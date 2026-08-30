import { Capacitor } from "@capacitor/core";
import * as desktop from "./tauriBridgeImpl";
import * as android from "./capacitorBridgeImpl";

/**
 * Platform dispatcher. Every other file in this project imports storage
 * and platform-info functions from this exact path (unchanged since the
 * desktop-only prototype), so switching implementations here is the only
 * place that needs to know Tauri and Capacitor exist.
 */
const impl = Capacitor.isNativePlatform() ? android : desktop;

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
// Grant activation is transition infrastructure itself, so it must not be
// counted as an operation that waits for the transition to finish.
export const restoreWorkspaceAccess = impl.restoreWorkspaceAccess;

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

// App-private config, app metadata, and status-bar appearance are not bound to
// a selected workspace grant and therefore do not participate in the drain.
export const getAppConfigFilePath = impl.getAppConfigFilePath;
export const getAppVersion = impl.getAppVersion;
export const fileSrc: typeof impl.fileSrc = (path: string) =>
  trackWorkspaceOperation(impl.fileSrc(path));
export const getWorkspaceStats: typeof impl.getWorkspaceStats = (path: string) =>
  trackWorkspaceOperation(impl.getWorkspaceStats(path));
export const setStatusBarAppearance = impl.setStatusBarAppearance;
