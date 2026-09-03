import * as bridge from "./tauriBridge";

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

export interface SaveCoordinator {
  change(session: string | number | null, path: string, content: string): void;
  flush(session: string | number | null, path: string): Promise<void>;
  waitForInflight(session: string | number | null, path: string): Promise<void>;
  prepareForTransition(session: string | number | null): Promise<void>;
  resetForSession(currentSession: string | number | null): void;
  retry(session: string | number | null, path: string): Promise<void>;
  getError(session: string | number | null, path: string): string | null;
  entryCount(): number;
  debugEntries(): Array<{ key: string; entry: Omit<SaveEntry, "timer" | "waiters"> }>;
}

// App.tsx owns the editor coordinator instance. The settings transition layer
// and auxiliary editor surfaces cannot import App without a cycle, so the
// factory registers the latest app coordinator here.
let activeCoordinator: SaveCoordinator | null = null;

/** Returns the app-owned save authority when the editor shell has initialized.
 * Callers must fail closed when it is absent rather than constructing a second
 * coordinator, which would create a competing writer for the same note path. */
export function getActiveSaveCoordinator(): SaveCoordinator | null {
  return activeCoordinator;
}

export async function prepareActiveSavesForTransition(
  session: string | number | null,
): Promise<void> {
  await activeCoordinator?.prepareForTransition(session);
}

function writeWorkspaceRevision(path: string, content: string): Promise<void> {
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

/** Coordinates debounced note writes for one app lifetime. */
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
      await writeWorkspaceRevision(path, content);
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

  async function prepareForTransition(session: string | number | null): Promise<void> {
    const prefix = `${sessionKey(session)}::`;
    blockedSessions.add(sessionKey(session));
    const waits: Promise<void>[] = [];
    for (const [key, entry] of entries) {
      if (!key.startsWith(prefix)) continue;
      if (entry.timer) {
        clearTimeout(entry.timer);
        entry.timer = null;
      }
      if (entry.inFlight) waits.push(waitForEntry(entry));
    }
    await Promise.all(waits);
    for (const key of Array.from(entries.keys())) {
      if (key.startsWith(prefix)) entries.delete(key);
    }
  }

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

  function entryCount(): number {
    return entries.size;
  }

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
    entryCount,
    debugEntries,
  };
  activeCoordinator = api;
  return api;
}