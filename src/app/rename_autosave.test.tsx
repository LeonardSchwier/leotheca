/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { signal } from "@preact/signals";
import { DEFAULT_WORKSPACE_SETTINGS } from "../settings/workspaceSettings";

const { updateWorkspaceSettingsSpy } = vi.hoisted(() => ({
  updateWorkspaceSettingsSpy: vi.fn(),
}));

vi.mock("../settings/store", () => {
  const workspacePath = signal<string | null>(null);
  const workspaceSettings = signal(DEFAULT_WORKSPACE_SETTINGS);
  return {
    workspacePath,
    workspaceSession: signal("test-session"),
    settingsLoaded: signal(false),
    settingsPanelOpen: signal(false),
    workspaceSelectionError: signal<string | null>(null),
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
  readTextFile: vi.fn<(path: string) => Promise<string>>(async () => ""),
  writeTextFile: vi.fn<(path: string, content: string) => Promise<void>>(async () => {}),
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
  createNoteFromTemplate: vi.fn(),
  listTemplates: vi.fn(async () => []),
  runSearch: vi.fn(),
  resetWorkspaceTree: vi.fn(),
  selectedDir: signal("/vault"),
  createCanvasQuick: vi.fn(),
  createNoteQuick: vi.fn(),
}));

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

vi.mock("../editor/MarkdownEditor", () => ({
  MarkdownEditor: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea data-testid="mock-editor" value={value} onInput={(e) => onChange((e.target as HTMLTextAreaElement).value)} />
  ),
}));

vi.mock("../settings/SettingsPanel", () => ({
  SettingsPanel: () => null,
}));

const { openOrFocusTab, openTabs, activeTabPath } = await import("../workspace/store");
const { settingsPanelOpen, workspacePath, workspaceSettings } = await import("../settings/store");
const { App } = await import("./App");

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

describe("App: tab rename while an autosave is still pending", () => {
  it("calls flushPendingAutosave (save coordinator flush) before renameEntry", async () => {
    const order: string[] = [];
    renameEntry.mockImplementation(async (path: string) => {
      order.push("rename:" + path);
      return "/vault/renamed.md";
    });
    writeTextFile.mockImplementation(async (path: string, content: string) => {
      order.push("write:" + path + ":" + content);
    });

    openOrFocusTab("/vault/note.md", "note.md", "initial content", "text");

    const { container, getByRole } = render(<App />);

    const editor = container.querySelector('[data-testid="mock-editor"]') as HTMLTextAreaElement;
    fireEvent.input(editor, { target: { value: "typed content" } });

    fireEvent.contextMenu(container.querySelector(".tab")!);
    fireEvent.click(getByRole("button", { name: "Rename" }));

    const nameInput = container.querySelector<HTMLInputElement>(".name-prompt input")!;
    fireEvent.input(nameInput, { target: { value: "renamed.md" } });
    fireEvent.click(getByRole("button", { name: "Rename" }));

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(order).toEqual(["write:/vault/note.md:typed content", "rename:/vault/note.md"]);
    expect(writeTextFile).toHaveBeenCalledTimes(1);
    expect(writeTextFile).toHaveBeenCalledWith("/vault/note.md", "typed content");
    expect(renameEntry).toHaveBeenCalledWith("/vault/note.md", "renamed.md");

    expect(openTabs.value).toHaveLength(1);
    expect(openTabs.value[0]).toMatchObject({
      path: "/vault/renamed.md",
      name: "renamed.md",
      content: "typed content",
      dirty: false,
    });
  });
});
