/**
 * Speech-to-text recognition controller
 * 
 * Main speech recognition functionality that works across platforms.
 * Uses whisper.cpp on desktop and Android's built-in SpeechRecognizer on mobile.
 * Fully offline as required by CONSTITUTION.
 */

import {
  getSpeechStatus,
  getSpeechOptions,
  initSpeechRecognition,
  transcribeAudio,
  stopSpeechRecognition,
  isSpeechRecognitionAvailable,
  type PlatformType,
  type SpeechOptions,
} from '../workspace/speechBridgeImpl';
import { Capacitor } from '@capacitor/core';

import type {
  SpeechRecognitionOptions,
  SpeechRecognitionResult,
  SpeechRecognitionError,
  SpeechRecognitionState,
  SpeechRecognitionController
} from './types';

/**
 * Default speech recognition options
 */
const DEFAULT_OPTIONS: Required<SpeechRecognitionOptions> = {
  language: 'en',
  modelSize: 'tiny'
};

/**
 * Main speech recognition controller implementation
 */
export class SpeechController implements SpeechRecognitionController {
  private state: SpeechRecognitionState = 'idle';
  private resultCallbacks: ((result: SpeechRecognitionResult) => void)[] = [];
  private errorCallbacks: ((error: SpeechRecognitionError) => void)[] = [];
  private stateChangeCallbacks: ((state: SpeechRecognitionState) => void)[] = [];
  
  private audioContext: AudioContext | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private options: Required<SpeechRecognitionOptions>;
  private platform: PlatformType | null = null;
  
  constructor(options: SpeechRecognitionOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Initialize the controller and detect platform
   */
  async initialize(): Promise<void> {
    try {
      const status = await getSpeechStatus();
      this.platform = status.platform;
      
      if (!status.offlineSupported) {
        this.setState('error');
        this.notifyError({
          code: 'not_supported',
          message: 'Speech recognition is not supported on this platform or device',
          isFatal: true
        });
      }
    } catch (error) {
      console.error('Failed to initialize speech controller:', error);
      this.setState('error');
    }
  }

  /**
   * Start speech recognition
   */
  async start(options?: SpeechRecognitionOptions): Promise<void> {
    if (this.state !== 'idle' && this.state !== 'error') {
      console.warn(`Speech recognition cannot start from state: ${this.state}`);
      return;
    }

    this.setState('starting');
    this.options = { ...this.options, ...options };

    try {
      // Check if speech recognition is available
      const available = await isSpeechRecognitionAvailable();
      if (!available) {
        throw new Error('Speech recognition not available on this platform');
      }
      
      // Initialize the bridge with platform-specific setup
      await initSpeechRecognition(this.options.modelSize);
      
      // On Android, the native SpeechRecognizer handles audio capture
      // On desktop, we use TypeScript MediaRecorder
      const isAndroid = Capacitor.isNativePlatform();
      if (!isAndroid) {
        await this.initializeAudio();
        this.setState('recording');
        this.startRecording();
      } else {
        // On Android, recognition is already started via the bridge
        this.setState('recording');
      }
    } catch (error) {
      const speechError = this.mapError(error);
      this.setState('error');
      this.notifyError(speechError);
      throw error;
    }
  }

  /**
   * Stop speech recognition
   */
  async stop(): Promise<void> {
    if (this.state === 'recording' || this.state === 'transcribing') {
      const isAndroid = Capacitor.isNativePlatform();
      
      if (!isAndroid) {
        // On desktop, stop recording and process audio
        this.setState('transcribing');
        await this.stopRecording();
        await this.processAudio();
      } else {
        // On Android, stop the native recognition
        // The results will come back through the bridge
        this.setState('transcribing');
        try {
          await stopSpeechRecognition();
        } catch (error) {
          console.error('Failed to stop Android speech recognition:', error);
        }
      }
    }
    
    this.cleanup();
    this.setState('idle');
  }

  /**
   * Get current state
   */
  getState(): SpeechRecognitionState {
    return this.state;
  }

  /**
   * Subscribe to results
   */
  onResult(callback: (result: SpeechRecognitionResult) => void): () => void {
    this.resultCallbacks.push(callback);
    return () => {
      const index = this.resultCallbacks.indexOf(callback);
      if (index > -1) {
        this.resultCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Subscribe to errors
   */
  onError(callback: (error: SpeechRecognitionError) => void): () => void {
    this.errorCallbacks.push(callback);
    return () => {
      const index = this.errorCallbacks.indexOf(callback);
      if (index > -1) {
        this.errorCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Subscribe to state changes
   */
  onStateChange(callback: (state: SpeechRecognitionState) => void): () => void {
    this.stateChangeCallbacks.push(callback);
    callback(this.state);
    return () => {
      const index = this.stateChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.stateChangeCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Get available speech options (models, languages)
   */
  async getOptions(): Promise<SpeechOptions> {
    try {
      return await getSpeechOptions();
    } catch (error) {
      console.error('Failed to get speech options:', error);
      return {
        models: [],
        languages: [],
        platform: this.platform || 'desktop',
        offlineCapable: false,
      };
    }
  }

  /**
   * Check if speech recognition is available
   */
  async isSpeechRecognitionAvailable(): Promise<boolean> {
    try {
      return await isSpeechRecognitionAvailable();
    } catch (error) {
      console.error('Failed to check speech availability:', error);
      return false;
    }
  }

  /**
   * Initialize audio context and request microphone permission
   */
  private async initializeAudio(): Promise<void> {
    const AudioContextClass = window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error('AudioContext not available');
    }
    this.audioContext = new AudioContextClass();
    
    // Request audio with specific constraints for speech recognition
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        // Request 16kHz sample rate if possible (whisper.cpp standard)
        sampleRate: 16000,
        sampleSize: 16,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false 
    });
    
    // Configure MediaRecorder with appropriate mime type
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/wav')
        ? 'audio/wav'
        : undefined;
    
    this.mediaRecorder = mimeType 
      ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 16000 })
      : new MediaRecorder(stream);
    
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };
  }

  /**
   * Start recording audio
   */
  private startRecording(): void {
    if (!this.mediaRecorder) {
      throw new Error('Media recorder not initialized');
    }

    this.audioChunks = [];
    this.mediaRecorder.start(1000); // Collect data every 1 second
  }

  /**
   * Stop recording audio
   */
  private async stopRecording(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder) {
        resolve();
        return;
      }

      this.mediaRecorder.onstop = () => {
        resolve();
      };
      this.mediaRecorder.stop();
    });
  }

  /**
   * Process recorded audio and transcribe it
   */
  private async processAudio(): Promise<void> {
    if (this.audioChunks.length === 0) {
      this.notifyResult({ text: '', isFinal: true });
      return;
    }

    try {
      // Combine all audio chunks into a single blob
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
      
      // Convert to audio buffer and process
      const audioBuffer = await audioBlob.arrayBuffer();
      const audioSamples = await this.decodeAudio(audioBuffer);
      
      // Use the bridge to transcribe
      const transcription = await transcribeAudio(audioSamples, this.options.language);
      
      this.notifyResult({ 
        text: transcription, 
        isFinal: true,
        confidence: 0.95
      });
    } catch (error) {
      const speechError = this.mapError(error);
      this.notifyError(speechError);
      this.setState('error');
    }
  }

  /**
   * Simple WAV header parser for extracting PCM data
   * Supports basic 16-bit mono WAV files
   */
  private parseWavData(audioBuffer: ArrayBuffer): Float32Array | null {
    const byteArray = new Uint8Array(audioBuffer);
    
    // WAV header is at least 44 bytes
    if (byteArray.length < 44) {
      return null;
    }
    
    // Check RIFF header
    const riffHeader = String.fromCharCode(
      byteArray[0], byteArray[1], byteArray[2], byteArray[3]
    );
    if (riffHeader !== 'RIFF') {
      return null; // Not a WAV file
    }
    
    // Check WAVE format
    const waveFormat = String.fromCharCode(
      byteArray[8], byteArray[9], byteArray[10], byteArray[11]
    );
    if (waveFormat !== 'WAVE') {
      return null;
    }
    
    // Check format (PCM = 1)
    const format = byteArray[20] | (byteArray[21] << 8);
    if (format !== 1) {
      return null; // Not PCM
    }
    
    // Check channels (mono = 1)
    const channels = byteArray[22] | (byteArray[23] << 8);
    if (channels !== 1) {
      return null; // Not mono
    }
    
    // Check bits per sample (16-bit = 16)
    const bitsPerSample = byteArray[34] | (byteArray[35] << 8);
    if (bitsPerSample !== 16) {
      return null; // Not 16-bit
    }
    
    // Get data chunk offset and size
    let dataOffset = 0;
    let dataSize = 0;
    
    for (let i = 12; i < byteArray.length - 8; i += 8) {
      const chunkId = String.fromCharCode(
        byteArray[i], byteArray[i + 1], byteArray[i + 2], byteArray[i + 3]
      );
      if (chunkId === 'data') {
        dataOffset = i + 8;
        dataSize = byteArray[i + 4] | (byteArray[i + 5] << 8) |
                  (byteArray[i + 6] << 16) | (byteArray[i + 7] << 24);
        break;
      }
    }
    
    if (dataOffset === 0 || dataSize === 0) {
      return null; // No data chunk found
    }
    
    // Extract PCM data (16-bit little-endian)
    const sampleCount = dataSize / 2;
    const samples = new Float32Array(sampleCount);
    
    for (let i = 0; i < sampleCount; i++) {
      const byteIndex = dataOffset + (i * 2);
      if (byteIndex + 1 < byteArray.length) {
        const intValue = (byteArray[byteIndex + 1] << 8) | byteArray[byteIndex];
        samples[i] = intValue / 32768.0; // Convert to -1.0 to 1.0 range
      }
    }
    
    return samples;
  }

  /**
   * Decode audio buffer to PCM samples
   * 
   * Attempts to handle WAV format first, then falls back to raw PCM
   */
  private async decodeAudio(audioBuffer: ArrayBuffer): Promise<Float32Array> {
    // Try WAV format first
    const wavSamples = this.parseWavData(audioBuffer);
    if (wavSamples) {
      return wavSamples;
    }
    
    // Fallback to raw PCM (for testing/demo purposes)
    const byteArray = new Uint8Array(audioBuffer);
    const samples = new Float32Array(byteArray.length / 2);
    
    for (let i = 0; i < samples.length; i++) {
      const byteIndex = i * 2;
      if (byteIndex + 1 < byteArray.length) {
        const intValue = (byteArray[byteIndex + 1] << 8) | byteArray[byteIndex];
        samples[i] = intValue / 32768.0; // Convert to -1.0 to 1.0 range
      }
    }
    
    return samples;
  }

  /**
   * Notify all result callbacks
   */
  private notifyResult(result: SpeechRecognitionResult): void {
    for (const callback of this.resultCallbacks) {
      try {
        callback(result);
      } catch (error) {
        console.error('Error in speech result callback:', error);
      }
    }
  }

  /**
   * Notify all error callbacks
   */
  private notifyError(error: SpeechRecognitionError): void {
    for (const callback of this.errorCallbacks) {
      try {
        callback(error);
      } catch (error) {
        console.error('Error in speech error callback:', error);
      }
    }
  }

  /**
   * Set state and notify callbacks
   */
  private setState(newState: SpeechRecognitionState): void {
    this.state = newState;
    for (const callback of this.stateChangeCallbacks) {
      try {
        callback(newState);
      } catch (error) {
        console.error('Error in speech state change callback:', error);
      }
    }
  }

  /**
   * Map various error types to SpeechRecognitionError
   */
  private mapError(error: unknown): SpeechRecognitionError {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const lowerErrorMessage = errorMessage.toLowerCase();
    
    if (lowerErrorMessage.includes('permission') || lowerErrorMessage.includes('denied')) {
      return {
        code: 'permission_denied',
        message: 'Microphone permission was denied. Please enable microphone access in your browser/device settings.',
        isFatal: true
      };
    }
    
    if (lowerErrorMessage.includes('no device') || lowerErrorMessage.includes('device not found') || lowerErrorMessage.includes('not found')) {
      return {
        code: 'no_microphone',
        message: 'No microphone was found. Please connect a microphone and try again.',
        isFatal: true
      };
    }
    
    if (lowerErrorMessage.includes('not supported') || lowerErrorMessage.includes('api not available')) {
      return {
        code: 'not_supported',
        message: 'Speech recognition is not supported in this environment.',
        isFatal: false
      };
    }
    
    return {
      code: 'unknown',
      message: errorMessage || 'An unknown error occurred during speech recognition.',
      isFatal: false
    };
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    if (this.mediaRecorder) {
      this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
      this.mediaRecorder = null;
    }
    
    if (this.audioContext) {
      this.audioContext.close().catch(console.error);
      this.audioContext = null;
    }
    
    this.audioChunks = [];
  }
}

/**
 * Singleton instance for global access
 */
let globalController: SpeechController | null = null;

export function getGlobalSpeechController(): SpeechController {
  if (!globalController) {
    globalController = new SpeechController();
  }
  return globalController;
}

export function resetGlobalSpeechController(): void {
  if (globalController) {
    globalController.stop().catch(console.error);
    globalController = null;
  }
}
