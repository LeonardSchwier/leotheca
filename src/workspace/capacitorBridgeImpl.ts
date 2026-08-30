import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { App } from "@capacitor/app";
import { Style, StatusBar } from "@capacitor/status-bar";
import { registerPlugin } from "@capacitor/core";
import type { FsEntry } from "./types";
import type { WorkspaceStats } from "../settings/VaultStatsPanel";
import { mapWithConcurrency } from "./concurrency";

/**
 * Real Android workspace storage, via a small custom Capacitor plugin
 * (android/app/src/main/java/.../FolderAccessPlugin.java) wrapping the
 * Storage Access Framework: the user picks any folder with the system
 * folder picker, we get a persistable content:// URI for it, and every
 * file operation below goes through that. No mature Capacitor plugin for
 * persistable SAF folder access exists as of this writing (Capacitor's
 * own Filesystem plugin explicitly does not support it since Android 11),
 * hence the small bespoke plugin rather than a dependency.
 *
 * SAF URIs are opaque: you cannot construct a child's URI from its
 * parent's, you have to ask the OS to list a directory and read them off
 * its response. The rest of this app still identifies files by plain path
 * strings (dirname(), tab identity, the search index, etc. all assume
 * that), so this module maintains a path -> URI cache, populated as
 * directories get listed and self-healing (falls back to walking down
 * from the nearest cached ancestor, re-listing as needed) for paths that
 * were never listed in this process, e.g. right after an app restart.
 */

interface NativeEntry {
  name: string;
  uri: string;
  isDir: boolean;
  mtime?: number;
}

/** One markdown file discovered by a native recursive workspace walk, see
 * findMarkdownFiles below. `relativePath` is relative to the walked root
 * (URI-joined with "/" by the native side), not yet prefixed with this
 * app's own workspace-relative path string. */
interface NativeMarkdownFile {
  relativePath: string;
  uri: string;
  mtime?: number;
}

interface WorkspaceWalkResult {
  markdownFiles: NativeMarkdownFile[];
  folderCount: number;
  imageCount: number;
}

/** One file of any extension discovered by findAllFiles's native walk, the
 * same shape as NativeMarkdownFile above minus the ".md"-only filter. */
interface NativeFile {
  relativePath: string;
  uri: string;
  mtime?: number;
  size?: number;
}

/** One entry (file or directory) discovered by findAllEntries's native
 * walk: the same relativePath/uri shape as NativeFile above, but also
 * covering directories, since expandAll (fileTreeStore.ts) needs to know
 * about every directory in the subtree, including one with nothing
 * directly inside it, which a files-only walk can never report. */
interface NativeAllEntry {
  relativePath: string;
  uri: string;
  isDir: boolean;
  mtime?: number;
}

interface FolderAccessPlugin {
  pickFolder(): Promise<{ uri: string | null }>;
  listDir(options: { uri: string }): Promise<{ entries: NativeEntry[] }>;
  findMarkdownFiles(options: { uri: string }): Promise<WorkspaceWalkResult>;
  findAllFiles(options: { uri: string }): Promise<{ files: NativeFile[] }>;
  findAllEntries(options: { uri: string }): Promise<{ entries: NativeAllEntry[] }>;
  readTextFile(options: { uri: string }): Promise<{ content: string }>;
  readTextFilesBatch(options: { uris: string[] }): Promise<{ contents: (string | null)[] }>;
  writeTextFile(options: {
    uri?: string;
    parentUri?: string;
    name?: string;
    contents: string;
  }): Promise<{ uri: string }>;
  writeBinaryFile(options: {
    uri?: string;
    parentUri?: string;
    name?: string;
    base64Data: string;
  }): Promise<{ uri: string }>;
  createDir(options: { parentUri: string; name: string }): Promise<{ uri: string }>;
  renamePath(options: { uri: string; newName: string }): Promise<{ uri: string }>;
  movePath(options: { uri: string; fromParentUri: string; toParentUri: string }): Promise<{ uri: string }>;
  deletePath(options: { uri: string }): Promise<void>;
  readFileAsDataUrl(options: { uri: string }): Promise<{ dataUrl: string }>;
}

const FolderAccess = registerPlugin<FolderAccessPlugin>("FolderAccess");

// Small, always-available app-private storage (no permission prompt, no
// SAF) for the tiny global pointer file only. Never used for workspace
// content, that's SAF-backed below.
const APP_DATA_ROOT = "/leotheca-appdata";
// Synthetic root standing in for whatever real folder the user picked.
export const WORKSPACE_ROOT = "/workspace";

function isWorkspacePath(path: string): boolean {
  return path === WORKSPACE_ROOT || path.startsWith(`${WORKSPACE_ROOT}/`);
}

function toAppDataRelative(path: string): string {
  if (path === APP_DATA_ROOT) return "";
  if (!path.startsWith(`${APP_DATA_ROOT}/`)) {
    throw new Error(`Path "${path}" is outside the app data root.`);
  }
  return path.slice(APP_DATA_ROOT.length + 1);
}

function pathDirname(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx > 0 ? path.slice(0, idx) : path;
}

function pathBasename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

const pathToUri = new Map<string, string>();

/** Resolves a workspace-relative path to its real content:// URI, walking
 * down from the nearest cached ancestor (at worst, the workspace root)
 * and listing directories as needed. Throws if the path truly does not
 * exist, or if the workspace root has not been picked/restored yet. */
async function resolveUri(path: string): Promise<string> {
  const cached = pathToUri.get(path);
  if (cached) return cached;
  if (path === WORKSPACE_ROOT) {
    throw new Error("No workspace folder has been selected yet.");
  }
  const parentUri = await resolveUri(pathDirname(path));
  const name = pathBasename(path);
  const { entries } = await FolderAccess.listDir({ uri: parentUri });
  const match = entries.find((e) => e.name === name);
  if (!match) throw new Error(`"${name}" was not found.`);
  pathToUri.set(path, match.uri);
  return match.uri;
}

/** Like resolveUri, but creates missing directories along the way instead
 * of throwing, matching write_text_file's "create parent dirs" behavior
 * on desktop. */
async function ensureDirUri(path: string): Promise<string> {
  const cached = pathToUri.get(path);
  if (cached) return cached;
  if (path === WORKSPACE_ROOT) {
    throw new Error("No workspace folder has been selected yet.");
  }
  const parentUri = await ensureDirUri(pathDirname(path));
  const name = pathBasename(path);
  const { entries } = await FolderAccess.listDir({ uri: parentUri });
  const existing = entries.find((e) => e.name === name && e.isDir);
  if (existing) {
    pathToUri.set(path, existing.uri);
    return existing.uri;
  }
  const created = await FolderAccess.createDir({ parentUri, name });
  pathToUri.set(path, created.uri);
  return created.uri;
}

export async function pickWorkspaceFolder(): Promise<{ path: string; token?: string } | null> {
  const result = await FolderAccess.pickFolder();
  if (!result.uri) return null;
  pathToUri.clear();
  pathToUri.set(WORKSPACE_ROOT, result.uri);
  return { path: WORKSPACE_ROOT, token: result.uri };
}

/** Re-seeds the path -> URI cache from a previously persisted SAF tree
 * URI, so a restarted app doesn't need to re-prompt the folder picker.
 * The permission itself was already made persistable at pick time; this
 * just reconnects our in-memory cache to it. */
export async function restoreWorkspaceAccess(path: string, token: string | undefined): Promise<void> {
  if (path === WORKSPACE_ROOT && token) {
    // The same synthetic path can now point at a different SAF tree. Never
    // let descendants resolved under the old grant survive that transition.
    pathToUri.clear();
    pathToUri.set(WORKSPACE_ROOT, token);
  }
}

export async function listDir(path: string): Promise<FsEntry[]> {
  if (!isWorkspacePath(path)) {
    throw new Error(`listDir is only supported for workspace paths, got "${path}".`);
  }
  const uri = await resolveUri(path);
  const { entries } = await FolderAccess.listDir({ uri });
  const result: FsEntry[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const childPath = `${path}/${entry.name}`;
    pathToUri.set(childPath, entry.uri);
    result.push({ name: entry.name, path: childPath, isDir: entry.isDir, mtime: entry.mtime });
  }
  return result;
}

export async function readTextFile(path: string): Promise<string> {
  if (isWorkspacePath(path)) {
    const uri = await resolveUri(path);
    const { content } = await FolderAccess.readTextFile({ uri });
    return content;
  }
  const result = await Filesystem.readFile({
    path: toAppDataRelative(path),
    directory: Directory.Data,
    encoding: Encoding.UTF8,
  });
  return typeof result.data === "string" ? result.data : await result.data.text();
}

/** Reads multiple workspace files' contents in one native call, for
 * full-text search's content-fallback (fileTreeStore.ts's runSearch):
 * one call per file whose name doesn't match the query exhausted the
 * app's Java heap on a real ~500-note vault, confirmed on-device
 * 2026-08-28 (see FolderAccessPlugin.java's readTextFilesBatch). Only
 * ever called with workspace paths, search's only real caller, unlike
 * readTextFile above which also serves app-data paths. Each path's URI
 * resolution is a pathToUri cache hit in practice, since these paths
 * always came from a prior findAllFiles walk in the same search. */
export async function readTextFilesBatch(paths: string[]): Promise<(string | null)[]> {
  const uris = await Promise.all(paths.map((path) => resolveUri(path)));
  const { contents } = await FolderAccess.readTextFilesBatch({ uris });
  return contents;
}

export async function writeTextFile(path: string, contents: string): Promise<void> {
  if (isWorkspacePath(path)) {
    const existingUri = pathToUri.get(path);
    if (existingUri) {
      await FolderAccess.writeTextFile({ uri: existingUri, contents });
      return;
    }
    const parentUri = await ensureDirUri(pathDirname(path));
    const name = pathBasename(path);
    const created = await FolderAccess.writeTextFile({ parentUri, name, contents });
    pathToUri.set(path, created.uri);
    return;
  }
  await Filesystem.writeFile({
    path: toAppDataRelative(path),
    directory: Directory.Data,
    data: contents,
    encoding: Encoding.UTF8,
    recursive: true,
  });
}

// btoa() only accepts a "binary string" (one code unit per byte), and
// String.fromCharCode(...bytes) over a whole image at once risks blowing
// the call stack (spread arguments count against the engine's argument
// limit), hence chunked conversion rather than one call over the whole
// buffer.
const BASE64_CHUNK_SIZE = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK_SIZE));
  }
  return btoa(binary);
}

/** Same shape as writeTextFile, for binary content (a pasted or dropped
 * image attachment). Content crosses the Capacitor plugin call boundary
 * as base64 (FolderAccessPlugin.java's writeBinaryFile decodes it back);
 * Filesystem.writeFile's own `data` is base64 by default when no
 * `encoding` is given, so the app-private branch needs no extra option
 * either. */
export async function writeBinaryFile(path: string, data: Uint8Array): Promise<void> {
  const base64Data = bytesToBase64(data);
  if (isWorkspacePath(path)) {
    const existingUri = pathToUri.get(path);
    if (existingUri) {
      await FolderAccess.writeBinaryFile({ uri: existingUri, base64Data });
      return;
    }
    const parentUri = await ensureDirUri(pathDirname(path));
    const name = pathBasename(path);
    const created = await FolderAccess.writeBinaryFile({ parentUri, name, base64Data });
    pathToUri.set(path, created.uri);
    return;
  }
  await Filesystem.writeFile({
    path: toAppDataRelative(path),
    directory: Directory.Data,
    data: base64Data,
    recursive: true,
  });
}

export async function createDir(path: string): Promise<void> {
  if (isWorkspacePath(path)) {
    await ensureDirUri(path);
    return;
  }
  await Filesystem.mkdir({ path: toAppDataRelative(path), directory: Directory.Data, recursive: true });
}

/** Same-folder rename only, which is all the UI ever asks for (the
 * NamePrompt-driven rename flow never changes an entry's parent). */
export async function renamePath(from: string, to: string): Promise<void> {
  const uri = await resolveUri(from);
  const newName = pathBasename(to);
  const renamed = await FolderAccess.renamePath({ uri, newName });
  pathToUri.delete(from);
  pathToUri.set(to, renamed.uri);
}

/** Mirrors the Rust `trash_path` command's behavior: move into
 * `<workspaceRoot>/.trash/<relative-to-root>`, timestamp-prefixing the
 * name on collision instead of overwriting. */
export async function trashPath(workspaceRoot: string, path: string): Promise<void> {
  if (!path.startsWith(`${workspaceRoot}/`)) {
    throw new Error(`"${path}" is not inside workspace root "${workspaceRoot}".`);
  }
  const relativeToWorkspace = path.slice(workspaceRoot.length + 1);
  const segments = relativeToWorkspace.split("/");
  const name = segments.pop()!;
  const trashParentPath = [workspaceRoot, ".trash", ...segments].join("/");
  const trashParentUri = await ensureDirUri(trashParentPath);

  const { entries } = await FolderAccess.listDir({ uri: trashParentUri });
  const finalName = entries.some((e) => e.name === name) ? `${Date.now()}-${name}` : name;

  const sourceUri = await resolveUri(path);
  const sourceParentUri = await resolveUri(pathDirname(path));
  const moved = await FolderAccess.movePath({ uri: sourceUri, fromParentUri: sourceParentUri, toParentUri: trashParentUri });
  if (finalName !== name) {
    await FolderAccess.renamePath({ uri: moved.uri, newName: finalName });
  }
  pathToUri.delete(path);
}

/** Deletes a workspace entry outright, no `.trash` involved, mirroring the
 * Rust `delete_path_permanent` command's desktop behavior. */
export async function deletePathPermanent(path: string): Promise<void> {
  const uri = await resolveUri(path);
  await FolderAccess.deletePath({ uri });
  pathToUri.delete(path);
}

export async function getAppConfigFilePath(filename: string): Promise<string> {
  return `${APP_DATA_ROOT}/${filename}`;
}

export async function getAppVersion(): Promise<string> {
  const info = await App.getInfo();
  return info.version;
}

export async function fileSrc(path: string): Promise<string> {
  const uri = await resolveUri(path);
  const { dataUrl } = await FolderAccess.readFileAsDataUrl({ uri });
  return dataUrl;
}

/** Walks `rootPath`'s entire subtree in a single native call
 * (FolderAccessPlugin.java's findMarkdownFiles), instead of one Capacitor
 * plugin round trip per directory the way a naive recursive `listDir`-based
 * walk would need. That per-directory approach measured at 90+ seconds on a
 * real ~580-note SAF-backed vault (confirmed on-device, session 53): the
 * JS/native bridge call itself is the dominant cost, not the underlying SAF
 * queries, so this removes that overhead by doing the whole recursive walk
 * (depth cap, dotfile skip, and all) on the native side in one round trip.
 * Shared by both findMarkdownFiles and getWorkspaceStats below, since they
 * need the same underlying walk and would otherwise duplicate it. */
async function walkWorkspace(rootPath: string): Promise<WorkspaceWalkResult> {
  const uri = await resolveUri(rootPath);
  return FolderAccess.findMarkdownFiles({ uri });
}

/** Recursively finds every markdown file under `rootPath`. `deps.walk`
 * defaults to the real native walk; tests inject a stand-in instead of
 * mocking the underlying Capacitor plugin call, the same seam
 * getWorkspaceStats below already used before this change. */
export async function findMarkdownFiles(
  rootPath: string,
  deps: { walk: typeof walkWorkspace } = { walk: walkWorkspace },
): Promise<FsEntry[]> {
  const { markdownFiles } = await deps.walk(rootPath);
  return markdownFiles.map(({ relativePath, uri, mtime }) => {
    const path = `${rootPath}/${relativePath}`;
    pathToUri.set(path, uri);
    return { name: pathBasename(path), path, isDir: false, mtime };
  });
}

/** Same reasoning as walkWorkspace above, but backing findAllFiles below:
 * every file regardless of extension, not just markdown notes. Kept as a
 * separate native call (FolderAccessPlugin.java's findAllFiles) rather
 * than reusing walkWorkspace/findMarkdownFiles, which keeps its "notes
 * only" contract intact for its other caller (rebuildLinkIndex). */
async function walkWorkspaceAllFiles(rootPath: string): Promise<{ files: NativeFile[] }> {
  const uri = await resolveUri(rootPath);
  return FolderAccess.findAllFiles({ uri });
}

/** Recursively finds every file under `rootPath`, regardless of extension,
 * for full-text search (fileTreeStore.ts's runSearch). Before this
 * existed, runSearch walked the workspace itself via repeated listDir
 * plugin calls, one per directory: on a real ~500-note SAF-backed vault
 * that didn't just run slowly, it crashed the app with an
 * OutOfMemoryError partway through the walk (confirmed on-device,
 * 2026-08-28), the same per-directory-IPC-call problem findMarkdownFiles's
 * own doc comment above already measured and fixed for the link index.
 * `deps.walk` follows the same test seam as findMarkdownFiles and
 * getWorkspaceStats. */
export async function findAllFiles(
  rootPath: string,
  deps: { walk: typeof walkWorkspaceAllFiles } = { walk: walkWorkspaceAllFiles },
): Promise<FsEntry[]> {
  const { files } = await deps.walk(rootPath);
  return files.map(({ relativePath, uri, mtime, size }) => {
    const path = `${rootPath}/${relativePath}`;
    pathToUri.set(path, uri);
    return { name: pathBasename(path), path, isDir: false, mtime, size };
  });
}

/** Same reasoning as walkWorkspaceAllFiles above, but backing
 * findAllEntries below: every file and directory, not just files. */
async function walkWorkspaceAllEntries(rootPath: string): Promise<{ entries: NativeAllEntry[] }> {
  const uri = await resolveUri(rootPath);
  return FolderAccess.findAllEntries({ uri });
}

/** Recursively finds every file and directory under `rootPath` in a single
 * native call, for fileTreeStore.ts's expandAll ("Expand All" in the file
 * tree). Before this existed, expandAll walked the workspace itself via
 * repeated listDir plugin calls, one per directory, the same per-directory
 * bridge-round-trip cost findMarkdownFiles's and findAllFiles's own doc
 * comments above already measured and fixed for the link index and search.
 * Kept as its own native call rather than teaching findAllFiles to also
 * return directories: findAllFiles's only caller (runSearch) relies on it
 * staying files-only, and a directory with nothing directly inside it (or
 * nested only under other empty directories) would never appear in a
 * files-only walk at all, which expandAll needs to know about, unlike
 * runSearch. `deps.walk` follows the same test seam as findAllFiles and
 * findMarkdownFiles. */
export async function findAllEntries(
  rootPath: string,
  deps: { walk: typeof walkWorkspaceAllEntries } = { walk: walkWorkspaceAllEntries },
): Promise<FsEntry[]> {
  const { entries } = await deps.walk(rootPath);
  return entries.map(({ relativePath, uri, isDir, mtime }) => {
    const path = `${rootPath}/${relativePath}`;
    pathToUri.set(path, uri);
    return { name: pathBasename(path), path, isDir, mtime };
  });
}

// At most this many notes are read concurrently while computing workspace
// statistics, same reasoning (and same helper) as the link index's own
// concurrency cap: reading every note's content one at a time is still
// real, separate work from the walk itself (see walkWorkspace above),
// which this bounds instead of dispatching all reads at once.
const WORKSPACE_STATS_READ_CONCURRENCY = 8;

/** `deps` defaults to this module's own `walkWorkspace`/`readTextFile`; the
 * parameter exists so tests can inject stand-ins without needing to mock
 * this file's own exports out from under itself, which ESM makes awkward
 * for same-file self-calls. Note: oldest/newest note dates are not
 * available here (SAF's directory listing does not surface a per-entry
 * creation timestamp through this plugin today), unlike the desktop
 * implementation. */
export async function getWorkspaceStats(
  rootPath: string,
  deps: { walk: typeof walkWorkspace; readTextFile: typeof readTextFile } = { walk: walkWorkspace, readTextFile },
): Promise<WorkspaceStats> {
  const { markdownFiles, folderCount, imageCount } = await deps.walk(rootPath);

  let totalNoteLines = 0;
  await mapWithConcurrency(markdownFiles, WORKSPACE_STATS_READ_CONCURRENCY, async (note) => {
    const contents = await deps.readTextFile(`${rootPath}/${note.relativePath}`);
    totalNoteLines += contents.length === 0 ? 0 : contents.split("\n").length;
  });

  return {
    folderCount,
    noteCount: markdownFiles.length,
    imageCount,
    averageLinesPerNote: markdownFiles.length === 0 ? 0 : totalNoteLines / markdownFiles.length,
    oldestNoteDate: null,
    newestNoteDate: null,
  };
}

/** Keeps the system status bar's icons (clock, battery, etc.) legible
 * against our own toolbar color, which the OS has no way to know about on
 * its own. `Style.Dark` gives white icons (for a dark toolbar background),
 * `Style.Light` gives dark icons (for a light one). */
export async function setStatusBarAppearance(isDarkBackground: boolean): Promise<void> {
  await StatusBar.setStyle({ style: isDarkBackground ? Style.Dark : Style.Light });
}
