import { batch, effect, signal } from "@preact/signals";
import {
  drainWorkspaceOperations,
  getAppVersion,
  isNativePlatform,
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
  focusTab,
  openOrFocusTab,
  openTabs,
} from "../workspace/store";
import { classifyWorkspaceResource } from "../workspace/types";
import { workspaceSaves } from "../workspace/workspaceSaves";
import { workspaceTransitions } from "../workspace/workspaceTransition";
import {
  classifyTransitionErrorKind,
  recoveryActionsFor,
  type WorkspaceTransitionErrorKind,
  type WorkspaceTransitionRecoveryAction,
} from "../workspace/workspaceTransitionRecovery";
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
// (section 7.5) so every reader, the switcher UI and search, sees
// presentation-ready order without re-sorting itself. `activeWorkspaceId`
// is the catalog's own notion of "last intended active profile," distinct
// from `workspacePath` (whether a workspace is actually, currently open):
// the two intentionally diverge while an active profile's folder is
// unavailable (section 17.2), a state Phase 1 falls back to the ordinary
// `WelcomeDialog` for rather than a dedicated recovery launcher (see
// ROADMAP.md's F20 Phase 2b entry).
export const workspaceProfiles = signal<WorkspaceProfile[]>([]);
export const activeWorkspaceId = signal<string | null>(null);
export const workspaceSettings = signal<WorkspaceSettings>(
  DEFAULT_WORKSPACE_SETTINGS,
);
export const settingsLoaded = signal(false);
export const workspaceSettingsSaveError = signal<string | null>(null);
/** True while at least one workspace-settings write is queued or in flight
 * (see queueWorkspaceSettingsWrite/resolveWorkspaceSettingsDrainWaiters
 * below), so SettingsPanel can show a "Saving…" indicator. The in-memory
 * `workspaceSettings` signal itself already updates synchronously on every
 * toggle (see updateWorkspaceSettings), so this exists purely for user
 * feedback on the disk write, not because anything else waits on it. */
export const workspaceSettingsSaving = signal(false);
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
// Mirrors workspaceSettingsCorrupted for the app-level config.json. Its
// decoded defaults remain usable in memory, but ordinary profile/theme
// changes must not silently replace malformed on-disk bytes.
export const globalConfigCorrupted = signal(false);
export const settingsPanelOpen = signal(false);
export const appVersion = signal("");
export const theme = signal<ThemePreference>("system");
// Applied from workspaceSettings.defaultViewMode whenever a workspace is
// (re)opened, see setWorkspacePath/initSettings below; free to change
// during the session afterward without touching that setting.
export const viewMode = signal<ViewMode>(
  DEFAULT_WORKSPACE_SETTINGS.defaultViewMode,
);

/** F20 Phase 2b-iii-b, spec sections 16.4 and 23: the recovery affordances
 * for a failed *in-session* transition to a real target profile (an
 * ordinary switch, or an active-profile relink), derived from
 * `workspaceTransitions.state` below rather than duplicating its lifecycle.
 * `null` whenever there is nothing to recover from, or the failure has no
 * real target (the active-profile-forget transition targets "no workspace",
 * spec 15.2; that failure path is handled by `WorkspaceForgetUnsavedWorkError`
 * and its own confirmation UI, not this banner, see `forgetWorkspaceProfile`).
 * `actions` names which of `retry`/`discard`/`relink`/`openAnother`/`forget`
 * apply for this failure's kind (`classifyTransitionErrorKind`); only those
 * are ever set, so a consumer can render exactly the buttons `actions`
 * lists without runtime `undefined` checks scattered through its JSX. */
export interface WorkspaceTransitionRecoveryInfo {
  targetProfileId: string;
  targetProfileName: string;
  kind: WorkspaceTransitionErrorKind;
  message: string;
  actions: WorkspaceTransitionRecoveryAction[];
  /** Each of these returns its own operation's real promise, unwrapped,
   * rather than a fire-and-forget `void`, so a UI consumer can show real
   * busy state and its own catch block for the exact button clicked,
   * instead of only ever reacting to whatever this effect recomputes next. */
  retry: () => Promise<unknown>;
  discard?: () => Promise<unknown>;
  relink?: () => Promise<unknown>;
  openAnother?: () => Promise<unknown>;
  forget?: () => Promise<unknown>;
}

export const workspaceTransitionRecovery = signal<WorkspaceTransitionRecoveryInfo | null>(null);

effect(() => {
  const transition = workspaceTransitions.state.value;
  if (transition.status !== "error" || transition.targetProfileId === null) {
    workspaceTransitionRecovery.value = null;
    return;
  }
  const targetProfileId = transition.targetProfileId;
  const profile = workspaceProfiles.value.find((p) => p.id === targetProfileId);
  if (!profile) {
    workspaceTransitionRecovery.value = null;
    return;
  }
  const kind = classifyTransitionErrorKind(transition.phase, isNativePlatform());
  const actions = recoveryActionsFor(kind);
  const has = (id: WorkspaceTransitionRecoveryAction["id"]) => actions.some((action) => action.id === id);
  workspaceTransitionRecovery.value = {
    targetProfileId,
    targetProfileName: profile.name,
    kind,
    message: transition.message,
    actions,
    retry: () => activateWorkspaceProfile(targetProfileId),
    discard: has("discard")
      ? () => setWorkspacePath(profile.path, profile.token, profile, { discardUnsaved: true })
      : undefined,
    relink: has("relink") || has("grant-access") ? () => relinkWorkspaceProfile(targetProfileId) : undefined,
    openAnother: has("open-another") ? () => addWorkspaceFromPicker() : undefined,
    forget: has("forget") ? () => forgetWorkspaceProfile(targetProfileId) : undefined,
  };
});

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
    const restoredActivePath = lastActivePath && restoredPaths.has(lastActivePath)
      ? lastActivePath
      : (openTabs.value.at(-1)?.path ?? null);
    if (restoredActivePath) focusTab(restoredActivePath);
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

// Global-config writes can overlap workspace transitions and profile edits.
// Each queued write reads the canonical signals only when its turn begins.
// Failure compensation runs inside that serialized turn before a later write
// can sample state, so a failed optimistic edit cannot leak back to disk via a
// different edit that happened while the first write was still in flight.
let globalConfigWriteTail: Promise<void> = Promise.resolve();
type GlobalConfigWriteFailureHandler = (error: unknown) => void;

function readCurrentGlobalConfig(): GlobalConfigV2 {
  const active = activeWorkspaceId.value
    ? workspaceProfiles.value.find((p) => p.id === activeWorkspaceId.value)
    : undefined;
  return {
    version: 2,
    theme: theme.value,
    activeWorkspaceId: activeWorkspaceId.value,
    workspaceProfiles: workspaceProfiles.value,
    lastWorkspacePath: active?.path ?? null,
    workspaceToken: active?.token,
  };
}

function saveGlobalConfigOrdered(
  readConfig: () => GlobalConfigV2,
  onFailure?: GlobalConfigWriteFailureHandler,
): Promise<void> {
  const write = globalConfigWriteTail.then(async () => {
    try {
      await saveGlobalConfig(readConfig());
    } catch (error) {
      onFailure?.(error);
      throw error;
    }
  });
  globalConfigWriteTail = write.catch(() => {});
  return write;
}

/** F20 Phase 1, spec section 18.4: "a write operation receives or reads
 * the latest canonical in-memory document immediately before
 * serialization." Every global-config write in this module goes through
 * this one function so theme changes, recency changes, and profile
 * catalog edits always serialize the current signal values together,
 * never a stale shape reconstructed piecemeal at each call site. The
 * compatibility mirror (section 19.3) is derived from whichever profile
 * `activeWorkspaceId` currently resolves to, not tracked as separate
 * signal state that could drift from it. `onFailure`, when supplied by an
 * optimistic profile edit, runs before the next queued write reads state. */
function persistGlobalConfig(onFailure?: GlobalConfigWriteFailureHandler): Promise<void> {
  if (globalConfigCorrupted.value) return Promise.resolve();
  return saveGlobalConfigOrdered(readCurrentGlobalConfig, onFailure);
}

/** Explicit recovery for a malformed app-level config.json. The current
 * decoded state is only written when the user invokes this action; ordinary
 * theme and profile changes remain in memory while the corrupt flag is set. */
export async function repairGlobalConfigFile(): Promise<void> {
  if (!globalConfigCorrupted.value) return;
  await saveGlobalConfigOrdered(readCurrentGlobalConfig);
  globalConfigCorrupted.value = false;
}

/** Marks `profile` as just-opened (section 7.5's `lastOpenedAt`) and makes
 * it the catalog's active profile, re-sorting so the switcher's own
 * ordering stays current. Does not itself persist. Every caller either
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
  const { config: global, corrupt: globalCorrupt } = await loadGlobalConfig();
  globalConfigCorrupted.value = globalCorrupt;
  theme.value = global.theme;
  workspaceProfiles.value = sortWorkspaceProfiles(global.workspaceProfiles);
  activeWorkspaceId.value = global.activeWorkspaceId;
  const activeProfile = global.activeWorkspaceId
    ? global.workspaceProfiles.find((p) => p.id === global.activeWorkspaceId)
    : undefined;
  if (activeProfile) {
    try {
      await restoreWorkspaceAccess(activeProfile.path, activeProfile.token);
      // Skip the listDir probe. If the path is invalid, the first real
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
      // Do NOT restoreLastOpenTabs() here. Only the active tab loads.
      // Other tabs load lazily when the user switches to them via
      // the tab bar's open handler.
      await persistGlobalConfig();
    } catch {
      // Section 17.2: retain the profile and its locator in the catalog;
      // do not overwrite global configuration merely because access
      // failed, and do not null out activeWorkspaceId. It stays the
      // user's last intended profile. workspacePath itself does become
      // null (no workspace is actually open), which falls back to the
      // ordinary WelcomeDialog rather than a dedicated recovery launcher
      // (deferred, see ROADMAP.md's F20 Phase 2b entry).
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
 * transition activates, either an existing profile
 * (`activateWorkspaceProfile`) or a not-yet-committed candidate
 * (`addWorkspaceFromPicker`, per spec section 11 step 8: "only after
 * successful activation is the candidate committed"). Only on success is
 * it marked opened (`lastOpenedAt`, `activeWorkspaceId`) and the full
 * catalog persisted; a failed transition leaves the catalog completely
 * untouched, matching section 16.4's "B remains in the catalog; B's
 * recency is unchanged." This function itself is no longer called
 * directly by any UI surface (spec section 20); it remains exported for
 * existing tests exercising the transition mechanics itself, and for the
 * two profile actions below, which are the only real callers now.
 *
 * F20 Phase 2b-iii-b, spec section 16.4: "A remains or becomes authoritative
 * again" when B cannot be opened. Before this phase, `publishFailure` reset
 * `workspacePath`/`workspaceToken` to `null`/`undefined` unconditionally,
 * even when there was a real outgoing workspace A whose access had just been
 * reconnected two steps earlier in `prepareOutgoing` below, silently
 * bouncing the user out to the "no workspace" welcome screen (losing their
 * open tabs) on any in-session switch failure instead of leaving them on A.
 * `outgoingPath`/`outgoingToken` are still captured before anything runs, so
 * restoring them on failure needs no new state; `workspaceSettings` itself
 * was never touched either, since `publishIncoming` never ran. What the
 * transition's own reset sweep (the `for (const reset of resets) reset()`
 * loop inside `workspaceTransitions.run`, always run before B's access is
 * even attempted) already cleared does need explicit repopulating, since
 * nothing here changes `workspacePath`'s *value* enough to retrigger a
 * `[rootPath]`-keyed effect: `FileTree.tsx`'s mount effect additionally
 * depends on `workspaceSession` for exactly this reason (see its own
 * comment), so bumping the session below is what makes the file tree
 * reload; tabs are restored explicitly via `restoreLastOpenTabs` since nothing
 * else does. A workspace with no prior A (startup, the only case
 * `WelcomeDialog`'s own recovery, F20 Phase 2b-iii-a, needs to handle)
 * keeps exactly its previous null/defaulted behavior.
 *
 * F20 Phase 2b-iii-b follow-up, spec section 16.3 steps 3/4/6 and 16.6:
 * `prepareOutgoing` below drains outgoing saves via
 * `workspaceSaves.prepareForTransition`, which now actually flushes (writes)
 * a pending debounced save and waits for an in-flight one, then throws if
 * anything genuinely failed to reach disk, rather than silently cancelling
 * pending work the way it used to (see that function's own doc comment in
 * `saveCoordinator.ts`). A thrown save failure lands in `workspaceTransitions`
 * as an ordinary `phase: "save"` / `save_failed` error, same as any other
 * `prepareOutgoing` failure, surfaced through the same in-session recovery
 * banner. `options.discardUnsaved` (spec 16.6's explicitly-confirmed "Switch
 * without saving") skips the flush-and-check entirely, reverting to a plain
 * cancel-and-wait so the transition can never be blocked by unsaved work the
 * user has deliberately chosen to lose.
 */
export async function setWorkspacePath(
  path: string,
  token?: string,
  profile?: WorkspaceProfile,
  options?: { discardUnsaved?: boolean },
): Promise<void> {
  settingsLoaded.value = true;
  workspaceSelectionError.value = null;
  const outgoingPath = workspacePath.value;
  const outgoingToken = workspaceToken.value;
  const outgoingSession = workspaceSession.value;
  const targetProfileId = profile?.id ?? null;
  const discard = options?.discardUnsaved ?? false;

  // Section 16.4/17.2: a failed activation changes nothing about the
  // catalog (no profile is marked opened, nothing below touches
  // `workspaceProfiles`/`activeWorkspaceId`), so there is nothing to
  // persist on failure. Persisting then would only risk overwriting a
  // concurrent, unrelated in-flight write with stale state, not recover
  // anything. `workspaceTransitions.run` itself rejects past this point,
  // so callers see the failure without a local catch here.
  await workspaceTransitions.run(
    {
      prepareOutgoing: async () => {
        // pickWorkspaceFolder() currently activates its picked SAF token before
        // returning. Rebind the old grant immediately so pending old-session
        // work cannot resolve against the newly picked tree while it drains.
        if (outgoingPath) await restoreWorkspaceAccess(outgoingPath, outgoingToken);
        await Promise.all([
          workspaceSaves.prepareForTransition(outgoingSession, { discard }),
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
      publishFailure: (error, _phase, isCurrent) => {
        const message =
          error instanceof Error && error.message
            ? `Could not open that workspace: ${error.message}`
            : "Could not open that workspace. Choose the folder again or select another folder.";
        if (outgoingPath) {
          batch(() => {
            workspacePath.value = outgoingPath;
            workspaceToken.value = outgoingToken;
            workspaceSession.value++;
            workspaceSelectionError.value = message;
          });
          void (async () => {
            await restoreLastOpenTabs(isCurrent);
          })();
          return;
        }
        lastPersistedTabsKey = JSON.stringify([[], null]);
        closeAllTabs();
        batch(() => {
          workspaceSettings.value = DEFAULT_WORKSPACE_SETTINGS;
          workspaceSettingsCorrupted.value = false;
          viewMode.value = DEFAULT_WORKSPACE_SETTINGS.defaultViewMode;
          workspacePath.value = null;
          workspaceToken.value = undefined;
          workspaceSession.value++;
          workspaceSelectionError.value = message;
        });
      },
      afterPublish: async (isCurrent) => {
        if (profile) markProfileOpened(profile);
        await persistGlobalConfig();
        if (!isCurrent()) return;
        await restoreLastOpenTabs(isCurrent);
      },
    },
    targetProfileId,
  );
}

export async function setTheme(next: ThemePreference): Promise<void> {
  theme.value = next;
  await persistGlobalConfig();
}

/** F20 Phase 1/2b-iii-a, spec section 20/10.4: activates a known catalog
 * profile. Selecting the already-active *and actually open* profile is a
 * genuine no-op (spec 10.4: "performs no filesystem work, does not
 * increment the workspace session, and does not alter recency"), checked
 * before touching anything. A stale switcher entry (an id no longer in the
 * catalog, e.g. a very fast double-forget) is likewise a silent no-op
 * rather than an error a caller must handle.
 *
 * Checking `workspacePath.value` too, not just the id match, matters for
 * section 17.2's retry: after a startup or switch failure,
 * `activeWorkspaceId` deliberately keeps pointing at the profile that
 * failed (it's still "the user's last intended profile"), but
 * `workspacePath` is null since nothing actually opened. Before this
 * check existed, re-selecting that same profile to retry silently did
 * nothing at all, since the id-only comparison already treated it as
 * "already active." */
export async function activateWorkspaceProfile(id: string): Promise<void> {
  if (id === activeWorkspaceId.value && workspacePath.value !== null) return;
  const profile = workspaceProfiles.value.find((p) => p.id === id);
  if (!profile) return;
  await setWorkspacePath(profile.path, profile.token, profile);
}

/** F20 Phase 1, spec section 11's add-workspace flow. Picker cancellation
 * (a `null` result) leaves all state unchanged, per step 9's own closing
 * note. A folder matching an already-known profile's locator (section
 * 12.2) activates that profile instead of creating a duplicate (step 5);
 * `lastOpenedAt: 0` on a brand-new candidate is a placeholder only.
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
 * persistence failure restores only this action's optimistic name if it
 * still owns that field. The compensation runs within the global write
 * queue before any later write reads the canonical profile catalog. */
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
  await persistGlobalConfig(() => {
    const latest = workspaceProfiles.value.find((profile) => profile.id === id);
    if (latest?.name !== name) return;
    workspaceProfiles.value = sortWorkspaceProfiles([
      ...workspaceProfiles.value.filter((profile) => profile.id !== id),
      { ...latest, name: current.name },
    ]);
  });
  return true;
}

/** F20 Phase 2a: choose only one of the bundled icon IDs. Unknown icon
 * strings may still round-trip from future config versions, but cannot be
 * newly persisted through this UI action. Recency and activation are untouched.
 * A failed persistence restores only this action's optimistic icon when
 * that value is still current, before any later queued write reads state. */
export async function setWorkspaceProfileIcon(id: string, icon: WorkspaceIcon): Promise<boolean> {
  if (!isKnownWorkspaceIcon(icon)) return false;
  const index = workspaceProfiles.value.findIndex((profile) => profile.id === id);
  if (index < 0) return false;
  const current = workspaceProfiles.value[index];
  if (current.icon === icon) return true;
  const next = [...workspaceProfiles.value];
  next[index] = { ...current, icon };
  workspaceProfiles.value = sortWorkspaceProfiles(next);
  await persistGlobalConfig(() => {
    const latest = workspaceProfiles.value.find((profile) => profile.id === id);
    if (latest?.icon !== icon) return;
    workspaceProfiles.value = sortWorkspaceProfiles([
      ...workspaceProfiles.value.filter((profile) => profile.id !== id),
      { ...latest, icon: current.icon },
    ]);
  });
  return true;
}

/** F20 Phase 2b-ii, spec section 15.2: thrown when forgetting the active
 * profile is aborted because there is note content that has not actually
 * reached disk yet (pending, in flight, or failed; see
 * `saveCoordinator.ts`'s `hasUnsavedWork`). The abort is the default
 * behavior, not a special case; a caller that wants the destructive
 * override re-calls with `{ discardUnsaved: true }` after its own explicit
 * second confirmation (spec: "must not be the primary action"). */
export class WorkspaceForgetUnsavedWorkError extends Error {
  constructor() {
    super("This workspace has changes that have not been saved yet.");
    this.name = "WorkspaceForgetUnsavedWorkError";
  }
}

/** F20 Phase 1/2a/2b-ii, spec section 7.7/15: removes a catalog entry,
 * never the folder, its notes, `.leotheca/settings.json`, or platform
 * permission state (section 15.3).
 *
 * Forgetting a *non-active* profile (section 15.1) is unchanged from
 * Phase 1/2a: a plain catalog edit, no transition, `options` ignored. A
 * failed config write restores the removed catalog entry before the next
 * queued global-config write can observe state.
 *
 * Forgetting the *active* profile (section 15.2) is a real transition to
 * the no-workspace state, not just a catalog edit, since a workspace is
 * actually open: it must flush/drain outgoing work the same way any other
 * transition does, then clear workspace-scoped UI state, before the
 * profile can be safely removed. Unlike an ordinary switch, this one must
 * not silently lose unsaved note content along the way (section 15.2's
 * "aborted by default" requirement, `saveCoordinator.ts`'s own tests show
 * `prepareForTransition` doesn't report that loss on its own), so
 * `workspaceSaves.hasUnsavedWork` is checked *before* starting the
 * transition; a caller that wants to proceed anyway passes
 * `{ discardUnsaved: true }` (the spec's secondary, non-primary "forget
 * without saving" action). `connectIncoming`/`loadIncoming` are no-ops
 * here since there is no incoming workspace to activate, only an outgoing
 * one to leave; `publishIncoming` both clears workspace state and removes
 * the profile from the catalog together, so a reader can never observe a
 * moment where the active id still names a profile no longer in the
 * catalog, or vice versa. */
export async function forgetWorkspaceProfile(
  id: string,
  options?: { discardUnsaved?: boolean },
): Promise<void> {
  if (id !== activeWorkspaceId.value) {
    const removed = workspaceProfiles.value.find((profile) => profile.id === id);
    if (!removed) return;
    workspaceProfiles.value = workspaceProfiles.value.filter((profile) => profile.id !== id);
    await persistGlobalConfig(() => {
      if (workspaceProfiles.value.some((profile) => profile.id === id)) return;
      workspaceProfiles.value = sortWorkspaceProfiles([...workspaceProfiles.value, removed]);
    });
    return;
  }

  if (!options?.discardUnsaved && workspaceSaves.hasUnsavedWork(workspaceSession.value)) {
    throw new WorkspaceForgetUnsavedWorkError();
  }

  await workspaceTransitions.run({
    prepareOutgoing: async () => {
      const outgoingSession = workspaceSession.value;
      await Promise.all([
        workspaceSaves.prepareForTransition(outgoingSession),
        drainWorkspaceSettingsWrites(),
      ]);
      await drainWorkspaceOperations();
      lastPersistedTabsKey = JSON.stringify([[], null]);
      closeAllTabs();
    },
    connectIncoming: async () => {},
    loadIncoming: async () => undefined,
    publishIncoming: () => {
      batch(() => {
        workspaceSettings.value = DEFAULT_WORKSPACE_SETTINGS;
        workspaceSettingsCorrupted.value = false;
        viewMode.value = DEFAULT_WORKSPACE_SETTINGS.defaultViewMode;
        workspacePath.value = null;
        workspaceToken.value = undefined;
        workspaceSession.value++;
        activeWorkspaceId.value = null;
        workspaceProfiles.value = workspaceProfiles.value.filter((profile) => profile.id !== id);
      });
    },
    afterPublish: async () => {
      await persistGlobalConfig();
    },
  });
}

/** F20 Phase 2b-i, spec section 14: thrown when the folder picked for a
 * relink already belongs to a different known profile. Carries the other
 * profile's display name so the caller can state, per the spec's own
 * confirmation requirement, exactly which profile the rejected folder
 * belongs to instead of a generic failure message. */
export class WorkspaceRelinkConflictError extends Error {
  constructor(public readonly conflictingProfileName: string) {
    super(`This folder is already used by workspace "${conflictingProfileName}".`);
    this.name = "WorkspaceRelinkConflictError";
  }
}

/** F20 Phase 2b-i, spec section 14: relinks an existing profile, active or
 * not, to a newly picked folder, preserving its id/name/icon/recency (only
 * `path`/`token` change). Returns `false` when the picker is cancelled or
 * the profile no longer exists (e.g. forgotten while the picker was open);
 * neither case changes anything (step 7). Throws
 * `WorkspaceRelinkConflictError` when the picked folder already belongs to
 * a different known profile (step 3), before anything is validated or
 * committed.
 *
 * Relinking the *active* profile routes through the ordinary
 * `setWorkspacePath` transition (step 6), so it gets the same
 * connect/load validation, save-draining, and generation-invalidation
 * guarantees as any other activation; a failed activation reports through
 * the existing `workspaceSelectionError` signal, the same as any other
 * transition failure, and leaves the profile's old locator untouched
 * (nothing here mutates the catalog until `setWorkspacePath`'s own
 * `afterPublish` succeeds).
 *
 * Relinking an *inactive* profile does not open it, matching the spec's
 * own distinction (step 6 names only the active case as needing the full
 * transition protocol): it must validate the candidate folder (step 4)
 * without disturbing whichever workspace is actually live. On Desktop
 * that's straightforward, `listDir`/`loadWorkspaceSettings` take the real
 * absolute path directly and never touch `restoreWorkspaceAccess` or the
 * active grant. On Android, every profile shares one synthetic
 * `/workspace` root and one in-memory URI cache (section 12.3); there is
 * no bridge primitive today to address a second, not-currently-open SAF
 * tree without repointing that shared cache, which would risk a
 * concurrent read or autosave against the workspace that's actually open
 * resolving into this candidate folder instead. Rather than accept that
 * risk, an inactive Android profile's relink target is committed on the
 * same trust level `addWorkspaceFromPicker` already gives a freshly
 * picked folder before it's ever opened (the platform picker returning a
 * grant is itself the only validation); real access/settings validation
 * then happens the ordinary way the next time this profile is activated,
 * the same as any other catalog profile. This is a disclosed, genuine
 * platform gap, not an oversight, left open under F20 Phase 2b-iv, which
 * will need a real per-tree probe primitive to close it.
 */
export async function relinkWorkspaceProfile(id: string): Promise<boolean> {
  if (!workspaceProfiles.value.some((profile) => profile.id === id)) return false;
  const folder = await pickWorkspaceFolder();
  if (!folder) return false;

  const conflict = findProfileByLocator(workspaceProfiles.value, folder.path, folder.token);
  if (conflict && conflict.id !== id) {
    throw new WorkspaceRelinkConflictError(conflict.name);
  }

  const current = workspaceProfiles.value.find((profile) => profile.id === id);
  if (!current) return false;

  if (id === activeWorkspaceId.value) {
    await setWorkspacePath(folder.path, folder.token, {
      ...current,
      path: folder.path,
      token: folder.token,
    });
    return true;
  }

  if (!isNativePlatform()) {
    // Real validation: listDir rejects an inaccessible/nonexistent folder.
    // loadWorkspaceSettings never throws for a missing settings.json (an
    // empty, never-before-opened folder is still a valid workspace), so it
    // alone would not prove the folder is actually reachable.
    await listDir(folder.path);
    await loadWorkspaceSettings(folder.path);
  }

  const relinked: WorkspaceProfile = { ...current, path: folder.path, token: folder.token };
  workspaceProfiles.value = sortWorkspaceProfiles([
    ...workspaceProfiles.value.filter((profile) => profile.id !== id),
    relinked,
  ]);
  await persistGlobalConfig(() => {
    const latest = workspaceProfiles.value.find((profile) => profile.id === id);
    if (latest?.path !== relinked.path || latest.token !== relinked.token) return;
    workspaceProfiles.value = sortWorkspaceProfiles([
      ...workspaceProfiles.value.filter((profile) => profile.id !== id),
      { ...latest, path: current.path, token: current.token },
    ]);
  });
  return true;
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
  workspaceSettingsSaving.value = false;
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
  workspaceSettingsSaving.value = true;
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
