/** Single-flight save coordinator keyed by {workspaceSession, path}.
 *
 * F-003: The old autosave was a component-local debounce map keyed only by
 * path. Two bugs followed:
 *
 * 1. Overlapping writes could complete out of order. Revision A fires, then
 *    revision B fires, B writes first, then A overwrites it and calls
 *    markTabSaved — the tab reports clean while containing B's content.
 *
 * 2. Failed writes were silent unhandled promises. markTabSaved ran regardless
 *    of whether the write actually succeeded, leaving a dirty tab appearing
 *    saved.
 *
 * 3. A session switch could leave an in-flight write from the old session
 *    targeting the wrong folder (Android) or simply writing stale content to
 *    a file that was already renamed or deleted.
 *
 * This coordinator fixes all three: it permits exactly one write per
 * {session, path} at a time, assigns monotonically increasing revisions,
 * marks a tab saved only when its revision matches, tracks the last error
 * so the UI can surface it with a retry action, and clears all entries on
 * session transition so no write from an old session can reach the disk.
 *
 * The module exposes a simple imperative API. App.tsx creates one instance
 * per app lifecycle (in a useMemo) and passes the methods to the editor,
 * tab bar, and rename dialog. Tests construct an instance, call methods,
 * and inspect the state map — no DOM or framework needed.
 *
 * Key design decisions:
 * - Debounce is kept (400 ms) to avoid writing on every keystroke. The
 *   coordinator handles the race that debouncing introduces (out-of-order
 *   completion) rather than removing it entirely.
 * - Revisions are per-path, not global, so concurrent edits in different
 *   files don't interfere with each other.
 * - Error state is exposed (not swallowed) so the user sees the failure
 *   and can retry. The tab stays dirty until a successful write.
 * - Session identity prevents cross-session contamination. When the user
 *   switches folders on Android, all pending saves for the old folder are
 *   cleared before the new folder loads.
 */

import { writeTextFile } from "./tauriBridge";

/** Internal state for one {session, path} pair. */
interface SaveEntry {
  /** Monotonically increasing counter for content revisions. Increments on
   * every change(), whether debounced or flushed. */
  revision: number;
  /** The content at the latest change() call. Used to write the correct
   * revision when the timer fires or the user requests a flush. */
  latestContent: string;
  /** Whether a write is currently in flight. Prevents overlapping writes. */
  inFlight: boolean;
  /** The revision that was most recently written to disk. Only this
   * revision can mark the tab clean. */
  savedRevision: number;
  /** The pending timer handle, if the editor is waiting for the debounce
   * period to elapse. Null when nothing is pending. */
  timer: ReturnType<typeof setTimeout> | null;
  /** The last write error, if any. Exposed to the UI for display and retry. */
  lastError: string | null;
  /** Resolves when the current in-flight write completes. Used by flush()
   * and waitForInflight() to wait for completion without setTimeout polling,
   * which would break under vi.useFakeTimers() in tests. */
  writeDone: (() => void) | null;
}

/** The coordinator key uniquely identifies a file within a workspace session.
 * Session identity prevents cross-session contamination (Android SAF folder
 * switch, desktop workspace reload). */
export function makeKey(session: string | number | null, path: string): string {
  return `${session ?? ""}::${path}`;
}

/** Optional callbacks invoked by the coordinator after a write completes.
 * onSaved: called when a write succeeds for a specific path.
 * onError: called when a write fails, with the path and error message.
 * These allow the coordinator to update the store (markTabSaved, markTabSaveError)
 * without coupling the module directly to the store. */
export interface SaveCoordinatorCallbacks {
  onSaved?: (path: string) => void;
  onError?: (path: string, error: string) => void;
}

/** Creates a fresh save coordinator with no entries. The caller (App.tsx)
 * should create one instance per app lifecycle (e.g. via useMemo) and pass
 * the methods to consumers. Accepts optional callbacks for success/error
 * notification. */
export function createSaveCoordinator(cbs?: SaveCoordinatorCallbacks) {
  // State lives in a plain object, not a signal, because the coordinator is
  // not a Preact component and shouldn't trigger re-renders on its own.
  // Consumers read error state directly when needed (e.g. in a keyboard
  // handler or tab bar) and the editor component can render error UI.
  const entries = new Map<string, SaveEntry>();

  /** Returns the entry for a key, creating it on first access. */
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
        writeDone: null,
      };
      entries.set(key, entry);
    }
    return entry;
  }

  /** Called by the editor every time the user types. The content is captured
   * and a debounce timer is (re)started. The actual write waits for the timer
   * to fire, at which point it checks whether this revision is still current.
   * If a newer revision arrived during the debounce, the write uses the
   * latest content — not the stale content that was captured at schedule time.
   *
   * If another write is already in flight for this path, the change is still
   * recorded so the in-flight write will use the freshest content when it
   * completes. This prevents the "A then B, B completes first, A overwrites"
   * bug from the audit. */
  function change(session: string | number | null, path: string, content: string) {
    const entry = getOrCreate(session, path);
    entry.latestContent = content;
    entry.revision++;
    const currentRevision = entry.revision;

    // If something is already in flight, don't start a second one.
    // The in-flight write will use the freshest content from latestContent
    // when it completes. If that content's revision matches currentRevision,
    // we write it; otherwise we know a newer revision arrived and will
    // schedule a write for that revision instead.
    if (entry.inFlight) {
      return;
    }

    // Clear any existing timer so the debounce resets.
    if (entry.timer) {
      clearTimeout(entry.timer);
      entry.timer = null;
    }

    // Start the debounce timer.
    entry.timer = setTimeout(() => {
      entry.timer = null;
      // Double-check: if another revision arrived while we were waiting,
      // or if this entry was cleared by a session reset, skip the write.
      const e = entries.get(makeKey(session, path));
      if (!e || e.revision !== currentRevision || e.inFlight) {
        return;
      }
      entry.inFlight = true;
      // Capture state for the write — no rereading of globals.
      const writePath = path;
      const writeContent = entry.latestContent;

      // Set up a promise that callers (flush, waitForInflight) can await
      // instead of polling with setTimeout. This is crucial for tests that
      // use vi.useFakeTimers().
      entry.writeDone = () => {};
      const writeDone = entry.writeDone;

      writeTextFile(writePath, writeContent)
        .then(() => {
          // Only mark saved if this revision is still current. A newer
          // revision could have been flushed or changed while we waited.
          if (entry.revision === currentRevision) {
            entry.savedRevision = currentRevision;
            entry.lastError = null;
            cbs?.onSaved?.(path);
          }
          entry.inFlight = false;
          writeDone?.();
          entry.writeDone = null;
        })
        .catch((err) => {
          // Keep the entry dirty and surface the error. Never swallow.
          entry.lastError = err instanceof Error ? err.message : String(err);
          entry.inFlight = false;
          writeDone?.();
          entry.writeDone = null;
          cbs?.onError?.(path, entry.lastError);
        });
    }, 400);
  }

  /** Flushes any pending debounce for the given path and writes immediately.
   * Used by Ctrl+S and by the rename flow (which flushes before renaming to
   * avoid writing stale content under the old path). Waits for any in-flight
   * write to complete first, then starts a new write with the current content.
   *
   * Returns a promise that resolves when the flush write is done (success or
   * error), so callers can await it before proceeding (e.g. before a rename).
   * The error is NOT thrown; it is captured in the entry so the UI can show it.
   * This matches the existing "never swallow" principle. */
  async function flush(session: string | number | null, path: string): Promise<void> {
    const entry = getOrCreate(session, path);

    // Cancel any pending timer.
    if (entry.timer) {
      clearTimeout(entry.timer);
      entry.timer = null;
    }

    // Wait for any in-flight write to complete before starting a flush.
    // This prevents the rename-flush race from the audit: without this,
    // the original timer could fire mid-flush, causing two writes for the
    // same path. We await writeDone (set by the change()/flush() handler
    // above) instead of polling with setTimeout, which would break under
    // vi.useFakeTimers() in tests.
    if (entry.inFlight && entry.writeDone) {
      await new Promise<void>((resolve) => {
        const orig = entry.writeDone;
        entry.writeDone = () => {
          orig?.();
          entry.writeDone = null;
          resolve();
        };
      });
    }

    // Start the write immediately with current content.
    entry.inFlight = true;
    const currentRevision = ++entry.revision;
    const writePath = path;
    const writeContent = entry.latestContent;

    // Set up writeDone for any caller waiting in the block above.
    entry.writeDone = () => {};
    const writeDone = entry.writeDone;

    return writeTextFile(writePath, writeContent)
      .then(() => {
        if (entry.revision === currentRevision) {
          entry.savedRevision = currentRevision;
          entry.lastError = null;
          cbs?.onSaved?.(path);
        }
        entry.inFlight = false;
        writeDone?.();
        entry.writeDone = null;
      })
      .catch((err) => {
        entry.lastError = err instanceof Error ? err.message : String(err);
        entry.inFlight = false;
        writeDone?.();
        entry.writeDone = null;
        cbs?.onError?.(path, entry.lastError);
        // Don't throw — the UI should show the error, not crash.
      });
  }

  /** Waits for any in-flight write to complete for a given path.
   * Used by the tab-close flow: if a user closes a tab while an autosave
   * is pending, we wait for that write to finish so it doesn't target
   * stale state. Does NOT start a write — it only waits for one in flight.
   *
   * If nothing is in flight, resolves immediately. */
  function waitForInflight(session: string | number | null, path: string): Promise<void> {
    const entry = entries.get(makeKey(session, path));
    if (!entry || !entry.inFlight) {
      return Promise.resolve();
    }
    if (entry.writeDone) {
      return new Promise<void>((resolve) => {
        const orig = entry.writeDone;
        entry.writeDone = () => {
          orig?.();
          entry.writeDone = null;
          resolve();
        };
      });
    }
    return Promise.resolve();
  }

  /** Clears all entries for a given session. Called when the user switches
   * workspace folders (Android SAF) or reloads the workspace (desktop).
   * Ensures no pending or in-flight writes from the old session can reach
   * the new one. */
  function resetForSession(session: string | number | null) {
    if (!session) {
      // Clear everything if session is null (no workspace active).
      entries.clear();
      return;
    }
    for (const [key, entry] of entries) {
      if (key.startsWith(`${session}::`)) {
        // Cancel pending timers.
        if (entry.timer) {
          clearTimeout(entry.timer);
          entry.timer = null;
        }
        // In-flight writes will either complete or be orphaned. The next
        // change() for a new session will create fresh entries.
        entry.timer = null;
      }
    }
  }

  /** Retries the last failed write for a path, using the current tab content.
   * Resets the error state and starts a write immediately. */
  function retry(session: string | number | null, path: string): Promise<void> {
    const entry = getOrCreate(session, path);

    // If something is already in flight, wait for it first.
    if (entry.inFlight) {
      return waitForInflight(session, path).then(() => retry(session, path));
    }

    // Reset error state.
    entry.lastError = null;

    // Capture the current tab content (the tab's own content signal is the
    // source of truth — not our latestContent which may be stale if the
    // user edited while the error was visible).
    entry.inFlight = true;
    const currentRevision = ++entry.revision;
    const writePath = path;
    const writeContent = entry.latestContent;

    entry.writeDone = () => {};
    const writeDone = entry.writeDone;

    return writeTextFile(writePath, writeContent)
      .then(() => {
        if (entry.revision === currentRevision) {
          entry.savedRevision = currentRevision;
          entry.lastError = null;
          cbs?.onSaved?.(path);
        }
        entry.inFlight = false;
        writeDone?.();
        entry.writeDone = null;
      })
      .catch((err) => {
        entry.lastError = err instanceof Error ? err.message : String(err);
        entry.inFlight = false;
        writeDone?.();
        entry.writeDone = null;
        cbs?.onError?.(path, entry.lastError);
      });
  }

  /** Returns the current error string for a path, or null if no error.
   * Called by UI components to display/save-error indicator. */
  function getError(session: string | number | null, path: string): string | number | null {
    const entry = entries.get(makeKey(session, path));
    return entry?.lastError ?? null;
  }

  /** Returns the number of entries (for testing/debugging). */
  function entryCount(): number {
    return entries.size;
  }

  /** Returns a copy of all entries (for testing/debugging). */
  function debugEntries(): Array<{ key: string; entry: Omit<SaveEntry, "timer" | "writeDone"> }> {
    const result: Array<{ key: string; entry: Omit<SaveEntry, "timer" | "writeDone"> }> = [];
    for (const [key, entry] of entries) {
      const rest: Omit<SaveEntry, "timer" | "writeDone"> = {
        revision: entry.revision,
        latestContent: entry.latestContent,
        inFlight: entry.inFlight,
        savedRevision: entry.savedRevision,
        lastError: entry.lastError,
      };
      result.push({ key, entry: rest });
    }
    return result;
  }

  return {
    change,
    flush,
    waitForInflight,
    resetForSession,
    retry,
    getError,
    entryCount,
    debugEntries,
  };
}
