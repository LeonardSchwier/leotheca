/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { signal } from "@preact/signals";
import { DEFAULT_WORKSPACE_SETTINGS } from "./workspaceSettings";
import type { ThemePreference } from "./globalConfig";

// store.ts calls window.matchMedia at module load (system-theme detection),
// which jsdom doesn't implement. Mocked out with real signals so the
// component's reactive reads/writes work exactly like the real module,
// without pulling in that side effect.
vi.mock("./store", () => ({
  appVersion: signal(""),
  settingsPanelOpen: signal(true),
  setTheme: vi.fn(),
  setWorkspacePath: vi.fn(),
  theme: signal<ThemePreference>("system"),
  updateWorkspaceSettings: vi.fn(),
  workspacePath: signal<string | null>(null),
  workspaceSettings: signal(DEFAULT_WORKSPACE_SETTINGS),
}));
vi.mock("../workspace/tauriBridge", () => ({
  getWorkspaceStats: vi.fn(),
  pickWorkspaceFolder: vi.fn(),
}));
// Out of scope for this file (its own loadStats/effect behavior); a plain
// stand-in keeps these tests focused on SettingsPanel's own logic.
vi.mock("./VaultStatsPanel", () => ({
  VaultStatsPanel: () => null,
}));

import { SettingsPanel } from "./SettingsPanel";
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
import { pickWorkspaceFolder } from "../workspace/tauriBridge";

afterEach(() => {
  cleanup();
  settingsPanelOpen.value = true;
  workspacePath.value = null;
  workspaceSettings.value = DEFAULT_WORKSPACE_SETTINGS;
  theme.value = "system";
  appVersion.value = "";
  vi.mocked(setTheme).mockReset();
  vi.mocked(setWorkspacePath).mockReset();
  vi.mocked(updateWorkspaceSettings).mockReset();
  vi.mocked(pickWorkspaceFolder).mockReset();
});

describe("SettingsPanel", () => {
  it("renders nothing when the panel is closed", () => {
    settingsPanelOpen.value = false;
    const { container } = render(<SettingsPanel />);
    expect(container.querySelector(".settings-panel")).toBeNull();
  });

  it("shows the workspace path, or a placeholder when none is set", () => {
    const { getByText, rerender } = render(<SettingsPanel />);
    expect(getByText("Not set")).toBeTruthy();

    workspacePath.value = "/home/user/vault";
    rerender(<SettingsPanel />);
    expect(getByText("/home/user/vault")).toBeTruthy();
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

  it("Change Folder opens the picked folder, and does nothing if cancelled", async () => {
    vi.mocked(pickWorkspaceFolder).mockResolvedValue({ path: "/vault", token: "tok" });
    const { getByText } = render(<SettingsPanel />);
    await fireEvent.click(getByText("Change Folder"));
    await Promise.resolve();
    expect(setWorkspacePath).toHaveBeenCalledWith("/vault", "tok");

    vi.mocked(setWorkspacePath).mockClear();
    vi.mocked(pickWorkspaceFolder).mockResolvedValue(null);
    await fireEvent.click(getByText("Change Folder"));
    await Promise.resolve();
    expect(setWorkspacePath).not.toHaveBeenCalled();
  });

  it("hides workspace-scoped rows (delete behavior, font size, zoom, view mode) with no workspace open", () => {
    const { queryByText } = render(<SettingsPanel />);
    expect(queryByText("Delete behavior")).toBeNull();
    expect(queryByText("Font size")).toBeNull();
    expect(queryByText("Zoom")).toBeNull();
    expect(queryByText("Default view mode")).toBeNull();
  });

  it("shows and wires the delete behavior switch once a workspace is open", () => {
    workspacePath.value = "/vault";
    const { getByText } = render(<SettingsPanel />);
    const permanent = getByText("Permanent");
    expect(permanent.className).not.toContain("active");
    fireEvent.click(permanent);
    expect(updateWorkspaceSettings).toHaveBeenCalledWith({ deleteBehavior: "permanent" });
  });

  it("marks the current delete behavior as active", () => {
    workspacePath.value = "/vault";
    workspaceSettings.value = { ...DEFAULT_WORKSPACE_SETTINGS, deleteBehavior: "permanent" };
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

  it("wires the default view mode switch and marks the active option", () => {
    workspacePath.value = "/vault";
    workspaceSettings.value = { ...DEFAULT_WORKSPACE_SETTINGS, defaultViewMode: "split" };
    const { getByText } = render(<SettingsPanel />);
    expect(getByText("Split").className).toContain("active");
    fireEvent.click(getByText("Preview"));
    expect(updateWorkspaceSettings).toHaveBeenCalledWith({ defaultViewMode: "preview" });
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

    fireEvent.click(getByText("x", { selector: ".license-viewer .modal-close" }));
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
