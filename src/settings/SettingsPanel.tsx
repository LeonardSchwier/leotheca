import { effect } from "@preact/signals";
import { useEffect, useState } from "preact/hooks";
import licenseText from "../../LICENSE?raw";
import { Capacitor } from "@capacitor/core";
import {
  addWorkspaceFromPicker,
  appVersion,
  externalFileOpenEnabled,
  globalConfigCorrupted,
  repairGlobalConfigFile,
  settingsPanelOpen,
  setExternalFileOpenEnabled,
  setTheme,
  setLanguage,
  repairWorkspaceSettingsFile,
  retryWorkspaceSettingsSave,
  theme,
  updateWorkspaceSettings,
  viewMode,
  workspacePath,
  workspaceSettingsCorrupted,
  workspaceSettingsSaveError,
  workspaceSettingsSaving,
  workspaceSettings,
} from "./store";
import type { ThemePreference } from "./globalConfig";
import {
  catalogs,
  interpolate,
  LANGUAGE_NAMES,
  LANGUAGE_PREFERENCES,
  languagePreference,
  t,
  type LanguagePreference,
  type MessageKey,
} from "../i18n";
import {
  clamp,
  MAX_FONT_SIZE,
  MAX_UI_ZOOM,
  MIN_FONT_SIZE,
  MIN_UI_ZOOM,
  type DeleteBehavior,
  type AccentColor,
  type ReadingFont,
  type ViewMode,
} from "./workspaceSettings";
import { getWorkspaceStats } from "../workspace/tauriBridge";
import { exportTextFileViaDialog } from "../workspace/tauriBridgeImpl";
import {
  currentDefaultHandlerContract,
  type DefaultHandlerContract,
} from "./defaultHandler";
import { VaultStatsPanel } from "./VaultStatsPanel";
import { WorkspaceProfilesSettings } from "./WorkspaceProfilesSettings";
import { KEYBOARD_SHORTCUTS } from "../app/shortcuts";
import { rebuildLinkIndex } from "../linking/store";
import { DiagnosticsPanel } from "../diagnostics/DiagnosticsPanel";

const THEME_OPTIONS: { value: ThemePreference; label: MessageKey }[] = [
  { value: "system", label: "settings.theme.followSystem" },
  { value: "light", label: "settings.theme.light" },
  { value: "dark", label: "settings.theme.dark" },
];

/** A language is named in itself, so it is the same text whatever the
 * interface language is; only "Follow System" is translated. */
function languageOptionLabel(value: LanguagePreference): string {
  return value === "system"
    ? t("settings.language.followSystem")
    : LANGUAGE_NAMES[value];
}

// Searching "Sprache" must find the row even while the interface is English,
// and "language" while it is German: someone who landed in the wrong
// language has to be able to find this setting.
const LANGUAGE_ROW_SEARCH_TERMS: string[] = [
  ...Object.values(catalogs).map(
    (catalog) => catalog["settings.language.label"],
  ),
  ...Object.values(LANGUAGE_NAMES),
];

const VIEW_MODE_OPTIONS: { value: ViewMode; label: MessageKey }[] = [
  { value: "source", label: "settings.viewMode.source" },
  { value: "split", label: "settings.viewMode.split" },
  { value: "preview", label: "settings.viewMode.preview" },
];

const DELETE_BEHAVIOR_OPTIONS: { value: DeleteBehavior; label: MessageKey }[] =
  [
    { value: "project-trash", label: "settings.deleteBehavior.projectTrash" },
    { value: "permanent", label: "settings.deleteBehavior.permanent" },
  ];

const FRONTMATTER_ALIASES_OPTIONS: { value: boolean; label: MessageKey }[] = [
  { value: true, label: "settings.option.on" },
  { value: false, label: "settings.option.off" },
];

const HEADING_LINKS_OPTIONS: { value: boolean; label: MessageKey }[] = [
  { value: true, label: "settings.option.on" },
  { value: false, label: "settings.option.off" },
];

const MARKDOWN_IMPORT_OPTIONS: { value: boolean; label: MessageKey }[] = [
  { value: true, label: "settings.option.on" },
  { value: false, label: "settings.option.off" },
];

const MATH_RENDERING_OPTIONS: { value: boolean; label: MessageKey }[] = [
  { value: true, label: "settings.option.on" },
  { value: false, label: "settings.option.off" },
];

const PASTE_IMAGES_OPTIONS: { value: boolean; label: MessageKey }[] = [
  { value: true, label: "settings.option.on" },
  { value: false, label: "settings.option.off" },
];
const CANVAS_OPTIONS: { value: boolean; label: MessageKey }[] = [
  { value: true, label: "settings.option.on" },
  { value: false, label: "settings.option.off" },
];

const FRONTMATTER_PROPERTIES_OPTIONS: { value: boolean; label: MessageKey }[] =
  [
    { value: true, label: "settings.option.on" },
    { value: false, label: "settings.option.off" },
  ];

const TAGS_OPTIONS: { value: boolean; label: MessageKey }[] = [
  { value: true, label: "settings.option.on" },
  { value: false, label: "settings.option.off" },
];

const TEMPLATES_OPTIONS: { value: boolean; label: MessageKey }[] = [
  { value: true, label: "settings.option.on" },
  { value: false, label: "settings.option.off" },
];
const OPTIONAL_FEATURE_OPTIONS: { value: boolean; label: MessageKey }[] = [
  { value: true, label: "settings.option.on" },
  { value: false, label: "settings.option.off" },
];
const ACCENT_OPTIONS: { value: AccentColor; label: MessageKey }[] = [
  { value: "warm", label: "settings.accentColor.warm" },
  { value: "ocean", label: "settings.accentColor.ocean" },
  { value: "forest", label: "settings.accentColor.forest" },
  { value: "plum", label: "settings.accentColor.plum" },
];
const READING_FONT_OPTIONS: { value: ReadingFont; label: MessageKey }[] = [
  { value: "sans", label: "settings.readingFont.sans" },
  { value: "serif", label: "settings.readingFont.serif" },
  { value: "mono", label: "settings.readingFont.mono" },
];

/**
 * Case-insensitive substring match of `query` against any of `texts` (a
 * setting's own label, plus its hint when it has one). An empty or
 * whitespace-only query matches everything, so the panel looks exactly as
 * it did before this feature existed until the user actually types
 * something (competitor-queued item, see ROADMAP.md's "Settings search").
 */
export function matchesSettingsSearch(
  query: string,
  ...texts: string[]
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return texts.some((text) => text.toLowerCase().includes(q));
}

/** A message key, or a key and its parameters, that a settings row can be
 * found by. */
export type SettingsSearchTerm =
  MessageKey | readonly [MessageKey, Readonly<Record<string, string | number>>];

/**
 * `matchesSettingsSearch` over message keys: each term is tested in the
 * active language and in English, so a German user finds a row by either
 * name. In English both are the same text, so English behaves exactly as a
 * search over the literal strings did.
 */
export function matchesSettingsSearchTerms(
  query: string,
  ...terms: SettingsSearchTerm[]
): boolean {
  const texts = new Set<string>();
  for (const term of terms) {
    const [key, params] = typeof term === "string" ? [term] : term;
    texts.add(t(key, params));
    texts.add(interpolate(catalogs.en[key], params));
  }
  return matchesSettingsSearch(query, ...texts);
}

interface SettingsPanelProps {
  /** Opens (or focuses an already-open tab for) a note, mirroring every
   * other sidebar panel's own prop of the same name (see TagsPanel,
   * TaskHubPanel, BookmarksPanel). Used by the Health section's Link
   * Diagnostics list to jump to a finding's source note. */
  onOpenFile: (path: string, name: string) => void | Promise<void>;
}

/** UX-01 spec section 16.1: "Settings opens as a large adaptive dialog...
 * left category navigation; right scrollable content pane." Matches this
 * app's own existing section groupings (each already gated by its own
 * `xVisible` boolean below) rather than forcing the spec's own merely
 * "suggested" category list (16.1) onto a different existing structure. */
type SettingsCategory =
  | "general"
  | "profiles"
  | "features"
  | "appearance"
  | "shortcuts"
  | "health"
  | "about";

export function SettingsPanel({ onOpenFile }: SettingsPanelProps) {
  const [showLicense, setShowLicense] = useState(false);
  const [folderPickerLoading, setFolderPickerLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] =
    useState<SettingsCategory>("general");
  // UX-01 spec 16.2: "A category landing page lists the same categories.
  // Selecting a category opens a detail page." Deliberately not driven by
  // any JS-side viewport-width check: the category list and the detail
  // pane both stay in the DOM at every width, and this state's effect on
  // which one is visible is entirely scoped to App.css's own
  // `max-width: 720px` media query (the same breakpoint this panel's
  // existing narrow-width override already uses). Outside that query this
  // flag has no visible effect at all -- nav and content render side by
  // side exactly as they did before this pass, matching 16.1. Resets to
  // the landing page every time Settings re-opens (an effect below), not
  // persisted across a close/reopen.
  const [compactDetailOpen, setCompactDetailOpen] = useState(false);
  useEffect(() => {
    if (settingsPanelOpen.value) setCompactDetailOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- settingsPanelOpen.value is a signal read, not plain outer-scope state; the component (and so this effect's own deps array) already re-runs whenever it changes.
  }, [settingsPanelOpen.value]);

  // Link Diagnostics (Health section) reads the shared linkIndex directly,
  // the same as it did in its old sidebar-panel home; refreshed on open so
  // it isn't showing a stale scan from before the panel opened, mirroring
  // the same on-open rebuildLinkIndex call every other sidebar panel already
  // does in App.tsx.
  effect(() => {
    if (settingsPanelOpen.value && workspacePath.value) {
      void rebuildLinkIndex(
        workspacePath.value,
        workspaceSettings.value.frontmatterAliasesEnabled,
        workspaceSettings.value.tagsEnabled,
      );
    }
  });

  if (!settingsPanelOpen.value) return null;

  const handleSelectDiagnostic = async (path: string, name: string) => {
    await onOpenFile(path, name);
    settingsPanelOpen.value = false;
    if (viewMode.value === "preview") viewMode.value = "split";
  };

  const handleExportSettings = async () => {
    try {
      const payload = {
        exportedAt: new Date().toISOString(),
        appVersion: appVersion.value || "unknown",
        workspaceSettings: JSON.parse(JSON.stringify(workspaceSettings.value)),
      };
      await exportTextFileViaDialog(
        "leotheca-settings.json",
        JSON.stringify(payload, null, 2),
      );
    } catch (e) {
      window.alert(
        t("settings.export.failed", {
          error: e instanceof Error ? e.message : String(e),
        }),
      );
    }
  };

  const matches = (...terms: SettingsSearchTerm[]) =>
    matchesSettingsSearchTerms(searchQuery, ...terms);

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
  const showRootFolder = matches(
    "settings.rootFolder.label",
    "settings.rootFolder.change",
  );
  const showExternalFileOpen = matches(
    "settings.externalFileOpen.label",
    "settings.externalFileOpen.search",
  );
  const showAccentThemes = matches(
    "settings.accentThemes.label",
    "settings.accentThemes.hint",
  );
  const showAccentColor = matches(
    "settings.accentColor.label",
    "settings.accentColor.hint",
  );
  const showReadingFont = matches(
    "settings.readingFont.label",
    "settings.readingFont.search",
  );
  const showEditorSnippets = matches(
    "settings.snippets.label",
    "settings.snippets.hint",
  );
  const showSnippetDefinitions = matches(
    "settings.snippetDefinitions.label",
    "settings.snippetDefinitions.hint",
  );
  const showCanvas = matches("settings.canvas.label", "settings.canvas.hint");
  const showDeleteBehavior = matches(
    "settings.deleteBehavior.label",
    "settings.deleteBehavior.hint",
  );
  const showFrontmatterAliases = matches(
    "settings.frontmatterAliases.label",
    "settings.frontmatterAliases.hint",
  );
  const showHeadingLinks = matches(
    "settings.headingLinks.label",
    "settings.headingLinks.hint",
  );
  const showMarkdownImport =
    !Capacitor.isNativePlatform() &&
    matches("settings.markdownImport.label", "settings.markdownImport.search");
  const showMathRendering = matches(
    "settings.mathRendering.label",
    "settings.mathRendering.hint",
  );
  const showMermaidRendering = matches(
    "settings.mermaid.label",
    "settings.mermaid.hint",
  );
  const showPasteImages = matches(
    "settings.pasteImages.label",
    "settings.pasteImages.hint",
  );
  const showAttachmentsFolder = matches(
    "settings.attachmentsFolder.label",
    "settings.attachmentsFolder.hint",
  );
  const showCaptureInboxFolder = matches(
    "settings.captureInboxFolder.label",
    "settings.captureInboxFolder.hint",
  );
  const showCaptureInboxNote = matches(
    "settings.captureInboxNote.label",
    "settings.captureInboxNote.hint",
  );
  const showCaptureDatePattern = matches(
    "settings.captureDatePattern.label",
    "settings.captureDatePattern.search",
  );
  const showFrontmatterProperties = matches(
    "settings.frontmatterProperties.label",
    "settings.frontmatterProperties.hint",
  );
  const showTags = matches("settings.tags.label", "settings.tags.hint");
  const showTemplates = matches(
    "settings.templates.label",
    "settings.templates.hint",
  );
  const showTemplatesFolder = matches(
    "settings.templatesFolder.label",
    "settings.templatesFolder.hint",
  );
  const showCollections = matches(
    "settings.collections.label",
    "settings.collections.search",
  );
  const showSpellchecking = matches(
    "settings.spellcheck.label",
    "settings.spellcheck.search",
  );
  const showWorkspaceProfiles = matches(
    "profiles.title",
    "settings.profiles.search",
  );
  const showTheme = matches("settings.theme.label");
  const showLanguage = matchesSettingsSearch(
    searchQuery,
    ...LANGUAGE_ROW_SEARCH_TERMS,
  );
  const showFontSize = matches("settings.fontSize.label");
  const showZoom = matches("settings.zoom.label", "settings.zoom.hint");
  const showDefaultViewMode = matches(
    "settings.viewMode.label",
    "settings.viewMode.hint",
  );
  const showRtlWorkspace = matches("settings.rtl.label", "settings.rtl.search");
  const showVersion = matches("settings.version.label");
  const showLicenseRow = matches("settings.license.label");
  const showHealth = matches(
    "settings.category.health",
    "settings.health.searchDiagnostics",
    "settings.health.searchBrokenLinks",
  );

  const filteredShortcuts = KEYBOARD_SHORTCUTS.filter((shortcut) =>
    matchesSettingsSearch(searchQuery, shortcut.description, shortcut.keys),
  );

  const showExternalFileOpenRow =
    showExternalFileOpen && !Capacitor.isNativePlatform();
  // The "Open with .md — set as default" guidance, resolved for the current
  // platform. Computed once per render (it's a pure, cheap function); kept as
  // a local so the JSX below can reference it and tests can stub the import.
  const defaultHandlerContract: DefaultHandlerContract | null =
    showExternalFileOpenRow ? currentDefaultHandlerContract() : null;
  const generalVisible =
    showRootFolder ||
    showExternalFileOpenRow ||
    Boolean(workspaceSettingsSaveError.value) ||
    workspaceSettingsCorrupted.value ||
    Boolean(
      workspacePath.value &&
      (showDeleteBehavior ||
        showFrontmatterAliases ||
        showHeadingLinks ||
        showMarkdownImport ||
        showMathRendering ||
        showMermaidRendering ||
        showPasteImages ||
        showAttachmentsFolder ||
        showCaptureInboxFolder ||
        showCaptureInboxNote ||
        showCaptureDatePattern ||
        showFrontmatterProperties ||
        showSpellchecking ||
        (workspaceSettings.value.themesEnabled && showAccentColor) ||
        (workspaceSettings.value.snippetsEnabled && showSnippetDefinitions) ||
        (workspaceSettings.value.templatesEnabled && showTemplatesFolder)),
    );
  const featureSelectionVisible = Boolean(
    workspacePath.value &&
    (showAccentThemes ||
      showEditorSnippets ||
      showCanvas ||
      showTags ||
      showTemplates ||
      showCollections),
  );
  const profilesVisible = showWorkspaceProfiles;
  const appearanceVisible =
    showTheme ||
    showLanguage ||
    Boolean(
      workspacePath.value &&
      (showFontSize ||
        showZoom ||
        showDefaultViewMode ||
        showRtlWorkspace ||
        showReadingFont),
    );
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

  // A search query overrides category selection entirely (shows every
  // matching section regardless of which category is selected), matching
  // this panel's existing pre-category search behavior exactly rather than
  // narrowing search results to just the active category.
  const inActiveCategory = (category: SettingsCategory): boolean =>
    searchQuery.trim() !== "" || activeCategory === category;

  const categories: {
    id: SettingsCategory;
    label: MessageKey;
    visible: boolean;
  }[] = [
    {
      id: "general",
      label: "settings.category.general",
      visible: generalVisible,
    },
    {
      id: "profiles",
      label: "settings.category.profiles",
      visible: profilesVisible,
    },
    {
      id: "features",
      label: "settings.category.features",
      visible: featureSelectionVisible,
    },
    {
      id: "appearance",
      label: "settings.category.appearance",
      visible: appearanceVisible,
    },
    {
      id: "shortcuts",
      label: "settings.category.shortcuts",
      visible: shortcutsVisible,
    },
    { id: "health", label: "settings.category.health", visible: healthVisible },
    { id: "about", label: "settings.category.about", visible: aboutVisible },
  ];

  // A live search already bypasses category selection (inActiveCategory
  // above); at compact width it also bypasses the category-list landing
  // page itself and jumps straight to results, the same way selecting a
  // category explicitly would -- typing to search is itself a clear
  // enough signal the user doesn't need the intermediate list screen.
  const compactShowingDetail = compactDetailOpen || searchQuery.trim() !== "";
  const returnToCompactList = () => {
    setCompactDetailOpen(false);
    setSearchQuery("");
  };

  return (
    <div
      class="modal-overlay"
      onClick={() => (settingsPanelOpen.value = false)}
    >
      <div class="modal settings-panel" onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h2>{t("settings.title")}</h2>
          {workspaceSettingsSaving.value && (
            <span class="settings-saving-indicator" role="status">
              {t("settings.saving")}
            </span>
          )}
          <button
            class="modal-close"
            aria-label={t("settings.close")}
            onClick={() => (settingsPanelOpen.value = false)}
          >
            x
          </button>
        </div>

        <div class="settings-search">
          <input
            type="text"
            class="settings-search-input"
            placeholder={t("settings.search.placeholder")}
            aria-label={t("settings.search.label")}
            value={searchQuery}
            onInput={(e) =>
              setSearchQuery((e.target as HTMLInputElement).value)
            }
          />
        </div>

        {nothingMatches && (
          <p class="empty-hint">
            {t("settings.search.noMatches", { query: searchQuery.trim() })}
          </p>
        )}

        <div
          class={`settings-body ${compactShowingDetail ? "settings-body--compact-detail" : ""}`}
        >
          <nav class="settings-nav" aria-label={t("settings.nav.label")}>
            {categories
              .filter((category) => category.visible)
              .map((category) => (
                <button
                  key={category.id}
                  class={activeCategory === category.id ? "active" : ""}
                  aria-current={
                    activeCategory === category.id ? "true" : undefined
                  }
                  onClick={() => {
                    setActiveCategory(category.id);
                    setCompactDetailOpen(true);
                  }}
                >
                  {t(category.label)}
                </button>
              ))}
          </nav>
          <div class="settings-content">
            {/* UX-01 spec 16.2: "Each category retains a stable heading and
            Close or Back action." Only visible under App.css's own
            `max-width: 720px` media query -- see compactDetailOpen's own
            doc comment above for why this needs no JS-side width check. */}
            <button
              type="button"
              class="settings-compact-back"
              onClick={returnToCompactList}
            >
              {t("settings.back")}
            </button>
            {generalVisible && inActiveCategory("general") && (
              <section class="settings-section">
                <h3>{t("settings.category.general")}</h3>
                {showRootFolder && (
                  <div class="settings-row">
                    <div>
                      <div class="settings-label">
                        {t("settings.rootFolder.label")}
                      </div>
                      <div class="settings-value">
                        {workspacePath.value ?? t("settings.rootFolder.notSet")}
                      </div>
                    </div>
                    <button
                      onClick={handleChangeFolder}
                      disabled={folderPickerLoading}
                    >
                      {folderPickerLoading
                        ? t("settings.rootFolder.opening")
                        : t("settings.rootFolder.change")}
                    </button>
                  </div>
                )}

                {showExternalFileOpenRow && (
                  <div class="settings-row">
                    <div>
                      <div class="settings-label">
                        {t("settings.externalFileOpen.label")}
                      </div>
                      <div class="settings-hint">
                        {t("settings.externalFileOpen.hint")}
                      </div>
                    </div>
                    <div class="settings-switch">
                      {OPTIONAL_FEATURE_OPTIONS.map((option) => (
                        <button
                          key={String(option.value)}
                          class={
                            externalFileOpenEnabled.value === option.value
                              ? "active"
                              : ""
                          }
                          onClick={() =>
                            void setExternalFileOpenEnabled(option.value)
                          }
                        >
                          {t(option.label)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {showExternalFileOpenRow && defaultHandlerContract && (
                  <div class="settings-row">
                    <div>
                      <div class="settings-label">
                        {t("settings.defaultHandler.label")}
                      </div>
                      <div class="settings-hint">
                        {defaultHandlerContract.isSettable
                          ? t("settings.defaultHandler.settable")
                          : t("settings.defaultHandler.notSettable")}
                      </div>
                      <ol class="settings-ol">
                        {defaultHandlerContract.steps.map((step, i) => (
                          <li key={String(i)}>
                            <span class="settings-step-target">
                              {step.target}
                            </span>{" "}
                            - {step.summary}
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                )}

                {workspaceSettingsSaveError.value && (
                  <div class="settings-row" role="alert">
                    <div class="settings-hint">
                      {workspaceSettingsSaveError.value}
                    </div>
                    <button onClick={() => void retryWorkspaceSettingsSave()}>
                      {t("settings.saveError.retry")}
                    </button>
                  </div>
                )}

                {workspaceSettingsCorrupted.value && (
                  <div class="settings-row" role="alert">
                    <div>
                      <div class="settings-label">
                        {t("settings.corrupted.label")}
                      </div>
                      <div class="settings-hint">
                        {t("settings.corrupted.hint")}
                      </div>
                    </div>
                    <button onClick={() => void repairWorkspaceSettingsFile()}>
                      {t("settings.corrupted.rewrite")}
                    </button>
                  </div>
                )}

                {globalConfigCorrupted.value && (
                  <div class="settings-row" role="alert">
                    <div>
                      <div class="settings-label">
                        {t("settings.globalCorrupted.label")}
                      </div>
                      <div class="settings-hint">
                        {t("settings.globalCorrupted.hint")}
                      </div>
                    </div>
                    <button onClick={() => void repairGlobalConfigFile()}>
                      {t("settings.globalCorrupted.rewrite")}
                    </button>
                  </div>
                )}

                {workspacePath.value && (
                  <>
                    {workspaceSettings.value.themesEnabled &&
                      showAccentColor && (
                        <div class="settings-row">
                          <div>
                            <div class="settings-label">
                              {t("settings.accentColor.label")}
                            </div>
                            <div class="settings-hint">
                              {t("settings.accentColor.hint")}
                            </div>
                          </div>
                          <div class="settings-switch">
                            {ACCENT_OPTIONS.map((option) => (
                              <button
                                key={option.value}
                                class={
                                  workspaceSettings.value.accentColor ===
                                  option.value
                                    ? "active"
                                    : ""
                                }
                                onClick={() =>
                                  void updateWorkspaceSettings({
                                    accentColor: option.value,
                                  })
                                }
                              >
                                {t(option.label)}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    {workspaceSettings.value.snippetsEnabled &&
                      showSnippetDefinitions && (
                        <div class="settings-row">
                          <div>
                            <div class="settings-label">
                              {t("settings.snippetDefinitions.label")}
                            </div>
                            <div class="settings-hint">
                              {t("settings.snippetDefinitions.hint")}
                            </div>
                          </div>
                          <div class="settings-value">
                            <textarea
                              value={workspaceSettings.value.snippets}
                              onInput={(e) =>
                                void updateWorkspaceSettings({
                                  snippets: (e.target as HTMLTextAreaElement)
                                    .value,
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
                      <div class="settings-label">
                        {t("settings.deleteBehavior.label")}
                      </div>
                      <div class="settings-hint">
                        {t("settings.deleteBehavior.hint")}
                      </div>
                    </div>
                    <div class="settings-switch">
                      {DELETE_BEHAVIOR_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          class={
                            workspaceSettings.value.deleteBehavior ===
                            option.value
                              ? "active"
                              : ""
                          }
                          onClick={() =>
                            void updateWorkspaceSettings({
                              deleteBehavior: option.value,
                            })
                          }
                        >
                          {t(option.label)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {workspacePath.value && showFrontmatterAliases && (
                  <div class="settings-row">
                    <div>
                      <div class="settings-label">
                        {t("settings.frontmatterAliases.label")}
                      </div>
                      <div class="settings-hint">
                        {t("settings.frontmatterAliases.hint")}
                      </div>
                    </div>
                    <div class="settings-switch">
                      {FRONTMATTER_ALIASES_OPTIONS.map((option) => (
                        <button
                          key={String(option.value)}
                          class={
                            workspaceSettings.value
                              .frontmatterAliasesEnabled === option.value
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
                          {t(option.label)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {workspacePath.value && showHeadingLinks && (
                  <div class="settings-row">
                    <div>
                      <div class="settings-label">
                        {t("settings.headingLinks.label")}
                      </div>
                      <div class="settings-hint">
                        {t("settings.headingLinks.hint")}
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
                          {t(option.label)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {workspacePath.value && showMarkdownImport && (
                  <div class="settings-row">
                    <div>
                      <div class="settings-label">
                        {t("settings.markdownImport.label")}
                      </div>
                      <div class="settings-hint">
                        {t("settings.markdownImport.hint")}
                      </div>
                    </div>
                    <div class="settings-switch">
                      {MARKDOWN_IMPORT_OPTIONS.map((option) => (
                        <button
                          key={String(option.value)}
                          class={
                            workspaceSettings.value.markdownImportEnabled ===
                            option.value
                              ? "active"
                              : ""
                          }
                          onClick={() =>
                            void updateWorkspaceSettings({
                              markdownImportEnabled: option.value,
                            })
                          }
                        >
                          {t(option.label)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {workspacePath.value && showMathRendering && (
                  <div class="settings-row">
                    <div>
                      <div class="settings-label">
                        {t("settings.mathRendering.label")}
                      </div>
                      <div class="settings-hint">
                        {t("settings.mathRendering.hint")}
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
                          {t(option.label)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {workspacePath.value && showMermaidRendering && (
                  <div class="settings-row">
                    <div>
                      <div class="settings-label">
                        {t("settings.mermaid.label")}
                      </div>
                      <div class="settings-hint">
                        {t("settings.mermaid.hint")}
                      </div>
                    </div>
                    <div class="settings-switch">
                      {MATH_RENDERING_OPTIONS.map((option) => (
                        <button
                          key={String(option.value)}
                          class={
                            workspaceSettings.value.mermaidRenderingEnabled ===
                            option.value
                              ? "active"
                              : ""
                          }
                          onClick={() =>
                            void updateWorkspaceSettings({
                              mermaidRenderingEnabled: option.value,
                            })
                          }
                        >
                          {t(option.label)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {workspacePath.value && showPasteImages && (
                  <div class="settings-row">
                    <div>
                      <div class="settings-label">
                        {t("settings.pasteImages.label")}
                      </div>
                      <div class="settings-hint">
                        {t("settings.pasteImages.hint")}
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
                          {t(option.label)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {workspacePath.value && showAttachmentsFolder && (
                  <div class="settings-row">
                    <div>
                      <div class="settings-label">
                        {t("settings.attachmentsFolder.label")}
                      </div>
                      <div class="settings-hint">
                        {t("settings.attachmentsFolder.hint")}
                      </div>
                    </div>
                    <div class="settings-value">
                      <input
                        type="text"
                        placeholder={t(
                          "settings.attachmentsFolder.placeholder",
                        )}
                        value={workspaceSettings.value.attachmentsFolder}
                        onInput={(e) => {
                          void updateWorkspaceSettings({
                            attachmentsFolder: (e.target as HTMLInputElement)
                              .value,
                          });
                        }}
                      />
                    </div>
                  </div>
                )}

                {workspacePath.value && showCaptureInboxFolder && (
                  <div class="settings-row">
                    <div>
                      <div class="settings-label">
                        {t("settings.captureInboxFolder.label")}
                      </div>
                      <div class="settings-hint">
                        {t("settings.captureInboxFolder.hint")}
                      </div>
                    </div>
                    <div class="settings-value">
                      <input
                        type="text"
                        placeholder={t(
                          "settings.captureInboxFolder.placeholder",
                        )}
                        value={workspaceSettings.value.captureInboxFolder}
                        onInput={(e) => {
                          void updateWorkspaceSettings({
                            captureInboxFolder: (e.target as HTMLInputElement)
                              .value,
                          });
                        }}
                      />
                    </div>
                  </div>
                )}

                {workspacePath.value && showCaptureInboxNote && (
                  <div class="settings-row">
                    <div>
                      <div class="settings-label">
                        {t("settings.captureInboxNote.label")}
                      </div>
                      <div class="settings-hint">
                        {t("settings.captureInboxNote.hint")}
                      </div>
                    </div>
                    <div class="settings-value">
                      <input
                        type="text"
                        placeholder={t("settings.captureInboxNote.placeholder")}
                        value={workspaceSettings.value.captureInboxNote}
                        onInput={(e) => {
                          void updateWorkspaceSettings({
                            captureInboxNote: (e.target as HTMLInputElement)
                              .value,
                          });
                        }}
                      />
                    </div>
                  </div>
                )}

                {workspacePath.value && showCaptureDatePattern && (
                  <div class="settings-row">
                    <div>
                      <div class="settings-label">
                        {t("settings.captureDatePattern.label")}
                      </div>
                      <div class="settings-hint">
                        {t("settings.captureDatePattern.hint")}
                      </div>
                    </div>
                    <div class="settings-value">
                      <input
                        type="text"
                        placeholder={t(
                          "settings.captureDatePattern.placeholder",
                        )}
                        value={workspaceSettings.value.captureDatePattern}
                        onInput={(e) => {
                          void updateWorkspaceSettings({
                            captureDatePattern: (e.target as HTMLInputElement)
                              .value,
                          });
                        }}
                      />
                    </div>
                  </div>
                )}

                {workspacePath.value && (
                  <div class="settings-row">
                    <div>
                      <div class="settings-label">
                        {t("settings.customCss.label")}
                      </div>
                      <div class="settings-hint">
                        {t("settings.customCss.hint")}
                      </div>
                    </div>
                    <div class="settings-switch">
                      <button
                        class={
                          workspaceSettings.value.customCssEnabled
                            ? "active"
                            : ""
                        }
                        onClick={() => {
                          void updateWorkspaceSettings({
                            customCssEnabled:
                              !workspaceSettings.value.customCssEnabled,
                          });
                        }}
                      >
                        {workspaceSettings.value.customCssEnabled
                          ? t("settings.customCss.enabled")
                          : t("settings.customCss.disabled")}
                      </button>
                    </div>
                  </div>
                )}

                {workspacePath.value &&
                  workspaceSettings.value.customCssEnabled && (
                    <div class="settings-row">
                      <div>
                        <div class="settings-label">
                          {t("settings.customCssPath.label")}
                        </div>
                        <div class="settings-hint">
                          {t("settings.customCssPath.hint")}
                        </div>
                      </div>
                      <div class="settings-value">
                        <input
                          type="text"
                          placeholder=".leotheca/custom.css"
                          value={workspaceSettings.value.customCssPath}
                          onInput={(e) => {
                            void updateWorkspaceSettings({
                              customCssPath: (e.target as HTMLInputElement)
                                .value,
                            });
                          }}
                        />
                      </div>
                    </div>
                  )}

                {workspacePath.value && showFrontmatterProperties && (
                  <div class="settings-row">
                    <div>
                      <div class="settings-label">
                        {t("settings.frontmatterProperties.label")}
                      </div>
                      <div class="settings-hint">
                        {t("settings.frontmatterProperties.hint")}
                      </div>
                    </div>
                    <div class="settings-switch">
                      {FRONTMATTER_PROPERTIES_OPTIONS.map((option) => (
                        <button
                          key={String(option.value)}
                          class={
                            workspaceSettings.value
                              .frontmatterPropertiesEnabled === option.value
                              ? "active"
                              : ""
                          }
                          onClick={() =>
                            void updateWorkspaceSettings({
                              frontmatterPropertiesEnabled: option.value,
                            })
                          }
                        >
                          {t(option.label)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {workspacePath.value && showSpellchecking && (
                  <div class="settings-row">
                    <div>
                      <div class="settings-label">
                        {t("settings.spellcheck.label")}
                      </div>
                      <div class="settings-hint">
                        {t("settings.spellcheck.hint", {
                          files:
                            "<code>.leotheca/dictionary.aff</code> + <code>.leotheca/dictionary.dic</code>",
                        })}
                      </div>
                    </div>
                    <div class="settings-switch">
                      {OPTIONAL_FEATURE_OPTIONS.map((option) => (
                        <button
                          key={String(option.value)}
                          class={
                            workspaceSettings.value.spellcheckEnabled ===
                            option.value
                              ? "active"
                              : ""
                          }
                          onClick={() =>
                            void updateWorkspaceSettings({
                              spellcheckEnabled: option.value,
                            })
                          }
                        >
                          {t(option.label)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {workspacePath.value &&
                  workspaceSettings.value.templatesEnabled &&
                  showTemplatesFolder && (
                    <div class="settings-row">
                      <div>
                        <div class="settings-label">
                          {t("settings.templatesFolder.label")}
                        </div>
                        <div class="settings-hint">
                          {t("settings.templatesFolder.hint")}
                        </div>
                      </div>
                      <div class="settings-value">
                        <input
                          type="text"
                          placeholder={t(
                            "settings.templatesFolder.placeholder",
                          )}
                          value={workspaceSettings.value.templatesFolder}
                          onInput={(e) => {
                            void updateWorkspaceSettings({
                              templatesFolder: (e.target as HTMLInputElement)
                                .value,
                            });
                          }}
                        />
                      </div>
                    </div>
                  )}
              </section>
            )}

            {profilesVisible && inActiveCategory("profiles") && (
              <WorkspaceProfilesSettings />
            )}

            {featureSelectionVisible && inActiveCategory("features") && (
              <section class="settings-section">
                <h3>{t("settings.section.features")}</h3>
                {showAccentThemes && (
                  <div class="settings-row">
                    <div>
                      <div class="settings-label">
                        {t("settings.accentThemes.label")}
                      </div>
                      <div class="settings-hint settings-hint-italic">
                        {t("settings.accentThemes.hint")}
                      </div>
                    </div>
                    <div class="settings-switch">
                      {OPTIONAL_FEATURE_OPTIONS.map((option) => (
                        <button
                          key={String(option.value)}
                          class={
                            workspaceSettings.value.themesEnabled ===
                            option.value
                              ? "active"
                              : ""
                          }
                          onClick={() =>
                            void updateWorkspaceSettings({
                              themesEnabled: option.value,
                            })
                          }
                        >
                          {t(option.label)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {showEditorSnippets && (
                  <div class="settings-row">
                    <div>
                      <div class="settings-label">
                        {t("settings.snippets.label")}
                      </div>
                      <div class="settings-hint settings-hint-italic">
                        {t("settings.snippets.hint")}
                      </div>
                    </div>
                    <div class="settings-switch">
                      {OPTIONAL_FEATURE_OPTIONS.map((option) => (
                        <button
                          key={String(option.value)}
                          class={
                            workspaceSettings.value.snippetsEnabled ===
                            option.value
                              ? "active"
                              : ""
                          }
                          onClick={() =>
                            void updateWorkspaceSettings({
                              snippetsEnabled: option.value,
                            })
                          }
                        >
                          {t(option.label)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {showCanvas && (
                  <div class="settings-row">
                    <div>
                      <div class="settings-label">
                        {t("settings.canvas.label")}
                      </div>
                      <div class="settings-hint settings-hint-italic">
                        {t("settings.canvas.hint")}
                      </div>
                    </div>
                    <div class="settings-switch">
                      {CANVAS_OPTIONS.map((option) => (
                        <button
                          key={String(option.value)}
                          class={
                            workspaceSettings.value.canvasEnabled ===
                            option.value
                              ? "active"
                              : ""
                          }
                          onClick={() =>
                            void updateWorkspaceSettings({
                              canvasEnabled: option.value,
                            })
                          }
                        >
                          {t(option.label)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {showTags && (
                  <div class="settings-row">
                    <div>
                      <div class="settings-label">
                        {t("settings.tags.label")}
                      </div>
                      <div class="settings-hint settings-hint-italic">
                        {t("settings.tags.hint")}
                      </div>
                    </div>
                    <div class="settings-switch">
                      {TAGS_OPTIONS.map((option) => (
                        <button
                          key={String(option.value)}
                          class={
                            workspaceSettings.value.tagsEnabled === option.value
                              ? "active"
                              : ""
                          }
                          onClick={() =>
                            void updateWorkspaceSettings({
                              tagsEnabled: option.value,
                            })
                          }
                        >
                          {t(option.label)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {showTemplates && (
                  <div class="settings-row">
                    <div>
                      <div class="settings-label">
                        {t("settings.templates.label")}
                      </div>
                      <div class="settings-hint settings-hint-italic">
                        {t("settings.templates.hint")}
                      </div>
                    </div>
                    <div class="settings-switch">
                      {TEMPLATES_OPTIONS.map((option) => (
                        <button
                          key={String(option.value)}
                          class={
                            workspaceSettings.value.templatesEnabled ===
                            option.value
                              ? "active"
                              : ""
                          }
                          onClick={() =>
                            void updateWorkspaceSettings({
                              templatesEnabled: option.value,
                            })
                          }
                        >
                          {t(option.label)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {showCollections && (
                  <div class="settings-row">
                    <div>
                      <div class="settings-label">
                        {t("settings.collections.label")}
                      </div>
                      <div class="settings-hint settings-hint-italic">
                        {t("settings.collections.hint")}
                      </div>
                    </div>
                    <div class="settings-switch">
                      {OPTIONAL_FEATURE_OPTIONS.map((option) => (
                        <button
                          key={String(option.value)}
                          class={
                            workspaceSettings.value.collectionsEnabled ===
                            option.value
                              ? "active"
                              : ""
                          }
                          onClick={() =>
                            void updateWorkspaceSettings({
                              collectionsEnabled: option.value,
                            })
                          }
                        >
                          {t(option.label)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            {appearanceVisible && inActiveCategory("appearance") && (
              <section class="settings-section">
                <h3>{t("settings.category.appearance")}</h3>
                {showTheme && (
                  <div class="settings-row">
                    <div class="settings-label">
                      {t("settings.theme.label")}
                    </div>
                    <div class="settings-switch">
                      {THEME_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          class={theme.value === option.value ? "active" : ""}
                          onClick={() => setTheme(option.value)}
                        >
                          {t(option.label)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {showLanguage && (
                  <div class="settings-row">
                    <div class="settings-label">
                      {t("settings.language.label")}
                    </div>
                    <div class="settings-switch">
                      {LANGUAGE_PREFERENCES.map((value) => (
                        <button
                          key={value}
                          class={
                            languagePreference.value === value ? "active" : ""
                          }
                          onClick={() => void setLanguage(value)}
                        >
                          {languageOptionLabel(value)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {workspacePath.value && (
                  <>
                    {showFontSize && (
                      <div class="settings-row">
                        <div class="settings-label">
                          {t("settings.fontSize.label")}
                        </div>
                        <div class="settings-value">
                          <input
                            type="number"
                            min={MIN_FONT_SIZE}
                            max={MAX_FONT_SIZE}
                            value={workspaceSettings.value.fontSize}
                            onInput={(e) => {
                              const raw = Number(
                                (e.target as HTMLInputElement).value,
                              );
                              if (!Number.isFinite(raw)) return;
                              void updateWorkspaceSettings({
                                fontSize: clamp(
                                  raw,
                                  MIN_FONT_SIZE,
                                  MAX_FONT_SIZE,
                                ),
                              });
                            }}
                          />
                        </div>
                      </div>
                    )}
                    {showReadingFont && (
                      <div class="settings-row">
                        <div>
                          <div class="settings-label">
                            {t("settings.readingFont.label")}
                          </div>
                          <div class="settings-hint">
                            {t("settings.readingFont.hint")}
                          </div>
                        </div>
                        <div class="settings-switch">
                          {READING_FONT_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              class={
                                workspaceSettings.value.readingFont ===
                                option.value
                                  ? "active"
                                  : ""
                              }
                              onClick={() =>
                                void updateWorkspaceSettings({
                                  readingFont: option.value,
                                })
                              }
                            >
                              {t(option.label)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {showZoom && (
                      <div class="settings-row">
                        <div>
                          <div class="settings-label">
                            {t("settings.zoom.label")}
                          </div>
                          <div class="settings-hint">
                            {t("settings.zoom.hint")}
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
                              const raw = Number(
                                (e.target as HTMLInputElement).value,
                              );
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
                          <div class="settings-label">
                            {t("settings.viewMode.label")}
                          </div>
                          <div class="settings-hint">
                            {t("settings.viewMode.hint")}
                          </div>
                        </div>
                        <div class="settings-switch">
                          {VIEW_MODE_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              class={
                                workspaceSettings.value.defaultViewMode ===
                                option.value
                                  ? "active"
                                  : ""
                              }
                              onClick={() =>
                                void updateWorkspaceSettings({
                                  defaultViewMode: option.value,
                                })
                              }
                            >
                              {t(option.label)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {showRtlWorkspace && (
                      <div class="settings-row">
                        <div>
                          <div class="settings-label">
                            {t("settings.rtl.label")}
                          </div>
                          <div class="settings-hint settings-hint-italic">
                            {t("settings.rtl.hint")}
                          </div>
                        </div>
                        <div class="settings-switch">
                          {OPTIONAL_FEATURE_OPTIONS.map((option) => (
                            <button
                              key={String(option.value)}
                              class={
                                workspaceSettings.value.rtlWorkspaceEnabled ===
                                option.value
                                  ? "active"
                                  : ""
                              }
                              onClick={() =>
                                void updateWorkspaceSettings({
                                  rtlWorkspaceEnabled: option.value,
                                })
                              }
                            >
                              {t(option.label)}
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

            {shortcutsVisible && inActiveCategory("shortcuts") && (
              <section
                class="settings-section"
                aria-label={t("settings.section.shortcuts")}
              >
                <h3>{t("settings.section.shortcuts")}</h3>
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

            {healthVisible && inActiveCategory("health") && (
              <section class="settings-section">
                <h3>{t("settings.category.health")}</h3>
                <DiagnosticsPanel onOpenFile={handleSelectDiagnostic} />
              </section>
            )}

            {aboutVisible && inActiveCategory("about") && (
              <section class="settings-section">
                <h3>{t("settings.category.about")}</h3>
                {showVersion && (
                  <div class="settings-row">
                    <div>
                      <div class="settings-label">
                        {t("settings.version.label")}
                      </div>
                      <div class="settings-value">
                        {appVersion.value || "..."}
                      </div>
                    </div>
                  </div>
                )}
                {showLicenseRow && (
                  <div class="settings-row">
                    <div class="settings-label">
                      {t("settings.license.label")}
                    </div>
                    <button onClick={() => setShowLicense(true)}>
                      {t("settings.license.view")}
                    </button>
                  </div>
                )}
                <div class="settings-row">
                  <div class="settings-label">{t("settings.export.label")}</div>
                  <button onClick={handleExportSettings}>
                    {t("settings.export.asJson")}
                  </button>
                </div>
              </section>
            )}
          </div>
        </div>
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
              <h2>{t("settings.license.label")}</h2>
              <button
                class="modal-close"
                aria-label={t("settings.license.close")}
                onClick={() => setShowLicense(false)}
              >
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
