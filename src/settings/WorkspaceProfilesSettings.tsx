import { WORKSPACE_ICONS, type WorkspaceIcon } from "./globalConfig";
import {
  activeWorkspaceId,
  addWorkspaceFromPicker,
  forgetWorkspaceProfile,
  relinkWorkspaceProfile,
  renameWorkspaceProfile,
  setWorkspaceProfileIcon,
  WorkspaceRelinkConflictError,
  workspaceProfiles,
} from "./store";
import { displayWorkspaceIcon } from "./workspaceProfiles";
import { workspaceIconGlyph } from "./WorkspaceSwitcher";

function reportProfileWriteFailure(action: string): void {
  window.alert(`Could not ${action} workspace profile. Try again.`);
}

function reportWorkspaceActionFailure(action: string): void {
  window.alert(`Could not ${action} workspace. Try again.`);
}

/** F20 Phase 2a/2b-i settings management surface. Active-profile forget,
 * the typed transition-state/error UI, and the startup recovery launcher
 * deliberately stay out of this component because they belong to the
 * remaining F20 Phase 2b-ii/2b-iii work (see ROADMAP.md). */
export function WorkspaceProfilesSettings() {
  const rename = async (id: string, currentName: string) => {
    const next = window.prompt("Workspace profile name", currentName);
    if (next === null) return;
    try {
      const accepted = await renameWorkspaceProfile(id, next);
      if (!accepted) window.alert("Use a name from 1 to 80 characters with no line breaks.");
    } catch {
      reportProfileWriteFailure("rename");
    }
  };

  const setIcon = async (id: string, icon: WorkspaceIcon) => {
    try {
      await setWorkspaceProfileIcon(id, icon);
    } catch {
      reportProfileWriteFailure("update");
    }
  };

  const forget = async (id: string) => {
    try {
      await forgetWorkspaceProfile(id);
    } catch {
      reportProfileWriteFailure("forget");
    }
  };

  const relink = async (id: string) => {
    try {
      await relinkWorkspaceProfile(id);
    } catch (error) {
      if (error instanceof WorkspaceRelinkConflictError) {
        window.alert(error.message);
        return;
      }
      reportWorkspaceActionFailure("relink");
    }
  };

  const add = async () => {
    try {
      await addWorkspaceFromPicker();
    } catch {
      reportWorkspaceActionFailure("add");
    }
  };

  return (
    <section class="settings-section" aria-labelledby="workspace-profiles-heading">
      <h3 id="workspace-profiles-heading">Workspace profiles</h3>
      <p class="settings-hint">Rename and identify known workspaces. Forgetting a profile never deletes its files.</p>
      {workspaceProfiles.value.map((profile) => {
        const isActive = profile.id === activeWorkspaceId.value;
        return (
          <div class="settings-row" key={profile.id}>
            <span aria-hidden="true">{workspaceIconGlyph(profile.icon)}</span>
            <div>
              <div class="settings-label">{profile.name}{isActive ? " (current)" : ""}</div>
              {!profile.token && <div class="settings-hint">{profile.path}</div>}
            </div>
            <button type="button" onClick={() => void rename(profile.id, profile.name)}>Rename</button>
            <button type="button" onClick={() => void relink(profile.id)}>Relink</button>
            <label>
              <span class="sr-only">Icon for {profile.name}</span>
              <select
                aria-label={`Icon for ${profile.name}`}
                value={displayWorkspaceIcon(profile.icon)}
                onChange={(event) => void setIcon(profile.id, event.currentTarget.value as WorkspaceIcon)}
              >
                {WORKSPACE_ICONS.map((icon) => <option key={icon} value={icon}>{icon}</option>)}
              </select>
            </label>
            {!isActive && (
              <button type="button" onClick={() => void forget(profile.id)}>Forget</button>
            )}
          </div>
        );
      })}
      <button type="button" onClick={() => void add()}>Add workspace</button>
    </section>
  );
}
