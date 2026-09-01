import { batch, effect, signal } from "@preact/signals";
import {
  drainWorkspaceOperations,
  getAppVersion,
  listDir,
  readTextFile,
  restoreWorkspaceAccess,
  setStatusBarAppearance,
} from "../workspace/tauriBridge";
import {
  loadGlobalConfig,
  saveGlobalConfig,
  type GlobalConfig,
  type ThemePreference,
} from "./globalConfig";
import {
  activeTabPath,
  closeAllTabs,
  openOrFocusTab,
  openTabs,
} from "../workspace/store";
import { classifyWorkspaceResource } from "../workspace/types";
import { workspaceSaves } from "../workspace/workspaceSaves";
import { workspaceTransitions } from "../workspace/workspaceTransition";
import {
  DEFAULT_WORKSPACE_SETTINGS,
  loadWorkspaceSettings,
  saveWorkspaceSettings,
  type ViewMode,
  type WorkspaceSettings,
} from "./workspaceSettings";

export const workspacePath = signal<string | null>(null);
export const workspaceSession = signal(0);
const workspaceToken = signal<string | undefined>(undefined);
export const workspaceSettings = signal<WorkspaceSettings>(
  DEFAULT_WORKSPACE_SETTINGS,
);
export const settingsLoaded = signal(false);
export const workspaceSettingsSaveError = signal<string | null>(null);
export const workspaceSelectionError = signal<string | null>(null);
// Set when the workspace's settings.json existed but didn't fully decode as
// written (see workspaceSettings.ts's decodeWorkspaceSettings): a JSON
// syntax error, a wrong-typed or out-of-range field, an unrecognized enum
// value, a lastOpenPaths/lastActivePath entry escaping the workspace, or an
// unrecognized version. Never cleared by simply saving again from the
// current in-memory (already-defaulted) state; only an explicit user
// action (SettingsPanel's "Rewrite settings file" button) does that, so a
// corrupt file is never silently overwritten just because the app happened
// to load it.
export const workspaceSettingsCorrupted = signal(false);
export const settingsPanelOpen = signal(false);
export const appVersion = signal("");
export const theme = signal<ThemePreference>("system");
// Applied from workspaceSettings.defaultViewMode whenever a workspace is
// (re)opened, see setWorkspacePath/initSettings below; free to change
// during the session afterward without touching that setting.
export const viewMode = signal<ViewMode>(
  DEFAULT_WORKSPACE_SETTINGS.defaultViewMode,
);

effect(() => {
  document.documentElement.style.setProperty("--content-font-size", `${workspaceSettings.value.fontSize}px`);
});

effect(() => {
  document.documentElement.style.setProperty("--ui-zoom", `${workspaceSettings.value.uiZoom / 100}`);
});

let isRestoringTabs = false;
let lastPersistedTabsKey = "";

/** Restores remembered tabs only while the caller still owns the workspace
 * transition. Reads may finish after another folder has been selected, so the
 * authority check is repeated after every await and before every mutation. */
export async function restoreLastOpenTabs(isCurrent: () => boolean = () => true): Promise<void> {
  const { lastOpenPaths, lastActivePath } = workspaceSettings.value;
  isRestoringTabs = true;
  try {
    for (const path of lastOpenPaths) {
      if (!isCurrent()) return;
      const name = path.split("/").pop() ?? path;
      const kind = classifyWorkspaceResource(path);
      try {
        const content = kind === "image" ? "" : await readTextFile(path);
        if (!isCurrent()) return;
        openOrFocusTab(path, name, content, kind);
      } catch {
        if (!isCurrent()) return;
      }
    }
    if (!isCurrent()) return;
    const restoredPaths = new Set(openTabs.value.map((tab) => tab.path));
    activeTabPath.value =
      lastActivePath && restoredPaths.has(lastActivePath)
        ? lastActivePath
        : (openTabs.value.at(-1)?.path ?? null);
    lastPersistedTabsKey = JSON.stringify([
      openTabs.value.map((tab) => tab.path),
      activeTabPath.value,
    ]);
  } finally {
    isRestoringTabs = false;
  }
}

effect(() => {
  if (!workspacePath.value || !settingsLoaded.value) return;
  const paths = openTabs.value.map((t) => t.path);
  const key = JSON.stringify([paths, activeTabPath.value]);
  if (isRestoringTabs || key === lastPersistedTabsKey) return;
  lastPersistedTabsKey = key;
  void updateWorkspaceSettings({
    lastOpenPaths: paths,
    lastActivePath: activeTabPath.value,
  });
});

function resolvesToDarkBackground(pref: ThemePreference): boolean {
  if (pref === "dark") return true;
  if (pref === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

effect(() => {
  const root = document.documentElement;
  if (theme.value === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme.value);
  void setStatusBarAppearance(resolvesToDarkBackground(theme.value));
});

// "system" theme also needs to react to the OS scheme changing while the
// app is open, not just to our own theme signal changing.
window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", () => {
    if (theme.value === "system") {
      void setStatusBarAppearance(resolvesToDarkBackground("system"));
    }
  });

// Global-config writes can overlap workspace transitions. Serialize them so a
// slower write from transition A can never land after the later B write.
let globalConfigWriteTail: Promise<void> = Promise.resolve();
function saveGlobalConfigOrdered(config: GlobalConfig): Promise<void> {
  const write = globalConfigWriteTail.then(() => saveGlobalConfig(config));
  globalConfigWriteTail = write.catch(() => {});
  return write;
}

export async function initSettings(): Promise<void> {
  appVersion.value = await getAppVersion();
  const global = await loadGlobalConfig();
  theme.value = global.theme;
  if (global.lastWorkspacePath) {
    try {
      await restoreWorkspaceAccess(global.lastWorkspacePath, global.workspaceToken);
      // Skip the listDir probe — if the path is invalid, the first real
      // file operation will fail with a clear error. This saves ~20-100ms
      // on startup by avoiding one unnecessary SAF round trip.
      const { settings: loadedWorkspaceSettings, corrupt } =
        await loadWorkspaceSettings(global.lastWorkspacePath);
      const { lastOpenPaths, lastActivePath } = loadedWorkspaceSettings;
      lastPersistedTabsKey = JSON.stringify([lastOpenPaths, lastActivePath]);
      isRestoringTabs = true;
      try {
        batch(() => {
          workspaceSettings.value = loadedWorkspaceSettings;
          workspaceSettingsCorrupted.value = corrupt;
          viewMode.value = loadedWorkspaceSettings.defaultViewMode;
          workspacePath.value = global.lastWorkspacePath;
          workspaceToken.value = global.workspaceToken;
          workspaceSession.value++;
        });
        const active = lastActivePath ?? lastOpenPaths[0] ?? null;
        if (active) {
          const content = await readTextFile(active);
          const name = active.split("/").pop() ?? active;
          const kind = classifyWorkspaceResource(active);
          openOrFocusTab(active, name, content, kind);
          // Update lastPersistedTabsKey after opening the tab so the effect
          // does not see a diff and trigger a write.
          lastPersistedTabsKey = JSON.stringify([
            openTabs.value.map((t) => t.path),
            activeTabPath.value,
          ]);
        }
      } finally {
        isRestoringTabs = false;
      }
      // Do NOT restoreLastOpenTabs() here — only the active tab loads.
      // Other tabs load lazily when the user switches to them via
      // the tab bar's open handler.
    } catch {
      workspacePath.value = null;
      await saveGlobalConfigOrdered({ lastWorkspacePath: null, theme: theme.value });
    }
  }
  settingsLoaded.value = true;
}

/**
 * Performs one authoritative workspace transition. If Android's folder picker
 * already reseeded the synthetic `/workspace` cache, reconnect to the outgoing
 * token synchronously first. Then block new outgoing autosaves, drain queued
 * settings writes plus every native workspace operation, clear outgoing UI
 * stores, and only then activate and validate the incoming grant. A later call
 * invalidates this call at every async phase.
 *
 * The incoming settings load runs through the same corrupt-decode path as
 * initSettings (see workspaceSettingsCorrupted above): a workspace switched
 * into with a malformed settings.json still becomes current, but its
 * corruption flag is set from the freshly loaded result, not carried over
 * from whatever the outgoing workspace's flag happened to be. A transition
 * that fails closed clears the flag entirely, since no settings file is
 * loaded for the resulting inactive state.
 */
export async function setWorkspacePath(path: string, token?: string): Promise<void> {
  settingsLoaded.value = true;
  workspaceSelectionError.value = null;
  const outgoingPath = workspacePath.value;
  const outgoingToken = workspaceToken.value;
  const outgoingSession = workspaceSession.value;

  try {
    await workspaceTransitions.run({
      prepareOutgoing: async () => {
        // pickWorkspaceFolder() currently activates its picked SAF token before
        // returning. Rebind the old grant immediately so pending old-session
        // work cannot resolve against the newly picked tree while it drains.
        if (outgoingPath) await restoreWorkspaceAccess(outgoingPath, outgoingToken);
        await Promise.all([
          workspaceSaves.prepareForTransition(outgoingSession),
          drainWorkspaceSettingsWrites(),
        ]);
        await drainWorkspaceOperations();

        // Clear tabs before the new grant is active. Preseed the persistence
        // key so this internal clear cannot overwrite the outgoing workspace's
        // remembered tabs while the transition is in progress.
        lastPersistedTabsKey = JSON.stringify([[], null]);
        closeAllTabs();
      },
      connectIncoming: async () => {
        await restoreWorkspaceAccess(path, token);
        // A successful restore alone is not proof the root remains readable,
        // especially for an expired Android persistable grant. Validate the
        // root before publishing the incoming session.
        await listDir(path);
      },
      loadIncoming: () => loadWorkspaceSettings(path),
      publishIncoming: ({ settings: loadedWorkspaceSettings, corrupt }) => {
        batch(() => {
          workspaceSettings.value = loadedWorkspaceSettings;
          workspaceSettingsCorrupted.value = corrupt;
          viewMode.value = loadedWorkspaceSettings.defaultViewMode;
          workspacePath.value = path;
          workspaceToken.value = token;
          workspaceSession.value++;
        });
      },
      publishFailure: (error) => {
        lastPersistedTabsKey = JSON.stringify([[], null]);
        closeAllTabs();
        batch(() => {
          workspaceSettings.value = DEFAULT_WORKSPACE_SETTINGS;
          workspaceSettingsCorrupted.value = false;
          viewMode.value = DEFAULT_WORKSPACE_SETTINGS.defaultViewMode;
          workspacePath.value = null;
          workspaceToken.value = undefined;
          workspaceSession.value++;
          workspaceSelectionError.value =
            error instanceof Error && error.message
              ? `Could not open that workspace: ${error.message}`
              : "Could not open that workspace. Choose the folder again or select another folder.";
        });
      },
      afterPublish: async (isCurrent) => {
        await saveGlobalConfigOrdered({ lastWorkspacePath: path, theme: theme.value, workspaceToken: token });
        if (!isCurrent()) return;
        await restoreLastOpenTabs(isCurrent);
      },
    });
  } catch (error) {
    await saveGlobalConfigOrdered({ lastWorkspacePath: null, theme: theme.value });
    throw error;
  }
}

export async function setTheme(next: ThemePreference): Promise<void> {
  theme.value = next;
  await saveGlobalConfigOrdered({
    lastWorkspacePath: workspacePath.value,
    theme: next,
    workspaceToken: workspaceToken.value,
  });
}

interface PendingWorkspaceSettingsWrite {
  path: string;
  settings: WorkspaceSettings;
  resolvers: Array<{ resolve: () => void; reject: (error: unknown) => void }>;
}

let pendingWorkspaceSettingsWrite: PendingWorkspaceSettingsWrite | null = null;
let workspaceSettingsWriteInFlight = false;
const workspaceSettingsDrainWaiters = new Set<() => void>();

function resolveWorkspaceSettingsDrainWaiters(): void {
  if (workspaceSettingsWriteInFlight || pendingWorkspaceSettingsWrite) return;
  for (const resolve of workspaceSettingsDrainWaiters) resolve();
  workspaceSettingsDrainWaiters.clear();
}

function drainWorkspaceSettingsWrites(): Promise<void> {
  if (!workspaceSettingsWriteInFlight && !pendingWorkspaceSettingsWrite) return Promise.resolve();
  return new Promise((resolve) => workspaceSettingsDrainWaiters.add(resolve));
}

function flushWorkspaceSettingsWrites(): void {
  if (workspaceSettingsWriteInFlight || !pendingWorkspaceSettingsWrite) {
    resolveWorkspaceSettingsDrainWaiters();
    return;
  }
  const pending = pendingWorkspaceSettingsWrite;
  pendingWorkspaceSettingsWrite = null;
  workspaceSettingsWriteInFlight = true;
  // Calling the native writer here, rather than from a promise continuation,
  // preserves the existing immediate-save behavior while its completion still
  // serializes every later revision.
  void saveWorkspaceSettings(pending.path, pending.settings)
    .then(
      () => pending.resolvers.forEach(({ resolve }) => resolve()),
      (error) => pending.resolvers.forEach(({ reject }) => reject(error)),
    )
    .finally(() => {
      workspaceSettingsWriteInFlight = false;
      flushWorkspaceSettingsWrites();
      resolveWorkspaceSettingsDrainWaiters();
    });
}

function queueWorkspaceSettingsWrite(
  path: string,
  settings: WorkspaceSettings,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (pendingWorkspaceSettingsWrite?.path === path) {
      pendingWorkspaceSettingsWrite.settings = settings;
      pendingWorkspaceSettingsWrite.resolvers.push({ resolve, reject });
      return;
    }
    pendingWorkspaceSettingsWrite = { path, settings, resolvers: [{ resolve, reject }] };
    flushWorkspaceSettingsWrites();
  });
}

/** Applies `patch` to the in-memory settings, then persists unless the
 * currently loaded file is marked corrupted (see workspaceSettingsCorrupted
 * above). The in-memory value still updates so the session stays usable
 * (font size, theme toggles, tab restoration bookkeeping) even before the
 * user repairs the file, but nothing reaches disk on its own: an ordinary
 * action like switching tabs must not silently replace the corrupt file's
 * real bytes with the defaulted values that produced this session's state.
 * Only repairWorkspaceSettingsFile's explicit recovery action, which clears
 * the flag before calling this, is allowed to write while corrupted. */
export async function updateWorkspaceSettings(
  patch: Partial<WorkspaceSettings>,
): Promise<void> {
  if (!workspacePath.value) return;
  workspaceSettings.value = { ...workspaceSettings.value, ...patch };
  if (workspaceSettingsCorrupted.value) return;
  const path = workspacePath.value;
  try {
    await queueWorkspaceSettingsWrite(path, workspaceSettings.value);
    workspaceSettingsSaveError.value = null;
  } catch (error) {
    workspaceSettingsSaveError.value =
      "Could not save workspace settings. Retry to keep your latest changes.";
    throw error;
  }
}

export async function retryWorkspaceSettingsSave(): Promise<void> {
  if (!workspacePath.value || !workspaceSettingsSaveError.value) return;
  await updateWorkspaceSettings({});
}

/** The explicit user recovery action for a corrupt settings.json (see
 * workspaceSettingsCorrupted above): writes the current, already-decoded
 * in-memory settings back to disk, replacing whatever malformed content
 * was there, and only then clears the corrupted flag. Never called
 * automatically just because a load happened to be corrupt; a user who
 * wants to inspect or hand-recover the original file first can do so
 * right up until they choose this. Clears the flag *before* calling
 * updateWorkspaceSettings so that call isn't itself skipped by the guard
 * above, which exists specifically to stop every other, non-explicit
 * caller from writing while corrupted. */
export async function repairWorkspaceSettingsFile(): Promise<void> {
  if (!workspacePath.value || !workspaceSettingsCorrupted.value) return;
  workspaceSettingsCorrupted.value = false;
  await updateWorkspaceSettings({});
}
