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

interface NativeMarkdownFile {
  relativePath: string;
  uri: string;
  mtime?: number;
  size?: number;
}

interface WorkspaceWalkResult {
  markdownFiles: NativeMarkdownFile[];
  folderCount: number;
  imageCount: number;
}

interface NativeFile {
  relativePath: string;
  uri: string;
  mtime?: number;
  size?: number;
}

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
  createTextFileNew(options: {
    parentUri: string;
    name: string;
    contents: string;
  }): Promise<{ uri: string }>;
  createBinaryFileNew(options: {
    parentUri: string;
    name: string;
    base64Data: string;
  }): Promise<{ uri: string }>;
  createDir(options: { parentUri: string; name: string }): Promise<{ uri: string }>;
  createDirNew(options: { parentUri: string; name: string }): Promise<{ uri: string }>;
  renamePath(options: { uri: string; newName: string }): Promise<{ uri: string }>;
  renamePathNoReplace(options: {
    uri: string;
    parentUri: string;
    newName: string;
  }): Promise<{ uri: string }>;
  movePath(options: {
    uri: string;
    fromParentUri: string;
    toParentUri: string;
  }): Promise<{ uri: string }>;
  deletePath(options: { uri: string }): Promise<void>;
  readFileAsDataUrl(options: { uri: string }): Promise<{ dataUrl: string }>;
}

const FolderAccess = registerPlugin<FolderAccessPlugin>("FolderAccess");

const APP_DATA_ROOT = "/leotheca-appdata";
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

interface WalkCacheEntry {
  timestamp: number;
  allFiles: NativeFile[] | null;
  markdownFiles: NativeMarkdownFile[] | null;
  allEntries: NativeAllEntry[] | null;
}

const walkCache = new Map<string, WalkCacheEntry>();
const WALK_CACHE_TTL_MS = 30_000;

function getWalkCache(rootPath: string): WalkCacheEntry | null {
  const entry = walkCache.get(rootPath);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > WALK_CACHE_TTL_MS) {
    walkCache.delete(rootPath);
    return null;
  }
  return entry;
}

function setWalkCache(
  rootPath: string,
  allFiles: NativeFile[] | null,
  markdownFiles: NativeMarkdownFile[] | null,
  allEntries: NativeAllEntry[] | null,
): void {
  const entry = getWalkCache(rootPath);
  if (entry) {
    entry.timestamp = Date.now();
    if (allFiles !== null) entry.allFiles = allFiles;
    if (markdownFiles !== null) entry.markdownFiles = markdownFiles;
    if (allEntries !== null) entry.allEntries = allEntries;
  } else {
    walkCache.set(rootPath, {
      timestamp: Date.now(),
      allFiles,
      markdownFiles,
      allEntries,
    });
  }
}

function isUriCacheSubtree(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

function evictUriSubtree(root: string): void {
  for (const path of pathToUri.keys()) {
    if (isUriCacheSubtree(path, root)) pathToUri.delete(path);
  }
}

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
  walkCache.clear();
  return { path: WORKSPACE_ROOT, token: result.uri };
}

export async function restoreWorkspaceAccess(path: string, token: string | undefined): Promise<void> {
  if (path === WORKSPACE_ROOT && token) {
    pathToUri.clear();
    pathToUri.set(WORKSPACE_ROOT, token);
    walkCache.clear();
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

const BASE64_CHUNK_SIZE = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK_SIZE));
  }
  return btoa(binary);
}

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
  await Filesystem.mkdir({
    path: toAppDataRelative(path),
    directory: Directory.Data,
    recursive: true,
  });
}

export async function renamePath(from: string, to: string): Promise<void> {
  const uri = await resolveUri(from);
  const newName = pathBasename(to);
  try {
    const renamed = await FolderAccess.renamePath({ uri, newName });
    evictUriSubtree(from);
    evictUriSubtree(to);
    pathToUri.set(to, renamed.uri);
  } catch (error) {
    evictUriSubtree(from);
    evictUriSubtree(to);
    throw error;
  }
}

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
  const trashTargetPath = `${trashParentPath}/${finalName}`;
  const sourceUri = await resolveUri(path);
  const sourceParentUri = await resolveUri(pathDirname(path));
  try {
    const moved = await FolderAccess.movePath({
      uri: sourceUri,
      fromParentUri: sourceParentUri,
      toParentUri: trashParentUri,
    });
    if (finalName !== name) {
      await FolderAccess.renamePath({ uri: moved.uri, newName: finalName });
    }
    evictUriSubtree(path);
    evictUriSubtree(trashTargetPath);
  } catch (error) {
    evictUriSubtree(path);
    evictUriSubtree(trashTargetPath);
    throw error;
  }
}

export async function deletePathPermanent(path: string): Promise<void> {
  const uri = await resolveUri(path);
  try {
    await FolderAccess.deletePath({ uri });
    evictUriSubtree(path);
  } catch (error) {
    evictUriSubtree(path);
    throw error;
  }
}

export async function writeWorkspaceTextFile(
  workspaceRoot: string,
  relativePath: string,
  contents: string,
): Promise<void> {
  return writeTextFile(`${workspaceRoot}/${relativePath}`, contents);
}

export async function writeWorkspaceBinaryFile(
  workspaceRoot: string,
  relativePath: string,
  data: Uint8Array,
): Promise<void> {
  return writeBinaryFile(`${workspaceRoot}/${relativePath}`, data);
}

export async function createWorkspaceTextFileNew(
  workspaceRoot: string,
  relativePath: string,
  contents: string,
): Promise<void> {
  const path = `${workspaceRoot}/${relativePath}`;
  const parentUri = await ensureDirUri(pathDirname(path));
  const created = await FolderAccess.createTextFileNew({
    parentUri,
    name: pathBasename(path),
    contents,
  });
  pathToUri.set(path, created.uri);
}

export async function createWorkspaceBinaryFileNew(
  workspaceRoot: string,
  relativePath: string,
  data: Uint8Array,
): Promise<void> {
  const path = `${workspaceRoot}/${relativePath}`;
  const parentUri = await ensureDirUri(pathDirname(path));
  const created = await FolderAccess.createBinaryFileNew({
    parentUri,
    name: pathBasename(path),
    base64Data: bytesToBase64(data),
  });
  pathToUri.set(path, created.uri);
}

export async function createWorkspaceDir(
  workspaceRoot: string,
  relativePath: string,
): Promise<void> {
  return createDir(`${workspaceRoot}/${relativePath}`);
}

export async function createWorkspaceDirNew(
  workspaceRoot: string,
  relativePath: string,
): Promise<void> {
  const path = `${workspaceRoot}/${relativePath}`;
  const parentUri = await ensureDirUri(pathDirname(path));
  const created = await FolderAccess.createDirNew({
    parentUri,
    name: pathBasename(path),
  });
  pathToUri.set(path, created.uri);
}

export async function renameWorkspacePath(
  workspaceRoot: string,
  from: string,
  to: string,
): Promise<void> {
  return renamePath(`${workspaceRoot}/${from}`, `${workspaceRoot}/${to}`);
}

export async function renameWorkspacePathNoReplace(
  workspaceRoot: string,
  from: string,
  to: string,
): Promise<void> {
  const fromPath = `${workspaceRoot}/${from}`;
  const toPath = `${workspaceRoot}/${to}`;
  const uri = await resolveUri(fromPath);
  const parentUri = await resolveUri(pathDirname(fromPath));
  try {
    const renamed = await FolderAccess.renamePathNoReplace({
      uri,
      parentUri,
      newName: pathBasename(toPath),
    });
    evictUriSubtree(fromPath);
    evictUriSubtree(toPath);
    pathToUri.set(toPath, renamed.uri);
  } catch (error) {
    evictUriSubtree(fromPath);
    evictUriSubtree(toPath);
    throw error;
  }
}

export async function deleteWorkspacePathPermanent(
  workspaceRoot: string,
  relativePath: string,
): Promise<void> {
  return deletePathPermanent(`${workspaceRoot}/${relativePath}`);
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

async function walkWorkspace(rootPath: string): Promise<WorkspaceWalkResult> {
  const uri = await resolveUri(rootPath);
  return FolderAccess.findMarkdownFiles({ uri });
}

export async function findMarkdownFiles(
  rootPath: string,
  deps: { walk: typeof walkWorkspace } = { walk: walkWorkspace },
): Promise<FsEntry[]> {
  const cached = getWalkCache(rootPath);
  if (cached?.allFiles) {
    const markdownFiles = cached.allFiles.filter((f) => f.relativePath.endsWith(".md"));
    return markdownFiles.map(({ relativePath, uri, mtime, size }) => {
      const path = `${rootPath}/${relativePath}`;
      pathToUri.set(path, uri);
      return { name: pathBasename(path), path, isDir: false, mtime, size };
    });
  }
  const { markdownFiles } = await deps.walk(rootPath);
  const allFilesResult = markdownFiles.map((f) => ({
    relativePath: f.relativePath,
    uri: f.uri,
    mtime: f.mtime,
    size: f.size,
  }));
  setWalkCache(rootPath, allFilesResult, markdownFiles, null);
  return markdownFiles.map(({ relativePath, uri, mtime, size }) => {
    const path = `${rootPath}/${relativePath}`;
    pathToUri.set(path, uri);
    return { name: pathBasename(path), path, isDir: false, mtime, size };
  });
}

async function walkWorkspaceAllFiles(rootPath: string): Promise<{ files: NativeFile[] }> {
  const uri = await resolveUri(rootPath);
  return FolderAccess.findAllFiles({ uri });
}

export async function findAllFiles(
  rootPath: string,
  deps: { walk: typeof walkWorkspaceAllFiles } = { walk: walkWorkspaceAllFiles },
): Promise<FsEntry[]> {
  const cached = getWalkCache(rootPath);
  if (cached?.allFiles) {
    return cached.allFiles.map(({ relativePath, uri, mtime, size }) => {
      const path = `${rootPath}/${relativePath}`;
      pathToUri.set(path, uri);
      return { name: pathBasename(path), path, isDir: false, mtime, size };
    });
  }
  const { files } = await deps.walk(rootPath);
  setWalkCache(rootPath, files, cached?.markdownFiles ?? null, null);
  return files.map(({ relativePath, uri, mtime, size }) => {
    const path = `${rootPath}/${relativePath}`;
    pathToUri.set(path, uri);
    return { name: pathBasename(path), path, isDir: false, mtime, size };
  });
}

async function walkWorkspaceAllEntries(rootPath: string): Promise<{ entries: NativeAllEntry[] }> {
  const uri = await resolveUri(rootPath);
  return FolderAccess.findAllEntries({ uri });
}

export async function findAllEntries(
  rootPath: string,
  deps: { walk: typeof walkWorkspaceAllEntries } = { walk: walkWorkspaceAllEntries },
): Promise<FsEntry[]> {
  const cached = getWalkCache(rootPath);
  if (cached?.allEntries) {
    return cached.allEntries.map(({ relativePath, uri, isDir, mtime }) => {
      const path = `${rootPath}/${relativePath}`;
      pathToUri.set(path, uri);
      return { name: pathBasename(path), path, isDir, mtime };
    });
  }
  const { entries } = await deps.walk(rootPath);
  setWalkCache(rootPath, null, null, entries);
  return entries.map(({ relativePath, uri, isDir, mtime }) => {
    const path = `${rootPath}/${relativePath}`;
    pathToUri.set(path, uri);
    return { name: pathBasename(path), path, isDir, mtime };
  });
}

const WORKSPACE_STATS_READ_CONCURRENCY = 8;

export async function getWorkspaceStats(
  rootPath: string,
  deps: { walk: typeof walkWorkspace; readTextFile: typeof readTextFile } = {
    walk: walkWorkspace,
    readTextFile,
  },
): Promise<WorkspaceStats> {
  const { markdownFiles, folderCount, imageCount } = await deps.walk(rootPath);
  let totalNoteLines = 0;
  await mapWithConcurrency(
    markdownFiles,
    WORKSPACE_STATS_READ_CONCURRENCY,
    async (note) => {
      const contents = await deps.readTextFile(`${rootPath}/${note.relativePath}`);
      totalNoteLines += contents.length === 0 ? 0 : contents.split("\n").length;
    },
  );
  return {
    folderCount,
    noteCount: markdownFiles.length,
    imageCount,
    averageLinesPerNote: markdownFiles.length === 0 ? 0 : totalNoteLines / markdownFiles.length,
    oldestNoteDate: null,
    newestNoteDate: null,
  };
}

export async function setStatusBarAppearance(isDarkBackground: boolean): Promise<void> {
  await StatusBar.setStyle({ style: isDarkBackground ? Style.Dark : Style.Light });
}
