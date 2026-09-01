import { describe, expect, it, vi } from "vitest";
import { createWorkspaceTransitionCoordinator } from "./workspaceTransition";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

describe("workspace transition authority", () => {
  it("publishes B when A's settings load finishes after B", async () => {
    const coordinator = createWorkspaceTransitionCoordinator();
    const loadA = deferred<string>();
    const loadB = deferred<string>();
    const published: string[] = [];
    const reset = vi.fn();
    coordinator.registerReset(reset);

    const a = coordinator.run({
      prepareOutgoing: async () => {},
      connectIncoming: async () => {},
      loadIncoming: () => loadA.promise,
      publishIncoming: (value) => published.push(value),
    });
    await Promise.resolve();
    await Promise.resolve();

    const b = coordinator.run({
      prepareOutgoing: async () => {},
      connectIncoming: async () => {},
      loadIncoming: () => loadB.promise,
      publishIncoming: (value) => published.push(value),
    });
    await Promise.resolve();
    await Promise.resolve();

    loadB.resolve("B");
    await expect(b).resolves.toBe(true);
    loadA.resolve("A");
    await expect(a).resolves.toBe(false);

    expect(published).toEqual(["B"]);
    // Each transition owns a pre-connect outgoing reset. A clears the old
    // workspace before waiting on its settings load; B then supersedes A and
    // clears that outgoing state again before connecting B. Only B publishes.
    expect(reset).toHaveBeenCalledTimes(2);
  });

  it("prevents stale post-publish restoration from mutating after a newer request", async () => {
    const coordinator = createWorkspaceTransitionCoordinator();
    const holdRestore = deferred<void>();
    const restored: string[] = [];

    const a = coordinator.run({
      prepareOutgoing: async () => {},
      connectIncoming: async () => {},
      loadIncoming: async () => "A",
      publishIncoming: () => {},
      afterPublish: async (isCurrent) => {
        await holdRestore.promise;
        if (isCurrent()) restored.push("A");
      },
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const b = coordinator.run({
      prepareOutgoing: async () => {},
      connectIncoming: async () => {},
      loadIncoming: async () => "B",
      publishIncoming: () => {},
      afterPublish: async (isCurrent) => {
        if (isCurrent()) restored.push("B");
      },
    });
    await expect(b).resolves.toBe(true);
    holdRestore.resolve();
    await expect(a).resolves.toBe(false);

    expect(restored).toEqual(["B"]);
  });
});
