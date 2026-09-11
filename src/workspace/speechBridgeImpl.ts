/**
 * Speech recognition bridge implementation
 * 
 * Platform dispatcher for speech recognition functionality.
 * This provides a unified interface that works on both desktop (Tauri)
 * and mobile (Capacitor) platforms.
 */

import * as tauriBridge from './speechBridge';
import * as capacitorBridge from './capacitorSpeechBridge';
import { Capacitor } from '@capacitor/core';

export * from './speechBridge';
export * from './capacitorSpeechBridge';

/**
 * Platform-specific speech recognition implementation
 * Note: impl is not used directly but kept for potential future extension
 */
// const impl = Capacitor.isNativePlatform() ? capacitorBridge : tauriBridge;

/**
 * Initialize speech recognition
 * - Desktop: Loads whisper.cpp model
 * - Android: Uses built-in SpeechRecognizer with offline mode
 */
export async function initSpeechRecognition(modelOrLanguage?: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    // On Android, modelOrLanguage is treated as a language hint
    // Offline mode is always preferred
    const result = await capacitorBridge.startAndroidSpeechRecognition(modelOrLanguage);
    if (!result.success) {
      throw new Error(result.error || 'Failed to start Android speech recognition');
    }
  } else {
    // On desktop, modelOrLanguage is treated as a model path
    await tauriBridge.initSpeechRecognition(modelOrLanguage || '');
  }
}

/**
 * Transcribe audio data
 * - Desktop: Uses whisper.cpp to transcribe locally
 * - Android: Uses built-in SpeechRecognizer
 */
export async function transcribeAudio(
  audioData: Float32Array | number[],
  language?: string
): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    // On Android, audio data is typically captured directly by the native API
    // This function might not be used, or might need special handling
    // For now, we'll return a placeholder
    return '[Android speech recognition in progress]';
  } else {
    return tauriBridge.transcribeAudio(audioData, language);
  }
}

/**
 * Stop speech recognition
 */
export async function stopSpeechRecognition(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await capacitorBridge.stopAndroidSpeechRecognition();
  } else {
    // On desktop, we don't have a direct stop function in the current API
    // This would be handled by the audio capture logic
  }
}

/**
 * Get speech recognition status
 */
export async function getSpeechStatus() {
  if (Capacitor.isNativePlatform()) {
    // On Android, check if offline recognition is supported
    const supported = await capacitorBridge.isAndroidOfflineSupported();
    const languages = await capacitorBridge.getAndroidLanguages();
    
    return {
      modelLoaded: false, // Android doesn't use models
      currentModel: null,
      supportedLanguages: languages,
      offlineSupported: supported,
      platform: 'android' as const,
    };
  } else {
    const status = await tauriBridge.getSpeechStatus();
    return {
      ...status,
      offlineSupported: true, // Desktop with whisper.cpp is always offline
      platform: 'desktop' as const,
    };
  }
}

/**
 * Get available whisper models
 * - Desktop: Returns available model sizes
 * - Android: Returns available language packs
 */
export async function getSpeechOptions() {
  if (Capacitor.isNativePlatform()) {
    const languages = await capacitorBridge.getAndroidLanguages();
    return {
      models: [], // Android doesn't use whisper models
      languages,
      platform: 'android' as const,
      offlineCapable: await capacitorBridge.isAndroidOfflineSupported(),
    };
  } else {
    const models = await tauriBridge.getWhisperModels();
    return {
      models,
      languages: models.flatMap(m => m.languages), // All models support the same languages
      platform: 'desktop' as const,
      offlineCapable: true,
    };
  }
}

/**
 * Check if speech recognition is available on this platform
 */
export async function isSpeechRecognitionAvailable(): Promise<boolean> {
  try {
    if (Capacitor.isNativePlatform()) {
      return capacitorBridge.isAndroidOfflineSupported();
    } else {
      // On desktop, check if whisper models are available
      const status = await tauriBridge.getSpeechStatus();
      return status.modelLoaded || true; // Always available, just might need model download
    }
  } catch {
    return false;
  }
}

/**
 * Platform type
 */
export type PlatformType = 'desktop' | 'android';

/**
 * Extended speech recognition status with platform info
 */
export interface SpeechStatus {
  modelLoaded: boolean;
  currentModel: string | null;
  supportedLanguages: string[];
  offlineSupported: boolean;
  platform: PlatformType;
}

/**
 * Speech options including models and languages
 */
export interface SpeechOptions {
  models: import('./speechBridge').WhisperModelInfo[];
  languages: string[];
  platform: PlatformType;
  offlineCapable: boolean;
}

// Re-export types from speech bridge for convenience
export type {
  WhisperModelSize,
  WhisperModelInfo,
  WhisperModelFile,
  SpeechRecognitionStatus,
  AudioCaptureConfig,
} from './speechBridge';

// Re-export utility functions and constants
export {
  getDefaultAudioConfig,
  SPEECH_SAMPLE_RATE,
  SPEECH_CHANNELS,
  DEFAULT_AUDIO_BUFFER_MS,
  samplesForDuration,
} from './speechBridge';
