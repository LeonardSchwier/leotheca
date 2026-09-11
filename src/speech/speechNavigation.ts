/**
 * Speech recognition navigation and editor integration
 * 
 * Provides signal-based integration between speech recognition and the editor.
 * This allows speech recognition results to be properly inserted at the cursor
 * position in the active note editor.
 */

import { signal } from "@preact/signals";
import type { SpeechRecognitionState, SpeechRecognitionResult, SpeechRecognitionError } from "./types";

/**
 * Signal that holds the current speech recognition state
 * This can be used by the UI to show recording indicators
 */
export const speechRecognitionState = signal<SpeechRecognitionState>('idle');

/**
 * Signal that holds the latest speech recognition result
 * This can be used by the editor to insert text at cursor
 */
export const speechRecognitionResult = signal<SpeechRecognitionResult | null>(null);

/**
 * Signal that holds the latest speech recognition error
 * This can be used by the UI to show error messages
 */
export const speechRecognitionError = signal<SpeechRecognitionError | null>(null);

/**
 * Request speech recognition to start
 * This is used by UI controls to initiate speech recognition
 */
export interface SpeechStartRequest {
  requestId: number;
  language?: string;
}

/**
 * Request speech recognition to stop
 * This is used by UI controls to stop speech recognition
 */
export interface SpeechStopRequest {
  requestId: number;
}

/**
 * Signal for starting speech recognition
 */
export const speechStartRequest = signal<SpeechStartRequest | null>(null);

/**
 * Signal for stopping speech recognition
 */
export const speechStopRequest = signal<SpeechStopRequest | null>(null);

/**
 * Counter for generating unique request IDs
 */
let nextRequestId = 1;

/**
 * Request to start speech recognition
 * @param language - Optional language code for speech recognition
 */
export function requestStartSpeechRecognition(language?: string): void {
  speechStartRequest.value = {
    requestId: nextRequestId++,
    language
  };
}

/**
 * Request to stop speech recognition
 */
export function requestStopSpeechRecognition(): void {
  speechStopRequest.value = {
    requestId: nextRequestId++
  };
}

/**
 * Check if speech recognition is currently active
 */
export function isSpeechRecognitionActive(): boolean {
  const state = speechRecognitionState.value;
  return state === 'starting' || state === 'recording' || state === 'transcribing';
}

/**
 * Check if speech recognition is in an error state
 */
export function isSpeechRecognitionError(): boolean {
  return speechRecognitionState.value === 'error';
}

/**
 * Get the current speech recognition state
 */
export function getCurrentSpeechState(): SpeechRecognitionState {
  return speechRecognitionState.value;
}

/**
 * Set the current speech recognition state
 * This should be called by the speech controller
 */
export function setSpeechState(state: SpeechRecognitionState): void {
  speechRecognitionState.value = state;
}

/**
 * Set the latest speech recognition result
 * This should be called by the speech controller when results are available
 */
export function setSpeechResult(result: SpeechRecognitionResult): void {
  speechRecognitionResult.value = result;
}

/**
 * Set the latest speech recognition error
 * This should be called by the speech controller when errors occur
 */
export function setSpeechError(error: SpeechRecognitionError): void {
  speechRecognitionError.value = error;
}

/**
 * Clear the current speech recognition result
 */
export function clearSpeechResult(): void {
  speechRecognitionResult.value = null;
}

/**
 * Clear the current speech recognition error
 */
export function clearSpeechError(): void {
  speechRecognitionError.value = null;
}

/**
 * Reset all speech navigation signals
 */
export function resetSpeechNavigation(): void {
  speechRecognitionState.value = 'idle';
  speechRecognitionResult.value = null;
  speechRecognitionError.value = null;
  speechStartRequest.value = null;
  speechStopRequest.value = null;
}

/**
 * Signal that indicates whether speech recognition should be available
 * This is based on platform support and feature flags
 */
export const speechRecognitionAvailable = signal<boolean>(false);

/**
 * Set whether speech recognition is available
 */
export function setSpeechAvailability(available: boolean): void {
  speechRecognitionAvailable.value = available;
}