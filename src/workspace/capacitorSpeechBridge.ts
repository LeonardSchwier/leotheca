/**
 * Speech recognition bridge functions for Android (Capacitor)
 * 
 * Provides Android-specific speech recognition using the platform's
 * built-in SpeechRecognizer API with offline mode.
 * 
 * This uses android.speech.SpeechRecognizer with EXTRA_PREFER_OFFLINE
 * to ensure fully offline speech recognition as required by CONSTITUTION.
 */

import { registerPlugin } from '@capacitor/core';

/**
 * Capacitor plugin interface for speech recognition
 */
export interface CapacitorSpeechPlugin {
  /**
   * Start speech recognition with offline preference.
   * Resolves only once the native recognizer delivers a final result or
   * error (see `SpeechRecognitionPlugin.java`'s `onResults`/`onError`,
   * the only places that resolve/reject the underlying plugin call), so
   * this promise is long-lived for the duration of one recognition turn.
   */
  startRecognition(options: {
    language?: string;
    preferOffline?: boolean;
  }): Promise<{ success: boolean; error?: string; text?: string; language?: string }>;
  
  /**
   * Stop speech recognition
   */
  stopRecognition(): Promise<{ success: boolean; error?: string }>;
  
  /**
   * Transcribe audio data (for TypeScript-captured audio)
   */
  transcribeAudioData(options: {
    audioData: number[];
    language?: string;
  }): Promise<{ text: string; language?: string }>;
  
  /**
   * Check if offline speech recognition is supported
   */
  isOfflineSupported(): Promise<{ supported: boolean }>;
  
  /**
   * Get available languages for offline recognition
   */
  getAvailableLanguages(): Promise<{ languages: string[] }>;
}

/**
 * Register the speech recognition plugin
 */
const SpeechRecognitionPlugin = registerPlugin<CapacitorSpeechPlugin>(
  'SpeechRecognition'
);

/**
 * Start speech recognition on Android.
 *
 * The returned promise does not resolve when listening merely begins; it
 * resolves once the native `SpeechRecognizer` delivers a final transcript
 * (or an error/no-match), which may be after the caller later requests a
 * stop via `stopAndroidSpeechRecognition`. Never rejects: native failures
 * are reported as a resolved `{ success: false, error }`.
 *
 * @param language - Optional language code (e.g., 'en', 'es', 'fr')
 * @returns Promise with the final recognition result
 */
export async function startAndroidSpeechRecognition(
  language?: string
): Promise<{ success: boolean; error?: string; text?: string; language?: string }> {
  try {
    const result = await SpeechRecognitionPlugin.startRecognition({
      language: language,
      preferOffline: true, // Required for offline operation
    });
    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Stop speech recognition on Android
 * 
 * @returns Promise with result
 */
export async function stopAndroidSpeechRecognition(): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await SpeechRecognitionPlugin.stopRecognition();
    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Transcribe audio data on Android
 * 
 * @param audioData - Array of audio samples (f32 values)
 * @param language - Optional language code
 * @returns Promise with transcription result
 */
export async function transcribeAndroidAudio(
  audioData: Float32Array | number[],
  language?: string
): Promise<{ text: string; language?: string }> {
  try {
    const dataArray = audioData instanceof Float32Array 
      ? Array.from(audioData) 
      : audioData;
    
    const result = await SpeechRecognitionPlugin.transcribeAudioData({
      audioData: dataArray,
      language: language,
    });
    return result;
  } catch (error) {
    return {
      text: '[Android transcription error: ' + (error instanceof Error ? error.message : 'Unknown error') + ']',
      language: language,
    };
  }
}

/**
 * Check if offline speech recognition is available on this Android device
 * 
 * @returns Promise with support status
 */
export async function isAndroidOfflineSupported(): Promise<boolean> {
  try {
    const result = await SpeechRecognitionPlugin.isOfflineSupported();
    return result.supported;
  } catch {
    return false;
  }
}

/**
 * Get available languages for offline speech recognition on Android
 * 
 * @returns Promise with array of language codes
 */
export async function getAndroidLanguages(): Promise<string[]> {
  try {
    const result = await SpeechRecognitionPlugin.getAvailableLanguages();
    return result.languages;
  } catch {
    return [];
  }
}
