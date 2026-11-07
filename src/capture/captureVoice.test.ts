import { describe, expect, it, vi } from "vitest";
import { h } from "preact";
import { act, render } from "@testing-library/preact";
import {
  appendTranscript,
  describeVoiceError,
  useCaptureVoice,
} from "./captureVoice";
import type {
  SpeechRecognitionController,
  SpeechRecognitionError,
  SpeechRecognitionResult,
  SpeechRecognitionState,
} from "../speech/types";

class FakeController implements SpeechRecognitionController {
  state: SpeechRecognitionState = "idle";
  available = true;
  startError: Error | null = null;
  stopCalls = 0;
  private results: Array<(r: SpeechRecognitionResult) => void> = [];
  private errors: Array<(e: SpeechRecognitionError) => void> = [];
  private states: Array<(s: SpeechRecognitionState) => void> = [];
  private set(s: SpeechRecognitionState) {
    this.state = s;
    this.states.forEach((cb) => cb(s));
  }
  async start() {
    this.set("starting");
    if (this.startError) {
      this.set("error");
      this.errors.forEach((cb) =>
        cb({ code: "permission_denied", message: "denied", isFatal: true }),
      );
      throw this.startError;
    }
    this.set("recording");
  }
  async stop() {
    this.stopCalls++;
    this.set("idle");
  }
  emitResult(text: string) {
    this.results.forEach((cb) => cb({ text, isFinal: true }));
  }
  getState() {
    return this.state;
  }
  onResult(cb: (r: SpeechRecognitionResult) => void) {
    this.results.push(cb);
    return () => {
      this.results = this.results.filter((c) => c !== cb);
    };
  }
  onError(cb: (e: SpeechRecognitionError) => void) {
    this.errors.push(cb);
    return () => {
      this.errors = this.errors.filter((c) => c !== cb);
    };
  }
  onStateChange(cb: (s: SpeechRecognitionState) => void) {
    this.states.push(cb);
    cb(this.state);
    return () => {
      this.states = this.states.filter((c) => c !== cb);
    };
  }
  async getOptions() {
    return {
      models: [],
      languages: [],
      platform: "desktop",
      offlineCapable: true,
    };
  }
  async isSpeechRecognitionAvailable() {
    return this.available;
  }
  async initialize() {}
}

type Api = ReturnType<typeof useCaptureVoice>;

function mount(
  controller: FakeController,
  enabled: boolean,
  onTranscript = vi.fn(),
) {
  const ref: { api: Api | null } = { api: null };
  const create = vi.fn(() => controller);
  function Probe(props: { enabled: boolean }) {
    ref.api = useCaptureVoice({
      enabled: props.enabled,
      onTranscript,
      createController: create,
    });
    return null;
  }
  const view = render(h(Probe, { enabled }));
  return { ref, create, onTranscript, view, Probe };
}

const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

describe("appendTranscript", () => {
  it("never overwrites typed text and ignores blank transcripts", () => {
    expect(appendTranscript("", " hi ")).toBe("hi");
    expect(appendTranscript("typed\n\n", "spoken")).toBe("typed\nspoken");
    expect(appendTranscript("typed", "   ")).toBe("typed");
  });
});

describe("describeVoiceError", () => {
  it("gives actionable text for a denied permission", () => {
    expect(
      describeVoiceError({
        code: "permission_denied",
        message: "x",
        isFatal: true,
      }),
    ).toMatch(/denied/);
  });
});

describe("useCaptureVoice", () => {
  it("does not create a controller or touch the engine while disabled", async () => {
    const c = new FakeController();
    const { ref, create } = mount(c, false);
    await flush();
    expect(create).not.toHaveBeenCalled();
    expect(ref.api?.available).toBe(false);
  });

  it("is unavailable when the engine reports it cannot run", async () => {
    const c = new FakeController();
    c.available = false;
    const { ref } = mount(c, true);
    await flush();
    expect(ref.api?.available).toBe(false);
  });

  it("records, then delivers the transcript once", async () => {
    const c = new FakeController();
    const { ref, onTranscript } = mount(c, true);
    await flush();
    expect(ref.api?.available).toBe(true);
    await act(async () => ref.api?.toggle());
    expect(ref.api?.state).toBe("recording");
    await act(async () => ref.api?.toggle());
    act(() => c.emitResult("buy milk"));
    expect(onTranscript).toHaveBeenCalledWith("buy milk");
    expect(onTranscript).toHaveBeenCalledTimes(1);
  });

  it("surfaces a denied permission as a message and stays idle-capable", async () => {
    const c = new FakeController();
    c.startError = new Error("denied");
    const { ref, onTranscript } = mount(c, true);
    await flush();
    await act(async () => ref.api?.toggle());
    expect(ref.api?.message).toMatch(/denied/i);
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it("cancel drops a late result, and a later recording works again", async () => {
    const c = new FakeController();
    const { ref, onTranscript } = mount(c, true);
    await flush();
    await act(async () => ref.api?.toggle());
    await act(async () => {
      await ref.api?.cancel();
    });
    act(() => c.emitResult("stale"));
    expect(onTranscript).not.toHaveBeenCalled();
    await act(async () => ref.api?.toggle());
    act(() => c.emitResult("fresh"));
    expect(onTranscript).toHaveBeenCalledWith("fresh");
  });

  it("closing (disabling) during recording releases the engine and drops results", async () => {
    const c = new FakeController();
    const { ref, onTranscript, view, Probe } = mount(c, true);
    await flush();
    await act(async () => ref.api?.toggle());
    const before = c.stopCalls;
    view.rerender(h(Probe, { enabled: false }));
    await flush();
    expect(c.stopCalls).toBeGreaterThan(before);
    act(() => c.emitResult("late"));
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it("reports empty recognition instead of inserting nothing silently", async () => {
    const c = new FakeController();
    const { ref, onTranscript } = mount(c, true);
    await flush();
    await act(async () => ref.api?.toggle());
    act(() => c.emitResult("  "));
    expect(onTranscript).not.toHaveBeenCalled();
    expect(ref.api?.message).toMatch(/No speech/);
  });
});
