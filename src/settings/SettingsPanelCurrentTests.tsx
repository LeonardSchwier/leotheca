/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, within } from "@testing-library/preact";
import { signal } from "@preact/signals";
import { DEFAULT_WORKSPACE_SETTINGS } from "./workspaceSettings";
import type { ThemePreference } from "./globalConfig";

// store.ts calls window.matchMedia at module load (system-theme detection),
// which jsdom doesn't implement. Mocked out with real signals so the
// component's reactive reads/writes work exactly like the real module,
// without pulling in that side effect.
vi.mock("./store", () => ({
  addWorkspaceFromPicker: vi.fn(),
  appVersion: signal(""),
  externalFileOpenEnabled: signal(true),
  globalConfigCorrupted: signal(false),
  repairGlobalConfigFile: vi.fn(),
  settingsPanelOpen: signal(true),
  setExternalFileOpenEnabled: vi.fn(),
  setTheme: vi.fn(),
  repairWorkspaceSettingsFile: vi.fn(),
  retryWorkspaceSettingsSave: vi.fn(),
  theme: signal<ThemePreference>("system"),
  updateWorkspaceSettings: vi.fn(),
  viewMode: signal("source"),
  workspacePath: signal<string | null>(null),
  workspaceSettingsCorrupted: signal(false),
  workspaceSettingsSaveError: signal<string | null>(null),
  workspaceSettingsSaving: signal(false),
  workspaceSettings: signal(DEFAULT_WORKSPACE_SETTINGS),
}));
vi.mock("../workspace/tauriBridge", () => ({
  getWorkspaceStats: vi.fn(),
}));
// Out of scope for this file (its own loadStats/effect behavior); a plain
// stand-in keeps these tests focused on SettingsPanel's own logic.
vi.mock("./VaultStatsPanel", () => ({
  VaultStatsPanel: () => null,
}));
vi.mock("../linking/store", () => ({
  rebuildLinkIndex: vi.fn(),
}));
// UX-01 spec section 16.1: Settings now shows one category at a time
// (General by default), rather than every section simultaneously. Tests
// below that exercise a setting living in a different category select it
// first via its own left-nav button, matching how a real user would
// actually reach that setting now.
function openCategory(
  getByRole: (role: string, options: { name: string }) => HTMLElement,
  label: string,
): void {
  fireEvent.click(getByRole("button", { name: label }));
}

// The Health section's own DiagnosticsPanel content (which findings show,
// how they're computed from linkIndex) is already covered by
// diagnostics.test.ts and DiagnosticsPanel.test.tsx; a plain stand-in here
// keeps this file focused on SettingsPanel's own logic (does the Health
// section appear, does selecting a row close the settings panel), the
// same reasoning as the VaultStatsPanel stand-in above.
vi.mock("../diagnostics/DiagnosticsPanel", () => ({
  DiagnosticsPanel: ({
    onOpenFile,
  }: {
    onOpenFile: (path: string, name: string) => void | Promise<void>;
  }) => (
    <button onClick={() => void onOpenFile("/vault/broken.md", "broken.md")}>
      Mock diagnostic row
    </button>
  ),
}));

import { matchesSettingsSearch, SettingsPanel } from "./SettingsPanel";
import {
  addWorkspaceFromPicker,
  appVersion,
  externalFileOpenEnabled,
  globalConfigCorrupted,
  repairGlobalConfigFile,
  settingsPanelOpen,
  setExternalFileOpenEnabled,
  setTheme,
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

afterEach(() => {
  cleanup();
  settingsPanelOpen.value = true;
  workspacePath.value = null;
  workspaceSettings.value = DEFAULT_WORKSPACE_SETTINGS;
  theme.value = "system";
  appVersion.value = "";
  viewMode.value = "source";
  externalFileOpenEnabled.value = true;
  vi.mocked(setTheme).mockReset();
  vi.mocked(setExternalFileOpenEnabled).mockReset();
  vi.mocked(addWorkspaceFromPicker).mockReset();
  vi.mocked(updateWorkspaceSettings).mockReset();
  vi.mocked(retryWorkspaceSettingsSave).mockReset();
  vi.mocked(repairWorkspaceSettingsFile).mockReset();
  vi.mocked(repairGlobalConfigFile).mockReset();
  workspaceSettingsSaveError.value = null;
  workspaceSettingsCorrupted.value = false;
  globalConfigCorrupted.value = false;
  workspaceSettingsSaving.value = false;
});

describe("matchesSettingsSearch", () => {
  it("matches everything for an empty or whitespace-only query", () => {
    expect(matchesSettingsSearch("", "Theme")).toBe(true);
    expect(matchesSettingsSearch("   ", "Theme")).toBe(true);
  });

  it("matches case-insensitively against any given text", () => {
    expect(matchesSettingsSearch("THEME", "Theme")).toBe(true);
    expect(matchesSettingsSearch("theme", "Theme")).toBe(true);
  });

  it("matches a substring, not just a whole-word or prefix match", () => {
    expect(matchesSettingsSearch("emplate", "Templates folder")).toBe(true);
  });

  it("matches against a hint even when the label itself doesn't match", () => {
    expect(matchesSettingsSearch("clipboard", "Copy link", "Copies the link to your clipboard")).toBe(true);
  });

  it("returns false when none of the given texts contain the query", () => {
    expect(matchesSettingsSearch("nonexistent", "Theme", "Follow your OS")).toBe(false);
  });
});

describe("SettingsPanel", () => {
  it("renders nothing when the panel is closed", () => {
    settingsPanelOpen.value = false;
    const { container } = render(<SettingsPanel onOpenFile={vi.fn()} />);
    expect(container.querySelector(".settings-panel")).toBeNull();
  });

  it("shows the workspace path, or a placeholder when none is set", () => {
    const { getByText, rerender } = render(<SettingsPanel onOpenFile={vi.fn()} />);
    expect(getByText("Not set")).toBeTruthy();

    workspacePath.value = "/home/user/vault";
    rerender(<SettingsPanel onOpenFile={vi.fn()} />);
    expect(getByText("/home/user/vault")).toBeTruthy();
  });

  it("shows nothing about corrupted settings when the file decoded cleanly", () => {
    const { queryByText } = render(<SettingsPanel onOpenFile={vi.fn()} />);
    expect(queryByText("Settings file had invalid data")).toBeNull();
  });

  it("shows a corruption notice and a repair button when the settings file didn't fully decode", () => {
    workspaceSettingsCorrupted.value = true;
    const { getByText } = render(<SettingsPanel onOpenFile={vi.fn()} />);
    expect(getByText("Settings file had invalid data")).toBeTruthy();
    const button = getByText("Rewrite settings file");
    fireEvent.click(button);
    expect(repairWorkspaceSettingsFile).toHaveBeenCalledTimes(1);
  });

  it("shows a global configuration repair action only when needed", () => {
    globalConfigCorrupted.value = true;
    const { getByText } = render(<SettingsPanel onOpenFile={vi.fn()} />);
    expect(getByText("App configuration had invalid data")).toBeTruthy();
    fireEvent.click(getByText("Rewrite app configuration"));
    expect(repairGlobalConfigFile).toHaveBeenCalledTimes(1);
  });

  it("closes on backdrop click but not on a click inside the panel", () => {
    const { container } = render(<SettingsPanel onOpenFile={vi.fn()} />);
    fireEvent.click(container.querySelector(".settings-panel")!);
    expect(settingsPanelOpen.value).toBe(true);

    fireEvent.click(container.querySelector(".modal-overlay")!);
    expect(settingsPanelOpen.value).toBe(false);
  });

  it("closes on the x button", () => {
    const { getByText } = render(<SettingsPanel onOpenFile={vi.fn()} />);
    fireEvent.click(getByText("x"));
    expect(settingsPanelOpen.value).toBe(false);
  });

  it("Change Folder routes through the workspace-profile picker flow", async () => {
    vi.mocked(addWorkspaceFromPicker).mockResolvedValue(undefined);
    const { container } = render(<SettingsPanel onOpenFile={vi.fn()} />);
    // Find the "Change Folder" button by text content
    const buttons = container.querySelectorAll("button");
    const folderBtn = Array.from(buttons).find(
      (b) => b.textContent?.trim() === "Change Folder",
    );
    expect(folderBtn).toBeTruthy();
    await fireEvent.click(folderBtn!);
    await Promise.resolve();
    expect(addWorkspaceFromPicker).toHaveBeenCalledTimes(1);
  });

  it("hides workspace-scoped rows (delete behavior, font size, zoom, view mode) with no workspace open", () => {
    const { queryByText } = render(<SettingsPanel onOpenFile={vi.fn()} />);
    expect(queryByText("Delete behavior")).toBeNull();
    expect(queryByText("Font size")).toBeNull();
    expect(queryByText("Zoom")).toBeNull();
    expect(queryByText("Default view mode")).toBeNull();
    expect(queryByText("Paste images as attachments")).toBeNull();
    expect(queryByText("Attachments folder")).toBeNull();
    expect(queryByText("Frontmatter properties panel")).toBeNull();
    expect(queryByText("Tags")).toBeNull();
    expect(queryByText("Templates")).toBeNull();
    expect(queryByText("Templates folder")).toBeNull();
  });

  it("shows and wires the delete behavior switch once a workspace is open", () => {
    workspacePath.value = "/vault";
    const { getByText } = render(<SettingsPanel onOpenFile={vi.fn()} />);
    const permanent = getByText("Permanent");
    expect(permanent.className).not.toContain("active");
    fireEvent.click(permanent);
    expect(updateWorkspaceSettings).toHaveBeenCalledWith({
      deleteBehavior: "permanent",
    });
  });

  it("marks the current delete behavior as active", () => {
    workspacePath.value = "/vault";
    workspaceSettings.value = {
      ...DEFAULT_WORKSPACE_SETTINGS,
      deleteBehavior: "permanent",
    };
    const { getByText } = render(<SettingsPanel onOpenFile={vi.fn()} />);
    expect(getByText("Permanent").className).toContain("active");
    expect(getByText("Project Trash").className).not.toContain("active");
  });

  it("theme switch is always visible and calls setTheme with the clicked option", () => {
    const { getByText, getByRole } = render(<SettingsPanel onOpenFile={vi.fn()} />);
    openCategory(getByRole, "Appearance");
    expect(getByText("Follow System").className).toContain("active");
    fireEvent.click(getByText("Dark"));
    expect(setTheme).toHaveBeenCalledWith("dark");
  });

  it("clamps an out-of-range font size before saving it", () => {
    workspacePath.value = "/vault";
    const { container, getByRole } = render(<SettingsPanel onOpenFile={vi.fn()} />);
    openCategory(getByRole, "Appearance");
    const inputs = container.querySelectorAll('input[type="number"]');
    const fontInput = inputs[0] as HTMLInputElement;
    fireEvent.input(fontInput, { target: { value: "999" } });
    expect(updateWorkspaceSettings).toHaveBeenCalledWith({ fontSize: 24 });
  });

  it("clamps an out-of-range zoom value before saving it", () => {
    workspacePath.value = "/vault";
    const { container, getByRole } = render(<SettingsPanel onOpenFile={vi.fn()} />);
    openCategory(getByRole, "Appearance");
    const inputs = container.querySelectorAll('input[type="number"]');
    const zoomInput = inputs[1] as HTMLInputElement;
    fireEvent.input(zoomInput, { target: { value: "5" } });
    expect(updateWorkspaceSettings).toHaveBeenCalledWith({ uiZoom: 50 });
  });

  it("shows and wires the paste-images-as-attachments switch", () => {
    workspacePath.value = "/vault";
    workspaceSettings.value = {
      ...DEFAULT_WORKSPACE_SETTINGS,
      pasteImagesEnabled: true,
    };
    const { getByText } = render(<SettingsPanel onOpenFile={vi.fn()} />);
    const row = getByText("Paste images as attachments").closest(
      ".settings-row",
    ) as HTMLElement;
    expect(within(row).getByText("On").className).toContain("active");
    fireEvent.click(within(row).getByText("Off"));
    expect(updateWorkspaceSettings).toHaveBeenCalledWith({
      pasteImagesEnabled: false,
    });
  });

  it("shows and wires the heading links switch", () => {
    workspacePath.value = "/vault";
    workspaceSettings.value = {
      ...DEFAULT_WORKSPACE_SETTINGS,
      headingLinksEnabled: true,
    };
    const { getByText } = render(<SettingsPanel onOpenFile={vi.fn()} />);
    const row = getByText("Heading links").closest(".settings-row") as HTMLElement;
    expect(within(row).getByText("On").className).toContain("active");
    fireEvent.click(within(row).getByText("Off"));
    expect(updateWorkspaceSettings).toHaveBeenCalledWith({
      headingLinksEnabled: false,
    });
  });

  it("wires the attachments folder text input", () => {
    workspacePath.value = "/vault";
    const { getByPlaceholderText } = render(<SettingsPanel onOpenFile={vi.fn()} />);
    const input = getByPlaceholderText("next to the note") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "attachments" } });
    expect(updateWorkspaceSettings).toHaveBeenCalledWith({
      attachmentsFolder: "attachments",
    });
  });

  it("wires the capture inbox folder text input", () => {
    workspacePath.value = "/vault";
    const { getByPlaceholderText } = render(<SettingsPanel onOpenFile={vi.fn()} />);
    const input = getByPlaceholderText("Inbox folder") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "Captures" } });
    expect(updateWorkspaceSettings).toHaveBeenCalledWith({
      captureInboxFolder: "Captures",
    });
  });

  it("wires the capture inbox note text input", () => {
    workspacePath.value = "/vault";
    const { getByPlaceholderText } = render(<SettingsPanel onOpenFile={vi.fn()} />);
    const input = getByPlaceholderText("Inbox note path") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "Notes/Inbox.md" } });
    expect(updateWorkspaceSettings).toHaveBeenCalledWith({
      captureInboxNote: "Notes/Inbox.md",
    });
  });

  it("shows and wires the frontmatter properties panel switch", () => {
    workspacePath.value = "/vault";
    workspaceSettings.value = {
      ...DEFAULT_WORKSPACE_SETTINGS,
      frontmatterPropertiesEnabled: true,
    };
    const { getByText } = render(<SettingsPanel onOpenFile={vi.fn()} />);
    const row = getByText("Frontmatter properties panel").closest(
      ".settings-row",
    ) as HTMLElement;
    expect(within(row).getByText("On").className).toContain("active");
    fireEvent.click(within(row).getByText("Off"));
    expect(updateWorkspaceSettings).toHaveBeenCalledWith({
      frontmatterPropertiesEnabled: false,
    });
  });

  it("shows and wires the tags switch", () => {
    workspacePath.value = "/vault";
    workspaceSettings.value = {
      ...DEFAULT_WORKSPACE_SETTINGS,
      tagsEnabled: true,
    };
    const { getByText, getByRole } = render(<SettingsPanel onOpenFile={vi.fn()} />);
    openCategory(getByRole, "Features");
    const row = getByText("Tags").closest(".settings-row") as HTMLElement;
    expect(within(row).getByText("On").className).toContain("active");
    fireEvent.click(within(row).getByText("Off"));
    expect(updateWorkspaceSettings).toHaveBeenCalledWith({
      tagsEnabled: false,
    });
  });

  it("shows and wires the templates switch", () => {
    workspacePath.value = "/vault";
    workspaceSettings.value = {
      ...DEFAULT_WORKSPACE_SETTINGS,
      templatesEnabled: true,
    };
    const { getByText, getByRole } = render(<SettingsPanel onOpenFile={vi.fn()} />);
    openCategory(getByRole, "Features");
    const row = getByText("Templates").closest(".settings-row") as HTMLElement;
    expect(within(row).getByText("On").className).toContain("active");
    fireEvent.click(within(row).getByText("Off"));
    expect(updateWorkspaceSettings).toHaveBeenCalledWith({
      templatesEnabled: false,
    });
  });

  it("wires the templates folder text input", () => {
    workspacePath.value = "/vault";
    const { getByPlaceholderText } = render(<SettingsPanel onOpenFile={vi.fn()} />);
    const input = getByPlaceholderText("Templates") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "Notes/Templates" } });
    expect(updateWorkspaceSettings).toHaveBeenCalledWith({
      templatesFolder: "Notes/Templates",
    });
  });

  describe("Feature selection (Collections off by default, 2026-09-03)", () => {
    it("groups Accent themes, Editor snippets, Canvas, Tags, Templates, and Collections under their own section, not General", () => {
      workspacePath.value = "/vault";
      const { getByText, getByRole, queryByText } = render(<SettingsPanel onOpenFile={vi.fn()} />);
      openCategory(getByRole, "Features");
      const featureSection = getByText("Feature selection").closest(".settings-section") as HTMLElement;
      for (const label of ["Accent themes", "Editor snippets", "Canvas", "Tags", "Templates", "Collections"]) {
        expect(within(featureSection).getByText(label)).toBeTruthy();
      }
      // Switching to General (Features' own section, and everything in it,
      // stops rendering entirely now that only one category shows at a
      // time) is a more direct proof these labels belong to Features alone
      // than searching within a specific General DOM subtree ever was.
      openCategory(getByRole, "General");
      expect(queryByText("Feature selection")).toBeNull();
      expect(queryByText("Collections")).toBeNull();
      expect(queryByText("Tags")).toBeNull();
    });

    it("shows and wires the collections switch, off by default", () => {
      workspacePath.value = "/vault";
      workspaceSettings.value = { ...DEFAULT_WORKSPACE_SETTINGS, collectionsEnabled: false };
      const { getByText, getByRole } = render(<SettingsPanel onOpenFile={vi.fn()} />);
      openCategory(getByRole, "Features");
      const row = getByText("Collections").closest(".settings-row") as HTMLElement;
      expect(within(row).getByText("Off").className).toContain("active");
      fireEvent.click(within(row).getByText("On"));
      expect(updateWorkspaceSettings).toHaveBeenCalledWith({
        collectionsEnabled: true,
      });
    });

    it("DEFAULT_WORKSPACE_SETTINGS defaults collectionsEnabled to false, unlike every other feature flag", () => {
      expect(DEFAULT_WORKSPACE_SETTINGS.collectionsEnabled).toBe(false);
    });

    it("gives each Feature selection row's description the italic hint class", () => {
      workspacePath.value = "/vault";
      const { getByText, getByRole } = render(<SettingsPanel onOpenFile={vi.fn()} />);
      openCategory(getByRole, "Features");
      const hint = getByText("Group notes by a saved search or a manual list, in their own panel. Off by default");
      expect(hint.className).toContain("settings-hint-italic");
    });
  });

  describe("Speech-to-text dictation (off by default, 2026-09-15)", () => {
    it("DEFAULT_WORKSPACE_SETTINGS defaults speechToTextEnabled to false, so no native speech API is touched until opted in", () => {
      expect(DEFAULT_WORKSPACE_SETTINGS.speechToTextEnabled).toBe(false);
    });

    it("shows and wires the speech-to-text switch, off by default", () => {
      workspacePath.value = "/vault";
      workspaceSettings.value = { ...DEFAULT_WORKSPACE_SETTINGS, speechToTextEnabled: false };
      const { getByText } = render(<SettingsPanel onOpenFile={vi.fn()} />);
      const row = getByText("Speech-to-text dictation").closest(".settings-row") as HTMLElement;
      expect(within(row).getByText("Off").className).toContain("active");
      fireEvent.click(within(row).getByText("On"));
      expect(updateWorkspaceSettings).toHaveBeenCalledWith({
        speechToTextEnabled: true,
      });
    });

    it("marks On active once the setting is enabled", () => {
      workspacePath.value = "/vault";
      workspaceSettings.value = { ...DEFAULT_WORKSPACE_SETTINGS, speechToTextEnabled: true };
      const { getByText } = render(<SettingsPanel onOpenFile={vi.fn()} />);
      const row = getByText("Speech-to-text dictation").closest(".settings-row") as HTMLElement;
      expect(within(row).getByText("On").className).toContain("active");
    });
  });

  describe("Open Markdown files from outside your workspace (OS file association)", () => {
    it("shows and wires the switch, visible with no workspace open, on by default", () => {
      workspacePath.value = null;
      externalFileOpenEnabled.value = true;
      const { getByText } = render(<SettingsPanel onOpenFile={vi.fn()} />);
      const row = getByText("Open Markdown files from outside your workspace").closest(
        ".settings-row",
      ) as HTMLElement;
      expect(within(row).getByText("On").className).toContain("active");
      fireEvent.click(within(row).getByText("Off"));
      expect(setExternalFileOpenEnabled).toHaveBeenCalledWith(false);
    });

    it("marks Off active once the setting is disabled", () => {
      externalFileOpenEnabled.value = false;
      const { getByText } = render(<SettingsPanel onOpenFile={vi.fn()} />);
      const row = getByText("Open Markdown files from outside your workspace").closest(
        ".settings-row",
      ) as HTMLElement;
      expect(within(row).getByText("Off").className).toContain("active");
    });
  });

  it("wires the default view mode switch and marks the active option", () => {
    workspacePath.value = "/vault";
    workspaceSettings.value = {
      ...DEFAULT_WORKSPACE_SETTINGS,
      defaultViewMode: "split",
    };
    const { getByText, getByRole } = render(<SettingsPanel onOpenFile={vi.fn()} />);
    openCategory(getByRole, "Appearance");
    expect(getByText("Split").className).toContain("active");
    fireEvent.click(getByText("Preview"));
    expect(updateWorkspaceSettings).toHaveBeenCalledWith({
      defaultViewMode: "preview",
    });
  });

  it("lists the keyboard shortcuts, always, regardless of whether a workspace is open", () => {
    const { getByText, getByRole } = render(<SettingsPanel onOpenFile={vi.fn()} />);
    openCategory(getByRole, "Shortcuts");
    expect(getByText("Ctrl+K")).toBeTruthy();
    expect(getByText("Command palette")).toBeTruthy();
    expect(getByText("Ctrl+,")).toBeTruthy();
  });

  it("shows the app version, or a placeholder while it's still loading", () => {
    const { getByText, getByRole, rerender } = render(<SettingsPanel onOpenFile={vi.fn()} />);
    openCategory(getByRole, "About");
    expect(getByText("...")).toBeTruthy();

    appVersion.value = "1.2.3";
    rerender(<SettingsPanel onOpenFile={vi.fn()} />);
    expect(getByText("1.2.3")).toBeTruthy();
  });

  it("opens the license view and closes it independently of the settings panel", () => {
    const { getByText, getByRole, container } = render(<SettingsPanel onOpenFile={vi.fn()} />);
    openCategory(getByRole, "About");
    fireEvent.click(getByText("View License"));
    expect(container.querySelector(".license-viewer")).toBeTruthy();

    fireEvent.click(
      getByText("x", { selector: ".license-viewer .modal-close" }),
    );
    expect(container.querySelector(".license-viewer")).toBeNull();
    expect(settingsPanelOpen.value).toBe(true);
  });

  it("clicking the license dialog's own backdrop closes only the license view, not the whole settings panel", () => {
    const { getByText, getByRole, container } = render(<SettingsPanel onOpenFile={vi.fn()} />);
    openCategory(getByRole, "About");
    fireEvent.click(getByText("View License"));

    const overlays = container.querySelectorAll(".modal-overlay");
    expect(overlays.length).toBe(2);
    const licenseOverlay = overlays[1];
    fireEvent.click(licenseOverlay);

    expect(container.querySelector(".license-viewer")).toBeNull();
    expect(settingsPanelOpen.value).toBe(true);
  });

  describe("search (competitor-queued 2026-09-03)", () => {
    it("shows only the active category (General) when the search box is empty", () => {
      const { getByText, queryByText } = render(<SettingsPanel onOpenFile={vi.fn()} />);
      expect(getByText("Root folder")).toBeTruthy();
      // UX-01 spec 16.1: categorized Settings shows one category at a
      // time by default now; Theme/Version live in Appearance/About, not
      // General, so an empty search no longer means "every setting" the
      // way it did before category navigation existed.
      expect(queryByText("Theme")).toBeNull();
      expect(queryByText("Version")).toBeNull();
    });

    it("a non-empty search overrides category selection and shows matches from every category", () => {
      const { getByLabelText, getByText } = render(<SettingsPanel onOpenFile={vi.fn()} />);
      const search = getByLabelText("Search settings") as HTMLInputElement;
      fireEvent.input(search, { target: { value: "version" } });
      expect(getByText("Version")).toBeTruthy();
    });

    it("filters rows by label text as the user types", () => {
      const { getByLabelText, getByText, queryByText } = render(<SettingsPanel onOpenFile={vi.fn()} />);
      const search = getByLabelText("Search settings") as HTMLInputElement;
      fireEvent.input(search, { target: { value: "theme" } });
      expect(getByText("Theme")).toBeTruthy();
      expect(queryByText("Version")).toBeNull();
      expect(queryByText("Keyboard shortcuts")).toBeNull();
    });

    it("matches a row by its hint text even when the label itself doesn't match", () => {
      workspacePath.value = "/vault";
      const { getByLabelText, getByText } = render(<SettingsPanel onOpenFile={vi.fn()} />);
      const search = getByLabelText("Search settings") as HTMLInputElement;
      // "Heading links"'s own hint text mentions "click navigation", which
      // doesn't appear in its label at all.
      fireEvent.input(search, { target: { value: "click navigation" } });
      expect(getByText("Heading links")).toBeTruthy();
    });

    it("filters keyboard shortcuts by description", () => {
      const { getByLabelText, getByText, queryByText } = render(<SettingsPanel onOpenFile={vi.fn()} />);
      const search = getByLabelText("Search settings") as HTMLInputElement;
      fireEvent.input(search, { target: { value: "command palette" } });
      expect(getByText("Command palette")).toBeTruthy();
      expect(queryByText("Theme")).toBeNull();
    });

    it("hides a section's own header once none of its rows match", () => {
      const { getByLabelText, queryByText } = render(<SettingsPanel onOpenFile={vi.fn()} />);
      const search = getByLabelText("Search settings") as HTMLInputElement;
      fireEvent.input(search, { target: { value: "theme" } });
      // Only "Appearance" (Theme) should remain; "About" has no match.
      expect(queryByText("About")).toBeNull();
    });

    it("shows a 'no settings match' message when the query matches nothing at all", () => {
      const { getByLabelText, getByText } = render(<SettingsPanel onOpenFile={vi.fn()} />);
      const search = getByLabelText("Search settings") as HTMLInputElement;
      fireEvent.input(search, { target: { value: "xyznonexistent" } });
      expect(getByText('No settings match "xyznonexistent".')).toBeTruthy();
    });

    it("never hides an active save-error or corrupted-settings alert, regardless of the search query", () => {
      workspaceSettingsSaveError.value = "Could not save settings.";
      const { getByLabelText, getByText } = render(<SettingsPanel onOpenFile={vi.fn()} />);
      const search = getByLabelText("Search settings") as HTMLInputElement;
      fireEvent.input(search, { target: { value: "xyznonexistent" } });
      expect(getByText("Could not save settings.")).toBeTruthy();
    });

    it("the search box itself stays visible no matter what is typed into it", () => {
      const { getByLabelText } = render(<SettingsPanel onOpenFile={vi.fn()} />);
      const search = getByLabelText("Search settings") as HTMLInputElement;
      fireEvent.input(search, { target: { value: "xyznonexistent" } });
      expect(getByLabelText("Search settings")).toBeTruthy();
    });
  });

  describe("Health section: Link Diagnostics, moved off the main screen (2026-09-03)", () => {
    it("shows a Health section with Link Diagnostics once a workspace is open", () => {
      workspacePath.value = "/vault";
      const { getByText, getByRole } = render(<SettingsPanel onOpenFile={vi.fn()} />);
      expect(getByText("Health")).toBeTruthy();
      openCategory(getByRole, "Health");
      expect(getByText("Mock diagnostic row")).toBeTruthy();
    });

    it("hides the Health section entirely with no workspace open", () => {
      const { queryByText } = render(<SettingsPanel onOpenFile={vi.fn()} />);
      expect(queryByText("Health")).toBeNull();
    });

    it("selecting a diagnostic opens its note, closes the settings panel, and switches out of preview mode", async () => {
      workspacePath.value = "/vault";
      viewMode.value = "preview";
      const onOpenFile = vi.fn();
      const { getByText, getByRole } = render(<SettingsPanel onOpenFile={onOpenFile} />);
      openCategory(getByRole, "Health");

      fireEvent.click(getByText("Mock diagnostic row"));
      await Promise.resolve();

      expect(onOpenFile).toHaveBeenCalledWith("/vault/broken.md", "broken.md");
      expect(settingsPanelOpen.value).toBe(false);
      expect(viewMode.value).toBe("split");
    });
  });

  describe("UX-01 spec section 16.1: categorized left-nav Settings", () => {
    it("shows General by default and nothing from other categories", () => {
      workspacePath.value = "/vault";
      const { getByText, queryByText } = render(<SettingsPanel onOpenFile={vi.fn()} />);
      expect(getByText("Root folder")).toBeTruthy();
      expect(queryByText("Feature selection")).toBeNull();
      expect(queryByText("Keyboard shortcuts")).toBeNull();
    });

    it("only lists a category's nav button when that category actually has something to show", () => {
      // No workspace open: Health, Workspace Profiles, and General's own
      // workspace-scoped rows all have nothing to show, but Appearance's
      // Theme and Shortcuts/About are workspace-independent.
      const { queryByRole } = render(<SettingsPanel onOpenFile={vi.fn()} />);
      expect(queryByRole("button", { name: "Health" })).toBeNull();
      expect(queryByRole("button", { name: "Appearance" })).toBeTruthy();
      expect(queryByRole("button", { name: "Shortcuts" })).toBeTruthy();
      expect(queryByRole("button", { name: "About" })).toBeTruthy();
    });

    it("switches the visible section when a different category is selected, and marks it current", () => {
      workspacePath.value = "/vault";
      const { getByText, getByRole, queryByText } = render(<SettingsPanel onOpenFile={vi.fn()} />);

      openCategory(getByRole, "Shortcuts");

      expect(queryByText("Root folder")).toBeNull();
      expect(getByText("Keyboard shortcuts")).toBeTruthy();
      expect(getByRole("button", { name: "Shortcuts" }).getAttribute("aria-current")).toBe("true");
      expect(getByRole("button", { name: "General" }).getAttribute("aria-current")).toBeNull();
    });

    it("keeps only one category's nav button marked active at a time", () => {
      workspacePath.value = "/vault";
      const { getByRole } = render(<SettingsPanel onOpenFile={vi.fn()} />);

      expect(getByRole("button", { name: "General" }).className).toContain("active");

      openCategory(getByRole, "Appearance");

      expect(getByRole("button", { name: "Appearance" }).className).toContain("active");
      expect(getByRole("button", { name: "General" }).className).not.toContain("active");
    });
  });

  // App.css's own `max-width: 720px` media query is what actually makes
  // any of this visible (jsdom doesn't evaluate real CSS media queries,
  // so these tests exercise the underlying state/class toggling that
  // query reads, not literal pixel visibility -- see App.css's and
  // SettingsPanel.tsx's own compactDetailOpen doc comments for why no
  // JS-side viewport-width check is involved at all).
  describe("UX-01 spec section 16.2: compact category-list-then-detail Settings", () => {
    it("starts on the landing page (no compact-detail class) when Settings opens", () => {
      workspacePath.value = "/vault";
      const { container } = render(<SettingsPanel onOpenFile={vi.fn()} />);

      expect(container.querySelector(".settings-body")?.className).not.toContain(
        "settings-body--compact-detail",
      );
    });

    it("selecting a category switches to the compact-detail state", () => {
      workspacePath.value = "/vault";
      const { container, getByRole } = render(<SettingsPanel onOpenFile={vi.fn()} />);

      openCategory(getByRole, "Appearance");

      expect(container.querySelector(".settings-body")?.className).toContain(
        "settings-body--compact-detail",
      );
    });

    it("clicking Back returns to the landing page and clears the search query", () => {
      workspacePath.value = "/vault";
      const { container, getByRole, getByPlaceholderText } = render(
        <SettingsPanel onOpenFile={vi.fn()} />,
      );
      openCategory(getByRole, "Appearance");
      const searchInput = getByPlaceholderText("Search settings…") as HTMLInputElement;
      fireEvent.input(searchInput, { target: { value: "theme" } });

      fireEvent.click(container.querySelector(".settings-compact-back")!);

      expect(container.querySelector(".settings-body")?.className).not.toContain(
        "settings-body--compact-detail",
      );
      expect(searchInput.value).toBe("");
    });

    it("typing a search query switches to the compact-detail state without selecting a category first", () => {
      workspacePath.value = "/vault";
      const { container, getByPlaceholderText } = render(<SettingsPanel onOpenFile={vi.fn()} />);

      fireEvent.input(getByPlaceholderText("Search settings…"), { target: { value: "theme" } });

      expect(container.querySelector(".settings-body")?.className).toContain(
        "settings-body--compact-detail",
      );
    });

    it("resets to the landing page the next time Settings is reopened", () => {
      workspacePath.value = "/vault";
      const { container, getByRole, rerender } = render(<SettingsPanel onOpenFile={vi.fn()} />);
      openCategory(getByRole, "Appearance");
      expect(container.querySelector(".settings-body")?.className).toContain(
        "settings-body--compact-detail",
      );

      settingsPanelOpen.value = false;
      rerender(<SettingsPanel onOpenFile={vi.fn()} />);
      settingsPanelOpen.value = true;
      rerender(<SettingsPanel onOpenFile={vi.fn()} />);

      expect(container.querySelector(".settings-body")?.className).not.toContain(
        "settings-body--compact-detail",
      );
    });
  });

  describe("Saving indicator (2026-09-04)", () => {
    it("shows a Saving… status in the header while workspaceSettingsSaving is true", () => {
      workspacePath.value = "/vault";
      workspaceSettingsSaving.value = true;
      const { getByRole } = render(<SettingsPanel onOpenFile={vi.fn()} />);
      expect(getByRole("status").textContent).toContain("Saving");
    });

    it("shows no Saving… status when nothing is writing", () => {
      workspacePath.value = "/vault";
      workspaceSettingsSaving.value = false;
      const { queryByRole } = render(<SettingsPanel onOpenFile={vi.fn()} />);
      expect(queryByRole("status")).toBeNull();
    });
  });
});
