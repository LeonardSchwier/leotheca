//! Whisper.cpp FFI bindings for Tauri
//!
//! Provides Rust-safe wrappers around whisper.cpp for speech-to-text recognition.
//! This module enables fully offline speech recognition using Whisper models.
//!
//! # Usage
//!
//! To enable whisper.cpp integration:
//! 1. Place whisper.cpp and whisper.h in src-tauri/native/whisper/
//! 2. Place GGML model files (e.g., ggml-tiny.bin) in your app directory
//! 3. The build script will automatically compile whisper.cpp
//!
//! If whisper.cpp source is not present, stub implementations will be used
//! that simulate the API but don't perform actual speech recognition.

use libc::c_int;
use std::ffi::{CStr, CString};
use std::ptr;

// Include generated bindings or use stubs
#[allow(dead_code)]
#[allow(non_snake_case)]
#[allow(non_camel_case_types)]
#[allow(non_upper_case_globals)]
#[allow(unused_imports)]
mod bindings {
    include!(concat!(env!("OUT_DIR"), "/bindings.rs"));
}

use bindings::*;

/// Constants for whisper sampling strategies
/// These are defined here for compatibility with both stub and real bindings
pub const WHISPER_SAMPLING_GREEDY: i32 = 0;
pub const WHISPER_SAMPLING_BEAM: i32 = 1;

/// Default sample rate for whisper models
pub const WHISPER_SAMPLE_RATE: i32 = 16000;

/// Interpret a raw `whisper_full` return code.
///
/// Pulled out of `WhisperModel::transcribe` so the failure/success decision is
/// independently testable without a real whisper.cpp context: whisper.cpp's
/// own convention (and the stub's) is `0` for success, nonzero for failure.
fn classify_whisper_full_result(result: c_int) -> Result<(), String> {
    if result != 0 {
        return Err(format!("whisper_full failed with status code {}", result));
    }
    Ok(())
}

/// Whisper model wrapper
#[derive(Debug)]
pub struct WhisperModel {
    context: *mut whisper_context,
    sample_rate: u32,
    n_threads: u32,
}

impl WhisperModel {
    /// Load whisper model from file path
    ///
    /// # Arguments
    /// * `model_path` - Path to the GGML model file (e.g., "ggml-tiny.bin")
    ///
    /// # Returns
    /// * `Ok(WhisperModel)` - Successfully loaded model
    /// * `Err(String)` - Error message if loading failed
    pub fn load(model_path: &str) -> Result<Self, String> {
        let path = CString::new(model_path).map_err(|e| e.to_string())?;

        let context = unsafe { whisper_init(path.as_ptr()) };
        if context.is_null() {
            return Err(format!(
                "Failed to initialize whisper context from model: {}",
                model_path
            ));
        }

        Ok(Self {
            context,
            sample_rate: WHISPER_SAMPLE_RATE as u32,
            n_threads: 4, // Use 4 threads for parallel processing
        })
    }

    /// Transcribe audio from PCM samples
    ///
    /// # Arguments
    /// * `audio_samples` - Array of f32 PCM audio samples (16kHz, mono)
    ///
    /// # Returns
    /// * `Ok(String)` - Transcribed text
    /// * `Err(String)` - Error message if transcription failed
    pub fn transcribe(&self, audio_samples: &[f32]) -> Result<String, String> {
        if audio_samples.is_empty() {
            return Ok(String::new());
        }

        let result = unsafe {
            whisper_full(
                self.context,
                ptr::null_mut(), // params - nullptr for now, real impl would use proper params
                audio_samples.len() as c_int,
            )
        };

        // A nonzero result is a real transcription failure. Report it honestly
        // as an error instead of returning fabricated placeholder text: a
        // maintenance review found this exact fallback silently inserting
        // "[Speech recognition placeholder - whisper.cpp integration ready]"
        // into a user's note in place of a real (or honestly-failed) transcript,
        // the same dishonesty class already fixed once in speech_commands.rs.
        classify_whisper_full_result(result)?;

        // Collect segments
        let n_segments = unsafe { whisper_full_n_segments(self.context) };
        let mut transcript = String::new();

        for i in 0..n_segments {
            let text_ptr = unsafe { whisper_full_get_segment_text(self.context, i) };
            if !text_ptr.is_null() {
                let c_str = unsafe { CStr::from_ptr(text_ptr) };
                if let Ok(text) = c_str.to_str() {
                    if i > 0 {
                        transcript.push(' ');
                    }
                    transcript.push_str(text);
                }
            }
        }

        Ok(transcript)
    }

    /// Get model information
    pub fn get_info(&self) -> WhisperModelInfo {
        WhisperModelInfo {
            sample_rate: self.sample_rate,
            n_threads: self.n_threads,
        }
    }

    /// Check if model is loaded
    pub fn is_loaded(&self) -> bool {
        !self.context.is_null()
    }
}

impl Drop for WhisperModel {
    fn drop(&mut self) {
        if !self.context.is_null() {
            unsafe { whisper_free(self.context) };
        }
    }
}

// Safety: WhisperModel contains a raw pointer to whisper_context.
// whisper.cpp's whisper_context is thread-safe for concurrent access
// as long as each thread uses its own whisper_full calls with proper
// parameter structures. The raw pointer is only accessed through
// the FFI functions which are designed to be thread-safe.
unsafe impl Send for WhisperModel {}
unsafe impl Sync for WhisperModel {}

/// Information about loaded whisper model
#[derive(Debug, Clone)]
pub struct WhisperModelInfo {
    pub sample_rate: u32,
    pub n_threads: u32,
}

/// Supported whisper model sizes
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WhisperModelSize {
    Tiny,
    Base,
    Small,
    Medium,
    Large,
}

impl WhisperModelSize {
    /// Get the filename for this model size
    pub fn filename(&self) -> &'static str {
        match self {
            WhisperModelSize::Tiny => "ggml-tiny.bin",
            WhisperModelSize::Base => "ggml-base.bin",
            WhisperModelSize::Small => "ggml-small.bin",
            WhisperModelSize::Medium => "ggml-medium.bin",
            WhisperModelSize::Large => "ggml-large.bin",
        }
    }

    /// Get the approximate file size in MB
    pub fn size_mb(&self) -> u32 {
        match self {
            WhisperModelSize::Tiny => 39,
            WhisperModelSize::Base => 75,
            WhisperModelSize::Small => 244,
            WhisperModelSize::Medium => 769,
            WhisperModelSize::Large => 1550,
        }
    }
}

/// Audio sample format for speech recognition
#[derive(Debug, Clone, Copy)]
pub struct AudioSampleFormat {
    pub sample_rate: u32,
    pub channels: u8,
    pub bits_per_sample: u8,
}

impl Default for AudioSampleFormat {
    fn default() -> Self {
        Self {
            sample_rate: WHISPER_SAMPLE_RATE as u32,
            channels: 1,         // Mono
            bits_per_sample: 32, // whisper.cpp expects f32
        }
    }
}

/// Check if a real whisper.cpp backend is compiled in, as opposed to the
/// stub bindings `build.rs` generates when no `whisper.cpp`/`whisper.h`
/// source is vendored. Backed by a build-script-emitted cfg rather than a
/// hardcoded literal, so it cannot silently drift out of sync with which
/// bindings actually got linked.
#[cfg(whisper_real)]
pub fn is_whisper_available() -> bool {
    true
}

/// See the `cfg(whisper_real)` variant above.
#[cfg(not(whisper_real))]
pub fn is_whisper_available() -> bool {
    false
}

/// Get whisper.cpp version information
#[cfg(whisper_real)]
pub fn get_whisper_version() -> String {
    // Real whisper.cpp system info is not wired up yet (would call
    // whisper_print_system_info); this is honest about being unimplemented
    // rather than claiming a version, matching is_whisper_available()'s cfg split.
    "whisper.cpp (FFI) - real backend compiled in, version info not yet wired up".to_string()
}

/// See the `cfg(whisper_real)` variant above.
#[cfg(not(whisper_real))]
pub fn get_whisper_version() -> String {
    "whisper.cpp (FFI) - stub implementations active".to_string()
}

/// Get list of supported languages by whisper
pub fn get_supported_languages() -> Vec<String> {
    vec![
        "en".to_string(), // English
        "fr".to_string(), // French
        "de".to_string(), // German
        "es".to_string(), // Spanish
        "it".to_string(), // Italian
        "pt".to_string(), // Portuguese
        "ru".to_string(), // Russian
        "zh".to_string(), // Chinese
        "ja".to_string(), // Japanese
        "ar".to_string(), // Arabic
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_model_size_info() {
        assert_eq!(WhisperModelSize::Tiny.filename(), "ggml-tiny.bin");
        assert_eq!(WhisperModelSize::Tiny.size_mb(), 39);

        assert_eq!(WhisperModelSize::Medium.filename(), "ggml-medium.bin");
        assert_eq!(WhisperModelSize::Medium.size_mb(), 769);
    }

    #[test]
    fn test_audio_format_default() {
        let format = AudioSampleFormat::default();
        assert_eq!(format.sample_rate, WHISPER_SAMPLE_RATE as u32);
        assert_eq!(format.channels, 1);
    }

    #[test]
    fn test_supported_languages() {
        let languages = get_supported_languages();
        assert!(languages.contains(&"en".to_string()));
        assert!(languages.contains(&"fr".to_string()));
    }

    /// Maintenance-review regression: `WhisperModel::transcribe` used to
    /// return `Ok("[Speech recognition placeholder - whisper.cpp integration
    /// ready]")` whenever the underlying `whisper_full` call failed, silently
    /// fabricating success text instead of surfacing a real error. Verify the
    /// decision logic directly: any nonzero code is a failure, never success.
    #[test]
    fn classify_whisper_full_result_rejects_any_nonzero_code() {
        assert!(classify_whisper_full_result(0).is_ok());

        for failing_code in [-1, 1, 42, i32::MIN, i32::MAX] {
            let err = classify_whisper_full_result(failing_code)
                .expect_err("nonzero whisper_full result must be an error, not fabricated Ok");
            assert!(
                !err.to_lowercase().contains("placeholder"),
                "error message must never resemble fabricated placeholder text: {err}"
            );
        }
    }

    /// This sandbox never vendors real `whisper.cpp`/`whisper.h` source
    /// (confirmed absent in `src-tauri/native/whisper/`), so `build.rs`
    /// always emits the stub bindings and `whisper_real` is never set here.
    /// `is_whisper_available()` must honestly reflect that instead of the
    /// old hardcoded `true`.
    #[test]
    fn is_whisper_available_is_honest_about_the_stub_build() {
        assert!(
            !is_whisper_available(),
            "this sandbox's build has no vendored whisper.cpp source, so the stub bindings are \
             active and is_whisper_available() must report false, not a hardcoded true"
        );
    }
}
