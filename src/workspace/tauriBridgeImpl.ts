import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { appConfigDir, join } from "@tauri-apps/api/path";
import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import type { FsEntry } from "./types";
import type { WorkspaceStats } from "../settings/VaultStatsPanel";

export async function pickWorkspaceFolder(): Promise<{
  path: string;
  token?: string;
  name?: string;
} | null> {
  const selected = await open({ directory: true, multiple: false });
  const path = Array.isArray(selected) ? (selected[0] ?? null) : selected;
  // No separate display name on Desktop: `path` is already the real
  // folder path, so `defaultProfileName`'s own basename fallback already
  // produces the right name without one, unlike Android's opaque,
  // synthetic "/workspace" root.
  return path ? { path } : null;
}

/** "Save As…" dialog for exporting a note as a standalone file outside
 * the workspace (ROADMAP.md's "Export a note to standalone HTML
 * (desktop)"). Deliberately not routed through `tauriBridge.ts`'s
 * platform dispatcher: unlike every other function in this file, this
 * one has no Android/Capacitor counterpart (see ROADMAP.md's "Print/
 * export a note on Android", which needs a real native "Save As"/share
 * plugin, not this desktop file-system dialog), so a caller that wants
 * it imports this module directly and gates the whole feature to
 * desktop, the same way the "Print note" command already does. Returns
 * `null` when the user cancels, same convention as `pickWorkspaceFolder`
 * above.
 *
 * `App.tsx`'s actual "Export note to HTML…" command no longer uses this
 * two-step pick-then-write: the returned path used to be handed straight
 * to the unscoped `writeTextFile`, which a compromised webview could just
 * as easily call directly with any path of its own choosing, never going
 * through this dialog at all (2026-09-22 security review). It now calls
 * `exportTextFileViaDialog` below instead, which performs the dialog and
 * the write together in Rust so the destination is never a value JS
 * supplies. Kept here, still exercised by its own test, as a plain
 * dialog-only utility for any future caller that genuinely just needs a
 * path back (not a write). */
export async function pickHtmlExportPath(defaultFileName: string): Promise<string | null> {
  return save({
    defaultPath: defaultFileName,
    filters: [{ name: "HTML", extensions: ["html"] }],
  });
}

/** Shows the same native "Save As…" dialog as `pickHtmlExportPath` above,
 * but performs the write in the same Rust command as the pick
 * (`export_text_file_via_dialog`) instead of returning the chosen path to
 * JS for a separate `writeTextFile` call. This is what actually closes the
 * export flow's own instance of the arbitrary-path-write gap
 * `check_unscoped_write_allowed` fixes for every other unscoped writer: a
 * webview cannot forge "the dialog's return value" the way it could forge
 * a plain path argument, since here there is no separate value to forge at
 * all. Desktop-only, not routed through the platform dispatcher, same as
 * `pickHtmlExportPath`. Returns `false` (no error) when the user cancels
 * the dialog. */
export async function exportTextFileViaDialog(
  defaultFileName: string,
  contents: string,
): Promise<boolean> {
  return invoke("export_text_file_via_dialog", {
    defaultFileName,
    contents,
  });
}

/** No-op on desktop: the real folder path from `pickWorkspaceFolder` is
 * already everything needed to reopen a workspace, unlike Android's opaque
 * SAF URI, which does need to be restored into an in-memory cache. */
export async function restoreWorkspaceAccess(
  path: string,
  token: string | undefined,
): Promise<void> {
  void path;
  void token;
}

/** Lists `path`'s immediate children. `workspaceRoot` establishes the
 * containment boundary the same way every workspace-scoped mutation's
 * `workspaceRoot` already does: `commands.rs`'s `list_dir` rejects `path`
 * outright if it resolves outside `workspaceRoot` (following a symlink),
 * and skips (rather than erroring the whole listing for) any child entry
 * that is itself a symlink escaping the workspace. Maintenance follow-up
 * to the whole-workspace read-traversal symlink fix: this is the command
 * that drives the always-visible file-tree sidebar, not just one of the
 * whole-workspace walks above, which is why it needs the boundary
 * threaded in explicitly instead of deriving it from `path` itself. */
export async function listDir(
  workspaceRoot: string,
  path: string,
): Promise<FsEntry[]> {
  return invoke<FsEntry[]>("list_dir", { path, workspaceRoot });
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

/** Reads `path`'s raw bytes, for content that must round-trip byte-for-byte
 * (e.g. copying an image attachment in `capture/captureCommit.ts`), unlike
 * `readTextFile` above, which requires valid UTF-8. */
export async function readBinaryFile(path: string): Promise<Uint8Array> {
  const data = await invoke<number[]>("read_binary_file", { path });
  return new Uint8Array(data);
}

/** Reads multiple files' contents in one native call, for full-text
 * search's content-fallback (fileTreeStore.ts's runSearch): one native
 * call per file whose name doesn't match the query exhausted the Android
 * app's Java heap on a real large vault (see commands.rs's
 * read_text_files_batch), so search batches its content reads through
 * this instead. An unreadable file resolves to null in its position
 * rather than failing the whole batch. */
export async function readTextFilesBatch(
  paths: string[],
): Promise<(string | null)[]> {
  return invoke<(string | null)[]>("read_text_files_batch", { paths });
}

export async function writeTextFile(
  path: string,
  contents: string,
): Promise<void> {
  return invoke("write_text_file", { path, contents });
}

/** `data` is sent as a plain array of byte values: Tauri's IPC already
 * serializes a JS number array into Rust's `Vec<u8>` for free, so there
 * is nothing to encode here (contrast capacitorBridgeImpl.ts's own
 * writeBinaryFile, which does need to base64-encode for the Capacitor
 * plugin call boundary). */
export async function writeBinaryFile(
  path: string,
  data: Uint8Array,
): Promise<void> {
  return invoke("write_binary_file", { path, data: Array.from(data) });
}

/** Mirrors `tauriBridge.ts`'s own in-memory `activeWorkspaceRoot` into the
 * Rust side's `ActiveWorkspaceRoot` state, so `write_text_file`/
 * `write_binary_file`'s native containment gate (2026-09-22 security
 * review) has a server-side notion of "the active workspace" to check
 * against, not just this module's own JS variable. `null` clears it (no
 * workspace open). Called by `tauriBridge.ts`'s `restoreWorkspaceAccess`
 * wrapper, never called directly by anything else. */
export async function setActiveWorkspaceRoot(path: string | null): Promise<void> {
  return invoke("set_active_workspace_root", { path });
}

export async function createDir(path: string): Promise<void> {
  return invoke("create_dir", { path });
}

export async function renamePath(from: string, to: string): Promise<void> {
  return invoke("rename_path", { from, to });
}

export async function trashPath(
  workspaceRoot: string,
  path: string,
): Promise<void> {
  return invoke("trash_path", { workspaceRoot, path });
}

export async function deletePathPermanent(path: string): Promise<void> {
  return invoke("delete_path_permanent", { path });
}

/** Audit follow-up F-004: the workspace-scoped counterpart to
 * `writeTextFile` above. `relativePath` is resolved and verified against
 * `workspaceRoot` on the Rust side (`resolve_within_workspace` in
 * `commands.rs`) before anything is written, rather than trusting an
 * already-joined absolute path computed here. Callers that already have an
 * absolute path can derive `relativePath` with `relativePathBetween` from
 * `workspace/paths.ts`. */
export async function writeWorkspaceTextFile(
  workspaceRoot: string,
  relativePath: string,
  contents: string,
): Promise<void> {
  return invoke("write_workspace_text_file", {
    workspaceRoot,
    relativePath,
    contents,
  });
}

/** Same containment guarantee as writeWorkspaceTextFile, for binary
 * attachment content. See writeBinaryFile above for the byte-array IPC
 * encoding note; unchanged here. */
export async function writeWorkspaceBinaryFile(
  workspaceRoot: string,
  relativePath: string,
  data: Uint8Array,
): Promise<void> {
  return invoke("write_workspace_binary_file", {
    workspaceRoot,
    relativePath,
    data: Array.from(data),
  });
}

/** Creates a brand-new text file and fails with `already_exists` if the
 * target exists. Unlike writeWorkspaceTextFile, this never replaces data. */
export async function createWorkspaceTextFileNew(
  workspaceRoot: string,
  relativePath: string,
  contents: string,
): Promise<void> {
  return invoke("create_workspace_text_file_new", {
    workspaceRoot,
    relativePath,
    contents,
  });
}

/** Binary counterpart to createWorkspaceTextFileNew, for attachments. */
export async function createWorkspaceBinaryFileNew(
  workspaceRoot: string,
  relativePath: string,
  data: Uint8Array,
): Promise<void> {
  return invoke("create_workspace_binary_file_new", {
    workspaceRoot,
    relativePath,
    data: Array.from(data),
  });
}

export async function createWorkspaceDir(
  workspaceRoot: string,
  relativePath: string,
): Promise<void> {
  return invoke("create_workspace_dir", { workspaceRoot, relativePath });
}

export async function createWorkspaceDirNew(
  workspaceRoot: string,
  relativePath: string,
): Promise<void> {
  return invoke("create_workspace_dir_new", { workspaceRoot, relativePath });
}

export async function renameWorkspacePath(
  workspaceRoot: string,
  from: string,
  to: string,
): Promise<void> {
  return invoke("rename_workspace_path", { workspaceRoot, from, to });
}

export async function renameWorkspacePathNoReplace(
  workspaceRoot: string,
  from: string,
  to: string,
): Promise<void> {
  return invoke("rename_workspace_path_no_replace", { workspaceRoot, from, to });
}

export async function deleteWorkspacePathPermanent(
  workspaceRoot: string,
  relativePath: string,
): Promise<void> {
  return invoke("delete_workspace_path_permanent", {
    workspaceRoot,
    relativePath,
  });
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
export async function setStatusBarAppearance(
  isDarkBackground: boolean,
): Promise<void> {
  void isDarkBackground;
}

// F05: Android share intent bridge - desktop no-ops
export interface AndroidStagedAttachment {
  filePath: string;
  fileName: string;
  fileSize: number;
  fingerprint: string;
  mimeType: string;
}

export interface PendingShareData {
  text: string;
  title: string | null;
  hasSingleUri: boolean;
  hasMultipleUris: boolean;
  attachments?: AndroidStagedAttachment[];
}

export interface ShareDataResult {
  data: PendingShareData | null;
  timestamp: number;
}

export interface HasShareDataResult {
  hasData: boolean;
}

/** No-op on desktop: Android share intents don't apply to desktop. */
export async function getPendingShareData(): Promise<ShareDataResult> {
  return { data: null, timestamp: 0 };
}

/** No-op on desktop: Android share intents don't apply to desktop. */
export async function hasPendingShareData(): Promise<HasShareDataResult> {
  return { hasData: false };
}

export interface FavoritesWidgetEntry {
  label: string;
  path: string;
}

/** No-op on desktop: Android home-screen widgets don't apply to desktop.
 * Declares no parameter (still callable with one; see FavoritesWidgetEntry
 * in the real Android implementation) since this file's lint config has no
 * unused-parameter exemption. */
export async function updateFavoritesWidget(): Promise<void> {}

/** A markdown file opened from outside the active workspace, path and
 * content together. `external_open.rs`'s `ExternalMarkdownFile` (Rust
 * side) always reads the content itself, in the same trusted call that
 * establishes the path (a real OS launch argument, or the native file
 * dialog's own result): `read_text_file`/`read_binary_file` are scoped to
 * the active workspace root and the app config directory only
 * (2026-09-22 security review) and reject everything else, so a bare path
 * handed to the frontend for a second, separately gated call to fetch
 * content through could never work for a genuinely external file -- this
 * feature's entire premise. */
export interface ExternalMarkdownFile {
  path: string;
  content: string;
}

/** Cold-start half of ROADMAP.md's "Open a Markdown file from outside the
 * workspace via OS file association": `lib.rs`'s own `run()` buffers the
 * path and content from this process's own launch arguments (when the OS
 * spawned a *fresh* Leotheca process via its "Open with" registration)
 * into managed state, since no window/listener exists yet to receive a
 * live event at that point. Consumed at most once per launch -- the Rust
 * side `take`s rather than merely reads it -- so this only ever returns a
 * real file on the very first call after a genuine file-association cold
 * start. `null` covers both "no such launch" and "the launch argument's
 * file could no longer be read," the same silent-no-op convention this
 * feature's every other failure path already follows. */
export async function takePendingExternalFile(): Promise<ExternalMarkdownFile | null> {
  return invoke("take_pending_open_file");
}

/** Live half of the same feature: an already-running instance's relaunch
 * is intercepted by the single-instance plugin (Windows/Linux) or
 * delivered as `RunEvent::Opened` (macOS) in `lib.rs`, both of which emit
 * this one event so the frontend has a single live path+content pair to
 * listen on regardless of which platform mechanism actually delivered it.
 * Returns an unlisten function, mirroring `onOpenUrl`'s own shape. */
export function onExternalFileOpen(callback: (file: ExternalMarkdownFile) => void): () => void {
  let unlisten: (() => void) | null = null;
  let cancelled = false;
  void listen<ExternalMarkdownFile>("open-external-file", (event) => callback(event.payload)).then(
    (fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    },
  );
  return () => {
    cancelled = true;
    unlisten?.();
  };
}

/** In-app half of ROADMAP.md's "Open files from outside the vault from
 * within an open app" (Obsidian Desktop v1.14.2 parity, 2026-09-15
 * competitor scan). The OS-level half -- Markdown as a registered file
 * type an installer offers as a default-app option -- already exists via
 * this same `tauri.conf.json`'s `bundle.fileAssociations`, which the
 * platform bundlers (macOS `Info.plist`, Linux `.desktop` `MimeType=`,
 * the Windows installer) turn into real OS registration with no
 * additional code; that only leaves the missing in-app command an
 * already-running instance needs, a plain "Open File" dialog rather than
 * a second OS-launch code path. Resolves to the picked file's path and
 * content together, or `null` when the user cancels -- same null-on-
 * cancel convention as `pickWorkspaceFolder`/`pickHtmlExportPath` above.
 * Deliberately not routed through `tauriBridge.ts`'s platform dispatcher:
 * like `pickHtmlExportPath`, this is a desktop-only native file dialog
 * with no Android/Capacitor counterpart, so `App.tsx`'s command imports
 * it directly and gates itself to desktop the same way "Export note to
 * HTML…" already does. The result is handed to the same
 * `handleExternalFileOpen` App.tsx already uses for OS file-association
 * launches, so a file inside the current workspace opens as an ordinary
 * tab and one outside it opens the existing read-only `ExternalFileView`
 * scratch view -- one open path, not a second one invented for this
 * command.
 *
 * Reads through the native `pick_and_read_external_markdown_file` Rust
 * command (`external_open.rs`) rather than showing the dialog here and
 * separately calling `readTextFile` on the result: `read_text_file`/
 * `read_binary_file` are deliberately scoped to the active workspace root
 * and the app config directory only (2026-09-22 security review), so a
 * path from outside both -- by definition, every real target this
 * feature exists for -- always failed that check. The native command
 * reads the file in the same trusted call that shows the dialog, the
 * same guarantee `pickHtmlExportPath`'s save-side counterpart already
 * relies on, so this bridge function never receives a bare path it would
 * need a second, gated call to fetch content for. A picked-but-unreadable
 * file (deleted or permission-denied between the dialog closing and the
 * native read) rejects; caught here and turned into the same silent
 * no-op every other caller of `handleExternalFileOpen` already follows
 * for a target that doesn't pan out. */
export async function pickMarkdownFileToOpen(): Promise<ExternalMarkdownFile | null> {
  try {
    return await invoke<ExternalMarkdownFile | null>("pick_and_read_external_markdown_file");
  } catch {
    return null;
  }
}
