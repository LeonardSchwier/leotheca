//! Whisper.cpp FFI bindings for Tauri
//!
//! Provides Rust-safe wrappers around whisper.cpp for speech-to-text recognition.
//! This module enables fully offline speech recognition using Whisper models.

use libc::{c_char, c_int, c_void, size_t};
use std::ffi::{CStr, CString};
use std::ptr;

/// Maximum length for transcribed text chunks
const MAX_TEXT_LENGTH: usize = 4096;

// External declarations for whisper.cpp functions
extern "C" {
    /// Initialize whisper context
    fn whisper_init(path: *const c_char) -> *mut c_void;
    
    /// Free whisper context
    fn whisper_free(ctx: *mut c_void);
    
    /// Set whisper parameters
    fn whisper_full_params(params: *mut c_void) -> *mut c_void;
    
    /// Run speech recognition
    fn whisper_full(
        ctx: *mut c_void,
        params: *mut c_void,
        data: *const f32,
        n_samples: c_int,
    ) -> c_int;
    
    /// Get number of segments
    fn whisper_full_n_segments(ctx: *mut c_void) -> c_int;
    
    /// Get segment text
    fn whisper_full_get_segment_text(
        ctx: *mut c_void,
        i_segment: c_int,
    ) -> *const c_char;
    
    /// Get segment timestamp
    fn whisper_full_get_segment_t0(ctx: *mut c_void, i_segment: c_int) -> c_int;
    fn whisper_full_get_segment_t1(ctx: *mut c_void, i_segment: c_int) -> c_int;
}

/// Whisper model wrapper
pub struct WhisperModel {
    context: *mut c_void,
    sample_rate: u32,
    n_ffmpeg_threads: u32,
    n_threads: u32,
}

impl WhisperModel {
    /// Load whisper model from file path
    pub fn load(model_path: &str) -> Result<Self, String> {
        let path = CString::new(model_path).map_err(|e| e.to_string())?;
        
        let context = unsafe { whisper_init(path.as_ptr()) };
        if context.is_null() {
            return Err("Failed to initialize whisper context".to_string());
        }
        
        Ok(Self {
            context,
            sample_rate: 16000, // 16kHz sample rate
            n_ffmpeg_threads: 1,
            n_threads: 4, // Use 4 threads for parallel processing
        })
    }
    
    /// Transcribe audio from PCM samples
    pub fn transcribe(&self, audio_samples: &[f32]) -> Result<String, String> {
        if audio_samples.is_empty() {
            return Ok(String::new());
        }
        
        // Create whisper parameters
        let params = unsafe { whisper_full_params(ptr::null_mut()) };
        
        // Configure parameters
        // Note: Actual whisper.cpp uses a struct for params, this is simplified
        
        // Run recognition
        let result = unsafe {
            whisper_full(
                self.context,
                params,
                audio_samples.as_ptr(),
                audio_samples.len() as c_int,
            )
        };
        
        if result != 0 {
            return Err(format!("Whisper recognition failed with code: {}", result));
        }
        
        // Collect segments
        let n_segments = unsafe { whisper_full_n_segments(self.context) };
        let mut transcript = String::new();
        
        for i in 0..n_segments {
            let text_ptr = unsafe { whisper_full_get_segment_text(self.context, i) };
            if !text_ptr.is_null() {
                let c_str = unsafe { CStr::from_ptr(text_ptr) };
                if let Ok(text) = c_str.to_str() {
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
}

impl Drop for WhisperModel {
    fn drop(&mut self) {
        if !self.context.is_null() {
            unsafe { whisper_free(self.context) };
        }
    }
}

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
            sample_rate: 16000, // 16kHz - standard for speech
            channels: 1,       // Mono
            bits_per_sample: 16,
        }
    }
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
        assert_eq!(format.sample_rate, 16000);
        assert_eq!(format.channels, 1);
    }
}
