/**
 * Speech-to-text recognition types and interfaces
 */

export interface SpeechRecognitionOptions {
  /** Language code for speech recognition (e.g., 'en', 'es', 'fr') */
  language?: string;
  /** Model size to use (tiny, base, small, medium) - affects accuracy and performance */
  modelSize?: 'tiny' | 'base' | 'small' | 'medium';
}

export interface SpeechRecognitionResult {
  /** The transcribed text */
  text: string;
  /** Whether this is a partial/final result */
  isFinal: boolean;
  /** Confidence score (0-1) if available */
  confidence?: number;
}

export interface SpeechRecognitionError {
  /** Error code */
  code: 'permission_denied' | 'no_microphone' | 'not_supported' | 'model_load_failed' | 'recognition_failed' | 'unknown';
  /** Human-readable error message */
  message: string;
  /** Whether this error is fatal (requires user action) */
  isFatal: boolean;
}

export type SpeechRecognitionState = 
  | 'idle'
  | 'starting'
  | 'recording'
  | 'transcribing'
  | 'error';

export interface SpeechOptions {
  models: unknown[];
  languages: string[];
  platform: string;
  offlineCapable: boolean;
}

export interface SpeechRecognitionController {
  /** Start speech recognition */
  start(options?: SpeechRecognitionOptions): Promise<void>;
  /** Stop speech recognition */
  stop(): Promise<void>;
  /** Get current state */
  getState(): SpeechRecognitionState;
  /** Subscribe to results */
  onResult(callback: (result: SpeechRecognitionResult) => void): () => void;
  /** Subscribe to errors */
  onError(callback: (error: SpeechRecognitionError) => void): () => void;
  /** Subscribe to state changes */
  onStateChange(callback: (state: SpeechRecognitionState) => void): () => void;
  /** Get available options (models, languages) */
  getOptions(): Promise<SpeechOptions>;
  /** Check if speech recognition is available */
  isSpeechRecognitionAvailable(): Promise<boolean>;
  /** Initialize the controller */
  initialize(): Promise<void>;
}
