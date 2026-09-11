/**
 * Speech recognition bridge functions for Tauri desktop
 * 
 * Provides TypeScript bindings for whisper.cpp-based speech recognition.
 * This is the desktop-specific implementation.
 */

import { invoke } from '@tauri-apps/api/core';

/**
 * Supported whisper model sizes
 */
export type WhisperModelSize = 'tiny' | 'base' | 'small' | 'medium';

/**
 * Whisper model information
 */
export interface WhisperModelInfo {
  name: string;
  displayName: string;
  sizeMb: number;
  description: string;
  languages: string[];
}

/**
 * Speech recognition status
 */
export interface SpeechRecognitionStatus {
  modelLoaded: boolean;
  currentModel: string | null;
  supportedLanguages: string[];
}

/**
 * Audio capture configuration
 */
export interface AudioCaptureConfig {
  sampleRate?: number;
  channels?: number;
  bitsPerSample?: number;
}

/**
 * Initialize speech recognition with a whisper model
 * 
 * @param modelPath - Path to the whisper model file
 * @returns Promise that resolves when model is loaded
 */
export async function initSpeechRecognition(modelPath: string): Promise<void> {
  return invoke('init_speech_recognition', { modelPath });
}

/**
 * Transcribe audio data to text
 * 
 * @param audioData - Array of audio samples (f32 values)
 * @param language - Optional language hint
 * @returns Promise that resolves with the transcribed text
 */
export async function transcribeAudio(
  audioData: Float32Array | number[],
  language?: string
): Promise<string> {
  // Convert to array if it's a Float32Array
  const dataArray = audioData instanceof Float32Array 
    ? Array.from(audioData) 
    : audioData;
  
  return invoke('transcribe_audio', { 
    audioData: dataArray,
    language: language || null
  });
}

/**
 * Get current speech recognition status
 * 
 * @returns Promise that resolves with the current status
 */
export async function getSpeechStatus(): Promise<SpeechRecognitionStatus> {
  return invoke('get_speech_status');
}

/**
 * Get list of available whisper models
 * 
 * @returns Promise that resolves with array of model info
 */
export async function getWhisperModels(): Promise<WhisperModelInfo[]> {
  return invoke('get_whisper_models');
}

/**
 * Whisper model file information
 */
export interface WhisperModelFile {
  path: string;
  name: string;
  sizeMb: number;
  exists: boolean;
}

/**
 * Check for available whisper model files in the application directory
 * 
 * @param appDir - Application directory to check for model files
 * @returns Promise that resolves with array of model file info
 */
export async function checkWhisperModels(appDir: string): Promise<WhisperModelFile[]> {
  return invoke('check_whisper_models', { appDir });
}

/**
 * Get default audio capture configuration
 * 
 * @returns Default audio configuration for speech recognition
 */
export function getDefaultAudioConfig(): AudioCaptureConfig {
  return {
    sampleRate: 16000,  // 16kHz - standard for speech
    channels: 1,       // Mono
    bitsPerSample: 16, // 16-bit audio
  };
}

/**
 * Sample rate for speech recognition (16kHz)
 */
export const SPEECH_SAMPLE_RATE = 16000;

/**
 * Number of audio channels for speech recognition (mono)
 */
export const SPEECH_CHANNELS = 1;

/**
 * Default audio buffer size in milliseconds
 */
export const DEFAULT_AUDIO_BUFFER_MS = 1000; // 1 second

/**
 * Calculate number of samples for a given duration
 * 
 * @param milliseconds - Duration in milliseconds
 * @returns Number of samples needed
 */
export function samplesForDuration(milliseconds: number): number {
  return Math.floor((SPEECH_SAMPLE_RATE * milliseconds) / 1000);
}
