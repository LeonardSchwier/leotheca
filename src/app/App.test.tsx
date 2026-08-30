/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/preact";
import { signal } from "@preact/signals";
import { DEFAULT_WORKSPACE_SETTINGS } from "../settings/workspaceSettings";

// A minimal, narrowly-scoped harness for App-level interactions that need
// real window events or top-level state wiring, not general App.tsx coverage.
// The zoom tests open a minimal workspace, so Sidebar is replaced with a
// no-op below; the other optional panels are never reached and don't need
// mocking.
const { updateWorkspaceSettingsSpy } = vi.hoisted(() => ({
  updateWorkspaceSettingsSpy: vi.fn(),
}));

vi.mock("../settings/store", () => {
  const workspacePath = signal<string | null>(null);
  const workspaceSettings = signal(DEFAULT_WORKSPACE_SETTINGS);
  return {
    workspacePath,
    workspaceSession: signal(0),
    settingsLoaded: signal(false),
    settingsPanelOpen: signal(false),
    viewMode: signal("source"),
    initSettings: vi.fn(),
    workspaceSettings,
    updateWorkspaceSettings: async (patch: Partial<typeof DEFAULT_WORKSPACE_SETTINGS>) => {
      if (!workspacePath.value) return;
      updateWorkspaceSettingsSpy(patch);
      workspaceSettings.value = { ...workspaceSettings.value, ...patch };
    },
  };
});

const { readTextFile, writeTextFile } = vi.hoisted(() => ({
  readTextFile: vi.fn<(path: string) => Promise<string>>(() => Promise.resolve("")),
  writeTextFile: vi.fn<(path: string, content: string) => Promise<void>>(() => Promise.resolve()),
}));

vi.mock("../workspace/tauriBridge", () => ({
  readTextFile,
  writeTextFile,
  pickWorkspaceFolder: vi.fn(),
  restoreWorkspaceAccess: vi.fn(),
  listDir: vi.fn(async () => []),
  findMarkdownFiles: vi.fn(async () => []),
  createDir: vi.fn(),
  renamePath: vi.fn(),
  trashPath: vi.fn(),
  deletePathPermanent: vi.fn(),
  getAppConfigFilePath: vi.fn(),
  getAppVersion: vi.fn(async () => "1.0"),
  fileSrc: vi.fn(),
  getWorkspaceStats: vi.fn(),
  setStatusBarAppearance: vi.fn(),
}));

const { renameEntry } = vi.hoisted(() => ({
  renameEntry: vi.fn<(oldPath: string, newName: string) => Promise<string>>(),
}));

vi.mock("../workspace/fileTreeStore", () => ({
  renameEntry,
  createNoteQuick: vi.fn(),
  createNoteFromTemplate: vi.fn(),
  listTemplates: vi.fn(async () => []),
  runSearch: vi.fn(),
  resetWorkspaceTree: vi.fn(),
  selectedDir: signal<string | null>(null),
}));

// Real @tauri-apps/plugin-deep-link and plugin-clipboard-manager reach for
// window.__TAURI_INTERNALS__, absent in jsdom; App.tsx's automation-command
// effect (see automationCommands.ts) is exercised by automationCommands'
// own unit tests, not by this file, so a plain no-op stand-in is enough here.
vi.mock("@tauri-apps/plugin-deep-link", () => ({
  getCurrent: vi.fn(async () => null),
  onOpenUrl: vi.fn(async () => () => {}),
}));

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: vi.fn(async () => {}),
}));

vi.mock("../workspace/Sidebar", () => ({
  Sidebar: ({ onOpenFile }: { onOpenFile: (path: string, name: string) => void }) => (
    <button onClick={() => onOpenFile("/vault/note.md", "note.md")}>Open mock note</button>
  ),
}));

// Stand in for CodeMirror with a plain, interactive textarea: this test
// exercises App.tsx's own handleChange/autosave logic, not the editor.
vi.mock("../editor/MarkdownEditor", () => ({
  MarkdownEditor: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea data-testid="mock-editor" value={value} onInput={(e) => onChange((e.target as HTMLTextAreaElement).value)} />
  ),
}));

// SettingsPanel has its own extensive dedicated test file and needs a much
// larger settings/store mock than this file cares about; the Ctrl+, test
// below only needs to verify the shortcut flips settingsPanelOpen, not that
// SettingsPanel itself renders correctly.
vi.mock("../settings/SettingsPanel", () => ({
  SettingsPanel: () => null,
}));

const { App } = await import("./App");
const { openOrFocusTab, openTabs, activeTabPath } = await import("../workspace/store");
const { settingsPanelOpen, workspacePath, workspaceSettings } = await import("../settings/store");
const defaultViewportWidth = window.innerWidth;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  openTabs.value = [];
  activeTabPath.value = null;
  settingsPanelOpen.value = false;
  workspacePath.value = null;
  workspaceSettings.value = DEFAULT_WORKSPACE_SETTINGS;
  updateWorkspaceSettingsSpy.mockClear();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: defaultViewportWidth });
  writeTextFile.mockClear();
  readTextFile.mockClear();
  renameEntry.mockReset();
});

describe("App: keyboard shortcuts", () => {
  it("Ctrl+W closes the active tab", () => {
    openOrFocusTab("/vault/a.md", "a.md", "", "text");
    openOrFocusTab("/vault/b.md", "b.md", "", "text");
    render(<App />);

    fireEvent.keyDown(window, { key: "w", ctrlKey: true });

    expect(openTabs.value.map((t) => t.path)).toEqual(["/vault/a.md"]);
  });

  it("Ctrl+Tab cycles to the next tab, wrapping around, and Ctrl+Shift+Tab goes backward", () => {
    openOrFocusTab("/vault/a.md", "a.md", "", "text");
    openOrFocusTab("/vault/b.md", "b.md", "", "text");
    openOrFocusTab("/vault/c.md", "c.md", "", "text"); // active is now c.md
    render(<App />);

    fireEvent.keyDown(window, { key: "Tab", ctrlKey: true });
    expect(activeTabPath.value).toBe("/vault/a.md"); // wraps past the end

    fireEvent.keyDown(window, { key: "Tab", ctrlKey: true });
    expect(activeTabPath.value).toBe("/vault/b.md");

    fireEvent.keyDown(window, { key: "Tab", ctrlKey: true, shiftKey: true });
    expect(activeTabPath.value).toBe("/vault/a.md");
  });

  it("Ctrl+S flushes the pending autosave for the active tab immediately", async () => {
    vi.useFakeTimers();
    openOrFocusTab("/vault/note.md", "note.md", "initial", "text");
    const { container } = render(<App />);

    const editor = container.querySelector('[data-testid="mock-editor"]') as HTMLTextAreaElement;
    fireEvent.input(editor, { target: { value: "typed content" } });
    expect(writeTextFile).not.toHaveBeenCalled(); // debounce hasn't fired on its own

    await act(async () => {
      fireEvent.keyDown(window, { key: "s", ctrlKey: true });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(writeTextFile).toHaveBeenCalledTimes(1);
    expect(writeTextFile).toHaveBeenCalledWith("/vault/note.md", "typed content");
    expect(openTabs.value[0].dirty).toBe(false);

    // The original debounce timer must have been cancelled, not merely
    // outraced, or this would be a second, redundant write.
    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });
    expect(writeTextFile).toHaveBeenCalledTimes(1);
  });

  it("Ctrl+, opens Settings", () => {
    render(<App />);
    expect(settingsPanelOpen.value).toBe(false);

    fireEvent.keyDown(window, { key: ",", ctrlKey: true });

    expect(settingsPanelOpen.value).toBe(true);
  });

  it("Ctrl+Plus, Ctrl+Minus, and Ctrl+0 update the persisted UI zoom", () => {
    workspacePath.value = "/vault";
    workspaceSettings.value = { ...DEFAULT_WORKSPACE_SETTINGS, uiZoom: 100 };
    render(<App />);

    fireEvent.keyDown(window, { key: "=", ctrlKey: true });
    expect(updateWorkspaceSettingsSpy).toHaveBeenLastCalledWith({ uiZoom: 110 });

    fireEvent.keyDown(window, { key: "-", ctrlKey: true });
    expect(updateWorkspaceSettingsSpy).toHaveBeenLastCalledWith({ uiZoom: 100 });

    workspaceSettings.value = { ...workspaceSettings.value, uiZoom: 170 };
    fireEvent.keyDown(window, { key: "0", ctrlKey: true });
    expect(updateWorkspaceSettingsSpy).toHaveBeenLastCalledWith({ uiZoom: 100 });
  });

  it("leaves browser zoom available before a workspace is open", () => {
    render(<App />);

    const browserZoom = new KeyboardEvent("keydown", {
      key: "=",
      ctrlKey: true,
      cancelable: true,
    });
    window.dispatchEvent(browserZoom);

    expect(browserZoom.defaultPrevented).toBe(false);
    expect(updateWorkspaceSettingsSpy).not.toHaveBeenCalled();
  });

  it("Ctrl+wheel zooms in or out, while an unmodified wheel is left alone", () => {
    workspacePath.value = "/vault";
    workspaceSettings.value = { ...DEFAULT_WORKSPACE_SETTINGS, uiZoom: 100 };
    render(<App />);

    const zoomIn = new WheelEvent("wheel", { deltaY: -1, ctrlKey: true, cancelable: true });
    window.dispatchEvent(zoomIn);
    expect(zoomIn.defaultPrevented).toBe(true);
    expect(updateWorkspaceSettingsSpy).toHaveBeenLastCalledWith({ uiZoom: 110 });

    const callCount = updateWorkspaceSettingsSpy.mock.calls.length;
    const ordinaryScroll = new WheelEvent("wheel", { deltaY: 1, cancelable: true });
    window.dispatchEvent(ordinaryScroll);
    expect(ordinaryScroll.defaultPrevented).toBe(false);
    expect(updateWorkspaceSettingsSpy).toHaveBeenCalledTimes(callCount);
  });
});

describe("App: narrow-screen navigation", () => {
  it("closes the file browser after opening a note", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 600 });
    workspacePath.value = "/vault";
    readTextFile.mockResolvedValue("note content");
    const { getByRole } = render(<App />);

    const fileBrowserToggle = getByRole("button", { name: "Toggle file browser" });
    if (!fileBrowserToggle.classList.contains("active")) fireEvent.click(fileBrowserToggle);
    expect(fileBrowserToggle.classList.contains("active")).toBe(true);

    await act(async () => {
      fireEvent.click(getByRole("button", { name: "Open mock note" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(activeTabPath.value).toBe("/vault/note.md");
    expect(fileBrowserToggle.classList.contains("active")).toBe(false);

    fireEvent.click(fileBrowserToggle);
  });
});
