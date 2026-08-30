export type WorkspaceReset = () => void;

export interface WorkspaceTransitionSteps<T> {
  /** Block outgoing work and drain anything that already crossed a native boundary. */
  prepareOutgoing: () => Promise<void>;
  /** Activate platform access for the candidate workspace. */
  connectIncoming: () => Promise<void>;
  /** Load all state needed before the workspace becomes visible. */
  loadIncoming: () => Promise<T>;
  /** Publish the already-loaded state synchronously. */
  publishIncoming: (loaded: T) => void;
  /** Optional post-publication restoration. It receives an authority check and
   * must stop mutating state once it becomes false. */
  afterPublish?: (isCurrent: () => boolean) => Promise<void>;
}

/**
 * Serial authority for workspace changes. A newer request invalidates every
 * older request immediately, even while an older settings read is unresolved.
 * Only the current generation may clear outgoing stores or publish incoming
 * state.
 */
export function createWorkspaceTransitionCoordinator() {
  let generation = 0;
  const resets = new Set<WorkspaceReset>();

  function registerReset(reset: WorkspaceReset): () => void {
    resets.add(reset);
    return () => resets.delete(reset);
  }

  function currentGeneration(): number {
    return generation;
  }

  async function run<T>(steps: WorkspaceTransitionSteps<T>): Promise<boolean> {
    const mine = ++generation;
    const isCurrent = () => generation === mine;

    await steps.prepareOutgoing();
    if (!isCurrent()) return false;

    await steps.connectIncoming();
    if (!isCurrent()) return false;

    const loaded = await steps.loadIncoming();
    if (!isCurrent()) return false;

    for (const reset of resets) reset();
    if (!isCurrent()) return false;

    steps.publishIncoming(loaded);
    if (!isCurrent()) return false;

    if (steps.afterPublish) await steps.afterPublish(isCurrent);
    return isCurrent();
  }

  return { run, registerReset, currentGeneration };
}

export const workspaceTransitions = createWorkspaceTransitionCoordinator();
