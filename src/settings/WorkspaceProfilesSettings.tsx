import { WORKSPACE_ICONS, type WorkspaceIcon } from "./globalConfig";
import {
  activeWorkspaceId,
  addWorkspaceFromPicker,
  forgetWorkspaceProfile,
  renameWorkspaceProfile,
  setWorkspaceProfileIcon,
  workspaceProfiles,
} from "./store";
import { displayWorkspaceIcon } from "./workspaceProfiles";
import { workspaceIconGlyph } from "./WorkspaceSwitcher";

function reportProfileWriteFailure(action: string): void {
  window.alert(`Could not ${action} workspace profile. Try again.`);
}

/** F20 Phase 2a settings management surface. Relink and active-profile forget
 * deliberately stay out of this component because they belong to Phase 2b. */
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
              <button type="button" onClick={() => void forgetWorkspaceProfile(profile.id)}>Forget</button>
            )}
          </div>
        );
      })}
      <button type="button" onClick={() => void addWorkspaceFromPicker()}>Add workspace</button>
    </section>
  );
}
