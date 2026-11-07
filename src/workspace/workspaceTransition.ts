import { signal } from "@preact/signals";

export type WorkspaceReset = () => void;

/** Spec `leotheca-workspace-profiles-sdd.md` section 16.3's four named
 * stages: `prepareOutgoing` is "save", `connectIncoming` is "access",
 * `loadIncoming` (and the synchronous `publishIncoming` right after it) is
 * "settings", and the post-publish `afterPublish` step that persists the
 * catalog is "global-config". */
export type WorkspaceTransitionPhase = "save" | "access" | "settings" | "global-config";

/** Section 16.1's typed transition state, verbatim. `targetProfileId` is
 * `null` for a transition with no incoming profile at all (forgetting the
 * active profile, which targets "no workspace"); `opening` never fires for
 * that case, since there is nothing to open, see `run()` below. */
export type WorkspaceTransitionState =
  | { status: "idle" }
  | { status: "saving"; targetProfileId: string | null }
  | { status: "opening"; targetProfileId: string }
  | {
      status: "error";
      targetProfileId: string | null;
      phase: WorkspaceTransitionPhase;
      message: string;
    };

export interface WorkspaceTransitionSteps<T> {
  /** Block outgoing work and drain anything that already crossed a native boundary. */
  prepareOutgoing: () => Promise<void>;
  /** Activate platform access for the candidate workspace. */
  connectIncoming: () => Promise<void>;
  /** Load all state needed before the workspace becomes visible. */
  loadIncoming: () => Promise<T>;
  /** Publish the already-loaded state synchronously. */
  publishIncoming: (loaded: T) => void;
  /** If the current transition fails after outgoing work has been invalidated,
   * publish a recoverable inactive state rather than leaving stale UI active.
   * `phase` names which of the four stages above actually failed (section
   * 16.1's own `error.phase`), and `isCurrent` lets a caller doing further
   * async recovery work (e.g. re-populating outgoing UI state) stop if a
   * newer transition has since taken over. */
  publishFailure?: (error: unknown, phase: WorkspaceTransitionPhase, isCurrent: () => boolean) => void;
  /** Optional post-publication restoration. It receives an authority check and
   * must stop mutating state once it becomes false. */
  afterPublish?: (isCurrent: () => boolean) => Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Something went wrong.";
}

/**
 * Serial authority for workspace changes. A newer request invalidates every
 * older request immediately, even while an older settings read is unresolved.
 * Only the current generation may clear outgoing stores or publish incoming
 * state. Outgoing stores are reset after their native work drains but before
 * the incoming grant is activated, so a late completion cannot repopulate old
 * state under the new Android `/workspace` identity.
 *
 * `state` (spec section 16.1) tracks this coordinator's own lifecycle for
 * any UI that wants to show progress or a failed-transition recovery banner,
 * in addition to (not instead of) each `run()` call's own `steps` callbacks;
 * a superseded transition (an older generation losing a race) never touches
 * `state` at all, matching section 16.2's "may not publish signals."
 */
export function createWorkspaceTransitionCoordinator() {
  let generation = 0;
  const resets = new Set<WorkspaceReset>();
  const state = signal<WorkspaceTransitionState>({ status: "idle" });

  function registerReset(reset: WorkspaceReset): () => void {
    resets.add(reset);
    return () => resets.delete(reset);
  }

  function currentGeneration(): number {
    return generation;
  }

  async function run<T>(
    steps: WorkspaceTransitionSteps<T>,
    targetProfileId: string | null = null,
  ): Promise<boolean> {
    const mine = ++generation;
    const isCurrent = () => generation === mine;
    let phase: WorkspaceTransitionPhase = "save";

    state.value = { status: "saving", targetProfileId };
    try {
      await steps.prepareOutgoing();
      if (!isCurrent()) return false;

      for (const reset of resets) reset();
      if (!isCurrent()) return false;

      phase = "access";
      // A transition with no real target (forget-active) never has
      // anything to "open"; connectIncoming/loadIncoming are no-ops for it,
      // so skip announcing a spinner state with nothing behind it.
      if (targetProfileId !== null) state.value = { status: "opening", targetProfileId };
      await steps.connectIncoming();
      if (!isCurrent()) return false;

      phase = "settings";
      const loaded = await steps.loadIncoming();
      if (!isCurrent()) return false;

      steps.publishIncoming(loaded);
      if (!isCurrent()) return false;

      state.value = { status: "idle" };
      if (steps.afterPublish) {
        phase = "global-config";
        await steps.afterPublish(isCurrent);
      }
      return isCurrent();
    } catch (error) {
      if (!isCurrent()) return false;
      for (const reset of resets) reset();
      state.value = { status: "error", targetProfileId, phase, message: errorMessage(error) };
      steps.publishFailure?.(error, phase, isCurrent);
      throw error;
    }
  }

  return { run, registerReset, currentGeneration, state };
}

export const workspaceTransitions = createWorkspaceTransitionCoordinator();
