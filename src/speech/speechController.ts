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
  transcribeAudio,
  isSpeechRecognitionAvailable,
  type PlatformType,
  type SpeechOptions,
} from '../workspace/speechBridgeImpl';

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
      
      // Initialize audio context and request microphone access
      await this.initializeAudio();
      this.setState('recording');
      this.startRecording();
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
      this.setState('transcribing');
      await this.stopRecording();
      await this.processAudio();
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
    
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: true,
      video: false 
    });
    
    this.mediaRecorder = new MediaRecorder(stream);
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
   * Decode audio buffer to PCM samples
   * 
   * This is a simplified version. In production, you'd use a proper
   * audio decoding library to handle various formats.
   */
  private async decodeAudio(audioBuffer: ArrayBuffer): Promise<Float32Array> {
    // For now, we'll create a simple PCM representation
    // In a real implementation, this would properly decode the audio format
    
    const byteArray = new Uint8Array(audioBuffer);
    
    // Convert to Float32 samples
    // This is a placeholder - real decoding would be more complex
    const samples = new Float32Array(byteArray.length / 2);
    
    for (let i = 0; i < samples.length; i++) {
      // Simple conversion from 16-bit PCM to float
      const byteIndex = i * 2;
      if (byteIndex + 1 < byteArray.length) {
        const intValue = (byteArray[byteIndex + 1] << 8) | byteArray[byteIndex];
        samples[i] = Math.max(-1.0, Math.min(1.0, intValue / 32768.0));
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
    
    if (errorMessage.includes('permission') || errorMessage.includes('denied')) {
      return {
        code: 'permission_denied',
        message: 'Microphone permission was denied. Please enable microphone access in your browser/device settings.',
        isFatal: true
      };
    }
    
    if (errorMessage.includes('no device') || errorMessage.includes('not found')) {
      return {
        code: 'no_microphone',
        message: 'No microphone was found. Please connect a microphone and try again.',
        isFatal: true
      };
    }
    
    if (errorMessage.includes('not supported') || errorMessage.includes('API not available')) {
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
