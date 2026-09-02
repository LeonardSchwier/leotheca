import { readTextFile, writeTextFile } from "../workspace/tauriBridge";
import { scanTasks, type TaskRecord } from "../markdown/tasks";
import { openTabs, updateTabContent } from "../workspace/store";
import { linkIndex } from "../linking/store";
import { workspaceSession } from "../settings/store";
import type { SaveCoordinator } from "../workspace/saveCoordinator";

/**
 * Conflict-checked, minimal completion-marker toggle (spec
 * f02-workspace-task-hub.md section 6.5): flips exactly the one character
 * inside a task's `[ ]`/`[x]`/`[X]`, never rewriting the rest of the line
 * or file, and never trusting a `TaskRecord` computed from content the
 * note may no longer have.
 *
 * This is not the spec's own `TaskLocator` (section 5.3), which adds a
 * persisted `normalizedFingerprint`/`noteFingerprint`/`workspaceSession`
 * shape to the record itself. Phase 1's `TaskRecord` carries none of
 * that, and adding it would mean a cache-version bump and touching the
 * persisted link-index decoder for a guarantee this module gets more
 * simply and more strongly by re-scanning: `findMatchingTask` below
 * re-runs the real `scanTasks` over the freshest available content and
 * requires an exact match (marker, text, indentation, and exact source
 * position) against the record the UI actually showed. Any drift at all,
 * not just a moved marker, fails the match, which is a strict superset of
 * what a fingerprint comparison would catch.
 */

export type ToggleTaskResult =
  | { status: "ok" }
  | { status: "stale" }
  | { status: "error"; message: string };

export interface ToggleTaskDeps {
  save: SaveCoordinator;
}

function tasksMatch(a: TaskRecord, b: TaskRecord): boolean {
  return (
    a.sourceFrom === b.sourceFrom &&
    a.sourceTo === b.sourceTo &&
    a.markerFrom === b.markerFrom &&
    a.markerTo === b.markerTo &&
    a.marker === b.marker &&
    a.text === b.text &&
    a.indentationColumns === b.indentationColumns
  );
}

/** Re-scans `content` and returns the task exactly matching `expected`, or
 * null when nothing does (the note changed underneath the recorded task:
 * spec section 5.3's "exact range no longer validates" -> fail closed). */
function findMatchingTask(content: string, expected: TaskRecord): TaskRecord | null {
  return scanTasks(content).find((task) => tasksMatch(task, expected)) ?? null;
}

/** The spec's own completion convention (section 6.5): reopening never
 * preserves the original marker's letter case (there is nothing meaningful
 * to preserve, a reopened task is just `[ ]`), and completing an open task
 * always writes lowercase `x`, never uppercase. */
function flipMarker(content: string, task: TaskRecord): string {
  const next = task.checked ? " " : "x";
  return content.slice(0, task.markerFrom) + next + content.slice(task.markerTo);
}

/** Incrementally replaces one note's task records in the shared workspace
 * index (spec section 8.3/FR-13), from content already in hand, never a
 * second read or a full workspace rescan. Scoped deliberately to only the
 * `tasksByPath` field: this phase does not attempt incremental updates for
 * the index's other projections (backlinks, aliases, tags), which today
 * only ever refresh via a full `rebuildLinkIndex` call, a pre-existing
 * gap this change does not introduce and does not attempt to close. */
function replaceIndexedTasks(path: string, content: string): void {
  const tasksByPath = new Map(linkIndex.value.tasksByPath);
  const tasks = scanTasks(content);
  if (tasks.length === 0) tasksByPath.delete(path);
  else tasksByPath.set(path, tasks);
  linkIndex.value = { ...linkIndex.value, tasksByPath };
}

// Serializes closed-file mutations per path (spec section 9.3): two rapid
// toggles of different tasks in the same closed note must never both read
// the same disk snapshot and race to write, each silently losing the
// other's edit. Queuing per path means the second toggle's own read only
// starts once the first toggle's write has actually landed, so it always
// validates against (and edits) what the first one just wrote.
const closedFileQueues = new Map<string, Promise<void>>();

function enqueueClosedFileWrite<T>(path: string, run: () => Promise<T>): Promise<T> {
  const previous = closedFileQueues.get(path) ?? Promise.resolve();
  const settled = previous.then(run, run);
  closedFileQueues.set(
    path,
    settled.then(
      () => undefined,
      () => undefined,
    ),
  );
  return settled;
}

/**
 * Toggles one task's completion marker end to end (spec section 6.5).
 *
 * For a note already open in a tab, the edit applies to the in-memory tab
 * content through the same `updateTabContent` + `SaveCoordinator` path a
 * normal keystroke edit uses (see App.tsx's `handleChange`): a dirty tab's
 * unsaved edits are never discarded, and there is still only ever one
 * writer for that path (spec section 8.4). For a closed note, the file is
 * re-read immediately before writing.
 *
 * Both branches require an exact `TaskRecord` match against the freshest
 * available content before writing anything, and re-check that the
 * workspace session has not moved on since the toggle started before
 * either writing (closed-note case) or publishing the incremental index
 * update (both cases): a workspace switch strictly between the click and
 * the write fails closed rather than risk applying an edit, or an index
 * update, to a workspace that is no longer the active one (spec section
 * 9.1). It does not attempt to cancel a native write already issued to
 * the platform bridge by the time a switch is observed; the guarantee
 * this gives is that such a write can never overwrite the newly active
 * workspace's own in-memory task index afterward.
 */
export async function toggleTaskCompletion(
  path: string,
  task: TaskRecord,
  deps: ToggleTaskDeps,
): Promise<ToggleTaskResult> {
  const sessionAtStart = workspaceSession.value;
  const openTab = openTabs.value.find((tab) => tab.path === path);

  if (openTab) {
    const matched = findMatchingTask(openTab.content, task);
    if (!matched) return { status: "stale" };

    const newContent = flipMarker(openTab.content, matched);
    updateTabContent(path, newContent);
    deps.save.change(sessionAtStart, path, newContent);
    await deps.save.flush(sessionAtStart, path);

    const error = deps.save.getError(sessionAtStart, path);
    if (error) return { status: "error", message: error };
    if (workspaceSession.value !== sessionAtStart) return { status: "stale" };
    replaceIndexedTasks(path, newContent);
    return { status: "ok" };
  }

  return enqueueClosedFileWrite(path, async () => {
    let diskContent: string;
    try {
      diskContent = await readTextFile(path);
    } catch (error) {
      return { status: "error", message: error instanceof Error ? error.message : String(error) };
    }
    if (workspaceSession.value !== sessionAtStart) return { status: "stale" };

    const matched = findMatchingTask(diskContent, task);
    if (!matched) return { status: "stale" };

    const newContent = flipMarker(diskContent, matched);
    try {
      await writeTextFile(path, newContent);
    } catch (error) {
      return { status: "error", message: error instanceof Error ? error.message : String(error) };
    }
    if (workspaceSession.value !== sessionAtStart) return { status: "stale" };
    replaceIndexedTasks(path, newContent);
    return { status: "ok" };
  });
}
