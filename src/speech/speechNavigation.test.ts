/**
 * Tests for speech navigation and signals
 * 
 * Tests the signal-based integration between speech recognition and the editor.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  speechRecognitionState,
  speechRecognitionResult,
  speechRecognitionError,
  speechStartRequest,
  speechStopRequest,
  speechRecognitionAvailable,
  requestStartSpeechRecognition,
  requestStopSpeechRecognition,
  isSpeechRecognitionActive,
  isSpeechRecognitionError,
  getCurrentSpeechState,
  setSpeechState,
  setSpeechResult,
  setSpeechError,
  clearSpeechResult,
  clearSpeechError,
  resetSpeechNavigation,
  setSpeechAvailability,
} from './speechNavigation';
import type { SpeechRecognitionState, SpeechRecognitionResult, SpeechRecognitionError } from './types';

describe('Speech Navigation Signals', () => {
  beforeEach(() => {
    // Reset all signals before each test
    resetSpeechNavigation();
  });

  afterEach(() => {
    // Clean up after each test
    resetSpeechNavigation();
  });

  describe('speechRecognitionState', () => {
    it('should default to idle', () => {
      expect(speechRecognitionState.value).toBe('idle');
    });

    it('should be settable via setSpeechState', () => {
      setSpeechState('recording');
      expect(speechRecognitionState.value).toBe('recording');
      
      setSpeechState('transcribing');
      expect(speechRecognitionState.value).toBe('transcribing');
    });

    it('should be gettable via getCurrentSpeechState', () => {
      setSpeechState('error');
      expect(getCurrentSpeechState()).toBe('error');
    });
  });

  describe('speechRecognitionResult', () => {
    it('should default to null', () => {
      expect(speechRecognitionResult.value).toBeNull();
    });

    it('should be settable via setSpeechResult', () => {
      const result: SpeechRecognitionResult = {
        text: 'Test transcription',
        isFinal: true,
        confidence: 0.95,
      };
      
      setSpeechResult(result);
      expect(speechRecognitionResult.value).toEqual(result);
    });

    it('should be clearable via clearSpeechResult', () => {
      const result: SpeechRecognitionResult = {
        text: 'Test',
        isFinal: true,
      };
      
      setSpeechResult(result);
      expect(speechRecognitionResult.value).not.toBeNull();
      
      clearSpeechResult();
      expect(speechRecognitionResult.value).toBeNull();
    });
  });

  describe('speechRecognitionError', () => {
    it('should default to null', () => {
      expect(speechRecognitionError.value).toBeNull();
    });

    it('should be settable via setSpeechError', () => {
      const error: SpeechRecognitionError = {
        code: 'permission_denied',
        message: 'Microphone permission denied',
        isFatal: true,
      };
      
      setSpeechError(error);
      expect(speechRecognitionError.value).toEqual(error);
    });

    it('should be clearable via clearSpeechError', () => {
      const error: SpeechRecognitionError = {
        code: 'unknown',
        message: 'Test error',
        isFatal: false,
      };
      
      setSpeechError(error);
      expect(speechRecognitionError.value).not.toBeNull();
      
      clearSpeechError();
      expect(speechRecognitionError.value).toBeNull();
    });
  });

  describe('Request Signals', () => {
    it('should create start request with default language', () => {
      requestStartSpeechRecognition();
      
      expect(speechStartRequest.value).not.toBeNull();
      expect(speechStartRequest.value?.language).toBeUndefined();
      expect(speechStartRequest.value?.requestId).toBeGreaterThan(0);
    });

    it('should create start request with specified language', () => {
      requestStartSpeechRecognition('fr');
      
      expect(speechStartRequest.value?.language).toBe('fr');
      expect(speechStartRequest.value?.requestId).toBeGreaterThan(0);
    });

    it('should create stop request', () => {
      requestStopSpeechRecognition();
      
      expect(speechStopRequest.value).not.toBeNull();
      expect(speechStopRequest.value?.requestId).toBeGreaterThan(0);
    });

    it('should increment request IDs', () => {
      requestStartSpeechRecognition();
      const firstStartId = speechStartRequest.value?.requestId;
      requestStartSpeechRecognition();
      const secondStartId = speechStartRequest.value?.requestId;
      requestStopSpeechRecognition();
      const stopId = speechStopRequest.value?.requestId;
      
      expect(secondStartId).toBeGreaterThan(firstStartId!);
      expect(stopId).toBeGreaterThan(secondStartId!);
    });
  });

  describe('Availability', () => {
    it('should default to false', () => {
      expect(speechRecognitionAvailable.value).toBe(false);
    });

    it('should be settable via setSpeechAvailability', () => {
      setSpeechAvailability(true);
      expect(speechRecognitionAvailable.value).toBe(true);
      
      setSpeechAvailability(false);
      expect(speechRecognitionAvailable.value).toBe(false);
    });
  });

  describe('Helper Functions', () => {
    describe('isSpeechRecognitionActive', () => {
      it('should return false for idle state', () => {
        setSpeechState('idle');
        expect(isSpeechRecognitionActive()).toBe(false);
      });

      it('should return false for error state', () => {
        setSpeechState('error');
        expect(isSpeechRecognitionActive()).toBe(false);
      });

      it('should return true for starting state', () => {
        setSpeechState('starting');
        expect(isSpeechRecognitionActive()).toBe(true);
      });

      it('should return true for recording state', () => {
        setSpeechState('recording');
        expect(isSpeechRecognitionActive()).toBe(true);
      });

      it('should return true for transcribing state', () => {
        setSpeechState('transcribing');
        expect(isSpeechRecognitionActive()).toBe(true);
      });
    });

    describe('isSpeechRecognitionError', () => {
      it('should return true only for error state', () => {
        setSpeechState('error');
        expect(isSpeechRecognitionError()).toBe(true);
        
        setSpeechState('idle');
        expect(isSpeechRecognitionError()).toBe(false);
        
        setSpeechState('recording');
        expect(isSpeechRecognitionError()).toBe(false);
      });
    });
  });

  describe('resetSpeechNavigation', () => {
    it('should reset all signals to default values', () => {
      // Set various values
      setSpeechState('recording');
      setSpeechResult({ text: 'Test', isFinal: true });
      setSpeechError({ code: 'unknown', message: 'Error', isFatal: false });
      requestStartSpeechRecognition('en');
      requestStopSpeechRecognition();
      setSpeechAvailability(true);

      // Reset
      resetSpeechNavigation();

      // Verify all reset
      expect(speechRecognitionState.value).toBe('idle');
      expect(speechRecognitionResult.value).toBeNull();
      expect(speechRecognitionError.value).toBeNull();
      expect(speechStartRequest.value).toBeNull();
      expect(speechStopRequest.value).toBeNull();
      expect(speechRecognitionAvailable.value).toBe(false);
    });
  });

  describe('Type Safety', () => {
    it('should accept all valid speech states', () => {
      const states: SpeechRecognitionState[] = ['idle', 'starting', 'recording', 'transcribing', 'error'];
      
      for (const state of states) {
        setSpeechState(state);
        expect(speechRecognitionState.value).toBe(state);
      }
    });

    it('should handle result with all optional fields', () => {
      const result: SpeechRecognitionResult = {
        text: 'Hello world',
        isFinal: true,
        confidence: 0.95,
      };
      
      setSpeechResult(result);
      expect(speechRecognitionResult.value).toEqual(result);
    });

    it('should handle error with all fields', () => {
      const error: SpeechRecognitionError = {
        code: 'permission_denied',
        message: 'Microphone access denied by user',
        isFatal: true,
      };
      
      setSpeechError(error);
      expect(speechRecognitionError.value).toEqual(error);
    });
  });
});
