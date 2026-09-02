import { signal } from "@preact/signals";
import type { FsEntry } from "./types";
import { isImagePath, isTextFile } from "./types";
import {
  createWorkspaceDirNew,
  createWorkspaceTextFileNew,
  deleteWorkspacePathPermanent,
  findAllEntries,
  findAllFiles,
  isWorkspaceMutationError,
  listDir,
  readTextFile,
  readTextFilesBatch,
  renameWorkspacePathNoReplace,
  trashPath,
} from "./tauriBridge";
import {
  updateWorkspaceSettings,
  workspacePath,
  workspaceSession,
  workspaceSettings,
} from "../settings/store";
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
export const searchInProgress = signal(false);

// Search state is shared by every sidebar instance, while each search has
// asynchronous enumeration and (often) asynchronous content batches. A
// monotonically increasing request generation makes the newest user intent
// authoritative. The workspace session is captured separately because all
// Android SAF folders intentionally share the synthetic `/workspace` path;
// a path comparison therefore cannot tell two grants apart.
let searchGeneration = 0;
interface SearchAuthority {
  generation: number;
  workspaceSession: number;
}

function beginSearchAuthority(): SearchAuthority {
  return {
    generation: ++searchGeneration,
    workspaceSession: workspaceSession.value,
  };
}

function isCurrentSearch(authority: SearchAuthority): boolean {
  return (
    authority.generation === searchGeneration &&
    authority.workspaceSession === workspaceSession.value
  );
}

function invalidateSearchAuthority(): void {
  searchGeneration++;
}

export const contextMenuTarget = signal<FsEntry | null>(null);
export const contextMenuPos = signal<{ x: number; y: number }>({ x: 0, y: 0 });

export function resetWorkspaceTree(): void {
  // A workspace transition owns the visible empty search state from this
  // point onward. Any enumeration or content batch started by the outgoing
  // workspace may finish, but it must never republish into the new session.
  invalidateSearchAuthority();
  expandedDirs.value = new Set();
  dirChildren.value = new Map();
  selectedDir.value = null;
  selectedPath.value = null;
  searchQuery.value = "";
  searchResults.value = null;
  searchInProgress.value = false;
  closeContextMenu();
}

export function openContextMenu(entry: FsEntry, x: number, y: number) {
  contextMenuTarget.value = entry;
  contextMenuPos.value = { x, y };
}

export function closeContextMenu() {
  contextMenuTarget.value = null;
}

export function relativePath(rootPath: string, path: string): string {
  return path.startsWith(rootPath)
    ? path.slice(rootPath.length).replace(/^\//, "")
    : path;
}

export function dirname(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx > 0 ? path.slice(0, idx) : path;
}

/** Every mutation below (create, rename, delete) only ever runs while a
 * workspace is open in the UI that exposes it, so a missing workspace here
 * is a real bug, not an expected condition to swallow silently the way a
 * read-only display guard (`if (!workspacePath.value) return;`) elsewhere
 * in the app does. */
function requireWorkspacePath(): string {
  const root = workspacePath.value;
  if (!root) {
    throw new Error("No workspace is open.");
  }
  return root;
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

/** Expands every directory under `rootPath`, including one with nothing
 * directly inside it. Uses findAllEntries's single native recursive walk
 * instead of one listDir bridge call per directory: that per-directory
 * approach used to run this exact walk here, and on a real large
 * SAF-backed vault it didn't just run slowly, the same per-directory-IPC
 * cost already measured and fixed for the link index, workspace stats, and
 * search (see findAllFiles's own doc comment). The native walk's own depth
 * cap (commands.rs's/FolderAccessPlugin.java's MAX_WALK_DEPTH, the same
 * constant findAllFiles's walk also uses) means a directory at that exact
 * cutoff is still listed and expanded here, just
 * with no children shown even if it genuinely has some beyond the cap:
 * the same already-accepted tradeoff search and the link index make at
 * that same boundary, for a workspace nested unrealistically deep. */
export async function expandAll(rootPath: string) {
  const entries = await findAllEntries(rootPath);
  const nextExpanded = new Set<string>([rootPath]);
  const childrenByParent = new Map<string, FsEntry[]>([[rootPath, []]]);
  for (const entry of entries) {
    if (entry.isDir) {
      nextExpanded.add(entry.path);
      if (!childrenByParent.has(entry.path))
        childrenByParent.set(entry.path, []);
    }
    const parent = dirname(entry.path);
    const siblings = childrenByParent.get(parent);
    if (siblings) siblings.push(entry);
    else childrenByParent.set(parent, [entry]);
  }
  expandedDirs.value = nextExpanded;
  const nextChildren = new Map(dirChildren.value);
  for (const [path, children] of childrenByParent) {
    nextChildren.set(path, children);
  }
  dirChildren.value = nextChildren;
}

/** Loads `rootPath`'s own listing, then auto-expands its immediate
 * subdirectories so a newly opened workspace shows one level of structure
 * without an explicit "Expand all" tap. Deliberately one level, not
 * `expandAll`'s full recursive native walk: bounded to however many
 * top-level directories the root actually has, rather than the whole
 * tree, so opening a large vault doesn't pay that walk's cost just to
 * render the first screen. A subdirectory whose own listing fails to load
 * doesn't block the others: it stays marked expanded but shows no
 * children, the same recoverable state a manually toggled folder would be
 * left in if `listDir` rejected for it, and collapsing then re-expanding
 * it retries the load like any other folder. */
export async function expandFirstLevel(rootPath: string): Promise<void> {
  const entries = await loadChildren(rootPath);
  const dirs = entries.filter((entry) => entry.isDir);
  if (dirs.length === 0) return;
  expandedDirs.value = new Set(dirs.map((dir) => dir.path));
  await Promise.allSettled(dirs.map((dir) => loadChildren(dir.path)));
}

export function toggleSortOrder() {
  const next =
    workspaceSettings.value.sortOrder === "name-asc" ? "name-desc" : "name-asc";
  updateWorkspaceSettings({ sortOrder: next });
}

/** Frontmatter stamped into every newly created note. Kept intentionally
 * minimal for v1; more properties can be added here as they're needed. */
function initialNoteContent(): string {
  const now = new Date().toISOString();
  return `---\ncreated: ${now}\n---\n\n`;
}

function alreadyExistsMessage(name: string): Error {
  return new Error(`"${name}" already exists in this folder.`);
}

function rethrowCreateCollision(error: unknown, name: string): never {
  if (isWorkspaceMutationError(error, "already_exists")) {
    throw alreadyExistsMessage(name);
  }
  throw error;
}

export async function createNote(
  dirPath: string,
  fileName: string,
): Promise<string> {
  const name = fileName.endsWith(".md") ? fileName : `${fileName}.md`;
  const existing = await listDir(dirPath);
  if (existing.some((e) => e.name === name)) {
    throw alreadyExistsMessage(name);
  }
  const path = `${dirPath}/${name}`;
  const root = requireWorkspacePath();
  try {
    await createWorkspaceTextFileNew(
      root,
      relativePath(root, path),
      initialNoteContent(),
    );
  } catch (error) {
    rethrowCreateCollision(error, name);
  }
  await loadChildren(dirPath);
  return path;
}

/** Finds a collision-free ".md" name in `existingNames`, starting from
 * `baseName` and counting up ("Untitled", "Untitled 2", "Untitled 3", ...)
 * the same way createNoteQuick has always named quick-captured notes.
 * Shared with createNoteFromTemplate below so picking a template can reuse
 * this exact auto-naming behavior (seeded from the template's own name)
 * instead of a second dialog asking the user to type a name by hand. */
function uniqueNoteName(existingNames: Set<string>, baseName: string): string {
  let name = `${baseName}.md`;
  let n = 2;
  while (existingNames.has(name)) {
    name = `${baseName} ${n}.md`;
    n++;
  }
  return name;
}

function uniqueCanvasName(existingNames: Set<string>): string {
  let name = "Untitled canvas.canvas";
  let n = 2;
  while (existingNames.has(name)) name = `Untitled canvas ${n++}.canvas`;
  return name;
}

/** Creates an auto-named text file through the native no-replace boundary.
 * `listDir` supplies the first likely-free candidate for a fast common path,
 * but it is only a hint: another process can create that name before our
 * mutation reaches the filesystem. The native `already_exists` result is
 * authoritative, so a raced candidate is added to the occupied set and the
 * next name is tried without ever replacing the other writer's file. */
async function createAutoNamedTextFile(
  root: string,
  dirPath: string,
  existingNames: Set<string>,
  nextName: (names: Set<string>) => string,
  contents: string,
): Promise<{ path: string; name: string }> {
  for (;;) {
    const name = nextName(existingNames);
    const path = `${dirPath}/${name}`;
    try {
      await createWorkspaceTextFileNew(root, relativePath(root, path), contents);
      return { path, name };
    } catch (error) {
      if (!isWorkspaceMutationError(error, "already_exists")) throw error;
      existingNames.add(name);
    }
  }
}

/** Creates a new, open-format canvas file without requiring a naming dialog. */
export async function createCanvasQuick(
  dirPath: string,
): Promise<{ path: string; name: string }> {
  const existing = await listDir(dirPath);
  const existingNames = new Set(existing.map((e) => e.name));
  const root = requireWorkspacePath();
  const created = await createAutoNamedTextFile(
    root,
    dirPath,
    existingNames,
    uniqueCanvasName,
    JSON.stringify({ nodes: [], edges: [] }, null, 2),
  );
  await loadChildren(dirPath);
  return created;
}

/** Creates a note with an auto-generated, collision-free name ("Untitled",
 * "Untitled 2", ...) instead of prompting for one, for a quick-capture
 * shortcut (Ctrl+N, and the "new-note" automation command in
 * app/automationCommands.ts) where interrupting with a naming dialog
 * would defeat the point. `content` defaults to the usual blank
 * frontmatter stamp, but the automation command passes real text through
 * instead, so it doesn't also have to invent a note name for content it
 * received from outside the app. Returns the new path and the name
 * actually used. */
export async function createNoteQuick(
  dirPath: string,
  content: string = initialNoteContent(),
): Promise<{ path: string; name: string }> {
  const existing = await listDir(dirPath);
  const existingNames = new Set(existing.map((e) => e.name));
  const root = requireWorkspacePath();
  const created = await createAutoNamedTextFile(
    root,
    dirPath,
    existingNames,
    (names) => uniqueNoteName(names, "Untitled"),
    content,
  );
  await loadChildren(dirPath);
  return created;
}

/** One Markdown file found directly inside the workspace's configured
 * templates folder (see WorkspaceSettings.templatesFolder), offered by
 * the "New note from template" command. */
export interface NoteTemplate {
  name: string;
  path: string;
}

function stripMdExtension(name: string): string {
  return name.toLowerCase().endsWith(".md") ? name.slice(0, -3) : name;
}

/** Lists the Markdown files directly inside the workspace's configured
 * templates folder, for the "New note from template" picker. Not
 * recursive: templates are meant to stay a flat, easy-to-browse list, not
 * another nested tree to navigate. A missing folder (the common case:
 * nobody has created one yet) is not an error, just an empty list, the
 * same treatment loadWorkspaceSettings gives a missing settings.json. */
export async function listTemplates(
  workspacePath: string,
): Promise<NoteTemplate[]> {
  const dir = `${workspacePath}/${workspaceSettings.value.templatesFolder}`;
  try {
    const entries = await listDir(dir);
    return entries
      .filter((e) => !e.isDir && e.name.toLowerCase().endsWith(".md"))
      .map((e) => ({ name: e.name, path: e.path }))
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  } catch {
    return [];
  }
}

/** Creates a note named after `template` (auto-uniquified the same way
 * createNoteQuick names "Untitled", so picking a template is a single
 * action, not a second naming prompt), with the template's own content
 * copied in verbatim instead of the usual blank frontmatter stamp: a
 * template's whole point is that its author already wrote the content
 * (including any frontmatter of its own) they want every note created
 * from it to start with. Returns the new path and the name actually
 * used. */
export async function createNoteFromTemplate(
  dirPath: string,
  template: NoteTemplate,
): Promise<{ path: string; name: string }> {
  const existing = await listDir(dirPath);
  const existingNames = new Set(existing.map((e) => e.name));
  const content = await readTextFile(template.path);
  const root = requireWorkspacePath();
  const created = await createAutoNamedTextFile(
    root,
    dirPath,
    existingNames,
    (names) => uniqueNoteName(names, stripMdExtension(template.name)),
    content,
  );
  await loadChildren(dirPath);
  return created;
}

export async function createFolder(
  dirPath: string,
  folderName: string,
): Promise<string> {
  const existing = await listDir(dirPath);
  if (existing.some((e) => e.name === folderName)) {
    throw alreadyExistsMessage(folderName);
  }
  const path = `${dirPath}/${folderName}`;
  const root = requireWorkspacePath();
  try {
    await createWorkspaceDirNew(root, relativePath(root, path));
  } catch (error) {
    rethrowCreateCollision(error, folderName);
  }
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

// When the native walk (findAllFiles on Rust, FolderAccessPlugin.findAllFiles
// on Android) does not report a file's size, fall back to this value for
// batch-bounding purposes.  Zero would let an unknown-sized file blend into
// a batch of zero-size entries and blow past the 8 MiB limit on the next
// real read (the audit flagged exactly this); a value equal to the batch cap
// means *any* unknown-sized file triggers a pre-batch flush so one batch can
// never contain more than two unreadable-size files.  4 MiB is a middle
// ground: a batch can hold at most two unknown-size files before flushing,
// and known-size files that fit within the remaining budget still group
// normally.  No real vault note exceeds 4 MiB, so this conservative default
// errs on the side of safety over grouping efficiency.
const CONSERVATIVE_UNKNOWN_SIZE = 4 * 1024 * 1024;

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
 * batches. The current-authority predicate is checked both before a read
 * is queued and after every native batch returns, so stale batches can
 * finish safely without contributing data to an obsolete search. */
function createBatchedContentReader(isCurrent: () => boolean) {
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
    if (!isCurrent()) {
      paths.forEach((path) => {
        for (const resolve of batch.get(path) ?? []) resolve(null);
      });
      return;
    }
    let contents: (string | null)[];
    try {
      contents = await readTextFilesBatch(paths);
    } catch {
      contents = paths.map(() => null); // Whole batch unreadable: treat every entry as no content, not a search failure.
    }
    const stillCurrent = isCurrent();
    paths.forEach((path, i) => {
      const content = stillCurrent ? (contents[i] ?? null) : null;
      for (const resolve of batch.get(path) ?? []) resolve(content);
    });
  }

  return function readOne(path: string, size: number): Promise<string | null> {
    return new Promise((resolve) => {
      if (!isCurrent()) {
        resolve(null);
        return;
      }
      // Flush *before* adding if the pending batch already has content and
      // adding this file's size would cross the batch cap. This prevents
      // any single native call from overshooting SEARCH_BATCH_MAX_BYTES:
      // with the old "add then check" order a batch of three 5 MB files
      // went out at 15 MB (overshooting the 8 MB cap by 7 MB) because
      // `pendingBytes` only hit the threshold *after* the third file was
      // appended.  Now the third file lands in a fresh batch, keeping each
      // batch at or below the limit.
      if (pendingBytes > 0 && pendingBytes + size >= SEARCH_BATCH_MAX_BYTES) {
        flush();
        pendingBytes = 0;
      }
      if (!pending.has(path)) pending.set(path, []);
      pending.get(path)!.push(resolve);
      pendingBytes += size;
      scheduleFlush();
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
 * Every request captures both a monotonically increasing request generation
 * and the workspace session. Authority is rechecked after enumeration,
 * around content batching, after matching, before result publication, and
 * in finally cleanup. This is deliberately stronger than comparing
 * rootPath: Android grants all use `/workspace`, so a same-path new grant
 * is a different authority lifetime even though the display path is equal.
 */
export async function runSearch(rootPath: string, query: string) {
  const authority = beginSearchAuthority();
  const isCurrent = () => isCurrentSearch(authority);
  searchQuery.value = query;
  const parsed = parseSearchQuery(query);
  if (parsed.length === 0) {
    if (isCurrent()) {
      searchResults.value = null;
      searchInProgress.value = false;
    }
    return;
  }
  searchInProgress.value = true;
  try {
    const entries = await findAllFiles(rootPath);
    if (!isCurrent()) return;
    const readContent = createBatchedContentReader(isCurrent);
    const matchFlags = await mapWithConcurrency(
      entries,
      SEARCH_CONTENT_READ_CONCURRENCY,
      async (entry) => {
        if (!isCurrent()) return false;
        let contentPromise: Promise<string | null> | null = null;
        // Files that are images, excessively large, or not text are never read
        // for content matching. Non-text files (PDFs, videos, compressed
        // archives, binaries…) are skipped here so they never reach the native
        // side's string serialization, which on Android replaces invalid UTF-8
        // rather than rejecting it (per FolderAccessPlugin.java's
        // readOneFileOrNull) and on Rust wastes IPC and memory on a file that
        // was never meant to be searched. The 50 MB cap is a second safety
        // net: even a single-text-file batch could hit the native heap ceiling.
        const fileIsReadableForContent =
          !isImagePath(entry.path) &&
          isTextFile(entry.path) &&
          (entry.size ?? CONSERVATIVE_UNKNOWN_SIZE) <=
            MAX_SEARCHABLE_FILE_BYTES;
        // When the native walk doesn't report a size, assume CONSERVATIVE_UNKNOWN_SIZE
        // bytes so the file still triggers a batch flush (it won't blend into a
        // zero-size batch with a hundred tiny notes), but don't read the file if
        // it is actually larger than MAX_SEARCHABLE_FILE_BYTES.
        const fileByteSize = entry.size ?? CONSERVATIVE_UNKNOWN_SIZE;
        const getContentLower = () => {
          if (!isCurrent()) return Promise.resolve(null);
          if (!contentPromise) {
            contentPromise = fileIsReadableForContent
              ? readContent(entry.path, fileByteSize).then((content) =>
                  isCurrent() ? (content?.toLowerCase() ?? null) : null,
                )
              : Promise.resolve(null);
          }
          return contentPromise;
        };
        const matched = await matchesSearchQuery(parsed, {
          nameLower: entry.name.toLowerCase(),
          pathLower: relativePath(rootPath, entry.path).toLowerCase(),
          tagsLower: linkIndex.value.tagsByPath.get(entry.path) ?? [],
          getContentLower,
        });
        return isCurrent() && matched;
      },
    );
    if (!isCurrent()) return;
    searchResults.value = entries.filter((_, i) => matchFlags[i]);
  } finally {
    if (isCurrent()) searchInProgress.value = false;
  }
}

export function clearSearch() {
  invalidateSearchAuthority();
  searchQuery.value = "";
  searchResults.value = null;
  searchInProgress.value = false;
}

export async function renameEntry(
  oldPath: string,
  newName: string,
): Promise<string> {
  const parent = dirname(oldPath);
  const siblings = await listDir(parent);
  if (siblings.some((e) => e.name === newName)) {
    throw alreadyExistsMessage(newName);
  }
  const newPath = `${parent}/${newName}`;
  const root = requireWorkspacePath();
  try {
    await renameWorkspacePathNoReplace(
      root,
      relativePath(root, oldPath),
      relativePath(root, newPath),
    );
  } catch (error) {
    rethrowCreateCollision(error, newName);
  }
  forgetPath(oldPath);
  await loadChildren(parent);
  return newPath;
}

export async function deleteEntry(
  rootPath: string,
  path: string,
): Promise<void> {
  if (workspaceSettings.value.deleteBehavior === "permanent") {
    await deleteWorkspacePathPermanent(rootPath, relativePath(rootPath, path));
  } else {
    await trashPath(rootPath, path);
  }
  forgetPath(path);
  await loadChildren(dirname(path));
}
