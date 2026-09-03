import { batch, effect, signal } from "@preact/signals";
import {
  drainWorkspaceOperations,
  getAppVersion,
  listDir,
  pickWorkspaceFolder,
  readTextFile,
  restoreWorkspaceAccess,
  setStatusBarAppearance,
} from "../workspace/tauriBridge";
import {
  loadGlobalConfig,
  saveGlobalConfig,
  type GlobalConfigV2,
  type ThemePreference,
  type WorkspaceIcon,
  type WorkspaceProfile,
} from "./globalConfig";
import {
  defaultProfileName,
  findProfileByLocator,
  isKnownWorkspaceIcon,
  normalizeProfileName,
  sortWorkspaceProfiles,
} from "./workspaceProfiles";
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
// F20 Phase 1: the local catalog of previously opened workspaces (spec
// `leotheca-workspace-profiles-sdd.md` section 18). Always kept sorted
// (section 7.5) so every reader — the switcher UI, search — sees
// presentation-ready order without re-sorting itself. `activeWorkspaceId`
// is the catalog's own notion of "last intended active profile," distinct
// from `workspacePath` (whether a workspace is actually, currently open):
// the two intentionally diverge while an active profile's folder is
// unavailable (section 17.2), a state Phase 1 falls back to the ordinary
// `WelcomeDialog` for rather than a dedicated recovery launcher (see
// ROADMAP.md's F20 Phase 2 entry).
export const workspaceProfiles = signal<WorkspaceProfile[]>([]);
export const activeWorkspaceId = signal<string | null>(null);
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

window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", () => {
    if (theme.value === "system") {
      void setStatusBarAppearance(resolvesToDarkBackground("system"));
    }
  });

let globalConfigWriteTail: Promise<void> = Promise.resolve();
function saveGlobalConfigOrdered(config: GlobalConfigV2): Promise<void> {
  const write = globalConfigWriteTail.then(() => saveGlobalConfig(config));
  globalConfigWriteTail = write.catch(() => {});
  return write;
}

function persistGlobalConfig(): Promise<void> {
  const active = activeWorkspaceId.value
    ? workspaceProfiles.value.find((p) => p.id === activeWorkspaceId.value)
    : undefined;
  return saveGlobalConfigOrdered({
    version: 2,
    theme: theme.value,
    activeWorkspaceId: activeWorkspaceId.value,
    workspaceProfiles: workspaceProfiles.value,
    lastWorkspacePath: active?.path ?? null,
    workspaceToken: active?.token,
  });
}

function markProfileOpened(profile: WorkspaceProfile): void {
  const opened: WorkspaceProfile = { ...profile, lastOpenedAt: Date.now() };
  workspaceProfiles.value = sortWorkspaceProfiles([
    ...workspaceProfiles.value.filter((p) => p.id !== opened.id),
    opened,
  ]);
  activeWorkspaceId.value = opened.id;
}

export async function initSettings(): Promise<void> {
  appVersion.value = await getAppVersion();
  const global = await loadGlobalConfig();
  theme.value = global.theme;
  workspaceProfiles.value = sortWorkspaceProfiles(global.workspaceProfiles);
  activeWorkspaceId.value = global.activeWorkspaceId;
  const activeProfile = global.activeWorkspaceId
    ? global.workspaceProfiles.find((p) => p.id === global.activeWorkspaceId)
    : undefined;
  if (activeProfile) {
    try {
      await restoreWorkspaceAccess(activeProfile.path, activeProfile.token);
      const { settings: loadedWorkspaceSettings, corrupt } =
        await loadWorkspaceSettings(activeProfile.path);
      const { lastOpenPaths, lastActivePath } = loadedWorkspaceSettings;
      lastPersistedTabsKey = JSON.stringify([lastOpenPaths, lastActivePath]);
      isRestoringTabs = true;
      try {
        batch(() => {
          workspaceSettings.value = loadedWorkspaceSettings;
          workspaceSettingsCorrupted.value = corrupt;
          viewMode.value = loadedWorkspaceSettings.defaultViewMode;
          workspacePath.value = activeProfile.path;
          workspaceToken.value = activeProfile.token;
          workspaceSession.value++;
          markProfileOpened(activeProfile);
        });
        const active = lastActivePath ?? lastOpenPaths[0] ?? null;
        if (active) {
          const content = await readTextFile(active);
          const name = active.split("/").pop() ?? active;
          const kind = classifyWorkspaceResource(active);
          openOrFocusTab(active, name, content, kind);
          lastPersistedTabsKey = JSON.stringify([
            openTabs.value.map((t) => t.path),
            activeTabPath.value,
          ]);
        }
      } finally {
        isRestoringTabs = false;
      }
      await persistGlobalConfig();
    } catch {
      workspacePath.value = null;
    }
  }
  settingsLoaded.value = true;
}

export async function setWorkspacePath(path: string, token?: string, profile?: WorkspaceProfile): Promise<void> {
  settingsLoaded.value = true;
  workspaceSelectionError.value = null;
  const outgoingPath = workspacePath.value;
  const outgoingToken = workspaceToken.value;
  const outgoingSession = workspaceSession.value;

  await workspaceTransitions.run({
    prepareOutgoing: async () => {
      if (outgoingPath) await restoreWorkspaceAccess(outgoingPath, outgoingToken);
      await Promise.all([
        workspaceSaves.prepareForTransition(outgoingSession),
        drainWorkspaceSettingsWrites(),
      ]);
      await drainWorkspaceOperations();
      lastPersistedTabsKey = JSON.stringify([[], null]);
      closeAllTabs();
    },
    connectIncoming: async () => {
      await restoreWorkspaceAccess(path, token);
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
      if (profile) markProfileOpened(profile);
      await persistGlobalConfig();
      if (!isCurrent()) return;
      await restoreLastOpenTabs(isCurrent);
    },
  });
}

export async function setTheme(next: ThemePreference): Promise<void> {
  theme.value = next;
  await persistGlobalConfig();
}

export async function activateWorkspaceProfile(id: string): Promise<void> {
  if (id === activeWorkspaceId.value) return;
  const profile = workspaceProfiles.value.find((p) => p.id === id);
  if (!profile) return;
  await setWorkspacePath(profile.path, profile.token, profile);
}

export async function addWorkspaceFromPicker(): Promise<void> {
  const folder = await pickWorkspaceFolder();
  if (!folder) return;
  const existing = findProfileByLocator(workspaceProfiles.value, folder.path, folder.token);
  if (existing) {
    await activateWorkspaceProfile(existing.id);
    return;
  }
  const candidate: WorkspaceProfile = {
    id: crypto.randomUUID(),
    name: defaultProfileName(folder.path),
    icon: "folder",
    path: folder.path,
    token: folder.token,
    lastOpenedAt: 0,
  };
  await setWorkspacePath(candidate.path, candidate.token, candidate);
}

/** Rename a catalog profile without opening it or changing recency. Invalid
 * input fails closed and leaves both in-memory and persisted state untouched. */
export async function renameWorkspaceProfile(id: string, rawName: string): Promise<boolean> {
  const name = normalizeProfileName(rawName);
  if (!name) return false;
  const index = workspaceProfiles.value.findIndex((profile) => profile.id === id);
  if (index < 0) return false;
  const current = workspaceProfiles.value[index];
  if (current.name === name) return true;
  const next = [...workspaceProfiles.value];
  next[index] = { ...current, name };
  workspaceProfiles.value = sortWorkspaceProfiles(next);
  try {
    await persistGlobalConfig();
    return true;
  } catch (error) {
    workspaceProfiles.value = sortWorkspaceProfiles([
      ...workspaceProfiles.value.filter((profile) => profile.id !== id),
      current,
    ]);
    throw error;
  }
}

/** Change only to a bundled icon. Unknown persisted icon values remain
 * untouched until the user explicitly chooses a known replacement. */
export async function setWorkspaceProfileIcon(id: string, icon: WorkspaceIcon): Promise<boolean> {
  if (!isKnownWorkspaceIcon(icon)) return false;
  const index = workspaceProfiles.value.findIndex((profile) => profile.id === id);
  if (index < 0) return false;
  const current = workspaceProfiles.value[index];
  if (current.icon === icon) return true;
  const next = [...workspaceProfiles.value];
  next[index] = { ...current, icon };
  workspaceProfiles.value = sortWorkspaceProfiles(next);
  try {
    await persistGlobalConfig();
    return true;
  } catch (error) {
    workspaceProfiles.value = sortWorkspaceProfiles([
      ...workspaceProfiles.value.filter((profile) => profile.id !== id),
      current,
    ]);
    throw error;
  }
}

export async function forgetWorkspaceProfile(id: string): Promise<void> {
  if (id === activeWorkspaceId.value) return;
  if (!workspaceProfiles.value.some((p) => p.id === id)) return;
  workspaceProfiles.value = workspaceProfiles.value.filter((p) => p.id !== id);
  await persistGlobalConfig();
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

export async function repairWorkspaceSettingsFile(): Promise<void> {
  if (!workspacePath.value || !workspaceSettingsCorrupted.value) return;
  workspaceSettingsCorrupted.value = false;
  await updateWorkspaceSettings({});
}
