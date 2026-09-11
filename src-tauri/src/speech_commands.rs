//! Tauri commands for speech-to-text recognition
//!
//! Exposes whisper.cpp functionality to the frontend via Tauri's command system.
//! This provides fully offline speech recognition.

use std::path::Path;
use std::sync::{Arc, Mutex};

use whisper_ffi::WhisperModel;

/// Shared whisper model state.
///
/// Tracks the loaded whisper model and its state.
#[derive(Debug, Default)]
pub struct WhisperState {
    pub model_loaded: bool,
    pub current_model: Option<String>,
    pub whisper_model: Option<WhisperModel>,
}

/// Initialize whisper model.
///
/// Loads the whisper model from the specified path.
/// Uses stub implementations when whisper.cpp source is not available.
#[tauri::command]
pub async fn init_speech_recognition(
    model_path: String,
    state: tauri::State<'_, Arc<Mutex<WhisperState>>>,
) -> Result<(), String> {
    let mut state_guard = state
        .lock()
        .map_err(|_| "Failed to lock whisper state".to_string())?;

    match WhisperModel::load(&model_path) {
        Ok(model) => {
            state_guard.whisper_model = Some(model);
            state_guard.model_loaded = true;
            state_guard.current_model = Some(model_path);
            Ok(())
        }
        Err(e) => Err(format!(
            "Failed to load whisper model: {}. Is whisper.cpp source available and model file present?",
            e
        )),
    }
}

/// Transcribe audio from PCM samples.
///
/// Uses whisper.cpp for actual transcription when available.
/// Uses stub implementations when whisper.cpp source is not available.
#[tauri::command]
pub async fn transcribe_audio(
    audio_data: Vec<f32>,
    _language: Option<String>,
    state: tauri::State<'_, Arc<Mutex<WhisperState>>>,
) -> Result<String, String> {
    let state_guard = state
        .lock()
        .map_err(|_| "Failed to lock whisper state".to_string())?;

    match &state_guard.whisper_model {
        Some(model) => {
            if audio_data.is_empty() {
                Ok(String::new())
            } else {
                model.transcribe(&audio_data)
            }
        }
        None => Err("Whisper model not loaded. Call init_speech_recognition first.".to_string()),
    }
}

/// Get speech recognition status
#[tauri::command]
pub async fn get_speech_status(
    state: tauri::State<'_, Arc<Mutex<WhisperState>>>,
) -> Result<SpeechRecognitionStatus, String> {
    let whisper_state = state
        .lock()
        .map_err(|_| "Failed to lock whisper state".to_string())?;

    // Whether a real whisper.cpp backend is compiled in, independent of
    // whether a specific model is currently loaded (`model_loaded` above).
    // A maintenance review found this hardcoded to `true` unconditionally,
    // the same dishonesty class already fixed once for `offlineSupported`/
    // `modelLoaded` in speechBridgeImpl.ts.
    let model_available = whisper_ffi::is_whisper_available();

    Ok(SpeechRecognitionStatus {
        model_loaded: whisper_state.model_loaded,
        current_model: whisper_state.current_model.clone(),
        supported_languages: get_supported_languages(),
        model_available,
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
    pub model_available: bool,
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
    /// silently inserted into their note. Now it returns an honest error
    /// about the model not being loaded or whisper.cpp source not being available.
    #[test]
    fn whisper_state_defaults_to_honestly_not_loaded() {
        let state = WhisperState::default();
        assert!(!state.model_loaded);
        assert!(state.current_model.is_none());
        assert!(state.whisper_model.is_none());
    }

    /// Maintenance-review regression: `get_speech_status`'s `model_available`
    /// field used to be `let model_available = true;` hardcoded unconditionally,
    /// regardless of whether a real whisper.cpp backend was actually compiled
    /// in. It must now mirror `whisper_ffi::is_whisper_available()`, which this
    /// sandbox's stub build (no vendored whisper.cpp/whisper.h source) reports
    /// honestly as `false`.
    #[test]
    fn model_available_mirrors_is_whisper_available_honestly() {
        assert!(
            !whisper_ffi::is_whisper_available(),
            "this sandbox's stub build must report no real whisper.cpp backend available"
        );
    }
}
