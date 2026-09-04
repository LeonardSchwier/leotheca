import { useState } from "preact/hooks";
import { workspaceTransitionRecovery } from "./store";
import { workspaceTransitions } from "../workspace/workspaceTransition";
import type { WorkspaceTransitionRecoveryAction } from "../workspace/workspaceTransitionRecovery";

const ACTION_LABELS: Record<WorkspaceTransitionRecoveryAction["id"], string> = {
  retry: "Retry",
  discard: "Switch without saving",
  relink: "Relink folder",
  "grant-access": "Grant access again",
  "open-another": "Open another workspace",
  forget: "Forget this workspace",
};

/** F20 Phase 2b-iii-b, spec sections 16.4 and 23: an in-session (not
 * startup) failed-transition recovery banner. Startup failures stay
 * `WelcomeDialog`'s territory (F20 Phase 2b-iii-a); this banner exists
 * specifically because that surface is wrong for an in-session failure,
 * where the previously-active workspace is (as of this same phase's fix to
 * `setWorkspacePath`'s `publishFailure`) restored and still authoritative,
 * so the user should see their own notes, not a full-screen takeover. It
 * renders inline, near the top of the app shell, alongside the ordinary
 * editor rather than as a modal, matching the spec's "non-blocking" framing
 * even for the phases that aren't strictly `global_config_save_failed`.
 *
 * Every button here comes from `workspaceTransitionRecovery`'s own
 * `actions` list (see that signal's doc comment in `store.ts` for why each
 * kind only ever offers a subset), so this component only needs to map an
 * action id to its label and its already-bound closure, never re-derive
 * which ids are valid for which kind itself. `discard`'s destructive intent
 * (spec 16.6: "requires explicit confirmation... unsaved editor changes can
 * be lost") gets a `window.confirm` gate the other, non-destructive actions
 * don't need.
 */
export function WorkspaceTransitionBanner() {
  const [busy, setBusy] = useState<WorkspaceTransitionRecoveryAction["id"] | null>(null);
  const recovery = workspaceTransitionRecovery.value;
  if (!recovery) return null;

  const run = async (id: WorkspaceTransitionRecoveryAction["id"], action: () => Promise<unknown>) => {
    setBusy(id);
    try {
      await action();
    } catch {
      // The action's own store function already routes its failure back
      // into workspaceTransitions.state (a fresh error, possibly a
      // different kind) or workspaceSelectionError; nothing further to
      // report here.
    } finally {
      setBusy(null);
    }
  };

  const handleAction = (action: WorkspaceTransitionRecoveryAction) => {
    if (action.id === "discard") {
      if (!recovery.discard) return;
      if (!window.confirm("Unsaved changes in this workspace will be lost. Switch anyway?")) return;
      void run("discard", recovery.discard);
      return;
    }
    const handler =
      action.id === "retry"
        ? recovery.retry
        : action.id === "relink" || action.id === "grant-access"
          ? recovery.relink
          : action.id === "open-another"
            ? recovery.openAnother
            : recovery.forget;
    if (!handler) return;
    void run(action.id, handler);
  };

  return (
    <div class="workspace-transition-banner" role="alert">
      <p class="workspace-transition-banner-message">
        Couldn't switch to "{recovery.targetProfileName}": {recovery.message}
      </p>
      <div class="workspace-transition-banner-actions">
        {recovery.actions.map((action) => (
          <button
            key={action.id}
            class={action.id === "discard" ? "workspace-transition-banner-danger" : undefined}
            onClick={() => handleAction(action)}
            disabled={busy !== null}
          >
            {busy === action.id ? "Working…" : ACTION_LABELS[action.id]}
          </button>
        ))}
        <button
          class="workspace-transition-banner-dismiss"
          aria-label="Dismiss"
          onClick={() => {
            workspaceTransitions.state.value = { status: "idle" };
          }}
          disabled={busy !== null}
        >
          ×
        </button>
      </div>
    </div>
  );
}
