import type { WorkspaceTransitionPhase } from "./workspaceTransition";

/**
 * Spec `leotheca-workspace-profiles-sdd.md` section 23's typed error model,
 * narrowed to the kinds a live `workspaceTransitions.run()` failure can
 * actually produce. `settings_corrupt` is not one of them: a malformed
 * workspace settings file does not throw, `loadWorkspaceSettings` already
 * decodes it into safe defaults and flags `workspaceSettingsCorrupted` for
 * the existing repair UI (`SettingsPanel`'s "Rewrite settings file"), so it
 * never reaches this classifier. `global_config_corrupt` (the catalog file
 * itself failing to decode at startup, before any profile is even known)
 * and `transition_superseded` (an internal control-flow outcome the spec
 * itself says is "no user-facing error") are likewise out of scope for this
 * classifier, which only covers an in-session transition failure with a
 * real target and a real phase.
 */
export type WorkspaceTransitionErrorKind =
  | "save_failed"
  | "permission_missing"
  | "workspace_missing"
  | "global_config_save_failed"
  | "unknown";

/** Classifies a failed transition's `phase` into one of section 23's typed
 * error kinds. The "access" phase covers both `permission_missing`
 * (Android: a revoked SAF grant surfaces here, since `restoreWorkspaceAccess`
 * itself is a cheap in-memory cache reseed on Android, see
 * `capacitorBridgeImpl.ts`, and the real native permission check only
 * happens on the following `listDir` call) and `workspace_missing`
 * (Desktop: the folder itself no longer exists, same `listDir` call). The
 * two platforms cannot produce the other's failure mode: Desktop has no SAF
 * grant to revoke, and Android's synthetic `/workspace` root cannot itself
 * "not exist" the way a real Desktop path can. */
export function classifyTransitionErrorKind(
  phase: WorkspaceTransitionPhase,
  isAndroid: boolean,
): WorkspaceTransitionErrorKind {
  switch (phase) {
    case "save":
      return "save_failed";
    case "access":
      return isAndroid ? "permission_missing" : "workspace_missing";
    case "global-config":
      return "global_config_save_failed";
    case "settings":
      return "unknown";
  }
}

export interface WorkspaceTransitionRecoveryAction {
  id: "retry" | "relink" | "grant-access" | "open-another" | "forget";
  label: string;
}

/** Section 23's own per-kind action lists, minus `save_failed`'s "Switch
 * without saving" (spec 16.6): that action is only meaningfully distinct
 * from a bare retry once `prepareOutgoing` actually flushes pending work
 * before waiting on it (spec 16.3 step 3), rather than only cancelling a
 * pending debounce outright the way it does today, see `setWorkspacePath`'s
 * own disclosure comment in `store.ts`. Offering it now would be a second
 * button that does exactly the same thing as the first. "Grant access
 * again" and "Relink folder" both resolve to the existing
 * `relinkWorkspaceProfile` action in this app (there is no separate "just
 * re-grant the same folder" native primitive on either platform, see F20
 * Phase 2b-i), so both surface as the same `relink`/`grant-access` id with
 * kind-appropriate copy; the caller wires both to the same handler. */
export function recoveryActionsFor(kind: WorkspaceTransitionErrorKind): WorkspaceTransitionRecoveryAction[] {
  switch (kind) {
    case "save_failed":
      return [{ id: "retry", label: "Retry" }];
    case "permission_missing":
      return [
        { id: "grant-access", label: "Grant access again" },
        { id: "open-another", label: "Open another workspace" },
        { id: "forget", label: "Forget this workspace" },
      ];
    case "workspace_missing":
      return [
        { id: "retry", label: "Retry" },
        { id: "relink", label: "Relink folder" },
        { id: "open-another", label: "Open another workspace" },
        { id: "forget", label: "Forget this workspace" },
      ];
    case "global_config_save_failed":
    case "unknown":
      return [{ id: "retry", label: "Retry" }];
  }
}
