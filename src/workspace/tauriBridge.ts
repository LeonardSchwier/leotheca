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

export const pickWorkspaceFolder = impl.pickWorkspaceFolder;
export const restoreWorkspaceAccess = impl.restoreWorkspaceAccess;
export const listDir = impl.listDir;
export const findMarkdownFiles = impl.findMarkdownFiles;
export const readTextFile = impl.readTextFile;
export const writeTextFile = impl.writeTextFile;
export const writeBinaryFile = impl.writeBinaryFile;
export const createDir = impl.createDir;
export const renamePath = impl.renamePath;
export const trashPath = impl.trashPath;
export const deletePathPermanent = impl.deletePathPermanent;
export const getAppConfigFilePath = impl.getAppConfigFilePath;
export const getAppVersion = impl.getAppVersion;
export const fileSrc = impl.fileSrc;
export const getWorkspaceStats = impl.getWorkspaceStats;
export const setStatusBarAppearance = impl.setStatusBarAppearance;
