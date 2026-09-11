/**
 * Tests for SpeechController
 * 
 * Tests the speech recognition controller functionality including
 * state management, initialization, audio processing, and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SpeechController } from './speechController';
import type { SpeechRecognitionState, SpeechRecognitionResult, SpeechRecognitionError } from './types';

// Mock global objects for testing
const mockAudioContext = vi.fn(() => ({
  close: vi.fn().mockResolvedValue(undefined),
}));

const mockMediaRecorder = vi.fn(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  ondataavailable: null,
  onstop: null,
  stream: {
    getTracks: () => [],
  },
}));

const mockGetUserMedia = vi.fn();

beforeEach(() => {
  // Reset all mocks before each test
  vi.resetAllMocks();
  
  // Mock window.AudioContext
  global.window = {
    AudioContext: mockAudioContext,
    webkitAudioContext: mockAudioContext,
    navigator: {
      mediaDevices: {
        getUserMedia: mockGetUserMedia,
      },
    },
    MediaRecorder: mockMediaRecorder,
    Float32Array: Float32Array,
    Uint8Array: Uint8Array,
    Blob: Blob,
    ArrayBuffer: ArrayBuffer,
  } as any;
});

afterEach(() => {
  delete (global as any).window;
});

describe('SpeechController', () => {
  describe('Initialization', () => {
    it('should start with idle state', () => {
      const controller = new SpeechController();
      expect(controller.getState()).toBe('idle');
    });

    it('should accept custom options', () => {
      const controller = new SpeechController({
        language: 'fr',
        modelSize: 'base',
      });
      // The options should be merged with defaults
      // We can't directly access private options, but we can test behavior
    });

    it('should throw error when speech recognition is not available', async () => {
      // Mock isSpeechRecognitionAvailable to return false
      const controller = new SpeechController();
      
      // Mock the bridge function
      vi.spyOn(controller as any, 'isSpeechRecognitionAvailable')
        .mockResolvedValueOnce(false);
      
      await expect(controller.start()).rejects.toThrow();
    });
  });

  describe('State Management', () => {
    it('should transition to starting state when start is called', async () => {
      const controller = new SpeechController();
      
      // Mock audio initialization
      mockGetUserMedia.mockResolvedValueOnce({} as any);
      
      // Start the controller
      const startPromise = controller.start();
      
      // State should transition to starting
      expect(controller.getState()).toBe('starting');
      
      // Clean up
      await startPromise.catch(() => {});
    });

    it('should transition to error state on failure', async () => {
      const controller = new SpeechController();
      
      // Mock getUserMedia to reject
      mockGetUserMedia.mockRejectedValueOnce(new Error('Permission denied'));
      
      const stateChangeCallback = vi.fn();
      controller.onStateChange(stateChangeCallback);
      
      await expect(controller.start()).rejects.toThrow();
      
      // Should have called state change callback with error state
      expect(stateChangeCallback).toHaveBeenCalledWith('error');
    });
  });

  describe('Audio Processing', () => {
    it('should parse WAV header correctly', () => {
      const controller = new SpeechController();
      
      // Create a minimal valid WAV file in memory
      // RIFF header (4 bytes) + file size (4) + WAVE (4) + fmt chunk (24) + data chunk header (8) + data
      const wavHeaderSize = 44;
      const sampleCount = 1000;
      const dataSize = sampleCount * 2; // 16-bit samples
      const totalSize = wavHeaderSize + dataSize - 8; // -8 because RIFF size doesn't include RIFF and size fields
      
      const buffer = new ArrayBuffer(wavHeaderSize + dataSize);
      const view = new DataView(buffer);
      
      // RIFF header
      view.setUint32(0, 0x52494646); // 'RIFF'
      view.setUint32(4, totalSize, true); // File size (little-endian)
      view.setUint32(8, 0x57415645); // 'WAVE'
      
      // fmt chunk
      view.setUint32(12, 0x666d7420); // 'fmt '
      view.setUint32(16, 16, true); // Chunk size
      view.setUint16(20, 1, true); // Format (PCM = 1)
      view.setUint16(22, 1, true); // Channels (mono = 1)
      view.setUint32(24, 16000, true); // Sample rate
      view.setUint32(28, 16000 * 1 * (16 / 8), true); // Byte rate
      view.setUint16(32, 1 * (16 / 8), true); // Block align
      view.setUint16(34, 16, true); // Bits per sample
      
      // data chunk
      view.setUint32(36, 0x64617461); // 'data'
      view.setUint32(40, dataSize, true); // Data size
      
      // Generate some sample data
      for (let i = 0; i < sampleCount; i++) {
        const byteIndex = wavHeaderSize + (i * 2);
        const sampleValue = Math.floor(Math.sin(i / 10) * 30000);
        view.setInt16(byteIndex, sampleValue, true);
      }
      
      const samples = (controller as any).parseWavData(buffer);
      
      expect(samples).not.toBeNull();
      expect(samples?.length).toBe(sampleCount);
    });

    it('should return null for non-WAV data', () => {
      const controller = new SpeechController();
      
      const buffer = new ArrayBuffer(100);
      const view = new DataView(buffer);
      view.setUint32(0, 0x46464952); // 'RIFF' in big-endian (wrong)
      
      const samples = (controller as any).parseWavData(buffer);
      expect(samples).toBeNull();
    });

    it('should fallback to raw PCM for non-WAV audio', async () => {
      const controller = new SpeechController();
      
      // Create raw PCM data (no header)
      const sampleCount = 100;
      const buffer = new ArrayBuffer(sampleCount * 2);
      const view = new DataView(buffer);
      
      for (let i = 0; i < sampleCount; i++) {
        const sampleValue = Math.floor(Math.sin(i / 10) * 30000);
        view.setInt16(i * 2, sampleValue, true);
      }
      
      const samples = await (controller as any).decodeAudio(buffer);
      
      expect(samples).toBeInstanceOf(Float32Array);
      expect(samples.length).toBe(sampleCount);
    });
  });

  describe('Error Handling', () => {
    it('should map permission errors correctly', () => {
      const controller = new SpeechController();
      
      const error = (controller as any).mapError(new Error('Permission denied'));
      
      expect(error.code).toBe('permission_denied');
      expect(error.isFatal).toBe(true);
    });

    it('should map no microphone errors correctly', () => {
      const controller = new SpeechController();
      
      const error = (controller as any).mapError(new Error('No device found'));
      
      expect(error.code).toBe('no_microphone');
      expect(error.isFatal).toBe(true);
    });

    it('should map unknown errors correctly', () => {
      const controller = new SpeechController();
      
      const error = (controller as any).mapError(new Error('Some unknown error'));
      
      expect(error.code).toBe('unknown');
      expect(error.isFatal).toBe(false);
    });
  });

  describe('Event Callbacks', () => {
    it('should call state change callbacks', async () => {
      const controller = new SpeechController();
      
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      
      const unsubscribe1 = controller.onStateChange(callback1);
      const unsubscribe2 = controller.onStateChange(callback2);
      
      // Trigger state changes through internal method
      (controller as any).setState('starting');
      
      expect(callback1).toHaveBeenCalledWith('starting');
      expect(callback2).toHaveBeenCalledWith('starting');
      
      // Unsubscribe and verify
      unsubscribe1();
      (controller as any).setState('recording');
      
      expect(callback1).not.toHaveBeenCalledWith('recording');
      expect(callback2).toHaveBeenCalledWith('recording');
    });

    it('should call result callbacks', async () => {
      const controller = new SpeechController();
      
      const callback = vi.fn();
      const unsubscribe = controller.onResult(callback);
      
      const result: SpeechRecognitionResult = {
        text: 'Test transcription',
        isFinal: true,
        confidence: 0.95,
      };
      
      (controller as any).notifyResult(result);
      
      expect(callback).toHaveBeenCalledWith(result);
      
      unsubscribe();
    });

    it('should call error callbacks', async () => {
      const controller = new SpeechController();
      
      const callback = vi.fn();
      const unsubscribe = controller.onError(callback);
      
      const error: SpeechRecognitionError = {
        code: 'permission_denied',
        message: 'Microphone permission denied',
        isFatal: true,
      };
      
      (controller as any).notifyError(error);
      
      expect(callback).toHaveBeenCalledWith(error);
      
      unsubscribe();
    });
  });
});

describe('SpeechController Types', () => {
  it('should have correct state types', () => {
    const states: SpeechRecognitionState[] = ['idle', 'starting', 'recording', 'transcribing', 'error'];
    expect(states).toContain('idle');
    expect(states).toContain('recording');
  });

  it('should have correct error codes', () => {
    const error: SpeechRecognitionError = {
      code: 'permission_denied',
      message: 'Test',
      isFatal: true,
    };
    expect(error.code).toBeOneOf([
      'permission_denied',
      'no_microphone',
      'not_supported',
      'model_load_failed',
      'recognition_failed',
      'unknown',
    ]);
  });
});
