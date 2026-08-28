import { signal } from "@preact/signals";
import type { FsEntry } from "./types";
import { isImagePath, MAX_WALK_DEPTH } from "./types";
import {
  createDir,
  deletePathPermanent,
  findAllFiles,
  listDir,
  readTextFilesBatch,
  renamePath,
  trashPath,
  writeTextFile,
} from "./tauriBridge";
import { updateWorkspaceSettings, workspaceSettings } from "../settings/store";
import { linkIndex } from "../linking/store";
import { matchesSearchQuery, parseSearchQuery } from "./searchQuery";
import { mapWithConcurrency } from "./concurrency";

export const expandedDirs = signal<Set<string>>(new Set());
export const dirChildren = signal<Map<string, FsEntry[]>>(new Map());
// The directory New Note/New Folder create into: a folder's own path when a
// folder is clicked, or a file's *parent* when a file is clicked (so a new
// note lands next to the file currently open). Deliberately not the same
// thing as "the tree row to visually highlight" — see selectedPath below.
export const selectedDir = signal<string | null>(null);
// The exact entry (file or folder) last clicked in the tree, purely for the
// "selected" highlight in FileTree.tsx. Kept separate from selectedDir:
// clicking a file sets selectedDir to that file's *parent* folder, so
// reusing selectedDir for the highlight would light up the parent folder's
// row instead of the file the user actually clicked.
export const selectedPath = signal<string | null>(null);
export const searchQuery = signal("");
export const searchResults = signal<FsEntry[] | null>(null);

export const contextMenuTarget = signal<FsEntry | null>(null);
export const contextMenuPos = signal<{ x: number; y: number }>({ x: 0, y: 0 });

export function openContextMenu(entry: FsEntry, x: number, y: number) {
  contextMenuTarget.value = entry;
  contextMenuPos.value = { x, y };
}

export function closeContextMenu() {
  contextMenuTarget.value = null;
}

export function relativePath(rootPath: string, path: string): string {
  return path.startsWith(rootPath) ? path.slice(rootPath.length).replace(/^\//, "") : path;
}

export function dirname(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx > 0 ? path.slice(0, idx) : path;
}

export function sortEntries(entries: FsEntry[]): FsEntry[] {
  const order = workspaceSettings.value.sortOrder;
  const dirs = entries.filter((e) => e.isDir);
  const files = entries.filter((e) => !e.isDir);
  const cmp = (a: FsEntry, b: FsEntry) => {
    const c = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    return order === "name-asc" ? c : -c;
  };
  return [...dirs.sort(cmp), ...files.sort(cmp)];
}

export async function loadChildren(path: string): Promise<FsEntry[]> {
  const entries = await listDir(path);
  dirChildren.value = new Map(dirChildren.value).set(path, entries);
  return entries;
}

export function toggleExpanded(path: string) {
  const next = new Set(expandedDirs.value);
  if (next.has(path)) next.delete(path);
  else next.add(path);
  expandedDirs.value = next;
}

function isPathOrUnder(candidate: string, path: string): boolean {
  return candidate === path || candidate.startsWith(`${path}/`);
}

/** Forgets any cached expand/children state, and clears the selected
 * folder, for `path` and anything nested under it. Needed after a rename
 * or delete: without this, a folder that was expanded (or selected as the
 * target for New Note/New Folder) when it got renamed or deleted stayed
 * "expanded" and "selected" under a path that no longer means anything,
 * either silently losing the expand state under the entry's new path
 * (rename) or, worse, making the next New Note/New Folder action try to
 * list a directory that no longer exists (delete). */
function forgetPath(path: string) {
  const nextExpanded = new Set(expandedDirs.value);
  for (const p of nextExpanded) {
    if (isPathOrUnder(p, path)) nextExpanded.delete(p);
  }
  expandedDirs.value = nextExpanded;

  const nextChildren = new Map(dirChildren.value);
  for (const p of nextChildren.keys()) {
    if (isPathOrUnder(p, path)) nextChildren.delete(p);
  }
  dirChildren.value = nextChildren;

  if (selectedDir.value && isPathOrUnder(selectedDir.value, path)) {
    selectedDir.value = null;
  }
  if (selectedPath.value && isPathOrUnder(selectedPath.value, path)) {
    selectedPath.value = null;
  }
}

export function collapseAll() {
  expandedDirs.value = new Set();
}

export async function expandAll(rootPath: string) {
  const next = new Set<string>();
  async function walk(path: string, depth: number) {
    const entries = await loadChildren(path);
    next.add(path);
    if (depth >= MAX_WALK_DEPTH) return;
    for (const entry of entries) {
      if (entry.isDir) await walk(entry.path, depth + 1);
    }
  }
  await walk(rootPath, 0);
  expandedDirs.value = next;
}

export function toggleSortOrder() {
  const next = workspaceSettings.value.sortOrder === "name-asc" ? "name-desc" : "name-asc";
  updateWorkspaceSettings({ sortOrder: next });
}

/** Frontmatter stamped into every newly created note. Kept intentionally
 * minimal for v1; more properties can be added here as they're needed. */
function initialNoteContent(): string {
  const now = new Date().toISOString();
  return `---\ncreated: ${now}\n---\n\n`;
}

export async function createNote(dirPath: string, fileName: string): Promise<string> {
  const name = fileName.endsWith(".md") ? fileName : `${fileName}.md`;
  const existing = await listDir(dirPath);
  if (existing.some((e) => e.name === name)) {
    throw new Error(`"${name}" already exists in this folder.`);
  }
  const path = `${dirPath}/${name}`;
  await writeTextFile(path, initialNoteContent());
  await loadChildren(dirPath);
  return path;
}

/** Creates a note with an auto-generated, collision-free name ("Untitled",
 * "Untitled 2", ...) instead of prompting for one, for a quick-capture
 * shortcut (Ctrl+N) where interrupting with a naming dialog would defeat
 * the point. Returns the new path and the name actually used. */
export async function createNoteQuick(dirPath: string): Promise<{ path: string; name: string }> {
  const existing = await listDir(dirPath);
  const existingNames = new Set(existing.map((e) => e.name));
  let name = "Untitled.md";
  let n = 2;
  while (existingNames.has(name)) {
    name = `Untitled ${n}.md`;
    n++;
  }
  const path = await createNote(dirPath, name);
  return { path, name };
}

export async function createFolder(dirPath: string, folderName: string): Promise<string> {
  const existing = await listDir(dirPath);
  if (existing.some((e) => e.name === folderName)) {
    throw new Error(`"${folderName}" already exists in this folder.`);
  }
  const path = `${dirPath}/${folderName}`;
  await createDir(path);
  await loadChildren(dirPath);
  return path;
}

// A single content-read batch's combined file size is capped here, not
// just its file count: a real on-device OutOfMemoryError (2026-08-28,
// after SEARCH_CONTENT_READ_CONCURRENCY below already cut native call
// count 31x) turned out to come from one batch's *serialized JSON
// response* needing a single ~288MB allocation, on a vault (migrated from
// Evernote/Joplin exports) with some individual files large enough that a
// handful landing in the same up-to-40-file batch summed to that. Bytes,
// not files, are what the native side actually has to allocate and
// marshal in one shot, so bytes are what gets capped. 8MB leaves real
// margin below any heap ceiling (including the un-largeHeap 256MB
// default) even accounting for JSON string-escaping overhead roughly
// doubling a UTF-8 payload's in-memory size.
const SEARCH_BATCH_MAX_BYTES = 8 * 1024 * 1024;

// A single file above this size is never read for content matching at
// all (its name can still match), the same treatment isImagePath's
// content-skip already gives an image: even alone, a file this large
// risks the same single-allocation failure a same-size *batch* hit,
// with no smaller grouping possible to fix it. Deliberately larger than
// SEARCH_BATCH_MAX_BYTES: a lone file under this size but over the batch
// cap still gets read, just in a batch of one (see readOne below), only
// something genuinely far outside what a real note or export file needs
// to be is skipped outright.
const MAX_SEARCHABLE_FILE_BYTES = 50 * 1024 * 1024;

/** One native call reads many files at once instead of one call per file
 * (see tauriBridge's readTextFilesBatch doc comment for why: a real
 * on-device OutOfMemoryError after ~1700 sequential single-file native
 * calls, 2026-08-28). Every getContentLower() call issued within the same
 * microtask tick lands in the same pending batch and goes out as one
 * native call, UNLESS the pending batch's combined size has already
 * crossed SEARCH_BATCH_MAX_BYTES, in which case it flushes immediately
 * instead of waiting for the tick to end, so one batch can never grow
 * past that cap no matter how many requests land in the same tick.
 * runSearch's own bounded concurrency (see SEARCH_CONTENT_READ_CONCURRENCY
 * below) is what makes multiple requests actually land in the same tick,
 * rather than one at a time. Scoped fresh per runSearch call (not
 * module-level) so two searches in flight at once can never mix their
 * batches. */
function createBatchedContentReader() {
  let pending = new Map<string, Array<(content: string | null) => void>>();
  let pendingBytes = 0;
  let flushScheduled = false;

  function scheduleFlush() {
    if (flushScheduled) return;
    flushScheduled = true;
    queueMicrotask(flush);
  }

  async function flush() {
    flushScheduled = false;
    const batch = pending;
    pending = new Map();
    pendingBytes = 0;
    const paths = Array.from(batch.keys());
    if (paths.length === 0) return;
    let contents: (string | null)[];
    try {
      contents = await readTextFilesBatch(paths);
    } catch {
      contents = paths.map(() => null); // Whole batch unreadable: treat every entry as no content, not a search failure.
    }
    paths.forEach((path, i) => {
      const content = contents[i] ?? null;
      for (const resolve of batch.get(path) ?? []) resolve(content);
    });
  }

  return function readOne(path: string, size: number): Promise<string | null> {
    return new Promise((resolve) => {
      if (!pending.has(path)) pending.set(path, []);
      pending.get(path)!.push(resolve);
      pendingBytes += size;
      if (pendingBytes >= SEARCH_BATCH_MAX_BYTES) {
        flush(); // Over budget already: flush this batch now instead of waiting for the tick to end.
      } else {
        scheduleFlush();
      }
    });
  };
}

// Entries matched concurrently while running a search, which bounds how
// many getContentLower() calls land in the same content-read batch above.
// Larger than the read concurrency used elsewhere (LINK_INDEX_READ_CONCURRENCY,
// WORKSPACE_STATS_READ_CONCURRENCY, both 8 in their own files): those bound
// queue depth so an unrelated user action can interleave promptly, but the
// real on-device crash this fixes came from ~1700 sequential native calls
// piling up over the whole search, not from too much work in flight at any
// one moment, so cutting total native call count matters more here than a
// shallow queue does. SEARCH_BATCH_MAX_BYTES above is what actually bounds
// any one native call's cost now; this just bounds how many requests can
// land in the same tick to be grouped together in the first place.
const SEARCH_CONTENT_READ_CONCURRENCY = 40;

/** Full-text search: matches by file name first (cheap), and for text
 * files that don't match by name, falls back to reading and checking their
 * content. Skips hidden entries (`.trash`, `.leotheca`, ...) and, for
 * content matching, image files, which have no text content to search
 * (both handled natively, see findAllFiles).
 *
 * Also understands the query-syntax operators in workspace/searchQuery.ts
 * (`tag:`, `path:`, a leading `-` to negate, `"quoted phrases"`, ` OR `
 * between groups); a plain query with no operators behaves exactly as
 * before they existed. Content is only ever read via
 * matchesSearchQuery's lazy getContentLower callback, when a `text`
 * clause genuinely needs it to decide a match, memoized here so a note's
 * content is read at most once even if several clauses reference it: a
 * tag/path-only query, or a query a note's name alone already satisfies,
 * never reads that file at all.
 *
 * The file list itself comes from one native recursive walk (findAllFiles)
 * rather than this function recursing via repeated listDir calls, one per
 * directory: that per-directory approach used to run this exact walk here,
 * and on a real ~500-note SAF-backed vault it didn't just run slowly, it
 * crashed the app outright with an OutOfMemoryError partway through
 * (confirmed on-device, 2026-08-28), the same per-directory-IPC-call cost
 * already measured and fixed for the link index and workspace stats (see
 * findAllFiles's own doc comment). Matching itself runs with bounded
 * concurrency (see SEARCH_CONTENT_READ_CONCURRENCY above) rather than one
 * entry at a time, both for speed and because a genuinely large vault's
 * worth of content-fallback matching, run one call at a time, hit that
 * same class of crash again even after the walk itself was fixed (see
 * createBatchedContentReader above). A file above MAX_SEARCHABLE_FILE_BYTES
 * is treated like an image, matchable by name but never read for content:
 * even alone, a file that large risks the same kind of single-allocation
 * failure a same-size batch hit.
 */
export async function runSearch(rootPath: string, query: string) {
  searchQuery.value = query;
  const parsed = parseSearchQuery(query);
  if (parsed.length === 0) {
    searchResults.value = null;
    return;
  }
  const entries = await findAllFiles(rootPath);
  const readContent = createBatchedContentReader();
  const matchFlags = await mapWithConcurrency(entries, SEARCH_CONTENT_READ_CONCURRENCY, async (entry) => {
    let contentPromise: Promise<string | null> | null = null;
    const getContentLower = () => {
      if (!contentPromise) {
        contentPromise =
          isImagePath(entry.path) || (entry.size ?? 0) > MAX_SEARCHABLE_FILE_BYTES
            ? Promise.resolve(null)
            : readContent(entry.path, entry.size ?? 0).then((content) => content?.toLowerCase() ?? null);
      }
      return contentPromise;
    };
    return matchesSearchQuery(parsed, {
      nameLower: entry.name.toLowerCase(),
      pathLower: relativePath(rootPath, entry.path).toLowerCase(),
      tagsLower: linkIndex.value.tagsByPath.get(entry.path) ?? [],
      getContentLower,
    });
  });
  searchResults.value = entries.filter((_, i) => matchFlags[i]);
}

export function clearSearch() {
  searchQuery.value = "";
  searchResults.value = null;
}

export async function renameEntry(oldPath: string, newName: string): Promise<string> {
  const parent = dirname(oldPath);
  const siblings = await listDir(parent);
  if (siblings.some((e) => e.name === newName)) {
    throw new Error(`"${newName}" already exists in this folder.`);
  }
  const newPath = `${parent}/${newName}`;
  await renamePath(oldPath, newPath);
  forgetPath(oldPath);
  await loadChildren(parent);
  return newPath;
}

export async function deleteEntry(rootPath: string, path: string): Promise<void> {
  if (workspaceSettings.value.deleteBehavior === "permanent") {
    await deletePathPermanent(path);
  } else {
    await trashPath(rootPath, path);
  }
  forgetPath(path);
  await loadChildren(dirname(path));
}
