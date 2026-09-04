import { useState } from "preact/hooks";
import {
  activateWorkspaceProfile,
  activeWorkspaceId,
  addWorkspaceFromPicker,
  relinkWorkspaceProfile,
  workspaceProfiles,
  workspaceSelectionError,
  WorkspaceRelinkConflictError,
} from "./store";
import { workspaceIconGlyph } from "./WorkspaceSwitcher";

function reportRelinkFailure(error: unknown): void {
  if (error instanceof WorkspaceRelinkConflictError) {
    window.alert(error.message);
    return;
  }
  window.alert("Could not relink workspace. Try again.");
}

/** F20 Phase 2b-iii-a, spec sections 9.4/17.2/17.3: the app's only "no
 * workspace is open" surface, shown whenever `App.tsx`'s `rootPath` is
 * empty. Three distinct cases, matched to the spec's own three startup
 * scenarios rather than one generic "choose a folder" message for all of
 * them:
 *
 * - No profiles exist at all (9.4): the plain first-run experience,
 *   unchanged from before this phase.
 * - `activeWorkspaceId` names a real catalog profile (17.2): that profile
 *   failed to open (this dialog wouldn't be showing otherwise), so name it
 *   and offer Retry and Relink directly, not just a bare error string.
 * - Profiles exist but none is recognized as active (17.3, e.g. every
 *   profile was forgotten while none was open, or a corrupt/legacy config
 *   named an unknown id): list them for one-click activation instead of
 *   requiring a detour through the header switcher.
 *
 * Retry reuses `activateWorkspaceProfile` itself: its own no-op guard
 * checks not just `activeWorkspaceId` but also that a workspace is
 * actually open, specifically so re-selecting the same failed profile
 * here retries instead of silently doing nothing (see that function's own
 * doc comment). Relink reuses the same `relinkWorkspaceProfile` Settings'
 * per-profile Relink button already calls; a successful relink of the
 * active profile activates it through the ordinary transition, which
 * closes this dialog itself once `workspacePath` becomes non-null.
 */
export function WelcomeDialog() {
  const [loading, setLoading] = useState(false);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [relinking, setRelinking] = useState(false);

  const profiles = workspaceProfiles.value;
  const activeProfile = profiles.find((p) => p.id === activeWorkspaceId.value);
  const otherProfiles = profiles.filter((p) => p.id !== activeWorkspaceId.value);

  const handleChoose = async () => {
    setLoading(true);
    workspaceSelectionError.value = null;
    try {
      await addWorkspaceFromPicker();
    } catch {
      // setWorkspacePath publishes the actionable, non-sensitive error and
      // leaves no active workspace. The dialog stays open for a retry.
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = async (id: string) => {
    setActivatingId(id);
    workspaceSelectionError.value = null;
    try {
      await activateWorkspaceProfile(id);
    } catch {
      // Same as handleChoose: the store already publishes the error.
    } finally {
      setActivatingId(null);
    }
  };

  const handleRelink = async (id: string) => {
    setRelinking(true);
    try {
      await relinkWorkspaceProfile(id);
    } catch (error) {
      reportRelinkFailure(error);
    } finally {
      setRelinking(false);
    }
  };

  if (profiles.length === 0) {
    return (
      <div class="modal-overlay">
        <div class="modal welcome-dialog">
          <h2>Welcome to Leotheca</h2>
          <p>Choose a folder on disk to use as your root workspace. You can change it later from Settings.</p>
          {workspaceSelectionError.value && (
            <p role="alert" class="settings-error">{workspaceSelectionError.value}</p>
          )}
          <button onClick={handleChoose} disabled={loading}>
            {loading ? "Opening folder picker…" : "Choose Folder"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div class="modal-overlay">
      <div class="modal welcome-dialog workspace-launcher">
        {activeProfile ? (
          <>
            <h2>Couldn't open "{activeProfile.name}"</h2>
            <p>This workspace's folder may have moved, or access may have been revoked.</p>
            {workspaceSelectionError.value && (
              <p role="alert" class="settings-error">{workspaceSelectionError.value}</p>
            )}
            <div class="workspace-launcher-actions">
              <button onClick={() => void handleActivate(activeProfile.id)} disabled={activatingId === activeProfile.id}>
                {activatingId === activeProfile.id ? "Retrying…" : "Retry"}
              </button>
              <button onClick={() => void handleRelink(activeProfile.id)} disabled={relinking}>
                {relinking ? "Relinking…" : "Relink folder"}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2>Open a workspace</h2>
            {workspaceSelectionError.value && (
              <p role="alert" class="settings-error">{workspaceSelectionError.value}</p>
            )}
          </>
        )}
        {otherProfiles.length > 0 && (
          <>
            <p class="workspace-launcher-label">{activeProfile ? "Or open a different workspace" : "Recent workspaces"}</p>
            <div class="workspace-launcher-list" role="list" aria-label="Recent workspaces">
              {otherProfiles.map((profile) => (
                <div class="workspace-switcher-row" role="listitem" key={profile.id}>
                  <button
                    class="workspace-switcher-row-button"
                    onClick={() => void handleActivate(profile.id)}
                    disabled={activatingId === profile.id}
                  >
                    <span class="workspace-switcher-icon" aria-hidden="true">{workspaceIconGlyph(profile.icon)}</span>
                    <span class="workspace-switcher-row-name">{profile.name}</span>
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
        <button onClick={handleChoose} disabled={loading}>
          {loading ? "Opening folder picker…" : "Add workspace"}
        </button>
      </div>
    </div>
  );
}
