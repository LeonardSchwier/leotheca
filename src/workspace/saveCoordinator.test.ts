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

  it("cancels pending outgoing debounces and rejects later edits for that session", async () => {
    writeTextFile.mockResolvedValue();
    const saves = createSaveCoordinator();
    saves.change(3, "/workspace/note.md", "outgoing");

    await saves.prepareForTransition(3);
    saves.change(3, "/workspace/note.md", "late outgoing");
    await vi.advanceTimersByTimeAsync(1000);

    expect(writeTextFile).not.toHaveBeenCalled();
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
