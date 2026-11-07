/**
 * Tests for speechBridgeImpl.ts's desktop availability honesty.
 *
 * Maintenance-review regression coverage: `isSpeechRecognitionAvailable()`
 * and `getSpeechStatus()`'s `offlineSupported` field used to be hardcoded
 * to `true` on desktop regardless of whether a real speech-recognition
 * backend was actually loaded (`status.modelLoaded || true` always
 * evaluates to `true`), so the UI never had a chance to detect that no
 * whisper.cpp backend is compiled into this build. See ROADMAP.md's
 * "Desktop speech-to-text fabricates transcription..." entry.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@capacitor/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@capacitor/core')>();
  return { ...actual, Capacitor: { ...actual.Capacitor, isNativePlatform: vi.fn(() => false) } };
});

vi.mock('./speechBridge', () => ({
  getSpeechStatus: vi.fn(),
}));

import { Capacitor } from '@capacitor/core';
import * as tauriBridge from './speechBridge';
import { isSpeechRecognitionAvailable, getSpeechStatus } from './speechBridgeImpl';

describe('speechBridgeImpl desktop availability', () => {
  beforeEach(() => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
  });

  it('reports unavailable when no desktop model is loaded, instead of always true', async () => {
    vi.mocked(tauriBridge.getSpeechStatus).mockResolvedValue({
      modelLoaded: false,
      currentModel: null,
      supportedLanguages: [],
    });

    await expect(isSpeechRecognitionAvailable()).resolves.toBe(false);
  });

  it('reports available once a real desktop model is actually loaded', async () => {
    vi.mocked(tauriBridge.getSpeechStatus).mockResolvedValue({
      modelLoaded: true,
      currentModel: 'ggml-tiny.bin',
      supportedLanguages: ['en'],
    });

    await expect(isSpeechRecognitionAvailable()).resolves.toBe(true);
  });

  it('does not claim offline support when no desktop model is loaded', async () => {
    vi.mocked(tauriBridge.getSpeechStatus).mockResolvedValue({
      modelLoaded: false,
      currentModel: null,
      supportedLanguages: [],
    });

    const status = await getSpeechStatus();
    expect(status.offlineSupported).toBe(false);
    expect(status.platform).toBe('desktop');
  });

  it('claims offline support once a real desktop model is actually loaded', async () => {
    vi.mocked(tauriBridge.getSpeechStatus).mockResolvedValue({
      modelLoaded: true,
      currentModel: 'ggml-tiny.bin',
      supportedLanguages: ['en'],
    });

    const status = await getSpeechStatus();
    expect(status.offlineSupported).toBe(true);
  });
});
