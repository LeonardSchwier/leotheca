import { signal } from "@preact/signals";
import type { FsEntry } from "./types";
import { isImagePath } from "./types";
import {
  createDir,
  deletePathPermanent,
  listDir,
  readTextFile,
  renamePath,
  trashPath,
  writeTextFile,
} from "./tauriBridge";
import { updateWorkspaceSettings, workspaceSettings } from "../settings/store";

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
  async function walk(path: string) {
    const entries = await loadChildren(path);
    next.add(path);
    for (const entry of entries) {
      if (entry.isDir) await walk(entry.path);
    }
  }
  await walk(rootPath);
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

/** Full-text search: matches by file name first (cheap), and for text
 * files that don't match by name, falls back to reading and checking their
 * content. Skips hidden entries (`.trash`, `.leotheca`, ...), the same
 * convention the Rust `workspace_stats` command already uses, and image
 * files, which have no text content to search. */
export async function runSearch(rootPath: string, query: string) {
  searchQuery.value = query;
  const q = query.trim().toLowerCase();
  if (!q) {
    searchResults.value = null;
    return;
  }
  const matches: FsEntry[] = [];
  async function walk(path: string) {
    const entries = await listDir(path);
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (entry.isDir) {
        await walk(entry.path);
        continue;
      }
      if (entry.name.toLowerCase().includes(q)) {
        matches.push(entry);
        continue;
      }
      if (isImagePath(entry.path)) continue;
      try {
        const content = await readTextFile(entry.path);
        if (content.toLowerCase().includes(q)) matches.push(entry);
      } catch {
        // Unreadable file, skip it rather than failing the whole search.
      }
    }
  }
  await walk(rootPath);
  searchResults.value = matches;
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
