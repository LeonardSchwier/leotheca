import { fileNameFromPath } from "../linking/store";
import type { TaskRecord } from "../markdown/tasks";

/**
 * Filtering, grouping, and sorting for the Task Hub (F02 Phase 2,
 * spec/f02-workspace-task-hub.md section 6.3), operating purely over the
 * already-indexed `LinkIndex.tasksByPath`/`tagsByPath` maps: no second
 * task store, no re-reading any note.
 *
 * Deliberately narrower than the spec's full section 6.3/7.2 surface,
 * disclosed here rather than silently dropped (see the F02 Phase 2
 * ROADMAP.md entry for the same list): due-state filtering, grouping, and
 * sorting (spec 5.2, 6.3) are not implemented, since they depend on the
 * due-date extraction convention Phase 1's `scanTasks` does not parse at
 * all; adding it is a real parsing feature (an ISO-date suffix grammar,
 * local-calendar-day bucketing, per-day memoization) on its own, not a
 * query-layer addition over data the index already has. "Recently
 * modified note" sorting is deferred for the same reason: `LinkIndex`
 * does not expose a per-note modification time today, only the mtime the
 * cache uses internally for its own change detection. Persisted
 * `TaskHubSettingsV1` (spec section 7.2) is also not implemented; the
 * query lives as ordinary component state, reset per session, which
 * matches the spec's own "text, path, and tag filters are session-only by
 * default" for the fields that mattered most to get right and is a
 * strictly safer default (a filtered-out task can never look silently
 * missing across a restart) for the ones this phase left unpersisted.
 */

export type TaskHubStatus = "open" | "completed" | "all";
export type TaskHubGroupBy = "note" | "folder" | "none";
export type TaskHubSortBy = "note" | "text";

export interface TaskHubQuery {
  status: TaskHubStatus;
  /** Folder prefixes (workspace-relative-style path segments as stored in
   * `LinkIndex` keys); a task matches if its note's path equals, or falls
   * under, at least one listed prefix. Empty means no path restriction. */
  pathPrefixes: string[];
  /** Note tags (matched case-insensitively against `LinkIndex.tagsByPath`,
   * AND'd together per spec section 6.3: a task's note must carry every
   * listed tag, not just one). Empty means no tag restriction. */
  tags: string[];
  /** Case-insensitive substring match against task text, note title, and
   * note path (spec section 6.3's Text filter). */
  text: string;
  groupBy: TaskHubGroupBy;
  sortBy: TaskHubSortBy;
}

export const DEFAULT_TASK_HUB_QUERY: TaskHubQuery = {
  status: "open",
  pathPrefixes: [],
  tags: [],
  text: "",
  groupBy: "none",
  sortBy: "note",
};

export interface TaskEntry {
  path: string;
  noteTitle: string;
  task: TaskRecord;
}

export interface TaskGroup {
  key: string;
  label: string;
  entries: TaskEntry[];
}

function noteTitleFromPath(path: string): string {
  return fileNameFromPath(path).replace(/\.md$/i, "");
}

/** Every indexed task across the workspace, in a stable, deterministic
 * order: grouped by note path (sorted, so the list doesn't reshuffle
 * between renders as Map insertion order shifts), then in each note's own
 * source order. This is the query pipeline's own starting point; filters,
 * grouping, and sort below never reorder a note's tasks relative to each
 * other except when `sortBy` explicitly asks for that (spec section 6.3's
 * "note path and source order" stays the implicit tie-break even then). */
export function flattenTasks(tasksByPath: Map<string, TaskRecord[]>): TaskEntry[] {
  const entries: TaskEntry[] = [];
  for (const path of Array.from(tasksByPath.keys()).sort()) {
    const noteTitle = noteTitleFromPath(path);
    for (const task of tasksByPath.get(path) ?? []) {
      entries.push({ path, noteTitle, task });
    }
  }
  return entries;
}

/** A path-prefix filter matches the note itself or anything nested under
 * it, never an unrelated path that merely starts with the same
 * characters (`projects` must not match `projects-archive/x.md`). */
function pathMatchesPrefix(path: string, prefix: string): boolean {
  const normalized = prefix.trim().replace(/\/+$/, "");
  if (normalized === "") return true;
  return path === normalized || path.startsWith(`${normalized}/`);
}

/** Whether one task entry satisfies a query, given the note's own tags
 * from the shared index. Exported so a host can preview a match without
 * re-deriving the whole pipeline (e.g. a future per-row diagnostic). */
export function matchesTaskQuery(
  entry: TaskEntry,
  query: TaskHubQuery,
  tagsByPath: Map<string, string[]>,
): boolean {
  if (query.status === "open" && entry.task.checked) return false;
  if (query.status === "completed" && !entry.task.checked) return false;

  if (
    query.pathPrefixes.length > 0 &&
    !query.pathPrefixes.some((prefix) => pathMatchesPrefix(entry.path, prefix))
  ) {
    return false;
  }

  if (query.tags.length > 0) {
    const noteTags = new Set((tagsByPath.get(entry.path) ?? []).map((tag) => tag.toLowerCase()));
    if (!query.tags.every((tag) => noteTags.has(tag.toLowerCase()))) return false;
  }

  const needle = query.text.trim().toLowerCase();
  if (needle !== "") {
    const haystack = `${entry.task.text} ${entry.noteTitle} ${entry.path}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }

  return true;
}

/** Stable sort: `sortBy: "note"` keeps `flattenTasks`'s own path/source
 * order (a no-op copy), `sortBy: "text"` orders by each task's display
 * text case-insensitively, falling back to path and source order to keep
 * results deterministic when two tasks share the same text. */
export function sortTaskEntries(entries: TaskEntry[], sortBy: TaskHubSortBy): TaskEntry[] {
  if (sortBy === "note") return entries;
  return [...entries].sort((a, b) => {
    const byText = a.task.displayText.toLowerCase().localeCompare(b.task.displayText.toLowerCase());
    if (byText !== 0) return byText;
    const byPath = a.path.localeCompare(b.path);
    if (byPath !== 0) return byPath;
    return a.task.sourceFrom - b.task.sourceFrom;
  });
}

function folderOfPath(path: string): string {
  const lastSlash = path.lastIndexOf("/");
  return lastSlash === -1 ? "" : path.slice(0, lastSlash);
}

/** Groups an already filtered-and-sorted list of entries, preserving each
 * incoming entry's relative order within its group. `groupBy: "none"`
 * yields a single group (or none, for an empty result) so a host can
 * always render `TaskGroup[]` uniformly rather than special-casing the
 * ungrouped case. */
export function groupTaskEntries(entries: TaskEntry[], groupBy: TaskHubGroupBy): TaskGroup[] {
  if (groupBy === "none") {
    return entries.length === 0 ? [] : [{ key: "", label: "", entries }];
  }

  const groups = new Map<string, TaskGroup>();
  for (const entry of entries) {
    const key = groupBy === "note" ? entry.path : folderOfPath(entry.path);
    if (!groups.has(key)) {
      const label = groupBy === "note" ? entry.noteTitle : key === "" ? "(Workspace root)" : key;
      groups.set(key, { key, label, entries: [] });
    }
    groups.get(key)!.entries.push(entry);
  }
  return Array.from(groups.values()).sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * The full Task Hub query pipeline: filter, then sort, then group. Sort
 * runs before grouping so a `sortBy` choice governs each group's own
 * internal order too (e.g. grouping by folder while sorted by text still
 * shows each folder's own tasks alphabetically), not just the flat list.
 */
export function queryTasks(
  tasksByPath: Map<string, TaskRecord[]>,
  tagsByPath: Map<string, string[]>,
  query: TaskHubQuery,
): TaskGroup[] {
  const all = flattenTasks(tasksByPath);
  const filtered = all.filter((entry) => matchesTaskQuery(entry, query, tagsByPath));
  const sorted = sortTaskEntries(filtered, query.sortBy);
  return groupTaskEntries(sorted, query.groupBy);
}

/** Total number of tasks the current index carries before any filter is
 * applied, for the Task Hub's own "N tasks" header count (spec section
 * 6.2), which reports the workspace total, not the filtered count. */
export function totalTaskCount(tasksByPath: Map<string, TaskRecord[]>): number {
  let count = 0;
  for (const tasks of tasksByPath.values()) count += tasks.length;
  return count;
}
