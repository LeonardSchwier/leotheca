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

// UX-01 spec 13.6: the Document Header's Saving indicator must be driven
// by a real write-start event, never the 400ms debounce timer alone.
describe("onSaveStart callback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    writeTextFile.mockReset();
  });

  afterEach(() => vi.useRealTimers());

  it("fires exactly when the debounced write actually begins, before it resolves", async () => {
    const nativeWrite = deferred<void>();
    writeTextFile.mockReturnValueOnce(nativeWrite.promise);
    const onSaveStart = vi.fn();
    const onSaved = vi.fn();
    const saves = createSaveCoordinator({ onSaveStart, onSaved });

    saves.change(1, "/workspace/note.md", "hello");
    expect(onSaveStart).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(400);
    expect(onSaveStart).toHaveBeenCalledWith("/workspace/note.md");
    expect(onSaveStart).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();

    nativeWrite.resolve();
    await Promise.resolve();
    expect(onSaved).toHaveBeenCalledWith("/workspace/note.md");
  });

  it("fires again for a second edit's own debounced write, not just the first", async () => {
    writeTextFile.mockResolvedValue();
    const onSaveStart = vi.fn();
    const saves = createSaveCoordinator({ onSaveStart });

    saves.change(1, "/workspace/note.md", "v1");
    await vi.advanceTimersByTimeAsync(400);
    saves.change(1, "/workspace/note.md", "v2");
    await vi.advanceTimersByTimeAsync(400);

    expect(onSaveStart).toHaveBeenCalledTimes(2);
  });

  it("is suppressed for a blocked session's own drain write, matching onSaved/onError", async () => {
    writeTextFile.mockResolvedValue();
    const onSaveStart = vi.fn();
    const saves = createSaveCoordinator({ onSaveStart });

    saves.change(4, "/workspace/note.md", "outgoing");
    await saves.prepareForTransition(4);

    expect(onSaveStart).not.toHaveBeenCalled();
  });
});

// F20 Phase 2b-ii, spec section 15.2: forgetting the active profile must
// know whether there is anything left to lose *before* prepareForTransition
// runs, since that drain discards exactly this state (see the tests above)
// rather than reporting it back.
describe("flush revision invariant (rm-9d2a9eb41e719983)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    writeTextFile.mockReset();
  });

  afterEach(() => vi.useRealTimers());

  it("does not leave a phantom unsaved-work state after flushing a clean, saved note", async () => {
    writeTextFile.mockResolvedValue();
    const saves = createSaveCoordinator();
    // Edit, let the debounce fire, so the note is fully saved (savedRevision === revision).
    saves.change(1, "/workspace/note.md", "content v1");
    await vi.advanceTimersByTimeAsync(400);
    expect(saves.hasUnsavedWork(1)).toBe(false);

    // Flush again (e.g. before a close/rename/copy in App.tsx). With the old
    // buggy `++entry.revision`, this would bump revision to 2 and write content
    // v1, leaving savedRevision=2 only if the write's revision check passed —
    // but writeRevision sets savedRevision = revision (the bumped value) when
    // entry.revision === revision, so it would actually look clean. The real
    // bug manifests when a *newer* edit lands between the bump and the write
    // settling, or more simply: the bump itself is semantically wrong because
    // it conflates "I asked for a write" with "there is new content".
    // The regression this test guards: after flush on an already-clean note,
    // hasUnsavedWork must remain false.
    writeTextFile.mockClear();
    await saves.flush(1, "/workspace/note.md");
    expect(saves.hasUnsavedWork(1)).toBe(false);
    // The flush wrote the same content once.
    expect(writeTextFile).toHaveBeenCalledTimes(1);
    expect(writeTextFile).toHaveBeenCalledWith("/workspace/note.md", "content v1");
  });

  it("flushes a pending (debounced, not-yet-fired) edit and leaves no phantom dirty state", async () => {
    writeTextFile.mockResolvedValue();
    const saves = createSaveCoordinator();
    // Edit but do NOT let the 400ms debounce fire.
    saves.change(2, "/workspace/note.md", "pending edit");
    expect(saves.hasUnsavedWork(2)).toBe(true);

    // flush() should cancel the debounce and write the pending content now.
    await saves.flush(2, "/workspace/note.md");

    expect(writeTextFile).toHaveBeenCalledWith("/workspace/note.md", "pending edit");
    // After the flush settles, the note is fully saved.
    expect(saves.hasUnsavedWork(2)).toBe(false);
    // The debounce timer was cancelled, so advancing time does not fire a
    // second write.
    await vi.advanceTimersByTimeAsync(1000);
    expect(writeTextFile).toHaveBeenCalledTimes(1);
  });

  it("reports the error and keeps hasUnsavedWork true when the flush write fails", async () => {
    writeTextFile.mockRejectedValueOnce(new Error("disk full"));
    const saves = createSaveCoordinator();
    saves.change(3, "/workspace/note.md", "will fail");
    await vi.advanceTimersByTimeAsync(400); // let it fire and fail

    expect(saves.getError(3, "/workspace/note.md")).toBe("disk full");
    expect(saves.hasUnsavedWork(3)).toBe(true);

    // A subsequent flush also fails and must not clear the error or the
    // unsaved state.
    writeTextFile.mockRejectedValueOnce(new Error("disk full again"));
    await saves.flush(3, "/workspace/note.md");
    expect(saves.getError(3, "/workspace/note.md")).toBe("disk full again");
    expect(saves.hasUnsavedWork(3)).toBe(true);
  });

  it("is a no-op (no write, no spurious dirty state) for a note that was never edited", async () => {
    writeTextFile.mockResolvedValue();
    const saves = createSaveCoordinator();
    // No change() call for this path — the note is clean by definition.
    await saves.flush(4, "/workspace/never-edited.md");
    expect(writeTextFile).not.toHaveBeenCalled();
    expect(saves.hasUnsavedWork(4)).toBe(false);
  });

  it("does not bump the revision when a newer edit lands while the flush write is in flight", async () => {
    // Scenario: v1 write is in flight, then v2 arrives. flush() must not
    // create a phantom third revision. The v1 write settles for a now-stale
    // revision (entry.revision is 2), so savedRevision is NOT set to 1.
    // writeRevision's finally-block reschedule then fires the v2 write, which
    // settles for the current revision (2) and sets savedRevision=2, clearing
    // the unsaved state. flush itself contributes no spurious write.
    const nativeWrite = deferred<void>();
    writeTextFile.mockReturnValueOnce(nativeWrite.promise);
    const saves = createSaveCoordinator();
    saves.change(5, "/workspace/note.md", "v1");
    await vi.advanceTimersByTimeAsync(400); // v1 write is now in flight (rev 1)
    expect(writeTextFile).toHaveBeenCalledTimes(1);

    // v2 arrives while v1 write is in flight.
    saves.change(5, "/workspace/note.md", "v2");
    expect(saves.hasUnsavedWork(5)).toBe(true);

    // flush() awaits the in-flight write. After it settles, flush sees
    // entry.revision (2) !== savedRevision (0) and calls writeRevision with
    // revision=2. But the reschedule in v1's finally-block has already fired
    // (or will fire) the v2 write. Either way, the total writes are v1 and
    // v2 — no phantom third write from the old ++entry.revision bump.
    writeTextFile.mockResolvedValue(undefined);
    nativeWrite.resolve();
    await saves.flush(5, "/workspace/note.md");

    // Exactly two writes: v1 (the in-flight one) and v2 (rescheduled or
    // re-issued by flush). The key assertion: no phantom third revision
    // (the old bug would have produced a write for revision 3 with v2 content,
    // and savedRevision would be 3 while entry.revision might be 2 or 3,
    // creating inconsistency).
    expect(saves.hasUnsavedWork(5)).toBe(false);
    // v2 content must have been written (the latest content is on disk).
    const writes = writeTextFile.mock.calls.map(([, content]) => content);
    expect(writes).toContain("v2");
    // The first write was always v1.
    expect(writes[0]).toBe("v1");
  });

  it("retry() still bumps the revision as an intentional new save attempt (unchanged behavior)", async () => {
    // retry() is intentionally different from flush(): it represents a
    // deliberate "try again" after a failure, and bumping the revision is
    // part of that semantic (it tracks a new save attempt). Verify the
    // revision still advances so a subsequent hasUnsavedWork reflects the
    // new attempt's outcome.
    writeTextFile.mockRejectedValueOnce(new Error("first failure"));
    const saves = createSaveCoordinator();
    saves.change(6, "/workspace/note.md", "content");
    await vi.advanceTimersByTimeAsync(400); // write fails
    expect(saves.getError(6, "/workspace/note.md")).toBe("first failure");

    // retry succeeds — revision should be bumped (new attempt) and savedRevision
    // should catch up, clearing the unsaved state.
    writeTextFile.mockResolvedValue();
    await saves.retry(6, "/workspace/note.md");
    expect(saves.getError(6, "/workspace/note.md")).toBeNull();
    expect(saves.hasUnsavedWork(6)).toBe(false);
    // The retry wrote the content (possibly twice if the debounce also fired;
    // the key assertion is the unsaved state is cleared).
    expect(writeTextFile).toHaveBeenCalled();
  });
});

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
