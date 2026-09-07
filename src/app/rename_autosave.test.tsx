/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/preact";
import { signal } from "@preact/signals";
import { DEFAULT_WORKSPACE_SETTINGS } from "../settings/workspaceSettings";
import { linkIndex } from "../linking/store";
import { parseWikiLinks } from "../linking/wikiSyntax";

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
    workspaceProfiles: signal([]),
    activeWorkspaceId: signal<string | null>(null),
    activateWorkspaceProfile: vi.fn(),
    addWorkspaceFromPicker: vi.fn(),
    forgetWorkspaceProfile: vi.fn(),
    workspaceTransitionRecovery: signal(null),
    updateWorkspaceSettings: async (
      patch: Partial<typeof DEFAULT_WORKSPACE_SETTINGS>,
    ) => {
      if (!workspacePath.value) return;
      updateWorkspaceSettingsSpy(patch);
      workspaceSettings.value = { ...workspaceSettings.value, ...patch };
    },
  };
});

const { readTextFile, writeTextFile } = vi.hoisted(() => ({
  readTextFile: vi.fn<(path: string) => Promise<string>>(async () => ""),
  writeTextFile: vi.fn<(path: string, content: string) => Promise<void>>(
    async () => {},
  ),
}));

vi.mock("../workspace/tauriBridge", () => ({
  readTextFile,
  writeTextFile,
  pickWorkspaceFolder: vi.fn(),
  restoreWorkspaceAccess: vi.fn(),
  listDir: vi.fn(async () => []),
  findMarkdownFiles: vi.fn(async () => []),
  createWorkspaceDir: vi.fn(),
  renameWorkspacePath: vi.fn(),
  trashPath: vi.fn(),
  deleteWorkspacePathPermanent: vi.fn(),
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
  Sidebar: ({
    onOpenFile,
  }: {
    onOpenFile: (path: string, name: string) => void;
  }) => (
    <button onClick={() => onOpenFile("/vault/note.md", "note.md")}>
      Open mock note
    </button>
  ),
}));

vi.mock("../editor/MarkdownEditor", () => ({
  MarkdownEditor: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (v: string) => void;
  }) => (
    <textarea
      data-testid="mock-editor"
      value={value}
      onInput={(e) => onChange((e.target as HTMLTextAreaElement).value)}
    />
  ),
}));

vi.mock("../settings/SettingsPanel", () => ({
  SettingsPanel: () => null,
}));

const { closeAllTabs, openOrFocusTab, openTabs } =
  await import("../workspace/store");
const { settingsPanelOpen, workspacePath, workspaceSettings } =
  await import("../settings/store");
const { App } = await import("./App");

const defaultViewportWidth = window.innerWidth;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  closeAllTabs();
  settingsPanelOpen.value = false;
  workspacePath.value = null;
  workspaceSettings.value = DEFAULT_WORKSPACE_SETTINGS;
  updateWorkspaceSettingsSpy.mockClear();
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: defaultViewportWidth,
  });
  writeTextFile.mockClear();
  readTextFile.mockClear();
  renameEntry.mockReset();
  linkIndex.value = {
    backlinksByPath: new Map(),
    pathsByNoteName: new Map(),
    pathsByAlias: new Map(),
    aliasesByPath: new Map(),
    pathsByTag: new Map(),
    tagsByPath: new Map(),
    tasksByPath: new Map(),
  };
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

    const editor = container.querySelector(
      '[data-testid="mock-editor"]',
    ) as HTMLTextAreaElement;
    fireEvent.input(editor, { target: { value: "typed content" } });

    fireEvent.contextMenu(container.querySelector(".tab")!);
    fireEvent.click(getByRole("button", { name: "Rename" }));

    const nameInput =
      container.querySelector<HTMLInputElement>(".name-prompt input")!;
    fireEvent.input(nameInput, { target: { value: "renamed.md" } });
    fireEvent.click(getByRole("button", { name: "Rename" }));

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(order).toEqual([
      "write:/vault/note.md:typed content",
      "rename:/vault/note.md",
    ]);
    expect(writeTextFile).toHaveBeenCalledTimes(1);
    expect(writeTextFile).toHaveBeenCalledWith(
      "/vault/note.md",
      "typed content",
    );
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

describe("App: rename shows a link-impact preview when a reference exists (F03 Phase 2b-i)", () => {
  function withReferrerIndex(): void {
    linkIndex.value = {
      backlinksByPath: new Map(),
      pathsByNoteName: new Map([
        ["note", ["/vault/note.md"]],
        ["referrer", ["/vault/referrer.md"]],
      ]),
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
      pathsByTag: new Map(),
      tagsByPath: new Map(),
      tasksByPath: new Map(),
      wikiLinksByPath: new Map([["/vault/referrer.md", parseWikiLinks("See [[note]].")]]),
    };
    readTextFile.mockImplementation(async (path: string) =>
      path === "/vault/referrer.md" ? "See [[note]]." : "",
    );
  }

  it("shows the Review dialog before renaming, and Continue proceeds with the unchanged real rename", async () => {
    withReferrerIndex();
    renameEntry.mockImplementation(async () => "/vault/renamed.md");
    openOrFocusTab("/vault/note.md", "note.md", "content", "text");
    const { container, getByRole, getByText } = render(<App />);

    fireEvent.contextMenu(container.querySelector(".tab")!);
    fireEvent.click(getByRole("button", { name: "Rename" }));
    const nameInput = container.querySelector<HTMLInputElement>(".name-prompt input")!;
    fireEvent.input(nameInput, { target: { value: "renamed.md" } });
    fireEvent.click(getByRole("button", { name: "Rename" }));

    await waitFor(() => expect(getByText("Review rename")).toBeTruthy());
    expect(getByText("1 link elsewhere will still need updating")).toBeTruthy();
    expect(getByText("/vault/referrer.md")).toBeTruthy();
    expect(renameEntry).not.toHaveBeenCalled();

    fireEvent.click(getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(renameEntry).toHaveBeenCalledWith("/vault/note.md", "renamed.md"));
    expect(openTabs.value[0]).toMatchObject({ path: "/vault/renamed.md", name: "renamed.md" });
  });

  it("cancelling the Review dialog renames nothing", async () => {
    withReferrerIndex();
    openOrFocusTab("/vault/note.md", "note.md", "content", "text");
    const { container, getByRole, getByText, queryByText } = render(<App />);

    fireEvent.contextMenu(container.querySelector(".tab")!);
    fireEvent.click(getByRole("button", { name: "Rename" }));
    const nameInput = container.querySelector<HTMLInputElement>(".name-prompt input")!;
    fireEvent.input(nameInput, { target: { value: "renamed.md" } });
    fireEvent.click(getByRole("button", { name: "Rename" }));

    await waitFor(() => expect(getByText("Review rename")).toBeTruthy());
    fireEvent.click(getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(queryByText("Review rename")).toBeNull());
    expect(renameEntry).not.toHaveBeenCalled();
    expect(openTabs.value[0]).toMatchObject({ path: "/vault/note.md", name: "note.md" });
  });
});
