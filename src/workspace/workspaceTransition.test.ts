import { describe, expect, it, vi } from "vitest";
import { createWorkspaceTransitionCoordinator } from "./workspaceTransition";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
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

describe("workspace transition state (F20 Phase 2b-iii-b, spec section 16.1)", () => {
  it("moves saving -> opening -> idle on a successful transition with a real target", async () => {
    const coordinator = createWorkspaceTransitionCoordinator();
    const observed: string[] = [];
    const record = () => observed.push(coordinator.state.value.status);

    record();
    const run = coordinator.run(
      {
        prepareOutgoing: async () => { record(); },
        connectIncoming: async () => { record(); },
        loadIncoming: async () => "B",
        publishIncoming: () => {},
      },
      "profile-b",
    );
    await run;
    record();

    expect(observed).toEqual(["idle", "saving", "opening", "idle"]);
  });

  it("never announces opening for a transition with no real target (e.g. forget-active)", async () => {
    const coordinator = createWorkspaceTransitionCoordinator();
    const observed: string[] = [];

    await coordinator.run({
      prepareOutgoing: async () => { observed.push(coordinator.state.value.status); },
      connectIncoming: async () => { observed.push(coordinator.state.value.status); },
      loadIncoming: async () => undefined,
      publishIncoming: () => {},
    });

    expect(observed).toEqual(["saving", "saving"]);
  });

  it("reports the save phase and the target profile id when prepareOutgoing rejects", async () => {
    const coordinator = createWorkspaceTransitionCoordinator();
    const failure = new Error("flush failed");

    await expect(
      coordinator.run(
        {
          prepareOutgoing: async () => {
            throw failure;
          },
          connectIncoming: async () => {},
          loadIncoming: async () => "B",
          publishIncoming: () => {},
        },
        "profile-b",
      ),
    ).rejects.toBe(failure);

    expect(coordinator.state.value).toEqual({
      status: "error",
      targetProfileId: "profile-b",
      phase: "save",
      message: "flush failed",
    });
  });

  it("reports the access phase when connectIncoming rejects", async () => {
    const coordinator = createWorkspaceTransitionCoordinator();

    await expect(
      coordinator.run(
        {
          prepareOutgoing: async () => {},
          connectIncoming: async () => {
            throw new Error("permission denied");
          },
          loadIncoming: async () => "B",
          publishIncoming: () => {},
        },
        "profile-b",
      ),
    ).rejects.toThrow("permission denied");

    expect(coordinator.state.value).toMatchObject({ status: "error", phase: "access", targetProfileId: "profile-b" });
  });

  it("reports the settings phase when loadIncoming rejects", async () => {
    const coordinator = createWorkspaceTransitionCoordinator();

    await expect(
      coordinator.run(
        {
          prepareOutgoing: async () => {},
          connectIncoming: async () => {},
          loadIncoming: async () => {
            throw new Error("malformed settings");
          },
          publishIncoming: () => {},
        },
        "profile-b",
      ),
    ).rejects.toThrow("malformed settings");

    expect(coordinator.state.value).toMatchObject({ status: "error", phase: "settings" });
  });

  it("reports the global-config phase, without discarding a successful publish, when afterPublish rejects", async () => {
    const coordinator = createWorkspaceTransitionCoordinator();
    const published: string[] = [];

    await expect(
      coordinator.run(
        {
          prepareOutgoing: async () => {},
          connectIncoming: async () => {},
          loadIncoming: async () => "B",
          publishIncoming: (value) => published.push(value),
          afterPublish: async () => {
            throw new Error("catalog write failed");
          },
        },
        "profile-b",
      ),
    ).rejects.toThrow("catalog write failed");

    expect(published).toEqual(["B"]);
    expect(coordinator.state.value).toMatchObject({ status: "error", phase: "global-config" });
  });

  it("passes the phase and a live isCurrent check to publishFailure", async () => {
    const coordinator = createWorkspaceTransitionCoordinator();
    const seen: { phase: string; isCurrentAtCallTime: boolean }[] = [];

    await expect(
      coordinator.run(
        {
          prepareOutgoing: async () => {},
          connectIncoming: async () => {
            throw new Error("gone");
          },
          loadIncoming: async () => "B",
          publishIncoming: () => {},
          publishFailure: (_error, phase, isCurrent) => {
            seen.push({ phase, isCurrentAtCallTime: isCurrent() });
          },
        },
        "profile-b",
      ),
    ).rejects.toThrow("gone");

    expect(seen).toEqual([{ phase: "access", isCurrentAtCallTime: true }]);
  });

  it("never touches state for a superseded transition's own failure (transition_superseded is silent)", async () => {
    const coordinator = createWorkspaceTransitionCoordinator();
    const loadA = deferred<string>();

    const a = coordinator.run(
      {
        prepareOutgoing: async () => {},
        connectIncoming: async () => {},
        loadIncoming: () => loadA.promise,
        publishIncoming: () => {},
      },
      "profile-a",
    );
    await Promise.resolve();
    await Promise.resolve();

    const b = coordinator.run(
      {
        prepareOutgoing: async () => {},
        connectIncoming: async () => {},
        loadIncoming: async () => "B",
        publishIncoming: () => {},
      },
      "profile-b",
    );
    await expect(b).resolves.toBe(true);
    expect(coordinator.state.value).toEqual({ status: "idle" });

    loadA.reject(new Error("stale failure from A"));
    await expect(a).resolves.toBe(false);

    // B already published and returned to idle; A's own late rejection must
    // not overwrite that with a spurious error state.
    expect(coordinator.state.value).toEqual({ status: "idle" });
  });
});
