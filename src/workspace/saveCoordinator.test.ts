import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { writeTextFile } = vi.hoisted(() => ({
  writeTextFile: vi.fn<(path: string, content: string) => Promise<void>>(),
}));

vi.mock("./tauriBridge", () => ({ writeTextFile }));

import { createSaveCoordinator } from "./saveCoordinator";

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("save coordinator workspace transitions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    writeTextFile.mockReset();
  });

  afterEach(() => vi.useRealTimers());

  it("F20 Phase 2b-iii-b follow-up: flushes (actually writes) a pending outgoing debounce instead of cancelling it", async () => {
    writeTextFile.mockResolvedValue();
    const saves = createSaveCoordinator();
    saves.change(3, "/workspace/note.md", "outgoing");

    await saves.prepareForTransition(3);

    expect(writeTextFile).toHaveBeenCalledWith("/workspace/note.md", "outgoing");
    expect(saves.entryCount()).toBe(0);
  });

  it("still rejects an edit for the session once it has started transitioning", async () => {
    writeTextFile.mockResolvedValue();
    const saves = createSaveCoordinator();
    saves.change(3, "/workspace/note.md", "outgoing");
    await saves.prepareForTransition(3);
    writeTextFile.mockClear();

    saves.change(3, "/workspace/note.md", "late outgoing");
    await vi.advanceTimersByTimeAsync(1000);

    expect(writeTextFile).not.toHaveBeenCalled();
  });

  it("F20 Phase 2b-iii-b follow-up: throws, preserves the entry, and un-blocks the session when the flush itself fails", async () => {
    writeTextFile.mockRejectedValueOnce(new Error("disk full"));
    const saves = createSaveCoordinator();
    saves.change(5, "/workspace/note.md", "outgoing");

    await expect(saves.prepareForTransition(5)).rejects.toThrow('Could not save "/workspace/note.md"');

    expect(saves.entryCount()).toBe(1);
    expect(saves.getError(5, "/workspace/note.md")).toBe("disk full");

    // The session is un-blocked again (spec 16.3 step 6: "keep A
    // authoritative and editable"), so a real edit resumes normal autosave.
    writeTextFile.mockResolvedValue();
    saves.change(5, "/workspace/note.md", "retry content");
    await vi.advanceTimersByTimeAsync(400);
    expect(writeTextFile).toHaveBeenCalledWith("/workspace/note.md", "retry content");
  });

  it("F20 Phase 2b-iii-b follow-up: throws when an already in-flight write fails", async () => {
    const nativeWrite = deferred<void>();
    writeTextFile.mockReturnValueOnce(nativeWrite.promise);
    const saves = createSaveCoordinator();
    saves.change(6, "/workspace/note.md", "revision A");
    await vi.advanceTimersByTimeAsync(400);
    expect(writeTextFile).toHaveBeenCalledTimes(1);

    const transition = saves.prepareForTransition(6);
    await Promise.resolve();
    nativeWrite.reject(new Error("permission denied"));

    await expect(transition).rejects.toThrow('Could not save "/workspace/note.md"');
    expect(saves.entryCount()).toBe(1);
  });

  it("F20 Phase 2b-iii-b follow-up: flushes a newer revision that arrived while the original write was still in flight", async () => {
    const nativeWrite = deferred<void>();
    writeTextFile.mockReturnValueOnce(nativeWrite.promise);
    const saves = createSaveCoordinator();
    saves.change(9, "/workspace/note.md", "v1");
    await vi.advanceTimersByTimeAsync(400);
    expect(writeTextFile).toHaveBeenCalledTimes(1);

    // A second edit lands while the first write is still in flight: change()
    // bumps the revision but deliberately does not schedule a new timer
    // while inFlight, so this content is only reachable through
    // prepareForTransition's own second round, not an ordinary debounce.
    saves.change(9, "/workspace/note.md", "v2");

    const transition = saves.prepareForTransition(9);
    await Promise.resolve();
    writeTextFile.mockResolvedValueOnce(undefined);
    nativeWrite.resolve();

    await transition;

    expect(writeTextFile).toHaveBeenNthCalledWith(1, "/workspace/note.md", "v1");
    expect(writeTextFile).toHaveBeenNthCalledWith(2, "/workspace/note.md", "v2");
    expect(saves.entryCount()).toBe(0);
  });

  it("drains an invoked write before transition completion and suppresses its late callback", async () => {
    const nativeWrite = deferred<void>();
    writeTextFile.mockReturnValueOnce(nativeWrite.promise);
    const onSaved = vi.fn();
    const saves = createSaveCoordinator({ onSaved });

    saves.change(4, "/workspace/note.md", "revision A");
    await vi.advanceTimersByTimeAsync(400);
    expect(writeTextFile).toHaveBeenCalledTimes(1);

    let transitionDone = false;
    const transition = saves.prepareForTransition(4).then(() => { transitionDone = true; });
    await Promise.resolve();
    expect(transitionDone).toBe(false);

    saves.change(4, "/workspace/note.md", "must be ignored");
    nativeWrite.resolve();
    await transition;

    expect(transitionDone).toBe(true);
    expect(onSaved).not.toHaveBeenCalled();
    expect(saves.entryCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(writeTextFile).toHaveBeenCalledTimes(1);
  });

  it("allows the same synthetic path in a new monotonic workspace session", async () => {
    writeTextFile.mockResolvedValue();
    const saves = createSaveCoordinator();
    saves.change(7, "/workspace/same.md", "old");
    await saves.prepareForTransition(7);

    saves.change(8, "/workspace/same.md", "new");
    await vi.advanceTimersByTimeAsync(400);

    expect(writeTextFile).toHaveBeenCalledWith("/workspace/same.md", "new");
  });
});

// F20 Phase 2b-ii, spec section 15.2: forgetting the active profile must
// know whether there is anything left to lose *before* prepareForTransition
// runs, since that drain discards exactly this state (see the tests above)
// rather than reporting it back.
describe("hasUnsavedWork", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    writeTextFile.mockReset();
  });

  afterEach(() => vi.useRealTimers());

  it("is false for a session with no entries at all", () => {
    const saves = createSaveCoordinator();
    expect(saves.hasUnsavedWork(1)).toBe(false);
  });

  it("is true for a pending edit that has not fired its debounce yet", () => {
    const saves = createSaveCoordinator();
    saves.change(1, "/workspace/note.md", "edited");
    expect(saves.hasUnsavedWork(1)).toBe(true);
  });

  it("is true while a write is in flight, false once it lands", async () => {
    const nativeWrite = deferred<void>();
    writeTextFile.mockReturnValueOnce(nativeWrite.promise);
    const saves = createSaveCoordinator();
    saves.change(1, "/workspace/note.md", "edited");
    await vi.advanceTimersByTimeAsync(400);
    expect(writeTextFile).toHaveBeenCalledTimes(1);
    expect(saves.hasUnsavedWork(1)).toBe(true);

    nativeWrite.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(saves.hasUnsavedWork(1)).toBe(false);
  });

  it("stays true after a write fails", async () => {
    writeTextFile.mockRejectedValueOnce(new Error("disk full"));
    const saves = createSaveCoordinator();
    saves.change(1, "/workspace/note.md", "edited");
    await vi.advanceTimersByTimeAsync(400);
    await Promise.resolve();
    await Promise.resolve();

    expect(saves.hasUnsavedWork(1)).toBe(true);
    expect(saves.getError(1, "/workspace/note.md")).toBe("disk full");
  });

  it("is scoped to the given session, not any other session's entries", () => {
    const saves = createSaveCoordinator();
    saves.change(1, "/workspace/note.md", "edited");
    expect(saves.hasUnsavedWork(2)).toBe(false);
  });

  it("is false again after prepareForTransition drains the session", async () => {
    writeTextFile.mockResolvedValue();
    const saves = createSaveCoordinator();
    saves.change(1, "/workspace/note.md", "edited");
    expect(saves.hasUnsavedWork(1)).toBe(true);

    await saves.prepareForTransition(1);

    expect(saves.hasUnsavedWork(1)).toBe(false);
  });
});
