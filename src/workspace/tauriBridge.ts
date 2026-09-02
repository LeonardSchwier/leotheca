import { Capacitor } from "@capacitor/core";
import * as desktop from "./tauriBridgeImpl";
import * as android from "./capacitorBridgeImpl";
import { isPathWithinWorkspace, relativePathBetween } from "./paths";

/**
 * Platform dispatcher. Every other file in this project imports storage
 * and platform-info functions from this exact path (unchanged since the
 * desktop-only prototype), so switching implementations here is the only
 * place that needs to know Tauri and Capacitor exist.
 */
const impl = Capacitor.isNativePlatform() ? android : desktop;

/** Whether this session is running on the Android/Capacitor bridge rather
 * than the Tauri desktop shell. A function, not a precomputed constant, so
 * callers that need platform-specific tuning (e.g. linking/store.ts's
 * read concurrency) get a value tests can freely override per case with
 * `vi.fn()`, rather than one baked in at this module's own import time. */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

// A workspace transition cannot safely replace Android's synthetic
// `/workspace` SAF grant while an older read, mutation, or attachment write
// is still inside the native bridge. Track every workspace-facing operation
// here, at the one boundary all callers already share, so the transition can
// drain them without teaching every feature its own lifecycle registry.
let activeWorkspaceOperations = 0;
const workspaceOperationDrainWaiters = new Set<() => void>();

function trackWorkspaceOperation<T>(operation: Promise<T>): Promise<T> {
  activeWorkspaceOperations += 1;
  return operation.finally(() => {
    activeWorkspaceOperations -= 1;
    if (activeWorkspaceOperations === 0) {
      for (const resolve of workspaceOperationDrainWaiters) resolve();
      workspaceOperationDrainWaiters.clear();
    }
  });
}

export function drainWorkspaceOperations(): Promise<void> {
  if (activeWorkspaceOperations === 0) return Promise.resolve();
  return new Promise((resolve) => workspaceOperationDrainWaiters.add(resolve));
}

export const pickWorkspaceFolder = impl.pickWorkspaceFolder;

// The transition layer calls this before it publishes a workspace, both on
// startup and on every later workspace switch. Keep the active root beside
// the platform grant at this same boundary: clear the capability before an
// activation attempt, and publish it only after the underlying activation
// succeeds. An autosave can therefore never reuse a root from a failed or
// superseded grant activation.
let activeWorkspaceRoot: string | null = null;

export async function restoreWorkspaceAccess(path: string, token?: string): Promise<void> {
  activeWorkspaceRoot = null;
  await impl.restoreWorkspaceAccess(path, token);
  activeWorkspaceRoot = path;
}

export const listDir: typeof impl.listDir = (path: string) =>
  trackWorkspaceOperation(impl.listDir(path));
export const findMarkdownFiles: typeof impl.findMarkdownFiles = (path: string) =>
  trackWorkspaceOperation(impl.findMarkdownFiles(path));
export const findAllFiles: typeof impl.findAllFiles = (path: string) =>
  trackWorkspaceOperation(impl.findAllFiles(path));
export const findAllEntries: typeof impl.findAllEntries = (path: string) =>
  trackWorkspaceOperation(impl.findAllEntries(path));
export const readTextFile: typeof impl.readTextFile = (path: string) =>
  trackWorkspaceOperation(impl.readTextFile(path));
export const readTextFilesBatch: typeof impl.readTextFilesBatch = (paths: string[]) =>
  trackWorkspaceOperation(impl.readTextFilesBatch(paths));
export const writeTextFile: typeof impl.writeTextFile = (path: string, contents: string) =>
  trackWorkspaceOperation(impl.writeTextFile(path, contents));
export const writeBinaryFile: typeof impl.writeBinaryFile = (path: string, data: Uint8Array) =>
  trackWorkspaceOperation(impl.writeBinaryFile(path, data));
export const createDir: typeof impl.createDir = (path: string) =>
  trackWorkspaceOperation(impl.createDir(path));
export const renamePath: typeof impl.renamePath = (from: string, to: string) =>
  trackWorkspaceOperation(impl.renamePath(from, to));
export const trashPath: typeof impl.trashPath = (workspaceRoot: string, path: string) =>
  trackWorkspaceOperation(impl.trashPath(workspaceRoot, path));
export const deletePathPermanent: typeof impl.deletePathPermanent = (path: string) =>
  trackWorkspaceOperation(impl.deletePathPermanent(path));
// Audit follow-up F-004's containment-checked counterparts to the functions
// above. Same drain participation: a rename or delete resolved and verified
// against the workspace root on the native side is still a native mutation
// in flight, so a transition must wait for it the same as for the unchecked
// calls above.
export const writeWorkspaceTextFile: typeof impl.writeWorkspaceTextFile = (
  workspaceRoot: string,
  relativePath: string,
  contents: string,
) => trackWorkspaceOperation(impl.writeWorkspaceTextFile(workspaceRoot, relativePath, contents));
export const writeWorkspaceBinaryFile: typeof impl.writeWorkspaceBinaryFile = (
  workspaceRoot: string,
  relativePath: string,
  data: Uint8Array,
) => trackWorkspaceOperation(impl.writeWorkspaceBinaryFile(workspaceRoot, relativePath, data));
export const createWorkspaceDir: typeof impl.createWorkspaceDir = (
  workspaceRoot: string,
  relativePath: string,
) => trackWorkspaceOperation(impl.createWorkspaceDir(workspaceRoot, relativePath));
export const renameWorkspacePath: typeof impl.renameWorkspacePath = (
  workspaceRoot: string,
  from: string,
  to: string,
) => trackWorkspaceOperation(impl.renameWorkspacePath(workspaceRoot, from, to));
export const deleteWorkspacePathPermanent: typeof impl.deleteWorkspacePathPermanent = (
  workspaceRoot: string,
  relativePath: string,
) => trackWorkspaceOperation(impl.deleteWorkspacePathPermanent(workspaceRoot, relativePath));

/**
 * Saves an already-open workspace file through the active workspace
 * capability rather than the older unrestricted absolute-path writer.
 * This is intentionally an overwrite operation: the note already exists,
 * and F-003's save coordinator owns revision ordering. New file creation
 * uses the separate no-replace mutation contract from F-004.
 */
export function writeActiveWorkspaceTextFile(path: string, contents: string): Promise<void> {
  const workspaceRoot = activeWorkspaceRoot;
  if (!workspaceRoot) {
    return Promise.reject(new Error("No active workspace is available for this write."));
  }
  if (path === workspaceRoot || !isPathWithinWorkspace(workspaceRoot, path)) {
    return Promise.reject(
      new Error(`Cannot save "${path}" outside workspace root "${workspaceRoot}".`),
    );
  }
  return writeWorkspaceTextFile(
    workspaceRoot,
    relativePathBetween(workspaceRoot, path),
    contents,
  );
}

// App-private config, app metadata, and status-bar appearance are not bound to
// a selected workspace grant and therefore do not participate in the drain.
export const getAppConfigFilePath = impl.getAppConfigFilePath;
export const getAppVersion = impl.getAppVersion;
export const fileSrc: typeof impl.fileSrc = (path: string) =>
  trackWorkspaceOperation(impl.fileSrc(path));
export const getWorkspaceStats: typeof impl.getWorkspaceStats = (path: string) =>
  trackWorkspaceOperation(impl.getWorkspaceStats(path));
export const setStatusBarAppearance = impl.setStatusBarAppearance;
