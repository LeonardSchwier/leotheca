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
  settingsPanelOpen: signal(true),
  setTheme: vi.fn(),
  repairWorkspaceSettingsFile: vi.fn(),
  retryWorkspaceSettingsSave: vi.fn(),
  theme: signal<ThemePreference>("system"),
  updateWorkspaceSettings: vi.fn(),
  viewMode: signal("source"),
  workspacePath: signal<string | null>(null),
  workspaceSettingsCorrupted: signal(false),
  workspaceSettingsSaveError: signal<string | null>(null),
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

afterEach(() => {
  cleanup();
  settingsPanelOpen.value = true;
  workspacePath.value = null;
  workspaceSettings.value = DEFAULT_WORKSPACE_SETTINGS;
  theme.value = "system";
  appVersion.value = "";
  viewMode.value = "source";
  vi.mocked(setTheme).mockReset();
  vi.mocked(addWorkspaceFromPicker).mockReset();
  vi.mocked(updateWorkspaceSettings).mockReset();
  vi.mocked(retryWorkspaceSettingsSave).mockReset();
  vi.mocked(repairWorkspaceSettingsFile).mockReset();
  workspaceSettingsSaveError.value = null;
  workspaceSettingsCorrupted.value = false;
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
    const { getByText } = render(<SettingsPanel onOpenFile={vi.fn()} />);
    expect(getByText("Follow System").className).toContain("active");
    fireEvent.click(getByText("Dark"));
    expect(setTheme).toHaveBeenCalledWith("dark");
  });

  it("clamps an out-of-range font size before saving it", () => {
    workspacePath.value = "/vault";
    const { container } = render(<SettingsPanel onOpenFile={vi.fn()} />);
    const inputs = container.querySelectorAll('input[type="number"]');
    const fontInput = inputs[0] as HTMLInputElement;
    fireEvent.input(fontInput, { target: { value: "999" } });
    expect(updateWorkspaceSettings).toHaveBeenCalledWith({ fontSize: 24 });
  });

  it("clamps an out-of-range zoom value before saving it", () => {
    workspacePath.value = "/vault";
    const { container } = render(<SettingsPanel onOpenFile={vi.fn()} />);
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
    const { getByText } = render(<SettingsPanel onOpenFile={vi.fn()} />);
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
    const { getByText } = render(<SettingsPanel onOpenFile={vi.fn()} />);
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
      const { getByText } = render(<SettingsPanel onOpenFile={vi.fn()} />);
      const featureSection = getByText("Feature selection").closest(".settings-section") as HTMLElement;
      for (const label of ["Accent themes", "Editor snippets", "Canvas", "Tags", "Templates", "Collections"]) {
        expect(within(featureSection).getByText(label)).toBeTruthy();
      }
      const generalSection = getByText("General").closest(".settings-section") as HTMLElement;
      expect(within(generalSection).queryByText("Collections")).toBeNull();
      expect(within(generalSection).queryByText("Tags")).toBeNull();
    });

    it("shows and wires the collections switch, off by default", () => {
      workspacePath.value = "/vault";
      workspaceSettings.value = { ...DEFAULT_WORKSPACE_SETTINGS, collectionsEnabled: false };
      const { getByText } = render(<SettingsPanel onOpenFile={vi.fn()} />);
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
      const { getByText } = render(<SettingsPanel onOpenFile={vi.fn()} />);
      const hint = getByText("Group notes by a saved search or a manual list, in their own panel. Off by default");
      expect(hint.className).toContain("settings-hint-italic");
    });
  });

  it("wires the default view mode switch and marks the active option", () => {
    workspacePath.value = "/vault";
    workspaceSettings.value = {
      ...DEFAULT_WORKSPACE_SETTINGS,
      defaultViewMode: "split",
    };
    const { getByText } = render(<SettingsPanel onOpenFile={vi.fn()} />);
    expect(getByText("Split").className).toContain("active");
    fireEvent.click(getByText("Preview"));
    expect(updateWorkspaceSettings).toHaveBeenCalledWith({
      defaultViewMode: "preview",
    });
  });

  it("lists the keyboard shortcuts, always, regardless of whether a workspace is open", () => {
    const { getByText } = render(<SettingsPanel onOpenFile={vi.fn()} />);
    expect(getByText("Ctrl+K")).toBeTruthy();
    expect(getByText("Command palette")).toBeTruthy();
    expect(getByText("Ctrl+,")).toBeTruthy();
  });

  it("shows the app version, or a placeholder while it's still loading", () => {
    const { getByText, rerender } = render(<SettingsPanel onOpenFile={vi.fn()} />);
    expect(getByText("...")).toBeTruthy();

    appVersion.value = "1.2.3";
    rerender(<SettingsPanel onOpenFile={vi.fn()} />);
    expect(getByText("1.2.3")).toBeTruthy();
  });

  it("opens the license view and closes it independently of the settings panel", () => {
    const { getByText, container } = render(<SettingsPanel onOpenFile={vi.fn()} />);
    fireEvent.click(getByText("View License"));
    expect(container.querySelector(".license-viewer")).toBeTruthy();

    fireEvent.click(
      getByText("x", { selector: ".license-viewer .modal-close" }),
    );
    expect(container.querySelector(".license-viewer")).toBeNull();
    expect(settingsPanelOpen.value).toBe(true);
  });

  it("clicking the license dialog's own backdrop closes only the license view, not the whole settings panel", () => {
    const { getByText, container } = render(<SettingsPanel onOpenFile={vi.fn()} />);
    fireEvent.click(getByText("View License"));

    const overlays = container.querySelectorAll(".modal-overlay");
    expect(overlays.length).toBe(2);
    const licenseOverlay = overlays[1];
    fireEvent.click(licenseOverlay);

    expect(container.querySelector(".license-viewer")).toBeNull();
    expect(settingsPanelOpen.value).toBe(true);
  });

  describe("search (competitor-queued 2026-09-03)", () => {
    it("shows every setting when the search box is empty", () => {
      const { getByText } = render(<SettingsPanel onOpenFile={vi.fn()} />);
      expect(getByText("Theme")).toBeTruthy();
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
      const { getByText } = render(<SettingsPanel onOpenFile={vi.fn()} />);
      expect(getByText("Health")).toBeTruthy();
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
      const { getByText } = render(<SettingsPanel onOpenFile={onOpenFile} />);

      fireEvent.click(getByText("Mock diagnostic row"));
      await Promise.resolve();

      expect(onOpenFile).toHaveBeenCalledWith("/vault/broken.md", "broken.md");
      expect(settingsPanelOpen.value).toBe(false);
      expect(viewMode.value).toBe("split");
    });
  });
});
