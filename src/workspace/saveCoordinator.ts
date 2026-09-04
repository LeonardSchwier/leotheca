import * as bridge from "./tauriBridge";

interface SaveEntry {
  revision: number;
  latestContent: string;
  inFlight: boolean;
  /** The exact revision the current in-flight write (if any) is for, `null`
   * otherwise. Lets `prepareForTransition` tell "the write we waited for
   * settled for a now-stale revision" (a genuinely newer edit arrived while
   * it was running, so it deserves its own follow-up write) apart from
   * "the write we waited for is the most recent edit and it failed" (a real
   * failure, not a stale-revision race), which `entry.lastError` alone
   * cannot: a write settling for a stale revision leaves `lastError`
   * whatever it already was, which could itself be a leftover error from an
   * even earlier failed attempt. */
  inFlightRevision: number | null;
  savedRevision: number;
  timer: ReturnType<typeof setTimeout> | null;
  lastError: string | null;
  waiters: Set<() => void>;
}

function sessionKey(session: string | number | null): string {
  return session === null ? "<null>" : String(session);
}

export function makeKey(session: string | number | null, path: string): string {
  return `${sessionKey(session)}::${path}`;
}

export interface SaveCoordinatorCallbacks {
  onSaved?: (path: string) => void;
  onError?: (path: string, error: string) => void;
}

export interface SaveCoordinator {
  change(session: string | number | null, path: string, content: string): void;
  flush(session: string | number | null, path: string): Promise<void>;
  waitForInflight(session: string | number | null, path: string): Promise<void>;
  prepareForTransition(session: string | number | null, options?: { discard?: boolean }): Promise<void>;
  resetForSession(currentSession: string | number | null): void;
  retry(session: string | number | null, path: string): Promise<void>;
  getError(session: string | number | null, path: string): string | null;
  hasUnsavedWork(session: string | number | null): boolean;
  entryCount(): number;
  debugEntries(): Array<{ key: string; entry: Omit<SaveEntry, "timer" | "waiters"> }>;
}

// App.tsx owns the editor coordinator instance. The settings transition layer
// cannot import App without a cycle, so the factory registers the latest app
// coordinator here. Tests that construct isolated coordinators still get fresh
// instances; only explicit consumers of this module-level authority use the
// registered one.
let activeCoordinator: SaveCoordinator | null = null;

/** Returns the app-owned save authority when the editor shell has initialized.
 * Auxiliary editing surfaces must fail closed when it is absent rather than
 * constructing a second coordinator for the same note path. */
export function getActiveSaveCoordinator(): SaveCoordinator | null {
  return activeCoordinator;
}

export async function prepareActiveSavesForTransition(
  session: string | number | null,
  options?: { discard?: boolean },
): Promise<void> {
  await activeCoordinator?.prepareForTransition(session, options);
}

/** No registered coordinator (the editor shell hasn't initialized, or a
 * test constructed its own isolated instance) means there is nothing this
 * session could possibly have left unsaved. */
export function hasActiveUnsavedWork(session: string | number | null): boolean {
  return activeCoordinator?.hasUnsavedWork(session) ?? false;
}

function writeWorkspaceRevision(path: string, content: string): Promise<void> {
  // Production tauriBridge always exposes the capability-aware writer. A few
  // older whole-module test doubles intentionally provide only writeTextFile.
  // Vitest's strict module-mock proxy throws when an omitted export is read, so
  // probe for the export before accessing it. This keeps those doubles usable
  // without weakening the real app path: the production module always takes
  // the capability-aware branch.
  const writers = bridge as unknown as {
    writeTextFile: typeof bridge.writeTextFile;
    writeActiveWorkspaceTextFile?: typeof bridge.writeTextFile;
  };
  const writer =
    "writeActiveWorkspaceTextFile" in writers
      ? writers.writeActiveWorkspaceTextFile!
      : writers.writeTextFile;
  return writer(path, content);
}

/**
 * Coordinates debounced note writes for one app lifetime.
 *
 * N-001/N-003 adds an explicit transition barrier: once a session is being
 * left, new edits for it are rejected, pending timers are cancelled, and
 * already-invoked native writes are drained before Android SAF access changes.
 * F-004 routes every actual note write through the active workspace capability
 * held by tauriBridge, so autosave cannot bypass native containment.
 */
export function createSaveCoordinator(cbs?: SaveCoordinatorCallbacks): SaveCoordinator {
  const entries = new Map<string, SaveEntry>();
  const blockedSessions = new Set<string>();

  function isBlocked(session: string | number | null): boolean {
    return blockedSessions.has(sessionKey(session));
  }

  function getOrCreate(session: string | number | null, path: string): SaveEntry {
    const key = makeKey(session, path);
    let entry = entries.get(key);
    if (!entry) {
      entry = {
        revision: 0,
        latestContent: "",
        inFlight: false,
        inFlightRevision: null,
        savedRevision: 0,
        timer: null,
        lastError: null,
        waiters: new Set(),
      };
      entries.set(key, entry);
    }
    return entry;
  }

  function resolveWaiters(entry: SaveEntry): void {
    for (const resolve of entry.waiters) resolve();
    entry.waiters.clear();
  }

  function waitForEntry(entry: SaveEntry): Promise<void> {
    if (!entry.inFlight) return Promise.resolve();
    return new Promise((resolve) => entry.waiters.add(resolve));
  }

  function schedule(
    session: string | number | null,
    path: string,
    entry: SaveEntry,
    revision: number,
  ): void {
    if (isBlocked(session)) return;
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      entry.timer = null;
      if (isBlocked(session) || entry.inFlight || entry.revision !== revision) return;
      void writeRevision(session, path, entry, revision);
    }, 400);
  }

  /** `bypassBlockGate` lets `prepareForTransition` below issue an authorized
   * write for a session it has *itself* just blocked, without opening that
   * gate to any other caller (every other call site still passes the
   * default `false`, unchanged). Bookkeeping (`savedRevision`/`lastError`)
   * always updates on the actual write outcome regardless of block state,
   * since a blocked session is still alive in memory and its own drain
   * needs an accurate answer to "did this actually land"; only the
   * `onSaved`/`onError` *callbacks* (which the app wires to live UI) stay
   * suppressed for a blocked session, the original reason this gate
   * existed. The reschedule-on-a-newer-revision below intentionally stays
   * blocked-gated too: `prepareForTransition`'s own explicit follow-up pass
   * is what picks up a newer revision that arrives while blocked, not an
   * implicit reschedule that could race its own drain. */
  async function writeRevision(
    session: string | number | null,
    path: string,
    entry: SaveEntry,
    revision: number,
    bypassBlockGate = false,
  ): Promise<void> {
    if (!bypassBlockGate && isBlocked(session)) return;
    entry.inFlight = true;
    entry.inFlightRevision = revision;
    const content = entry.latestContent;
    try {
      await writeWorkspaceRevision(path, content);
      if (entry.revision === revision) {
        entry.savedRevision = revision;
        entry.lastError = null;
        if (!isBlocked(session)) cbs?.onSaved?.(path);
      }
    } catch (error) {
      entry.lastError = error instanceof Error ? error.message : String(error);
      if (!isBlocked(session)) cbs?.onError?.(path, entry.lastError);
    } finally {
      entry.inFlight = false;
      entry.inFlightRevision = null;
      resolveWaiters(entry);
      if (!isBlocked(session) && entry.revision > revision && !entry.timer) {
        schedule(session, path, entry, entry.revision);
      }
    }
  }

  function change(session: string | number | null, path: string, content: string): void {
    if (isBlocked(session)) return;
    const entry = getOrCreate(session, path);
    entry.latestContent = content;
    entry.revision += 1;
    if (entry.inFlight) return;
    schedule(session, path, entry, entry.revision);
  }

  async function flush(session: string | number | null, path: string): Promise<void> {
    if (isBlocked(session)) return;
    const entry = getOrCreate(session, path);
    if (entry.timer) {
      clearTimeout(entry.timer);
      entry.timer = null;
    }
    await waitForEntry(entry);
    if (isBlocked(session)) return;
    const revision = ++entry.revision;
    await writeRevision(session, path, entry, revision);
  }

  function waitForInflight(session: string | number | null, path: string): Promise<void> {
    const entry = entries.get(makeKey(session, path));
    return entry ? waitForEntry(entry) : Promise.resolve();
  }

  /** F20 Phase 2b-iii-b follow-up (spec `leotheca-workspace-profiles-sdd.md`
   * section 16.3 steps 3/4/6): actually *flushes* delayed saves (writes
   * them) rather than only cancelling their timer, then waits for
   * already-in-flight writes, matching step 3's own word "flush." Throws
   * (leaving every entry for `session` intact and un-blocking it, so
   * editing can resume) if anything for this session still hasn't reached
   * disk once that settles, per step 6's "abort on a save failure." Only a
   * clean drain (every entry's `revision === savedRevision`) deletes the
   * session's entries and lets the caller proceed to actually open the
   * target workspace. A write that fails here is reported, not silently
   * retried: retrying automatically would mask which failure actually
   * caused the abort and double real disk/network cost for what might be a
   * persistent, not transient, failure; `writeRevision`'s own `entry.retry`
   * path (already exposed elsewhere) is how a deliberate retry happens.
   *
   * The one deliberate second pass is narrower than "retry everything
   * again": an entry that was already in flight when this function started
   * may pick up a *newer* revision once that write settles, since
   * `change()` bumps `revision` but deliberately skips scheduling a new
   * timer while `inFlight` (see `change` above), and the ordinary
   * reschedule-on-finish in `writeRevision` is itself gated on the session
   * not being blocked, which it now is. That follow-up write only ever
   * fires for entries whose revision has genuinely moved past what the
   * write we waited for was actually for (`entry.inFlightRevision`, not
   * `entry.lastError`: a write settling for a now-stale revision leaves
   * `lastError` exactly as it already was, which could itself be a leftover
   * error from an even earlier, unrelated failed attempt), never for one
   * that was written directly here and failed at its own, still-current
   * revision. Blocking happens synchronously, before any `await` in this
   * function, so no further generation of edits can arrive once the first
   * pass has started.
   *
   * `discard` (spec section 16.6, "Switch without saving," an explicitly
   * user-confirmed destructive fallback for exactly the failure this
   * function itself would otherwise report) skips every write attempt
   * above entirely and reverts to only cancelling pending timers and
   * waiting for whatever was already in flight, the same as this function
   * always did before this disclosure; it never throws and always deletes
   * the session's entries, since the caller has already accepted the loss. */
  async function prepareForTransition(
    session: string | number | null,
    options?: { discard?: boolean },
  ): Promise<void> {
    const prefix = `${sessionKey(session)}::`;
    const pending: Array<[string, SaveEntry]> = [];
    const wasInFlight: Array<[string, SaveEntry, number | null]> = [];
    for (const [key, entry] of entries) {
      if (!key.startsWith(prefix)) continue;
      if (entry.timer) {
        clearTimeout(entry.timer);
        entry.timer = null;
      }
      pending.push([key, entry]);
      if (entry.inFlight) wasInFlight.push([key, entry, entry.inFlightRevision]);
    }
    blockedSessions.add(sessionKey(session));

    if (options?.discard) {
      await Promise.all(wasInFlight.map(([, entry]) => waitForEntry(entry)));
      for (const [key] of pending) entries.delete(key);
      return;
    }

    await Promise.all(
      pending.map(([key, entry]) =>
        entry.inFlight
          ? waitForEntry(entry)
          : entry.revision !== entry.savedRevision
            ? writeRevision(session, key.slice(prefix.length), entry, entry.revision, true)
            : undefined,
      ),
    );

    await Promise.all(
      wasInFlight
        .filter(
          ([, entry, waitedForRevision]) =>
            !entry.inFlight && entry.revision !== entry.savedRevision && entry.revision !== waitedForRevision,
        )
        .map(([key, entry]) => writeRevision(session, key.slice(prefix.length), entry, entry.revision, true)),
    );

    const failedPaths = pending
      .filter(([, entry]) => entry.revision !== entry.savedRevision)
      .map(([key]) => key.slice(prefix.length));

    if (failedPaths.length > 0) {
      blockedSessions.delete(sessionKey(session));
      throw new Error(
        failedPaths.length === 1
          ? `Could not save "${failedPaths[0]}".`
          : `Could not save ${failedPaths.length} notes: ${failedPaths.join(", ")}.`,
      );
    }

    for (const [key] of pending) entries.delete(key);
  }

  /** Defensive cleanup after a new session publishes. The authoritative drain
   * happened before publication; this only removes any non-current leftovers
   * from legacy callers and never blocks the newly published session. */
  function resetForSession(currentSession: string | number | null): void {
    const currentPrefix = `${sessionKey(currentSession)}::`;
    for (const [key, entry] of entries) {
      if (key.startsWith(currentPrefix)) continue;
      const oldSession = key.slice(0, key.indexOf("::"));
      blockedSessions.add(oldSession);
      if (entry.timer) clearTimeout(entry.timer);
      entry.timer = null;
      if (!entry.inFlight) entries.delete(key);
    }
  }

  async function retry(session: string | number | null, path: string): Promise<void> {
    if (isBlocked(session)) return;
    const entry = getOrCreate(session, path);
    await waitForEntry(entry);
    if (isBlocked(session)) return;
    entry.lastError = null;
    const revision = ++entry.revision;
    await writeRevision(session, path, entry, revision);
  }

  function getError(session: string | number | null, path: string): string | null {
    return entries.get(makeKey(session, path))?.lastError ?? null;
  }

  /** F20 Phase 2b-ii, spec section 15.2: whether `session` has any note whose
   * latest edit has not actually reached disk yet, pending (not yet fired),
   * in flight, or failed (a failed write never advances `savedRevision`).
   * Checked *before* calling `prepareForTransition` so `forgetWorkspaceProfile`
   * can ask for confirmation up front, matching that action's own "aborted
   * by default" design (forgetting has no "stay on A and keep editing"
   * recovery the way an ordinary switch failure now does, see
   * `prepareForTransition`'s own doc comment below for how *that* path
   * actually flushes rather than discards this same state as of F20 Phase
   * 2b-iii-b's follow-up fix). `forgetWorkspaceProfile`'s active-profile path
   * uses this to decide whether to even attempt the drain, rather than running it first
   * and discovering the loss afterward. */
  function hasUnsavedWork(session: string | number | null): boolean {
    const prefix = `${sessionKey(session)}::`;
    for (const [key, entry] of entries) {
      if (key.startsWith(prefix) && entry.revision !== entry.savedRevision) return true;
    }
    return false;
  }

  function entryCount(): number {
    return entries.size;
  }

  /** Returns a copy of all entries (for testing/debugging). */
  function debugEntries(): Array<{
    key: string;
    entry: Omit<SaveEntry, "timer" | "waiters">;
  }> {
    return Array.from(entries, ([key, entry]) => ({
      key,
      entry: {
        revision: entry.revision,
        latestContent: entry.latestContent,
        inFlight: entry.inFlight,
        inFlightRevision: entry.inFlightRevision,
        savedRevision: entry.savedRevision,
        lastError: entry.lastError,
      },
    }));
  }

  const api: SaveCoordinator = {
    change,
    flush,
    waitForInflight,
    prepareForTransition,
    resetForSession,
    retry,
    getError,
    hasUnsavedWork,
    entryCount,
    debugEntries,
  };
  activeCoordinator = api;
  return api;
}
