//! Tauri commands for speech-to-text recognition
//!
//! Exposes whisper.cpp functionality to the frontend via Tauri's command system.
//! This provides fully offline speech recognition.

use std::path::Path;
use std::sync::{Arc, Mutex};

/// Shared whisper model state.
///
/// Always reports "not loaded": no real whisper.cpp backend is compiled
/// into this build (see `SPEECH_NOT_IMPLEMENTED`), so there is nothing to
/// track here yet beyond the honest default.
#[derive(Debug, Default)]
pub struct WhisperState {
    pub model_loaded: bool,
    pub current_model: Option<String>,
}

/// Error returned by every speech command below: this build has no real
/// speech-recognition backend at all, not merely an unloaded model.
///
/// The `whisper-ffi` crate (`src-tauri/native/whisper/`) that would wrap a
/// real whisper.cpp is an `optional = true` dependency behind the `whisper`
/// Cargo feature, which is absent from `[features] default` and never
/// passed by any CI/release job; no `whisper.cpp`/`whisper.h` source is
/// vendored either, so enabling that feature today would still only
/// produce the crate's own stub bindings. Returning a real error here
/// (instead of fabricating transcribed text) lets the existing
/// `SpeechRecognitionButton.tsx` error-state UI take over rather than
/// silently inserting fabricated text into a note. See ROADMAP.md's
/// "Desktop speech-to-text fabricates transcription..." entry.
const SPEECH_NOT_IMPLEMENTED: &str =
    "Desktop speech recognition is not implemented in this build: no whisper.cpp backend is compiled in.";

/// Initialize whisper model.
///
/// Always fails: see `SPEECH_NOT_IMPLEMENTED`.
#[tauri::command]
pub async fn init_speech_recognition(
    _model_path: String,
    _state: tauri::State<'_, Arc<Mutex<WhisperState>>>,
) -> Result<(), String> {
    Err(SPEECH_NOT_IMPLEMENTED.to_string())
}

/// Transcribe audio from PCM samples.
///
/// Always fails: see `SPEECH_NOT_IMPLEMENTED`. Never fabricates transcribed
/// text, regardless of the audio's length or content.
#[tauri::command]
pub async fn transcribe_audio(
    _audio_data: Vec<f32>,
    _language: Option<String>,
    _state: tauri::State<'_, Arc<Mutex<WhisperState>>>,
) -> Result<String, String> {
    Err(SPEECH_NOT_IMPLEMENTED.to_string())
}

/// Get speech recognition status
#[tauri::command]
pub async fn get_speech_status(
    state: tauri::State<'_, Arc<Mutex<WhisperState>>>,
) -> Result<SpeechRecognitionStatus, String> {
    let whisper_state = state
        .lock()
        .map_err(|_| "Failed to lock whisper state".to_string())?;

    Ok(SpeechRecognitionStatus {
        model_loaded: whisper_state.model_loaded,
        current_model: whisper_state.current_model.clone(),
        supported_languages: get_supported_languages(),
    })
}

/// Get list of available whisper models
#[tauri::command]
pub async fn get_whisper_models() -> Result<Vec<WhisperModelInfo>, String> {
    Ok(vec![
        WhisperModelInfo {
            name: "tiny".to_string(),
            display_name: "Tiny".to_string(),
            size_mb: 39,
            description: "Fast, good for quick notes".to_string(),
            languages: get_supported_languages(),
        },
        WhisperModelInfo {
            name: "base".to_string(),
            display_name: "Base".to_string(),
            size_mb: 75,
            description: "Balanced accuracy and speed".to_string(),
            languages: get_supported_languages(),
        },
        WhisperModelInfo {
            name: "small".to_string(),
            display_name: "Small".to_string(),
            size_mb: 244,
            description: "Better accuracy, slower".to_string(),
            languages: get_supported_languages(),
        },
        WhisperModelInfo {
            name: "medium".to_string(),
            display_name: "Medium".to_string(),
            size_mb: 769,
            description: "High accuracy, requires more RAM".to_string(),
            languages: get_supported_languages(),
        },
    ])
}

/// Check for available whisper model files in the application directory
#[tauri::command]
pub async fn check_whisper_models(app_dir: String) -> Result<Vec<WhisperModelFile>, String> {
    let mut models = Vec::new();

    // Check for model files in the specified directory
    let model_files = vec![
        ("ggml-tiny.bin", "tiny", 39),
        ("ggml-base.bin", "base", 75),
        ("ggml-small.bin", "small", 244),
        ("ggml-medium.bin", "medium", 769),
    ];

    for (filename, name, size_mb) in model_files {
        let model_path = Path::new(&app_dir).join(filename);
        let exists = model_path.exists();

        models.push(WhisperModelFile {
            path: model_path.to_string_lossy().into_owned(),
            name: name.to_string(),
            size_mb,
            exists,
        });
    }

    Ok(models)
}

/// Supported languages for speech recognition
fn get_supported_languages() -> Vec<String> {
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

/// Speech recognition status
#[derive(Debug, Clone, serde::Serialize)]
pub struct SpeechRecognitionStatus {
    pub model_loaded: bool,
    pub current_model: Option<String>,
    pub supported_languages: Vec<String>,
}

/// Whisper model information
#[derive(Debug, Clone, serde::Serialize)]
pub struct WhisperModelInfo {
    pub name: String,
    pub display_name: String,
    pub size_mb: u32,
    pub description: String,
    pub languages: Vec<String>,
}

/// Audio capture configuration
#[derive(Debug, Clone, serde::Deserialize)]
#[allow(dead_code)]
pub struct AudioCaptureConfig {
    pub sample_rate: Option<u32>,
    pub channels: Option<u8>,
    pub bits_per_sample: Option<u8>,
}

/// Speech recognition options
#[derive(Debug, Clone, serde::Deserialize)]
#[allow(dead_code)]
pub struct SpeechRecognitionOptions {
    pub model: Option<String>,
    pub language: Option<String>,
    pub beam_size: Option<u32>,
    pub best_of: Option<u32>,
}

/// Model file information
#[derive(Debug, Clone, serde::Serialize)]
pub struct WhisperModelFile {
    pub path: String,
    pub name: String,
    pub size_mb: u32,
    pub exists: bool,
}

impl Default for AudioCaptureConfig {
    fn default() -> Self {
        Self {
            sample_rate: Some(16000),
            channels: Some(1),
            bits_per_sample: Some(16),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Maintenance-review regression: `transcribe_audio` used to fabricate
    /// text like "[Transcribed text from 3200ms of audio]" instead of
    /// returning a real error, so a desktop user got fake dictated text
    /// silently inserted into their note. Both commands now always return
    /// this one honest error; assert it never resembles that fabricated
    /// output.
    #[test]
    fn speech_not_implemented_error_never_resembles_a_fabricated_transcription() {
        let lower = SPEECH_NOT_IMPLEMENTED.to_lowercase();
        assert!(!lower.contains("transcribed"));
        assert!(!lower.contains("0.95"));
        assert!(lower.contains("not implemented"));
    }

    #[test]
    fn whisper_state_defaults_to_honestly_not_loaded() {
        let state = WhisperState::default();
        assert!(!state.model_loaded);
        assert!(state.current_model.is_none());
    }
}
