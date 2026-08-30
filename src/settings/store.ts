import { batch, effect, signal } from "@preact/signals";
import { getAppVersion, readTextFile, restoreWorkspaceAccess, setStatusBarAppearance } from "../workspace/tauriBridge";
import { loadGlobalConfig, saveGlobalConfig, type GlobalConfig, type ThemePreference } from "./globalConfig";
import { activeTabPath, closeAllTabs, openOrFocusTab, openTabs } from "../workspace/store";
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
export const workspaceSettings = signal<WorkspaceSettings>(DEFAULT_WORKSPACE_SETTINGS);
export const settingsLoaded = signal(false);
export const workspaceSettingsSaveError = signal<string | null>(null);
export const settingsPanelOpen = signal(false);
export const appVersion = signal("");
export const theme = signal<ThemePreference>("system");
export const viewMode = signal<ViewMode>(DEFAULT_WORKSPACE_SETTINGS.defaultViewMode);

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
        : openTabs.value.at(-1)?.path ?? null;
    lastPersistedTabsKey = JSON.stringify([openTabs.value.map((tab) => tab.path), activeTabPath.value]);
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
  void updateWorkspaceSettings({ lastOpenPaths: paths, lastActivePath: activeTabPath.value });
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

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (theme.value === "system") void setStatusBarAppearance(resolvesToDarkBackground("system"));
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
      const loadedWorkspaceSettings = await loadWorkspaceSettings(global.lastWorkspacePath);
      const { lastOpenPaths, lastActivePath } = loadedWorkspaceSettings;
      lastPersistedTabsKey = JSON.stringify([lastOpenPaths, lastActivePath]);
      isRestoringTabs = true;
      try {
        batch(() => {
          workspaceSettings.value = loadedWorkspaceSettings;
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
          lastPersistedTabsKey = JSON.stringify([openTabs.value.map((t) => t.path), activeTabPath.value]);
        }
      } finally {
        isRestoringTabs = false;
      }
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
 * token synchronously first, then block and drain old saves before activating
 * the incoming token. A later call invalidates this call at every async phase.
 */
export async function setWorkspacePath(path: string, token?: string): Promise<void> {
  settingsLoaded.value = true;
  const outgoingPath = workspacePath.value;
  const outgoingToken = workspaceToken.value;
  const outgoingSession = workspaceSession.value;

  await workspaceTransitions.run({
    prepareOutgoing: async () => {
      // pickWorkspaceFolder() currently activates its picked SAF token before
      // returning. Rebind the old grant immediately so a pending old-session
      // resolveUri cannot accidentally finish against the newly picked tree.
      if (outgoingPath) await restoreWorkspaceAccess(outgoingPath, outgoingToken);
      await workspaceSaves.prepareForTransition(outgoingSession);
    },
    connectIncoming: () => restoreWorkspaceAccess(path, token),
    loadIncoming: () => loadWorkspaceSettings(path),
    publishIncoming: (loadedWorkspaceSettings) => {
      // These tab clears are transition bookkeeping, not a user close action;
      // prevent the outgoing settings persistence effect from recording them.
      lastPersistedTabsKey = JSON.stringify([[], null]);
      closeAllTabs();
      batch(() => {
        workspaceSettings.value = loadedWorkspaceSettings;
        viewMode.value = loadedWorkspaceSettings.defaultViewMode;
        workspacePath.value = path;
        workspaceToken.value = token;
        workspaceSession.value++;
      });
    },
    afterPublish: async (isCurrent) => {
      await saveGlobalConfigOrdered({ lastWorkspacePath: path, theme: theme.value, workspaceToken: token });
      if (!isCurrent()) return;
      await restoreLastOpenTabs(isCurrent);
    },
  });
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

function flushWorkspaceSettingsWrites(): void {
  if (workspaceSettingsWriteInFlight || !pendingWorkspaceSettingsWrite) return;
  const pending = pendingWorkspaceSettingsWrite;
  pendingWorkspaceSettingsWrite = null;
  workspaceSettingsWriteInFlight = true;
  void saveWorkspaceSettings(pending.path, pending.settings).then(
    () => pending.resolvers.forEach(({ resolve }) => resolve()),
    (error) => pending.resolvers.forEach(({ reject }) => reject(error)),
  ).finally(() => {
    workspaceSettingsWriteInFlight = false;
    flushWorkspaceSettingsWrites();
  });
}

function queueWorkspaceSettingsWrite(path: string, settings: WorkspaceSettings): Promise<void> {
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

export async function updateWorkspaceSettings(patch: Partial<WorkspaceSettings>): Promise<void> {
  if (!workspacePath.value) return;
  workspaceSettings.value = { ...workspaceSettings.value, ...patch };
  const path = workspacePath.value;
  try {
    await queueWorkspaceSettingsWrite(path, workspaceSettings.value);
    workspaceSettingsSaveError.value = null;
  } catch (error) {
    workspaceSettingsSaveError.value = "Could not save workspace settings. Retry to keep your latest changes.";
    throw error;
  }
}

export async function retryWorkspaceSettingsSave(): Promise<void> {
  if (!workspacePath.value || !workspaceSettingsSaveError.value) return;
  await updateWorkspaceSettings({});
}
