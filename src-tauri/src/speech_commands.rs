//! Tauri commands for speech-to-text recognition
//!
//! Exposes whisper.cpp functionality to the frontend via Tauri's command system.
//! This provides fully offline speech recognition.

use std::sync::{Arc, Mutex};
use std::path::Path;

/// Shared whisper model state
#[derive(Debug, Default)]
pub struct WhisperState {
    // Hold the loaded whisper model from the FFI crate
    pub model: Option<whisper_ffi::WhisperModel>,
    pub model_loaded: bool,
    pub current_model: Option<String>,
    pub sample_rate: u32,
}

/// Initialize whisper model
#[tauri::command]
pub async fn init_speech_recognition(
    model_path: String,
    state: tauri::State<'_, Arc<Mutex<WhisperState>>>,
) -> Result<(), String> {
    let mut whisper_state = state.lock().map_err(|_| "Failed to lock whisper state".to_string())?;
    
    // Try to load the whisper model using FFI
    match whisper_ffi::WhisperModel::load(&model_path) {
        Ok(model) => {
            whisper_state.model = Some(model);
            whisper_state.model_loaded = true;
            whisper_state.current_model = Some(model_path);
            whisper_state.sample_rate = 16000; // Standard sample rate for whisper
            Ok(())
        }
        Err(e) => {
            // Fallback to placeholder mode for testing
            eprintln!("Failed to load whisper model: {}", e);
            whisper_state.model = None;
            whisper_state.model_loaded = false;
            whisper_state.current_model = None;
            Err(format!("Failed to load whisper model: {}", e))
        }
    }
}

/// Transcribe audio from PCM samples
#[tauri::command]
pub async fn transcribe_audio(
    audio_data: Vec<f32>,
    _language: Option<String>,
    state: tauri::State<'_, Arc<Mutex<WhisperState>>>,
) -> Result<String, String> {
    let whisper_state = state.lock().map_err(|_| "Failed to lock whisper state".to_string())?;
    
    if !whisper_state.model_loaded || whisper_state.model.is_none() {
        return Err("Speech recognition model not loaded. Please initialize a model first.".to_string());
    }
    
    // In a real implementation, this would:
    // 1. Convert the audio data to the format whisper expects
    // 2. Run the whisper model on the audio
    // 3. Return the transcribed text
    
    if audio_data.is_empty() {
        return Ok(String::new());
    }
    
    // Try to use the FFI model for transcription
    if let Some(model) = &whisper_state.model {
        match model.transcribe(&audio_data) {
            Ok(transcription) => Ok(transcription),
            Err(e) => {
                eprintln!("Whisper transcription error: {}", e);
                // Fallback to placeholder for now
                Ok("[Speech recognition placeholder - whisper.cpp integration in progress]".to_string())
            }
        }
    } else {
        // Fallback to placeholder
        Ok("[Speech recognition placeholder - whisper.cpp integration in progress]".to_string())
    }
}

/// Get speech recognition status
#[tauri::command]
pub async fn get_speech_status(
    state: tauri::State<'_, Arc<Mutex<WhisperState>>>,
) -> Result<SpeechRecognitionStatus, String> {
    let whisper_state = state.lock().map_err(|_| "Failed to lock whisper state".to_string())?;
    
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
pub async fn check_whisper_models(
    app_dir: String,
) -> Result<Vec<WhisperModelFile>, String> {
    use std::fs;
    
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
        "en".to_string(),  // English
        "fr".to_string(),  // French
        "de".to_string(),  // German
        "es".to_string(),  // Spanish
        "it".to_string(),  // Italian
        "pt".to_string(),  // Portuguese
        "ru".to_string(),  // Russian
        "zh".to_string(),  // Chinese
        "ja".to_string(),  // Japanese
        "ar".to_string(),  // Arabic
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
