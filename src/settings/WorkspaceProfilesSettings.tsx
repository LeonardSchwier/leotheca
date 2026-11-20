import { WORKSPACE_ICONS, type WorkspaceIcon } from "./globalConfig";
import {
  activeWorkspaceId,
  addWorkspaceFromPicker,
  relinkWorkspaceProfile,
  renameWorkspaceProfile,
  setWorkspaceProfileIcon,
  WorkspaceRelinkConflictError,
  workspaceProfiles,
} from "./store";
import { displayWorkspaceIcon } from "./workspaceProfiles";
import { t, type MessageKey } from "../i18n";
import {
  forgetWithUnsavedWorkConfirmation,
  workspaceIconGlyph,
} from "./WorkspaceSwitcher";

/** One whole sentence per failed action, so a translation never has to
 * build a sentence around an English verb. */
function reportFailure(message: MessageKey): void {
  window.alert(t(message));
}

/** F20 Phase 2a/2b-i/2b-ii settings management surface. The typed
 * transition-state/error UI and the startup recovery launcher deliberately
 * stay out of this component because they belong to the remaining F20
 * Phase 2b-iii work (see ROADMAP.md). */
export function WorkspaceProfilesSettings() {
  const rename = async (id: string, currentName: string) => {
    const next = window.prompt(t("profiles.namePrompt"), currentName);
    if (next === null) return;
    try {
      const accepted = await renameWorkspaceProfile(id, next);
      if (!accepted) window.alert(t("profiles.invalidName"));
    } catch {
      reportFailure("profiles.renameFailed");
    }
  };

  const setIcon = async (id: string, icon: WorkspaceIcon) => {
    try {
      await setWorkspaceProfileIcon(id, icon);
    } catch {
      reportFailure("profiles.updateFailed");
    }
  };

  const relink = async (id: string) => {
    try {
      await relinkWorkspaceProfile(id);
    } catch (error) {
      if (error instanceof WorkspaceRelinkConflictError) {
        window.alert(
          t("welcome.relinkConflict", { name: error.conflictingProfileName }),
        );
        return;
      }
      reportFailure("profiles.relinkFailed");
    }
  };

  const add = async () => {
    try {
      await addWorkspaceFromPicker();
    } catch {
      reportFailure("profiles.addFailed");
    }
  };

  return (
    <section
      class="settings-section"
      aria-labelledby="workspace-profiles-heading"
    >
      <h3 id="workspace-profiles-heading">{t("profiles.title")}</h3>
      <p class="settings-hint">{t("profiles.hint")}</p>
      {workspaceProfiles.value.map((profile) => {
        const isActive = profile.id === activeWorkspaceId.value;
        return (
          <div class="settings-row" key={profile.id}>
            <span aria-hidden="true">{workspaceIconGlyph(profile.icon)}</span>
            <div>
              <div class="settings-label">
                {isActive
                  ? t("profiles.current", { name: profile.name })
                  : profile.name}
              </div>
              {!profile.token && (
                <div class="settings-hint">{profile.path}</div>
              )}
            </div>
            <button
              type="button"
              onClick={() => void rename(profile.id, profile.name)}
            >
              {t("profiles.rename")}
            </button>
            <button type="button" onClick={() => void relink(profile.id)}>
              {t("profiles.relink")}
            </button>
            <label>
              <span class="sr-only">
                {t("profiles.iconFor", { name: profile.name })}
              </span>
              <select
                aria-label={t("profiles.iconFor", { name: profile.name })}
                value={displayWorkspaceIcon(profile.icon)}
                onChange={(event) =>
                  void setIcon(
                    profile.id,
                    event.currentTarget.value as WorkspaceIcon,
                  )
                }
              >
                {WORKSPACE_ICONS.map((icon) => (
                  <option key={icon} value={icon}>
                    {icon}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => void forgetWithUnsavedWorkConfirmation(profile.id)}
            >
              {t("profiles.forget")}
            </button>
          </div>
        );
      })}
      <button type="button" onClick={() => void add()}>
        {t("profiles.add")}
      </button>
    </section>
  );
}
