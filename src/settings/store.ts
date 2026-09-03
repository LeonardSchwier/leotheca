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
function saveGlobalConfigOrdered(config: GlobalConfigV2): Promise<void> {
  const write = globalConfigWriteTail.then(() => saveGlobalConfig(config));
  globalConfigWriteTail = write.catch(() => {});
  return write;
}

/** F20 Phase 1, spec section 18.4: "a write operation receives or reads
 * the latest canonical in-memory document immediately before
 * serialization." Every global-config write in this module goes through
 * this one function so theme changes, recency changes, and profile
 * catalog edits always serialize the *current* signal values together,
 * never a stale shape reconstructed piecemeal at each call site (the
 * pre-Phase-1 code built a fresh `{lastWorkspacePath, theme,
 * workspaceToken}` object per call site instead; this replaces every one
 * of those with a single source of truth). The compatibility mirror
 * (section 19.3) is derived from whichever profile `activeWorkspaceId`
 * currently resolves to, not tracked as separate signal state that could
 * drift from it. */
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

/** Marks `profile` as just-opened (section 7.5's `lastOpenedAt`) and makes
 * it the catalog's active profile, re-sorting so the switcher's own
 * ordering stays current. Does not itself persist — every caller either
 * follows with `persistGlobalConfig()` directly or relies on
 * `setWorkspacePath`'s own `afterPublish` doing so once the transition
 * that necessitated this update has actually succeeded. */
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
      // Skip the listDir probe — if the path is invalid, the first real
      // file operation will fail with a clear error. This saves ~20-100ms
      // on startup by avoiding one unnecessary SAF round trip.
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
      await persistGlobalConfig();
    } catch {
      // Section 17.2: retain the profile and its locator in the catalog;
      // do not overwrite global configuration merely because access
      // failed, and do not null out activeWorkspaceId — it stays the
      // user's last intended profile. workspacePath itself does become
      // null (no workspace is actually open), which falls back to the
      // ordinary WelcomeDialog rather than a dedicated recovery launcher
      // (deferred, see ROADMAP.md's F20 Phase 2 entry).
      workspacePath.value = null;
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
 *
 * F20 Phase 1: `profile`, when given, is the catalog entry this
 * transition activates — an existing profile (`activateWorkspaceProfile`)
 * or a not-yet-committed candidate (`addWorkspaceFromPicker`, per spec
 * section 11 step 8: "only after successful activation is the candidate
 * committed"). Only on success is it marked opened (`lastOpenedAt`,
 * `activeWorkspaceId`) and the full catalog persisted; a failed
 * transition leaves the catalog completely untouched, matching section
 * 16.4's "B remains in the catalog; B's recency is unchanged." This
 * function itself is no longer called directly by any UI surface (spec
 * section 20); it remains exported for existing tests exercising the
 * transition mechanics itself, and for the two profile actions below,
 * which are the only real callers now.
 */
export async function setWorkspacePath(path: string, token?: string, profile?: WorkspaceProfile): Promise<void> {
  settingsLoaded.value = true;
  workspaceSelectionError.value = null;
  const outgoingPath = workspacePath.value;
  const outgoingToken = workspaceToken.value;
  const outgoingSession = workspaceSession.value;

  // Section 16.4/17.2: a failed activation changes nothing about the
  // catalog (no profile is marked opened, nothing below touches
  // `workspaceProfiles`/`activeWorkspaceId`), so there is nothing to
  // persist on failure — persisting then would only risk overwriting a
  // concurrent, unrelated in-flight write with a stale snapshot (section
  // 16.5), not recover anything. `workspaceTransitions.run` itself
  // already rejects past this point, so callers see the failure without
  // a local catch here.
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

/** F20 Phase 1, spec section 20/10.4: activates a known catalog profile.
 * Selecting the already-active profile is a genuine no-op (spec 10.4:
 * "performs no filesystem work, does not increment the workspace
 * session, and does not alter recency"), checked before touching
 * anything. A stale switcher entry (an id no longer in the catalog, e.g.
 * a very fast double-forget) is likewise a silent no-op rather than an
 * error a caller must handle. */
export async function activateWorkspaceProfile(id: string): Promise<void> {
  if (id === activeWorkspaceId.value) return;
  const profile = workspaceProfiles.value.find((p) => p.id === id);
  if (!profile) return;
  await setWorkspacePath(profile.path, profile.token, profile);
}

/** F20 Phase 1, spec section 11's add-workspace flow. Picker cancellation
 * (a `null` result) leaves all state unchanged, per step 9's own closing
 * note. A folder matching an already-known profile's locator (section
 * 12.2) activates that profile instead of creating a duplicate (step 5);
 * `lastOpenedAt: 0` on a brand-new candidate is a placeholder only —
 * `setWorkspacePath`'s own `afterPublish` overwrites it with the real
 * open time via `markProfileOpened`, and only on success, per step 8's
 * "only after successful activation is the candidate committed." */
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

/** F20 Phase 2a: rename catalog metadata only. Validation follows section
 * 13.1 exactly; the action never opens a workspace or changes recency. A
 * persistence failure restores only this action's own optimistic name if
 * it still owns that field; a later concurrent edit must never be rolled
 * back by an older failed write. */
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
    const latest = workspaceProfiles.value.find((profile) => profile.id === id);
    if (latest?.name === name) {
      workspaceProfiles.value = sortWorkspaceProfiles([
        ...workspaceProfiles.value.filter((profile) => profile.id !== id),
        { ...latest, name: current.name },
      ]);
    }
    throw error;
  }
}

/** F20 Phase 2a: choose only one of the bundled icon IDs. Unknown icon
 * strings may still round-trip from future config versions, but cannot be
 * newly persisted through this UI action. Recency and activation are untouched.
 * A failed persistence restores only this action's own optimistic icon when
 * that value is still current, preserving any later concurrent edit. */
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
    const latest = workspaceProfiles.value.find((profile) => profile.id === id);
    if (latest?.icon === icon) {
      workspaceProfiles.value = sortWorkspaceProfiles([
        ...workspaceProfiles.value.filter((profile) => profile.id !== id),
        { ...latest, icon: current.icon },
      ]);
    }
    throw error;
  }
}

/** F20 Phase 1, spec section 7.7/15.1: removes only the catalog entry —
 * never the folder, its notes, `.leotheca/settings.json`, or platform
 * permission state. Narrowed to a non-active profile only, per this
 * phase's own claimed scope (see ROADMAP.md): forgetting the *active*
 * profile needs section 15.2's zero-active-workspace recovery flow,
 * deferred to F20 Phase 2. The switcher UI itself never offers this
 * action for the active profile, and this function additionally refuses
 * it defensively rather than trusting the UI alone. */
export async function forgetWorkspaceProfile(id: string): Promise<void> {
  if (id === activeWorkspaceId.value) return;
  if (!workspaceProfiles.value.some((p) => p.id !== id)) return;
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