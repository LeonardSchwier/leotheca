import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { appConfigDir, join } from "@tauri-apps/api/path";
import { getVersion } from "@tauri-apps/api/app";
import type { FsEntry } from "./types";
import type { WorkspaceStats } from "../settings/VaultStatsPanel";

export async function pickWorkspaceFolder(): Promise<{ path: string; token?: string } | null> {
  const selected = await open({ directory: true, multiple: false });
  const path = Array.isArray(selected) ? (selected[0] ?? null) : selected;
  return path ? { path } : null;
}

/** No-op on desktop: the real folder path from `pickWorkspaceFolder` is
 * already everything needed to reopen a workspace, unlike Android's opaque
 * SAF URI, which does need to be restored into an in-memory cache. */
export async function restoreWorkspaceAccess(path: string, token: string | undefined): Promise<void> {
  void path;
  void token;
}

export async function listDir(path: string): Promise<FsEntry[]> {
  return invoke<FsEntry[]>("list_dir", { path });
}

/** Recursively finds every markdown file under `path` in a single native
 * call, instead of one `listDir` round trip per directory (see
 * commands.rs's `find_markdown_files` for why: ~83s across ~514 calls on a
 * real 580-note vault, all IPC overhead rather than actual disk time). Used
 * by linking/store.ts's rebuildLinkIndex; nothing else needs a full
 * recursive walk of the whole workspace the way that does. */
export async function findMarkdownFiles(path: string): Promise<FsEntry[]> {
  return invoke<FsEntry[]>("find_markdown_files", { path });
}

/** Same one-native-call walk as findMarkdownFiles above, but every file
 * regardless of extension, for full-text search (fileTreeStore.ts's
 * runSearch), which also matches images and other attachments by name. */
export async function findAllFiles(path: string): Promise<FsEntry[]> {
  return invoke<FsEntry[]>("find_all_files", { path });
}

/** Same one-native-call walk as findAllFiles above, but also reports
 * directory entries (including an empty one), for fileTreeStore.ts's
 * expandAll, which needs to expand and know about every directory in the
 * subtree, not just files (see commands.rs's find_all_entries for why this
 * is a separate command from findAllFiles rather than an option on it). */
export async function findAllEntries(path: string): Promise<FsEntry[]> {
  return invoke<FsEntry[]>("find_all_entries", { path });
}

export async function readTextFile(path: string): Promise<string> {
  return invoke<string>("read_text_file", { path });
}

/** Reads multiple files' contents in one native call, for full-text
 * search's content-fallback (fileTreeStore.ts's runSearch): one native
 * call per file whose name doesn't match the query exhausted the Android
 * app's Java heap on a real large vault (see commands.rs's
 * read_text_files_batch), so search batches its content reads through
 * this instead. An unreadable file resolves to null in its position
 * rather than failing the whole batch. */
export async function readTextFilesBatch(paths: string[]): Promise<(string | null)[]> {
  return invoke<(string | null)[]>("read_text_files_batch", { paths });
}

export async function writeTextFile(path: string, contents: string): Promise<void> {
  return invoke("write_text_file", { path, contents });
}

/** `data` is sent as a plain array of byte values: Tauri's IPC already
 * serializes a JS number array into Rust's `Vec<u8>` for free, so there
 * is nothing to encode here (contrast capacitorBridgeImpl.ts's own
 * writeBinaryFile, which does need to base64-encode for the Capacitor
 * plugin call boundary). */
export async function writeBinaryFile(path: string, data: Uint8Array): Promise<void> {
  return invoke("write_binary_file", { path, data: Array.from(data) });
}

export async function createDir(path: string): Promise<void> {
  return invoke("create_dir", { path });
}

export async function renamePath(from: string, to: string): Promise<void> {
  return invoke("rename_path", { from, to });
}

export async function trashPath(workspaceRoot: string, path: string): Promise<void> {
  return invoke("trash_path", { workspaceRoot, path });
}

export async function deletePathPermanent(path: string): Promise<void> {
  return invoke("delete_path_permanent", { path });
}

export async function getAppConfigFilePath(filename: string): Promise<string> {
  return join(await appConfigDir(), filename);
}

export async function getAppVersion(): Promise<string> {
  return getVersion();
}

export async function fileSrc(path: string): Promise<string> {
  return convertFileSrc(path);
}

export async function getWorkspaceStats(path: string): Promise<WorkspaceStats> {
  return invoke<WorkspaceStats>("workspace_stats", { path });
}

/** No-op on desktop: there is no OS status bar to color. */
export async function setStatusBarAppearance(isDarkBackground: boolean): Promise<void> {
  void isDarkBackground;
}
