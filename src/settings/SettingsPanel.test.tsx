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
  workspacePath: signal<string | null>(null),
  workspaceSettingsCorrupted: signal(false),
  workspaceSettingsSaveError: signal<string | null>(null),
  workspaceSettings: signal(DEFAULT_WORKSPACE_SETTINGS),
}));
vi.mock("../workspace/tauriBridge", () => ({
  getWorkspaceStats: vi.fn(),
}));
vi.mock("./VaultStatsPanel", () => ({
  VaultStatsPanel: () => null,
}));
// Profile-management behavior has its own focused tests. Here a small stand-in
// keeps the long-standing SettingsPanel suite focused on its existing controls
// while still asserting that the new section replaced the legacy switch path.
vi.mock("./WorkspaceProfilesSettings", () => ({
  WorkspaceProfilesSettings: () => <section><h3>Workspace profiles</h3></section>,
}));

import { SettingsPanel } from "./SettingsPanel";
import {
  addWorkspaceFromPicker,
  appVersion,
  settingsPanelOpen,
  setTheme,
  repairWorkspaceSettingsFile,
  retryWorkspaceSettingsSave,
  theme,
  updateWorkspaceSettings,
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
  vi.mocked(setTheme).mockReset();
  vi.mocked(addWorkspaceFromPicker).mockReset();
  vi.mocked(updateWorkspaceSettings).mockReset();
  vi.mocked(retryWorkspaceSettingsSave).mockReset();
  vi.mocked(repairWorkspaceSettingsFile).mockReset();
  workspaceSettingsSaveError.value = null;
  workspaceSettingsCorrupted.value = false;
});

describe("SettingsPanel", () => {
  it("renders nothing when the panel is closed", () => {
    settingsPanelOpen.value = false;
    const { container } = render(<SettingsPanel />);
    expect(container.querySelector(".settings-panel")).toBeNull();
  });

  it("shows profile management and removes the legacy Change Folder path", () => {
    const { getByText, queryByText } = render(<SettingsPanel />);
    expect(getByText("Workspace profiles")).toBeTruthy();
    expect(queryByText("Change Folder")).toBeNull();
    expect(queryByText("Root folder")).toBeNull();
  });

  it("shows nothing about corrupted settings when the file decoded cleanly", () => {
    const { queryByText } = render(<SettingsPanel />);
    expect(queryByText("Settings file had invalid data")).toBeNull();
  });

  it("shows a corruption notice and a repair button when the settings file didn't fully decode", () => {
    workspaceSettingsCorrupted.value = true;
    const { getByText } = render(<SettingsPanel />);
    expect(getByText("Settings file had invalid data")).toBeTruthy();
    const button = getByText("Rewrite settings file");
    fireEvent.click(button);
    expect(repairWorkspaceSettingsFile).toHaveBeenCalledTimes(1);
  });

  it("closes on backdrop click but not on a click inside the panel", () => {
    const { container } = render(<SettingsPanel />);
    fireEvent.click(container.querySelector(".settings-panel")!);
    expect(settingsPanelOpen.value).toBe(true);

    fireEvent.click(container.querySelector(".modal-overlay")!);
    expect(settingsPanelOpen.value).toBe(false);
  });

  it("closes on the x button", () => {
    const { getByText } = render(<SettingsPanel />);
    fireEvent.click(getByText("x"));
    expect(settingsPanelOpen.value).toBe(false);
  });

  it("hides workspace-scoped rows (delete behavior, font size, zoom, view mode) with no workspace open", () => {
    const { queryByText } = render(<SettingsPanel />);
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
    const { getByText } = render(<SettingsPanel />);
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
    const { getByText } = render(<SettingsPanel />);
    expect(getByText("Permanent").className).toContain("active");
    expect(getByText("Project Trash").className).not.toContain("active");
  });

  it("theme switch is always visible and calls setTheme with the clicked option", () => {
    const { getByText } = render(<SettingsPanel />);
    expect(getByText("Follow System").className).toContain("active");
    fireEvent.click(getByText("Dark"));
    expect(setTheme).toHaveBeenCalledWith("dark");
  });

  it("clamps an out-of-range font size before saving it", () => {
    workspacePath.value = "/vault";
    const { container } = render(<SettingsPanel />);
    const inputs = container.querySelectorAll('input[type="number"]');
    const fontInput = inputs[0] as HTMLInputElement;
    fireEvent.input(fontInput, { target: { value: "999" } });
    expect(updateWorkspaceSettings).toHaveBeenCalledWith({ fontSize: 24 });
  });

  it("clamps an out-of-range zoom value before saving it", () => {
    workspacePath.value = "/vault";
    const { container } = render(<SettingsPanel />);
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
    const { getByText } = render(<SettingsPanel />);
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
    const { getByText } = render(<SettingsPanel />);
    const row = getByText("Heading links").closest(".settings-row") as HTMLElement;
    expect(within(row).getByText("On").className).toContain("active");
    fireEvent.click(within(row).getByText("Off"));
    expect(updateWorkspaceSettings).toHaveBeenCalledWith({
      headingLinksEnabled: false,
    });
  });

  it("wires the attachments folder text input", () => {
    workspacePath.value = "/vault";
    const { getByPlaceholderText } = render(<SettingsPanel />);
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
    const { getByText } = render(<SettingsPanel />);
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
    const { getByText } = render(<SettingsPanel />);
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
    const { getByText } = render(<SettingsPanel />);
    const row = getByText("Templates").closest(".settings-row") as HTMLElement;
    expect(within(row).getByText("On").className).toContain("active");
    fireEvent.click(within(row).getByText("Off"));
    expect(updateWorkspaceSettings).toHaveBeenCalledWith({
      templatesEnabled: false,
    });
  });

  it("wires the templates folder text input", () => {
    workspacePath.value = "/vault";
    const { getByPlaceholderText } = render(<SettingsPanel />);
    const input = getByPlaceholderText("Templates") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "Notes/Templates" } });
    expect(updateWorkspaceSettings).toHaveBeenCalledWith({
      templatesFolder: "Notes/Templates",
    });
  });

  it("wires the default view mode switch and marks the active option", () => {
    workspacePath.value = "/vault";
    workspaceSettings.value = {
      ...DEFAULT_WORKSPACE_SETTINGS,
      defaultViewMode: "split",
    };
    const { getByText } = render(<SettingsPanel />);
    expect(getByText("Split").className).toContain("active");
    fireEvent.click(getByText("Preview"));
    expect(updateWorkspaceSettings).toHaveBeenCalledWith({
      defaultViewMode: "preview",
    });
  });

  it("lists the keyboard shortcuts, always, regardless of whether a workspace is open", () => {
    const { getByText } = render(<SettingsPanel />);
    expect(getByText("Ctrl+K")).toBeTruthy();
    expect(getByText("Command palette")).toBeTruthy();
    expect(getByText("Ctrl+,")).toBeTruthy();
  });

  it("shows the app version, or a placeholder while it's still loading", () => {
    const { getByText, rerender } = render(<SettingsPanel />);
    expect(getByText("...")).toBeTruthy();

    appVersion.value = "1.2.3";
    rerender(<SettingsPanel />);
    expect(getByText("1.2.3")).toBeTruthy();
  });

  it("opens the license view and closes it independently of the settings panel", () => {
    const { getByText, container } = render(<SettingsPanel />);
    fireEvent.click(getByText("View License"));
    expect(container.querySelector(".license-viewer")).toBeTruthy();

    fireEvent.click(
      getByText("x", { selector: ".license-viewer .modal-close" }),
    );
    expect(container.querySelector(".license-viewer")).toBeNull();
    expect(settingsPanelOpen.value).toBe(true);
  });

  it("clicking the license dialog's own backdrop closes only the license view, not the whole settings panel", () => {
    const { getByText, container } = render(<SettingsPanel />);
    fireEvent.click(getByText("View License"));

    const overlays = container.querySelectorAll(".modal-overlay");
    expect(overlays.length).toBe(2);
    const licenseOverlay = overlays[1];
    fireEvent.click(licenseOverlay);

    expect(container.querySelector(".license-viewer")).toBeNull();
    expect(settingsPanelOpen.value).toBe(true);
  });
});
