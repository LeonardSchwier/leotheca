import { writeTextFile } from "./tauriBridge";

interface SaveEntry {
  revision: number;
  latestContent: string;
  inFlight: boolean;
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

/**
 * Coordinates debounced note writes for one app lifetime.
 *
 * N-001/N-003 adds an explicit transition barrier: once a session is being
 * left, new edits for it are rejected, pending timers are cancelled, and
 * already-invoked native writes are drained before the caller is allowed to
 * change Android SAF access. Session ids are monotonic, so an invalidated
 * session never becomes writable again.
 */
export function createSaveCoordinator(cbs?: SaveCoordinatorCallbacks) {
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

  async function writeRevision(
    session: string | number | null,
    path: string,
    entry: SaveEntry,
    revision: number,
  ): Promise<void> {
    if (isBlocked(session)) return;
    entry.inFlight = true;
    const content = entry.latestContent;
    try {
      await writeTextFile(path, content);
      if (entry.revision === revision && !isBlocked(session)) {
        entry.savedRevision = revision;
        entry.lastError = null;
        cbs?.onSaved?.(path);
      }
    } catch (error) {
      entry.lastError = error instanceof Error ? error.message : String(error);
      if (!isBlocked(session)) cbs?.onError?.(path, entry.lastError);
    } finally {
      entry.inFlight = false;
      resolveWaiters(entry);
      // A change may have arrived while this write was in flight. Preserve the
      // debounce contract by scheduling that newer revision now rather than
      // silently dropping it.
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

  /**
   * Invalidates an outgoing workspace session and resolves only after every
   * native write already invoked for that session has settled. The caller can
   * safely swap an Android SAF grant only after this promise resolves.
   */
  async function prepareForTransition(session: string | number | null): Promise<void> {
    const keyPrefix = `${sessionKey(session)}::`;
    blockedSessions.add(sessionKey(session));
    const waits: Promise<void>[] = [];
    for (const [key, entry] of entries) {
      if (!key.startsWith(keyPrefix)) continue;
      if (entry.timer) {
        clearTimeout(entry.timer);
        entry.timer = null;
      }
      if (entry.inFlight) waits.push(waitForEntry(entry));
    }
    await Promise.all(waits);
    for (const key of Array.from(entries.keys())) {
      if (key.startsWith(keyPrefix)) entries.delete(key);
    }
  }

  /** Legacy synchronous invalidation kept for narrow callers/tests. New
   * workspace transitions must use prepareForTransition() and await it. */
  function resetForSession(session: string | number | null): void {
    const keyPrefix = `${sessionKey(session)}::`;
    blockedSessions.add(sessionKey(session));
    for (const [key, entry] of entries) {
      if (!key.startsWith(keyPrefix)) continue;
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

  function entryCount(): number {
    return entries.size;
  }

  function debugEntries(): Array<{
    key: string;
    entry: Omit<SaveEntry, "timer" | "waiters">;
  }> {
    return Array.from(entries, ([key, entry]) => {
      const { timer: _timer, waiters: _waiters, ...rest } = entry;
      return { key, entry: rest };
    });
  }

  return {
    change,
    flush,
    waitForInflight,
    prepareForTransition,
    resetForSession,
    retry,
    getError,
    entryCount,
    debugEntries,
  };
}
