import { useEffect, useState } from "preact/hooks";
import licenseText from "../../LICENSE?raw";
import {
  addWorkspaceFromPicker,
  appVersion,
  globalConfigCorrupted,
  repairGlobalConfigFile,
  settingsPanelOpen,
  setTheme,
  repairWorkspaceSettingsFile,
  retryWorkspaceSettingsSave,
  theme,
  updateWorkspaceSettings,
  viewMode,
  workspacePath,
  workspaceSettingsCorrupted,
  workspaceSettingsSaveError,
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
  type AccentColor,
  type ViewMode,
} from "./workspaceSettings";
import { getWorkspaceStats } from "../workspace/tauriBridge";
import { VaultStatsPanel } from "./VaultStatsPanel";
import { WorkspaceProfilesSettings } from "./WorkspaceProfilesSettings";
import { KEYBOARD_SHORTCUTS } from "../app/shortcuts";
import { rebuildLinkIndex } from "../linking/store";
import { DiagnosticsPanel } from "../diagnostics/DiagnosticsPanel";

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

const HEADING_LINKS_OPTIONS: { value: boolean; label: string }[] = [
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
const CANVAS_OPTIONS: { value: boolean; label: string }[] = [
  { value: true, label: "On" },
  { value: false, label: "Off" },
];

const FRONTMATTER_PROPERTIES_OPTIONS: { value: boolean; label: string }[] = [
  { value: true, label: "On" },
  { value: false, label: "Off" },
];

const TAGS_OPTIONS: { value: boolean; label: string }[] = [
  { value: true, label: "On" },
  { value: false, label: "Off" },
];

const TEMPLATES_OPTIONS: { value: boolean; label: string }[] = [
  { value: true, label: "On" },
  { value: false, label: "Off" },
];
const OPTIONAL_FEATURE_OPTIONS: { value: boolean; label: string }[] = [
  { value: true, label: "On" },
  { value: false, label: "Off" },
];
const ACCENT_OPTIONS: { value: AccentColor; label: string }[] = [
  { value: "warm", label: "Warm" },
  { value: "ocean", label: "Ocean" },
  { value: "forest", label: "Forest" },
  { value: "plum", label: "Plum" },
];

/**
 * Case-insensitive substring match of `query` against any of `texts` (a
 * setting's own label, plus its hint when it has one). An empty or
 * whitespace-only query matches everything, so the panel looks exactly as
 * it did before this feature existed until the user actually types
 * something (competitor-queued item, see ROADMAP.md's "Settings search").
 */
export function matchesSettingsSearch(query: string, ...texts: string[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return texts.some((text) => text.toLowerCase().includes(q));
}

interface SettingsPanelProps {
  /** Opens (or focuses an already-open tab for) a note, mirroring every
   * other sidebar panel's own prop of the same name (see TagsPanel,
   * TaskHubPanel, BookmarksPanel). Used by the Health section's Link
   * Diagnostics list to jump to a finding's source note. */
  onOpenFile: (path: string, name: string) => void | Promise<void>;
}

export function SettingsPanel({ onOpenFile }: SettingsPanelProps) {
  const [showLicense, setShowLicense] = useState(false);
  const [folderPickerLoading, setFolderPickerLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Link Diagnostics (Health section) reads the shared linkIndex directly,
  // the same as it did in its old sidebar-panel home; refreshed on open so
  // it isn't showing a stale scan from before the panel opened, mirroring
  // the same on-open rebuildLinkIndex call every other sidebar panel already
  // does in App.tsx.
  useEffect(() => {
    if (settingsPanelOpen.value && workspacePath.value) {
      void rebuildLinkIndex(
        workspacePath.value,
        workspaceSettings.value.frontmatterAliasesEnabled,
        workspaceSettings.value.tagsEnabled,
      );
    }
  }, [settingsPanelOpen.value, workspacePath.value]);

  if (!settingsPanelOpen.value) return null;

  const handleSelectDiagnostic = async (path: string, name: string) => {
    await onOpenFile(path, name);
    settingsPanelOpen.value = false;
    if (viewMode.value === "preview") viewMode.value = "split";
  };

  const matches = (...texts: string[]) => matchesSettingsSearch(searchQuery, ...texts);

  const handleChangeFolder = async () => {
    setFolderPickerLoading(true);
    try {
      await addWorkspaceFromPicker();
    } finally {
      setFolderPickerLoading(false);
    }
  };

  // Filter matches for every row a search query could plausibly find,
  // computed once per render and reused both to hide/show the individual
  // row and to decide whether the section holding it has anything left to
  // show at all. The two workspace-scoped alerts (save error, corrupted
  // settings file) are deliberately never hidden by a search query: they
  // are transient status, not an "option" to find, and hiding an active
  // error because it doesn't match the search text would be a real UX
  // regression, not a filtering convenience.
  const showRootFolder = matches("Root folder", "Change Folder");
  const showAccentThemes = matches("Accent themes", "Use this workspace's restrained accent color");
  const showAccentColor = matches("Accent color", "Changes highlights without replacing the light or dark palette");
  const showEditorSnippets = matches("Editor snippets", "Type ;trigger then Tab to expand a local writing shortcut");
  const showSnippetDefinitions = matches("Snippet definitions", "One per line: trigger, a tab, then replacement text");
  const showCanvas = matches("Canvas", "Allow creation and viewing of local canvas files");
  const showDeleteBehavior = matches("Delete behavior", "Where deleted notes and folders go");
  const showFrontmatterAliases = matches(
    "Frontmatter aliases",
    "Resolve [[wikilinks]], autocomplete, and backlinks by a note's aliases: frontmatter field too, not just its file name",
  );
  const showHeadingLinks = matches(
    "Heading links",
    "Resolve [[Note#Heading]] and [[#Heading]] links to a specific heading, with Preview click navigation to it. Off, [[wikilinks]] parse exactly as before this feature existed",
  );
  const showMathRendering = matches("Math rendering", "Render $inline$ and $$block$$ LaTeX math in Preview, via KaTeX");
  const showPasteImages = matches(
    "Paste images as attachments",
    "Pasting or dropping an image into a note saves it as a file and inserts a link to it",
  );
  const showAttachmentsFolder = matches(
    "Attachments folder",
    "Where a pasted/dropped image is saved; empty means next to the note that embeds it",
  );
  const showFrontmatterProperties = matches(
    "Frontmatter properties panel",
    "Show a note's frontmatter fields above the editor as editable rows",
  );
  const showTags = matches("Tags", "Recognize #tag syntax and a note's tags: frontmatter field in the Tags panel");
  const showTemplates = matches(
    "Templates",
    'Offer a "New note from template" command that starts a note from a file in the templates folder',
  );
  const showTemplatesFolder = matches("Templates folder", "Where template notes live, relative to the workspace root");
  const showCollections = matches(
    "Collections",
    "Group notes by a saved search or a manual list, off by default",
  );
  const showWorkspaceProfiles = matches(
    "Workspace profiles",
    "Rename, identify, add, and forget known workspaces without deleting their files",
  );
  const showTheme = matches("Theme");
  const showFontSize = matches("Font size");
  const showZoom = matches("Zoom", "Scales the whole app; use Ctrl+Plus, Ctrl+Minus, or Ctrl+0");
  const showDefaultViewMode = matches("Default view mode", "Applied when this workspace is opened");
  const showVersion = matches("Version");
  const showLicenseRow = matches("License");
  const showHealth = matches("Health", "Link Diagnostics", "broken or ambiguous links");

  const filteredShortcuts = KEYBOARD_SHORTCUTS.filter((shortcut) => matches(shortcut.description, shortcut.keys));

  const generalVisible =
    showRootFolder ||
    Boolean(workspaceSettingsSaveError.value) ||
    workspaceSettingsCorrupted.value ||
    Boolean(
      workspacePath.value &&
        (showDeleteBehavior ||
          showFrontmatterAliases ||
          showHeadingLinks ||
          showMathRendering ||
          showPasteImages ||
          showAttachmentsFolder ||
          showFrontmatterProperties ||
          (workspaceSettings.value.themesEnabled && showAccentColor) ||
          (workspaceSettings.value.snippetsEnabled && showSnippetDefinitions) ||
          (workspaceSettings.value.templatesEnabled && showTemplatesFolder)),
    );
  const featureSelectionVisible = Boolean(
    workspacePath.value &&
      (showAccentThemes || showEditorSnippets || showCanvas || showTags || showTemplates || showCollections),
  );
  const profilesVisible = showWorkspaceProfiles;
  const appearanceVisible = showTheme || Boolean(workspacePath.value && (showFontSize || showZoom || showDefaultViewMode));
  const shortcutsVisible = filteredShortcuts.length > 0;
  const aboutVisible = showVersion || showLicenseRow;
  const healthVisible = Boolean(workspacePath.value && showHealth);
  const nothingMatches =
    searchQuery.trim() !== "" &&
    !generalVisible &&
    !featureSelectionVisible &&
    !profilesVisible &&
    !appearanceVisible &&
    !shortcutsVisible &&
    !aboutVisible &&
    !healthVisible;

  return (
    <div
      class="modal-overlay"
      onClick={() => (settingsPanelOpen.value = false)}
    >
      <div class="modal settings-panel" onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h2>Settings</h2>
          <button
            class="modal-close"
            onClick={() => (settingsPanelOpen.value = false)}
          >
            x
          </button>
        </div>

        <div class="settings-search">
          <input
            type="text"
            class="settings-search-input"
            placeholder="Search settings…"
            aria-label="Search settings"
            value={searchQuery}
            onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
          />
        </div>

        {nothingMatches && (
          <p class="empty-hint">No settings match &quot;{searchQuery.trim()}&quot;.</p>
        )}

        {generalVisible && (
        <section class="settings-section">
          <h3>General</h3>
          {showRootFolder && (
          <div class="settings-row">
            <div>
              <div class="settings-label">Root folder</div>
              <div class="settings-value">
                {workspacePath.value ?? "Not set"}
              </div>
            </div>
            <button onClick={handleChangeFolder} disabled={folderPickerLoading}>
              {folderPickerLoading ? "Opening folder picker…" : "Change Folder"}
            </button>
          </div>
          )}

          {workspaceSettingsSaveError.value && (
            <div class="settings-row" role="alert">
              <div class="settings-hint">
                {workspaceSettingsSaveError.value}
              </div>
              <button onClick={() => void retryWorkspaceSettingsSave()}>
                Retry
              </button>
            </div>
          )}

          {workspaceSettingsCorrupted.value && (
            <div class="settings-row" role="alert">
              <div>
                <div class="settings-label">Settings file had invalid data</div>
                <div class="settings-hint">
                  Some values in this workspace's settings.json could not be
                  read as written, so defaults are being used for those instead.
                  The original file is left untouched until you rewrite it here.
                </div>
              </div>
              <button onClick={() => void repairWorkspaceSettingsFile()}>
                Rewrite settings file
              </button>
            </div>
          )}

          {globalConfigCorrupted.value && (
            <div class="settings-row" role="alert">
              <div>
                <div class="settings-label">App configuration had invalid data</div>
                <div class="settings-hint">
                  Some saved app settings or workspace profiles could not be
                  read as written. The original configuration is left
                  untouched until you rewrite it here.
                </div>
              </div>
              <button onClick={() => void repairGlobalConfigFile()}>
                Rewrite app configuration
              </button>
            </div>
          )}

          {workspacePath.value && (
            <>
              {workspaceSettings.value.themesEnabled && showAccentColor && (
                <div class="settings-row">
                  <div>
                    <div class="settings-label">Accent color</div>
                    <div class="settings-hint">
                      Changes highlights without replacing the light or dark
                      palette
                    </div>
                  </div>
                  <div class="settings-switch">
                    {ACCENT_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        class={
                          workspaceSettings.value.accentColor === option.value
                            ? "active"
                            : ""
                        }
                        onClick={() =>
                          void updateWorkspaceSettings({
                            accentColor: option.value,
                          })
                        }
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {workspaceSettings.value.snippetsEnabled && showSnippetDefinitions && (
                <div class="settings-row">
                  <div>
                    <div class="settings-label">Snippet definitions</div>
                    <div class="settings-hint">
                      One per line: trigger, a tab, then replacement text
                    </div>
                  </div>
                  <div class="settings-value">
                    <textarea
                      value={workspaceSettings.value.snippets}
                      onInput={(e) =>
                        void updateWorkspaceSettings({
                          snippets: (e.target as HTMLTextAreaElement).value,
                        })
                      }
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {workspacePath.value && showDeleteBehavior && (
            <div class="settings-row">
              <div>
                <div class="settings-label">Delete behavior</div>
                <div class="settings-hint">
                  Where deleted notes and folders go
                </div>
              </div>
              <div class="settings-switch">
                {DELETE_BEHAVIOR_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    class={
                      workspaceSettings.value.deleteBehavior === option.value
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      void updateWorkspaceSettings({
                        deleteBehavior: option.value,
                      })
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {workspacePath.value && showFrontmatterAliases && (
            <div class="settings-row">
              <div>
                <div class="settings-label">Frontmatter aliases</div>
                <div class="settings-hint">
                  Resolve [[wikilinks]], autocomplete, and backlinks by a note's
                  aliases: frontmatter field too, not just its file name
                </div>
              </div>
              <div class="settings-switch">
                {FRONTMATTER_ALIASES_OPTIONS.map((option) => (
                  <button
                    key={String(option.value)}
                    class={
                      workspaceSettings.value.frontmatterAliasesEnabled ===
                      option.value
                        ? "active"
                        : ""
                    }
                    onClick={() => {
                      void updateWorkspaceSettings({
                        frontmatterAliasesEnabled: option.value,
                      });
                      if (workspacePath.value)
                        void rebuildLinkIndex(
                          workspacePath.value,
                          option.value,
                        );
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {workspacePath.value && showHeadingLinks && (
            <div class="settings-row">
              <div>
                <div class="settings-label">Heading links</div>
                <div class="settings-hint">
                  Resolve [[Note#Heading]] and [[#Heading]] links to a specific
                  heading, with Preview click navigation to it. Off,
                  [[wikilinks]] parse exactly as before this feature existed
                </div>
              </div>
              <div class="settings-switch">
                {HEADING_LINKS_OPTIONS.map((option) => (
                  <button
                    key={String(option.value)}
                    class={
                      workspaceSettings.value.headingLinksEnabled ===
                      option.value
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      void updateWorkspaceSettings({
                        headingLinksEnabled: option.value,
                      })
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {workspacePath.value && showMathRendering && (
            <div class="settings-row">
              <div>
                <div class="settings-label">Math rendering</div>
                <div class="settings-hint">
                  Render $inline$ and $$block$$ LaTeX math in Preview, via KaTeX
                </div>
              </div>
              <div class="settings-switch">
                {MATH_RENDERING_OPTIONS.map((option) => (
                  <button
                    key={String(option.value)}
                    class={
                      workspaceSettings.value.mathRenderingEnabled ===
                      option.value
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      void updateWorkspaceSettings({
                        mathRenderingEnabled: option.value,
                      })
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {workspacePath.value && showPasteImages && (
            <div class="settings-row">
              <div>
                <div class="settings-label">Paste images as attachments</div>
                <div class="settings-hint">
                  Pasting or dropping an image into a note saves it as a file
                  and inserts a link to it
                </div>
              </div>
              <div class="settings-switch">
                {PASTE_IMAGES_OPTIONS.map((option) => (
                  <button
                    key={String(option.value)}
                    class={
                      workspaceSettings.value.pasteImagesEnabled ===
                      option.value
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      void updateWorkspaceSettings({
                        pasteImagesEnabled: option.value,
                      })
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {workspacePath.value && showAttachmentsFolder && (
            <div class="settings-row">
              <div>
                <div class="settings-label">Attachments folder</div>
                <div class="settings-hint">
                  Where a pasted/dropped image is saved; empty means next to the
                  note that embeds it
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

          {workspacePath.value && showFrontmatterProperties && (
            <div class="settings-row">
              <div>
                <div class="settings-label">Frontmatter properties panel</div>
                <div class="settings-hint">
                  Show a note's frontmatter fields above the editor as editable
                  rows
                </div>
              </div>
              <div class="settings-switch">
                {FRONTMATTER_PROPERTIES_OPTIONS.map((option) => (
                  <button
                    key={String(option.value)}
                    class={
                      workspaceSettings.value.frontmatterPropertiesEnabled ===
                      option.value
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      void updateWorkspaceSettings({
                        frontmatterPropertiesEnabled: option.value,
                      })
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {workspacePath.value && workspaceSettings.value.templatesEnabled && showTemplatesFolder && (
            <div class="settings-row">
              <div>
                <div class="settings-label">Templates folder</div>
                <div class="settings-hint">
                  Where template notes live, relative to the workspace root
                </div>
              </div>
              <div class="settings-value">
                <input
                  type="text"
                  placeholder="Templates"
                  value={workspaceSettings.value.templatesFolder}
                  onInput={(e) => {
                    void updateWorkspaceSettings({
                      templatesFolder: (e.target as HTMLInputElement).value,
                    });
                  }}
                />
              </div>
            </div>
          )}
        </section>
        )}

        {profilesVisible && <WorkspaceProfilesSettings />}

        {featureSelectionVisible && (
        <section class="settings-section">
          <h3>Feature selection</h3>
          {showAccentThemes && (
            <div class="settings-row">
              <div>
                <div class="settings-label">Accent themes</div>
                <div class="settings-hint settings-hint-italic">
                  Use this workspace's restrained accent color
                </div>
              </div>
              <div class="settings-switch">
                {OPTIONAL_FEATURE_OPTIONS.map((option) => (
                  <button
                    key={String(option.value)}
                    class={workspaceSettings.value.themesEnabled === option.value ? "active" : ""}
                    onClick={() => void updateWorkspaceSettings({ themesEnabled: option.value })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {showEditorSnippets && (
            <div class="settings-row">
              <div>
                <div class="settings-label">Editor snippets</div>
                <div class="settings-hint settings-hint-italic">
                  Type ;trigger then Tab to expand a local writing shortcut
                </div>
              </div>
              <div class="settings-switch">
                {OPTIONAL_FEATURE_OPTIONS.map((option) => (
                  <button
                    key={String(option.value)}
                    class={workspaceSettings.value.snippetsEnabled === option.value ? "active" : ""}
                    onClick={() => void updateWorkspaceSettings({ snippetsEnabled: option.value })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {showCanvas && (
            <div class="settings-row">
              <div>
                <div class="settings-label">Canvas</div>
                <div class="settings-hint settings-hint-italic">
                  Allow creation and viewing of local canvas files
                </div>
              </div>
              <div class="settings-switch">
                {CANVAS_OPTIONS.map((option) => (
                  <button
                    key={String(option.value)}
                    class={workspaceSettings.value.canvasEnabled === option.value ? "active" : ""}
                    onClick={() => void updateWorkspaceSettings({ canvasEnabled: option.value })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {showTags && (
            <div class="settings-row">
              <div>
                <div class="settings-label">Tags</div>
                <div class="settings-hint settings-hint-italic">
                  Recognize #tag syntax and a note's tags: frontmatter field in the Tags panel
                </div>
              </div>
              <div class="settings-switch">
                {TAGS_OPTIONS.map((option) => (
                  <button
                    key={String(option.value)}
                    class={workspaceSettings.value.tagsEnabled === option.value ? "active" : ""}
                    onClick={() => void updateWorkspaceSettings({ tagsEnabled: option.value })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {showTemplates && (
            <div class="settings-row">
              <div>
                <div class="settings-label">Templates</div>
                <div class="settings-hint settings-hint-italic">
                  Offer a "New note from template" command that starts a note from a file in the templates folder
                </div>
              </div>
              <div class="settings-switch">
                {TEMPLATES_OPTIONS.map((option) => (
                  <button
                    key={String(option.value)}
                    class={workspaceSettings.value.templatesEnabled === option.value ? "active" : ""}
                    onClick={() => void updateWorkspaceSettings({ templatesEnabled: option.value })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {showCollections && (
            <div class="settings-row">
              <div>
                <div class="settings-label">Collections</div>
                <div class="settings-hint settings-hint-italic">
                  Group notes by a saved search or a manual list, in their own panel. Off by default
                </div>
              </div>
              <div class="settings-switch">
                {OPTIONAL_FEATURE_OPTIONS.map((option) => (
                  <button
                    key={String(option.value)}
                    class={workspaceSettings.value.collectionsEnabled === option.value ? "active" : ""}
                    onClick={() => void updateWorkspaceSettings({ collectionsEnabled: option.value })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
        )}

        {appearanceVisible && (
        <section class="settings-section">
          <h3>Appearance</h3>
          {showTheme && (
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
          )}

          {workspacePath.value && (
            <>
              {showFontSize && (
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
                      void updateWorkspaceSettings({
                        fontSize: clamp(raw, MIN_FONT_SIZE, MAX_FONT_SIZE),
                      });
                    }}
                  />
                </div>
              </div>
              )}
              {showZoom && (
              <div class="settings-row">
                <div>
                  <div class="settings-label">Zoom</div>
                  <div class="settings-hint">
                    Scales the whole app; use Ctrl+Plus, Ctrl+Minus, or Ctrl+0
                  </div>
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
                      void updateWorkspaceSettings({
                        uiZoom: clamp(raw, MIN_UI_ZOOM, MAX_UI_ZOOM),
                      });
                    }}
                  />
                  %
                </div>
              </div>
              )}
              {showDefaultViewMode && (
              <div class="settings-row">
                <div>
                  <div class="settings-label">Default view mode</div>
                  <div class="settings-hint">
                    Applied when this workspace is opened
                  </div>
                </div>
                <div class="settings-switch">
                  {VIEW_MODE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      class={
                        workspaceSettings.value.defaultViewMode === option.value
                          ? "active"
                          : ""
                      }
                      onClick={() =>
                        void updateWorkspaceSettings({
                          defaultViewMode: option.value,
                        })
                      }
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              )}
            </>
          )}
        </section>
        )}

        {workspacePath.value && (
          <VaultStatsPanel
            rootPath={workspacePath.value}
            loadStats={getWorkspaceStats}
          />
        )}

        {shortcutsVisible && (
        <section class="settings-section" aria-label="Keyboard shortcuts">
          <h3>Keyboard shortcuts</h3>
          {filteredShortcuts.map((shortcut) => (
            <div class="settings-row" key={shortcut.keys}>
              <div class="settings-label">{shortcut.description}</div>
              <div class="settings-value">
                <kbd>{shortcut.keys}</kbd>
              </div>
            </div>
          ))}
        </section>
        )}

        {healthVisible && (
        <section class="settings-section">
          <h3>Health</h3>
          <DiagnosticsPanel onOpenFile={handleSelectDiagnostic} />
        </section>
        )}

        {aboutVisible && (
        <section class="settings-section">
          <h3>About</h3>
          {showVersion && (
          <div class="settings-row">
            <div>
              <div class="settings-label">Version</div>
              <div class="settings-value">{appVersion.value || "..."}</div>
            </div>
          </div>
          )}
          {showLicenseRow && (
          <div class="settings-row">
            <div class="settings-label">License</div>
            <button onClick={() => setShowLicense(true)}>View License</button>
          </div>
          )}
        </section>
        )}
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
          <div
            class="modal license-viewer"
            onClick={(e) => e.stopPropagation()}
          >
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
