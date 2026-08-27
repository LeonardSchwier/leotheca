import { useState } from "preact/hooks";
import licenseText from "../../LICENSE?raw";
import {
  appVersion,
  settingsPanelOpen,
  setTheme,
  setWorkspacePath,
  theme,
  updateWorkspaceSettings,
  workspacePath,
  workspaceSettings,
} from "./store";
import type { ThemePreference } from "./globalConfig";
import {
  clamp,
  MAX_FONT_SIZE,
  MAX_UI_ZOOM,
  MIN_FONT_SIZE,
  MIN_UI_ZOOM,
  type DeleteBehavior,
  type ViewMode,
} from "./workspaceSettings";
import { getWorkspaceStats, pickWorkspaceFolder } from "../workspace/tauriBridge";
import { VaultStatsPanel } from "./VaultStatsPanel";
import { KEYBOARD_SHORTCUTS } from "../app/shortcuts";
import { rebuildLinkIndex } from "../linking/store";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "Follow System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const VIEW_MODE_OPTIONS: { value: ViewMode; label: string }[] = [
  { value: "source", label: "Source" },
  { value: "split", label: "Split" },
  { value: "preview", label: "Preview" },
];

const DELETE_BEHAVIOR_OPTIONS: { value: DeleteBehavior; label: string }[] = [
  { value: "project-trash", label: "Project Trash" },
  { value: "permanent", label: "Permanent" },
];

const FRONTMATTER_ALIASES_OPTIONS: { value: boolean; label: string }[] = [
  { value: true, label: "On" },
  { value: false, label: "Off" },
];

const MATH_RENDERING_OPTIONS: { value: boolean; label: string }[] = [
  { value: true, label: "On" },
  { value: false, label: "Off" },
];

const PASTE_IMAGES_OPTIONS: { value: boolean; label: string }[] = [
  { value: true, label: "On" },
  { value: false, label: "Off" },
];

const FRONTMATTER_PROPERTIES_OPTIONS: { value: boolean; label: string }[] = [
  { value: true, label: "On" },
  { value: false, label: "Off" },
];

export function SettingsPanel() {
  const [showLicense, setShowLicense] = useState(false);
  if (!settingsPanelOpen.value) return null;

  const handleChangeFolder = async () => {
    const folder = await pickWorkspaceFolder();
    if (folder) await setWorkspacePath(folder.path, folder.token);
  };

  return (
    <div class="modal-overlay" onClick={() => (settingsPanelOpen.value = false)}>
      <div class="modal settings-panel" onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h2>Settings</h2>
          <button class="modal-close" onClick={() => (settingsPanelOpen.value = false)}>
            x
          </button>
        </div>

        <section class="settings-section">
          <h3>General</h3>
          <div class="settings-row">
            <div>
              <div class="settings-label">Root folder</div>
              <div class="settings-value">{workspacePath.value ?? "Not set"}</div>
            </div>
            <button onClick={handleChangeFolder}>Change Folder</button>
          </div>

          {workspacePath.value && (
            <div class="settings-row">
              <div>
                <div class="settings-label">Delete behavior</div>
                <div class="settings-hint">Where deleted notes and folders go</div>
              </div>
              <div class="settings-switch">
                {DELETE_BEHAVIOR_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    class={workspaceSettings.value.deleteBehavior === option.value ? "active" : ""}
                    onClick={() => void updateWorkspaceSettings({ deleteBehavior: option.value })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {workspacePath.value && (
            <div class="settings-row">
              <div>
                <div class="settings-label">Frontmatter aliases</div>
                <div class="settings-hint">
                  Resolve [[wikilinks]], autocomplete, and backlinks by a note's aliases: frontmatter field too, not
                  just its file name
                </div>
              </div>
              <div class="settings-switch">
                {FRONTMATTER_ALIASES_OPTIONS.map((option) => (
                  <button
                    key={String(option.value)}
                    class={workspaceSettings.value.frontmatterAliasesEnabled === option.value ? "active" : ""}
                    onClick={() => {
                      void updateWorkspaceSettings({ frontmatterAliasesEnabled: option.value });
                      if (workspacePath.value) void rebuildLinkIndex(workspacePath.value, option.value);
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {workspacePath.value && (
            <div class="settings-row">
              <div>
                <div class="settings-label">Math rendering</div>
                <div class="settings-hint">Render $inline$ and $$block$$ LaTeX math in Preview, via KaTeX</div>
              </div>
              <div class="settings-switch">
                {MATH_RENDERING_OPTIONS.map((option) => (
                  <button
                    key={String(option.value)}
                    class={workspaceSettings.value.mathRenderingEnabled === option.value ? "active" : ""}
                    onClick={() => void updateWorkspaceSettings({ mathRenderingEnabled: option.value })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {workspacePath.value && (
            <div class="settings-row">
              <div>
                <div class="settings-label">Paste images as attachments</div>
                <div class="settings-hint">
                  Pasting or dropping an image into a note saves it as a file and inserts a link to it
                </div>
              </div>
              <div class="settings-switch">
                {PASTE_IMAGES_OPTIONS.map((option) => (
                  <button
                    key={String(option.value)}
                    class={workspaceSettings.value.pasteImagesEnabled === option.value ? "active" : ""}
                    onClick={() => void updateWorkspaceSettings({ pasteImagesEnabled: option.value })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {workspacePath.value && (
            <div class="settings-row">
              <div>
                <div class="settings-label">Attachments folder</div>
                <div class="settings-hint">
                  Where a pasted/dropped image is saved; empty means next to the note that embeds it
                </div>
              </div>
              <div class="settings-value">
                <input
                  type="text"
                  placeholder="next to the note"
                  value={workspaceSettings.value.attachmentsFolder}
                  onInput={(e) => {
                    void updateWorkspaceSettings({
                      attachmentsFolder: (e.target as HTMLInputElement).value,
                    });
                  }}
                />
              </div>
            </div>
          )}

          {workspacePath.value && (
            <div class="settings-row">
              <div>
                <div class="settings-label">Frontmatter properties panel</div>
                <div class="settings-hint">
                  Show a note's frontmatter fields above the editor as editable rows
                </div>
              </div>
              <div class="settings-switch">
                {FRONTMATTER_PROPERTIES_OPTIONS.map((option) => (
                  <button
                    key={String(option.value)}
                    class={workspaceSettings.value.frontmatterPropertiesEnabled === option.value ? "active" : ""}
                    onClick={() => void updateWorkspaceSettings({ frontmatterPropertiesEnabled: option.value })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <section class="settings-section">
          <h3>Appearance</h3>
          <div class="settings-row">
            <div class="settings-label">Theme</div>
            <div class="settings-switch">
              {THEME_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  class={theme.value === option.value ? "active" : ""}
                  onClick={() => setTheme(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {workspacePath.value && (
            <>
              <div class="settings-row">
                <div class="settings-label">Font size</div>
                <div class="settings-value">
                  <input
                    type="number"
                    min={MIN_FONT_SIZE}
                    max={MAX_FONT_SIZE}
                    value={workspaceSettings.value.fontSize}
                    onInput={(e) => {
                      const raw = Number((e.target as HTMLInputElement).value);
                      if (!Number.isFinite(raw)) return;
                      void updateWorkspaceSettings({ fontSize: clamp(raw, MIN_FONT_SIZE, MAX_FONT_SIZE) });
                    }}
                  />
                </div>
              </div>
              <div class="settings-row">
                <div>
                  <div class="settings-label">Zoom</div>
                  <div class="settings-hint">Scales the whole app, not just note text</div>
                </div>
                <div class="settings-value">
                  <input
                    type="number"
                    min={MIN_UI_ZOOM}
                    max={MAX_UI_ZOOM}
                    step={10}
                    value={workspaceSettings.value.uiZoom}
                    onInput={(e) => {
                      const raw = Number((e.target as HTMLInputElement).value);
                      if (!Number.isFinite(raw)) return;
                      void updateWorkspaceSettings({ uiZoom: clamp(raw, MIN_UI_ZOOM, MAX_UI_ZOOM) });
                    }}
                  />
                  %
                </div>
              </div>
              <div class="settings-row">
                <div>
                  <div class="settings-label">Default view mode</div>
                  <div class="settings-hint">Applied when this workspace is opened</div>
                </div>
                <div class="settings-switch">
                  {VIEW_MODE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      class={workspaceSettings.value.defaultViewMode === option.value ? "active" : ""}
                      onClick={() => void updateWorkspaceSettings({ defaultViewMode: option.value })}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>

        {workspacePath.value && <VaultStatsPanel rootPath={workspacePath.value} loadStats={getWorkspaceStats} />}

        <section class="settings-section" aria-label="Keyboard shortcuts">
          <h3>Keyboard shortcuts</h3>
          {KEYBOARD_SHORTCUTS.map((shortcut) => (
            <div class="settings-row" key={shortcut.keys}>
              <div class="settings-label">{shortcut.description}</div>
              <div class="settings-value">
                <kbd>{shortcut.keys}</kbd>
              </div>
            </div>
          ))}
        </section>

        <section class="settings-section">
          <h3>About</h3>
          <div class="settings-row">
            <div>
              <div class="settings-label">Version</div>
              <div class="settings-value">{appVersion.value || "..."}</div>
            </div>
          </div>
          <div class="settings-row">
            <div class="settings-label">License</div>
            <button onClick={() => setShowLicense(true)}>View License</button>
          </div>
        </section>
      </div>

      {showLicense && (
        <div
          class="modal-overlay"
          onClick={(e) => {
            // This overlay is nested inside the settings panel's own
            // modal-overlay (see the license modal being a sibling of
            // .settings-panel below, both under the same outer div): without
            // stopping propagation here, a backdrop click closes the license
            // view correctly but then bubbles up to the outer overlay's own
            // click handler too, closing the whole Settings panel with it.
            e.stopPropagation();
            setShowLicense(false);
          }}
        >
          <div class="modal license-viewer" onClick={(e) => e.stopPropagation()}>
            <div class="modal-header">
              <h2>License</h2>
              <button class="modal-close" onClick={() => setShowLicense(false)}>
                x
              </button>
            </div>
            <pre class="license-text">{licenseText}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
