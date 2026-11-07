/**
 * Quick Capture voice input: drives the existing opt-in local speech-to-text
 * controller (whisper on desktop, SpeechRecognizer on Android) for one open
 * CaptureSheet. No network, no new recognition engine.
 *
 * Why a private controller instead of the shared one: the editor's dictation
 * button subscribes to the shared controller and inserts results into the open
 * note, so reusing it would type a captured voice note into the wrong place.
 */

import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { SpeechController } from "../speech/speechController";
import type {
  SpeechRecognitionController,
  SpeechRecognitionError,
} from "../speech/types";

export type CaptureVoiceState =
  "idle" | "starting" | "recording" | "transcribing";

/**
 * Appends dictated text after what the user already typed, on its own line,
 * so voice input can never overwrite or reorder existing capture text.
 */
export function appendTranscript(existing: string, transcript: string): string {
  const spoken = transcript.trim();
  if (!spoken) return existing;
  if (existing.trim() === "") return spoken;
  return `${existing.replace(/\s+$/, "")}\n${spoken}`;
}

export function describeVoiceError(error: SpeechRecognitionError): string {
  switch (error.code) {
    case "permission_denied":
      return "Microphone access was denied. Allow it in system settings to dictate a capture.";
    case "no_microphone":
      return "No microphone was found.";
    case "not_supported":
      return "Speech-to-text is not available on this device.";
    case "model_load_failed":
      return "The local speech model could not be loaded.";
    default:
      return (
        error.message || "Speech-to-text failed. Your typed text is unchanged."
      );
  }
}

interface UseCaptureVoiceOptions {
  /** Master gate: the speechToTextEnabled setting AND the sheet being open. */
  enabled: boolean;
  /** Receives final transcript text. Never called after cancel or close. */
  onTranscript: (text: string) => void;
  /** Injectable for tests. */
  createController?: () => SpeechRecognitionController;
}

export function useCaptureVoice({
  enabled,
  onTranscript,
  createController,
}: UseCaptureVoiceOptions) {
  const [state, setState] = useState<CaptureVoiceState>("idle");
  const [available, setAvailable] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const controllerRef = useRef<SpeechRecognitionController | null>(null);
  // True from cancel until the next start, so a late result from an abandoned
  // recording is dropped instead of inserted.
  const cancelledRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const createControllerRef = useRef(createController);
  createControllerRef.current = createController;

  useEffect(() => {
    if (!enabled) {
      setAvailable(false);
      setState("idle");
      setMessage(null);
      return;
    }
    let disposed = false;
    const controller = (
      createControllerRef.current ?? (() => new SpeechController())
    )();
    controllerRef.current = controller;

    const offResult = controller.onResult((result) => {
      if (disposed || cancelledRef.current) return;
      if (result.isFinal) {
        if (result.text.trim()) onTranscriptRef.current(result.text);
        else setMessage("No speech was recognized.");
      }
    });
    const offError = controller.onError((error) => {
      if (disposed || cancelledRef.current) return;
      setMessage(describeVoiceError(error));
    });
    const offState = controller.onStateChange((s) => {
      if (disposed) return;
      if (
        s === "idle" ||
        s === "starting" ||
        s === "recording" ||
        s === "transcribing"
      )
        setState(s);
      else setState("idle");
    });

    controller
      .isSpeechRecognitionAvailable()
      .then((ok) => {
        if (!disposed) setAvailable(ok);
      })
      .catch(() => {
        if (!disposed) setAvailable(false);
      });

    return () => {
      // Close during recording or transcription: drop the session so no late
      // result lands in a closed sheet, and release the microphone.
      disposed = true;
      offResult();
      offError();
      offState();
      controllerRef.current = null;
      void controller.stop().catch(() => undefined);
    };
  }, [enabled]);

  const start = useCallback(async () => {
    const controller = controllerRef.current;
    if (!controller) return;
    setMessage(null);
    cancelledRef.current = false;
    try {
      await controller.start();
    } catch {
      // The controller already reported the reason through onError.
      return;
    }
    // Cancelled while the engine was still starting: the controller ignores
    // stop() in that state, so release it now.
    if (cancelledRef.current) void controller.stop().catch(() => undefined);
  }, []);

  const stop = useCallback(async () => {
    try {
      await controllerRef.current?.stop();
    } catch {
      setMessage("Speech-to-text failed. Your typed text is unchanged.");
    }
  }, []);

  /** Abandon the recording without inserting anything. */
  const cancel = useCallback(async () => {
    cancelledRef.current = true;
    setMessage(null);
    try {
      await controllerRef.current?.stop();
    } catch {
      /* nothing to recover */
    }
  }, []);

  const toggle = useCallback(() => {
    if (state === "idle") void start();
    else if (state === "recording") void stop();
  }, [state, start, stop]);

  return { state, available: enabled && available, message, toggle, cancel };
}
