import { effect, signal } from "@preact/signals";
import { getAppVersion, listDir, readTextFile, restoreWorkspaceAccess, setStatusBarAppearance } from "../workspace/tauriBridge";
import { loadGlobalConfig, saveGlobalConfig, type ThemePreference } from "./globalConfig";
import { activeTabPath, closeAllTabs, openOrFocusTab, openTabs } from "../workspace/store";
import { classifyWorkspaceResource } from "../workspace/types";
import {
  DEFAULT_WORKSPACE_SETTINGS,
  loadWorkspaceSettings,
  saveWorkspaceSettings,
  type ViewMode,
  type WorkspaceSettings,
} from "./workspaceSettings";

export const workspacePath = signal<string | null>(null);
// Opaque, platform-specific (see GlobalConfig.workspaceToken); kept
// alongside workspacePath purely so later saves (e.g. setTheme) don't
// accidentally drop it.
const workspaceToken = signal<string | undefined>(undefined);
export const workspaceSettings = signal<WorkspaceSettings>(DEFAULT_WORKSPACE_SETTINGS);
export const settingsLoaded = signal(false);
export const settingsPanelOpen = signal(false);
export const appVersion = signal("");
export const theme = signal<ThemePreference>("system");
// Applied from workspaceSettings.defaultViewMode whenever a workspace is
// (re)opened, see setWorkspacePath/initSettings below; free to change
// during the session afterward without touching that setting.
export const viewMode = signal<ViewMode>(DEFAULT_WORKSPACE_SETTINGS.defaultViewMode);

// Keeps the editor and reading font size (see MarkdownEditor.tsx's CodeMirror
// theme and .markdown-preview in App.css, both reference this variable) in
// sync with the current workspace's setting, including the very first paint
// before any workspace is open (DEFAULT_WORKSPACE_SETTINGS applies then).
effect(() => {
  document.documentElement.style.setProperty(
    "--content-font-size",
    `${workspaceSettings.value.fontSize}px`,
  );
});

// Same idea for the whole-UI zoom level, see WorkspaceSettings.uiZoom's doc
// comment for why this is the CSS `zoom` property (applied to .app-shell in
// App.css) rather than a transform-based scale.
effect(() => {
  document.documentElement.style.setProperty(
    "--ui-zoom",
    `${workspaceSettings.value.uiZoom / 100}`,
  );
});

// Reopens the tabs that were open at the end of the last session in this
// workspace, so the editor isn't blank on every launch. Best-effort: a note
// deleted or moved since the last session is silently skipped rather than
// failing the whole restore.
let isRestoringTabs = false;

export async function restoreLastOpenTabs(): Promise<void> {
  const { lastOpenPaths, lastActivePath } = workspaceSettings.value;
  isRestoringTabs = true;
  try {
    for (const path of lastOpenPaths) {
      const name = path.split("/").pop() ?? path;
      const kind = classifyWorkspaceResource(path);
      try {
        const content = kind === "image" ? "" : await readTextFile(path);
        openOrFocusTab(path, name, content, kind);
      } catch {
        // Deleted or moved since last session, skip it.
      }
    }
    const restoredPaths = new Set(openTabs.value.map((tab) => tab.path));
    activeTabPath.value =
      lastActivePath && restoredPaths.has(lastActivePath)
        ? lastActivePath
        : openTabs.value.at(-1)?.path ?? null;
    lastPersistedTabsKey = JSON.stringify([
      openTabs.value.map((tab) => tab.path),
      activeTabPath.value,
    ]);
  } finally {
    isRestoringTabs = false;
  }
}

// Persists the open tab paths and the active one whenever they change, so
// they can be restored on next launch (see restoreLastOpenTabs above). Keyed
// off a derived key rather than openTabs.value directly, since that array
// also gets a new reference on every content edit (autosave), which would
// otherwise write this file on every keystroke.
let lastPersistedTabsKey = "";
effect(() => {
  if (!workspacePath.value) return;
  const paths = openTabs.value.map((t) => t.path);
  const key = JSON.stringify([paths, activeTabPath.value]);
  if (isRestoringTabs) return;
  if (key === lastPersistedTabsKey) return;
  lastPersistedTabsKey = key;
  void updateWorkspaceSettings({ lastOpenPaths: paths, lastActivePath: activeTabPath.value });
});

function resolvesToDarkBackground(pref: ThemePreference): boolean {
  if (pref === "dark") return true;
  if (pref === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

// Applies the theme preference to the document root so `theme.css`'s
// `[data-theme]` selectors take over from the `prefers-color-scheme`
// default ("system" removes the override and lets the media query
// decide), and keeps the Android status bar's icon color matched to our
// toolbar's actual background (a no-op on desktop).
effect(() => {
  const root = document.documentElement;
  if (theme.value === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", theme.value);
  }
  void setStatusBarAppearance(resolvesToDarkBackground(theme.value));
});

// "system" theme also needs to react to the OS scheme changing while the
// app is open, not just to our own theme signal changing.
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (theme.value === "system") {
    void setStatusBarAppearance(resolvesToDarkBackground("system"));
  }
});

export async function initSettings(): Promise<void> {
  appVersion.value = await getAppVersion();
  const global = await loadGlobalConfig();
  theme.value = global.theme;
  if (global.lastWorkspacePath) {
    try {
      await restoreWorkspaceAccess(global.lastWorkspacePath, global.workspaceToken);
      // Confirms access actually still works (not just that we have a
      // remembered path) before committing to it. Without this, a stale
      // pointer left over from a storage scheme change, a folder the user
      // moved or deleted, or a permission revoked outside the app would
      // set workspacePath to something every subsequent file operation
      // then fails on, leaving the UI half-loaded instead of just asking
      // the user to pick a folder again.
      await listDir(global.lastWorkspacePath);
      workspacePath.value = global.lastWorkspacePath;
      workspaceToken.value = global.workspaceToken;
      workspaceSettings.value = await loadWorkspaceSettings(global.lastWorkspacePath);
      viewMode.value = workspaceSettings.value.defaultViewMode;
      await restoreLastOpenTabs();
    } catch {
      workspacePath.value = null;
      await saveGlobalConfig({ lastWorkspacePath: null, theme: theme.value });
    }
  }
  settingsLoaded.value = true;
}

export async function setWorkspacePath(path: string, token?: string): Promise<void> {
  // closeAllTabs() below clears the *outgoing* workspace's tabs so the
  // incoming one doesn't briefly show stale ones (a real bug fixed in an
  // earlier session), but that clearing is not something the user asked
  // for by closing tabs, it is just this function's own bookkeeping. Left
  // alone, the persistence effect further down this file would still see
  // openTabs/activeTabPath change and write "0 tabs were open" into the
  // *outgoing* workspace's own settings.json, permanently losing its real
  // last-open-tabs the next time someone switches back to it. Pre-seeding
  // the effect's dedup key to exactly what that clear produces makes its
  // resulting write a no-op instead, without touching the effect itself
  // (adding a conditional early-return branch there instead would risk
  // Preact signals silently dropping that effect's subscription to
  // openTabs/activeTabPath on any run that doesn't read them).
  lastPersistedTabsKey = JSON.stringify([[], null]);
  closeAllTabs();
  workspacePath.value = path;
  workspaceToken.value = token;
  await saveGlobalConfig({ lastWorkspacePath: path, theme: theme.value, workspaceToken: token });
  workspaceSettings.value = await loadWorkspaceSettings(path);
  viewMode.value = workspaceSettings.value.defaultViewMode;
  await restoreLastOpenTabs();
}

export async function setTheme(next: ThemePreference): Promise<void> {
  theme.value = next;
  await saveGlobalConfig({
    lastWorkspacePath: workspacePath.value,
    theme: next,
    workspaceToken: workspaceToken.value,
  });
}

export async function updateWorkspaceSettings(patch: Partial<WorkspaceSettings>): Promise<void> {
  if (!workspacePath.value) return;
  workspaceSettings.value = { ...workspaceSettings.value, ...patch };
  await saveWorkspaceSettings(workspacePath.value, workspaceSettings.value);
}
