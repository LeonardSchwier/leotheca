/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/preact";
import { signal } from "@preact/signals";
import { DEFAULT_WORKSPACE_SETTINGS } from "../settings/workspaceSettings";
import { scanTasks, type TaskRecord } from "../markdown/tasks";

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
  readTextFile: vi.fn<(path: string) => Promise<string>>(() =>
    Promise.resolve(""),
  ),
  writeTextFile: vi.fn<(path: string, content: string) => Promise<void>>(() =>
    Promise.resolve(),
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
  createNoteQuick: vi.fn(),
  createNoteFromTemplate: vi.fn(),
  listTemplates: vi.fn(async () => []),
  runSearch: vi.fn(),
  resetWorkspaceTree: vi.fn(),
  selectedDir: signal<string | null>(null),
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
    <>
      <button onClick={() => onOpenFile("/vault/note.md", "note.md")}>
        Open mock note
      </button>
      {/* Two independently addressable notes, used by the N-002
          stale-file-open-completion tests below to control two
          concurrent handleOpenFile calls' read order independently. */}
      <button onClick={() => onOpenFile("/vault/a.md", "a.md")}>
        Open mock note A
      </button>
      <button onClick={() => onOpenFile("/vault/b.md", "b.md")}>
        Open mock note B
      </button>
    </>
  ),
}));

vi.mock("../editor/MarkdownEditor", () => ({
  MarkdownEditor: ({
    value,
    onChange,
    onCursorChange,
  }: {
    value: string;
    onChange: (v: string) => void;
    onCursorChange?: (pos: number) => void;
  }) => (
    <>
      <textarea
        data-testid="mock-editor"
        value={value}
        onInput={(e) => onChange((e.target as HTMLTextAreaElement).value)}
      />
      {/* Stands in for a real CodeMirror cursor/keyboard action (App.test.tsx
          mocks MarkdownEditor wholesale, so there is no real editor to move a
          cursor in); used by the Split-mode breadcrumb authority test below. */}
      <button
        data-testid="mock-editor-cursor-move"
        onClick={() => onCursorChange?.(0)}
      >
        Move cursor
      </button>
    </>
  ),
}));

vi.mock("../settings/SettingsPanel", () => ({
  SettingsPanel: () => null,
}));

const { App } = await import("./App");
const { activeTabPath, closeAllTabs, openOrFocusTab, openTabs } =
  await import("../workspace/store");
const { settingsPanelOpen, workspacePath, workspaceSettings, viewMode } =
  await import("../settings/store");
const { linkIndex } = await import("../linking/store");
const { outlineRevealRequest } = await import("../outline/outlineNavigation");
const { workspaceTransitions } = await import("../workspace/workspaceTransition");
const defaultViewportWidth = window.innerWidth;

const emptyLinkIndex = () => ({
  backlinksByPath: new Map<string, string[]>(),
  pathsByNoteName: new Map<string, string[]>(),
  pathsByAlias: new Map<string, string[]>(),
  aliasesByPath: new Map<string, string[]>(),
  pathsByTag: new Map<string, string[]>(),
  tagsByPath: new Map<string, string[]>(),
  tasksByPath: new Map<string, TaskRecord[]>(),
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  closeAllTabs();
  settingsPanelOpen.value = false;
  workspacePath.value = null;
  workspaceSettings.value = DEFAULT_WORKSPACE_SETTINGS;
  viewMode.value = "source";
  linkIndex.value = emptyLinkIndex();
  outlineRevealRequest.value = null;
  updateWorkspaceSettingsSpy.mockClear();
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: defaultViewportWidth,
  });
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
    openOrFocusTab("/vault/c.md", "c.md", "", "text");
    render(<App />);

    fireEvent.keyDown(window, { key: "Tab", ctrlKey: true });
    expect(activeTabPath.value).toBe("/vault/a.md");

    fireEvent.keyDown(window, { key: "Tab", ctrlKey: true });
    expect(activeTabPath.value).toBe("/vault/b.md");

    fireEvent.keyDown(window, { key: "Tab", ctrlKey: true, shiftKey: true });
    expect(activeTabPath.value).toBe("/vault/a.md");
  });

  it("Ctrl+S flushes the pending autosave for the active tab immediately", async () => {
    vi.useFakeTimers();
    openOrFocusTab("/vault/note.md", "note.md", "initial", "text");
    const { container } = render(<App />);

    const editor = container.querySelector(
      '[data-testid="mock-editor"]',
    ) as HTMLTextAreaElement;
    fireEvent.input(editor, { target: { value: "typed content" } });
    expect(writeTextFile).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.keyDown(window, { key: "s", ctrlKey: true });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(writeTextFile).toHaveBeenCalledTimes(1);
    expect(writeTextFile).toHaveBeenCalledWith(
      "/vault/note.md",
      "typed content",
    );
    expect(openTabs.value[0].dirty).toBe(false);

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
    expect(updateWorkspaceSettingsSpy).toHaveBeenLastCalledWith({
      uiZoom: 110,
    });

    fireEvent.keyDown(window, { key: "-", ctrlKey: true });
    expect(updateWorkspaceSettingsSpy).toHaveBeenLastCalledWith({
      uiZoom: 100,
    });

    workspaceSettings.value = { ...workspaceSettings.value, uiZoom: 170 };
    fireEvent.keyDown(window, { key: "0", ctrlKey: true });
    expect(updateWorkspaceSettingsSpy).toHaveBeenLastCalledWith({
      uiZoom: 100,
    });
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

    const zoomIn = new WheelEvent("wheel", {
      deltaY: -1,
      ctrlKey: true,
      cancelable: true,
    });
    window.dispatchEvent(zoomIn);
    expect(zoomIn.defaultPrevented).toBe(true);
    expect(updateWorkspaceSettingsSpy).toHaveBeenLastCalledWith({
      uiZoom: 110,
    });

    const callCount = updateWorkspaceSettingsSpy.mock.calls.length;
    const ordinaryScroll = new WheelEvent("wheel", {
      deltaY: 1,
      cancelable: true,
    });
    window.dispatchEvent(ordinaryScroll);
    expect(ordinaryScroll.defaultPrevented).toBe(false);
    expect(updateWorkspaceSettingsSpy).toHaveBeenCalledTimes(callCount);
  });
});

describe("App: narrow-screen navigation", () => {
  it("closes the file browser after opening a note", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 600,
    });
    workspacePath.value = "/vault";
    readTextFile.mockResolvedValue("note content");
    const { getByRole } = render(<App />);

    const fileBrowserToggle = getByRole("button", {
      name: "Toggle file browser",
    });
    if (!fileBrowserToggle.classList.contains("active"))
      fireEvent.click(fileBrowserToggle);
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

describe("App: Split-mode breadcrumb authority (spec section 7.5)", () => {
  it("defaults to Source, switches to Preview on a direct Preview scroll, and back to Source on a cursor action", () => {
    viewMode.value = "split";
    openOrFocusTab("/vault/note.md", "note.md", "# One\n\n## Two", "text");
    const { getByRole, container } = render(<App />);

    // The App.test.tsx MarkdownEditor mock, unlike the real editor, never
    // reports a cursor position on mount; drive its stand-in button once
    // first so cursorPos is populated the same way it would be for real.
    fireEvent.click(
      container.querySelector('[data-testid="mock-editor-cursor-move"]')!,
    );
    expect(
      getByRole("navigation", { name: "Breadcrumb (following Source)" }),
    ).toBeTruthy();

    const preview = container.querySelector(".markdown-preview")!;
    fireEvent.scroll(preview);
    expect(
      getByRole("navigation", { name: "Breadcrumb (following Preview)" }),
    ).toBeTruthy();

    fireEvent.click(
      container.querySelector('[data-testid="mock-editor-cursor-move"]')!,
    );
    expect(
      getByRole("navigation", { name: "Breadcrumb (following Source)" }),
    ).toBeTruthy();
  });

  it("resets authority to Source when switching to a different note", () => {
    viewMode.value = "split";
    openOrFocusTab("/vault/a.md", "a.md", "# One", "text");
    openOrFocusTab("/vault/b.md", "b.md", "# Other", "text");
    const { getByRole, getByText, container } = render(<App />);

    fireEvent.click(
      container.querySelector('[data-testid="mock-editor-cursor-move"]')!,
    );
    const preview = container.querySelector(".markdown-preview")!;
    fireEvent.scroll(preview);
    expect(
      getByRole("navigation", { name: "Breadcrumb (following Preview)" }),
    ).toBeTruthy();

    fireEvent.click(getByText("a.md"));
    expect(
      getByRole("navigation", { name: "Breadcrumb (following Source)" }),
    ).toBeTruthy();
  });
});

describe("App: F04 Phase 1 cross-note heading-link navigation", () => {
  it("opens the target note and reveals the resolved heading from its freshly-read content", async () => {
    linkIndex.value = {
      ...emptyLinkIndex(),
      pathsByNoteName: new Map([["second", ["/vault/second.md"]]]),
    };
    viewMode.value = "split";
    workspacePath.value = "/vault";
    const targetContent = "# Intro\n\n## Target\n\ntext";
    readTextFile.mockResolvedValue(targetContent);
    openOrFocusTab("/vault/first.md", "first.md", "See [[Second#Target]] over there.", "text");
    const { container } = render(<App />);

    const anchor = container.querySelector(
      'a[href^="#leotheca-wikilink="]',
    ) as HTMLAnchorElement;
    expect(anchor).toBeTruthy();

    await act(async () => {
      fireEvent.click(anchor);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(activeTabPath.value).toBe("/vault/second.md");
    expect(outlineRevealRequest.value?.from).toBe(targetContent.indexOf("Target"));
    expect(outlineRevealRequest.value?.to).toBe(
      targetContent.indexOf("Target") + "Target".length,
    );
  });

  it("does not request a reveal when the freshly-read target note has no matching heading", async () => {
    linkIndex.value = {
      ...emptyLinkIndex(),
      pathsByNoteName: new Map([["second", ["/vault/second.md"]]]),
    };
    viewMode.value = "split";
    workspacePath.value = "/vault";
    readTextFile.mockResolvedValue("# Intro\n\nno such heading here");
    openOrFocusTab("/vault/first.md", "first.md", "See [[Second#Target]] over there.", "text");
    const { container } = render(<App />);

    const anchor = container.querySelector(
      'a[href^="#leotheca-wikilink="]',
    ) as HTMLAnchorElement;

    await act(async () => {
      fireEvent.click(anchor);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(activeTabPath.value).toBe("/vault/second.md");
    expect(outlineRevealRequest.value).toBeNull();
  });
});

describe("App: F04 Phase 3a cross-note block-link navigation", () => {
  it("opens the target note and reveals the resolved block from its freshly-read content", async () => {
    linkIndex.value = {
      ...emptyLinkIndex(),
      pathsByNoteName: new Map([["second", ["/vault/second.md"]]]),
    };
    viewMode.value = "split";
    workspacePath.value = "/vault";
    const targetContent = "Intro text.\n\nThe target block. ^target-block\n\nmore text";
    readTextFile.mockResolvedValue(targetContent);
    openOrFocusTab("/vault/first.md", "first.md", "See [[Second#^target-block]] over there.", "text");
    const { container } = render(<App />);

    const anchor = container.querySelector(
      'a[href^="#leotheca-wikilink="]',
    ) as HTMLAnchorElement;
    expect(anchor).toBeTruthy();

    await act(async () => {
      fireEvent.click(anchor);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(activeTabPath.value).toBe("/vault/second.md");
    expect(outlineRevealRequest.value?.from).toBe(targetContent.indexOf("The target block."));
    expect(outlineRevealRequest.value?.to).toBe(
      targetContent.indexOf("The target block.") + "The target block.".length,
    );
  });

  it("does not request a reveal when the freshly-read target note has no matching block id", async () => {
    linkIndex.value = {
      ...emptyLinkIndex(),
      pathsByNoteName: new Map([["second", ["/vault/second.md"]]]),
    };
    viewMode.value = "split";
    workspacePath.value = "/vault";
    readTextFile.mockResolvedValue("No block ids here at all.");
    openOrFocusTab("/vault/first.md", "first.md", "See [[Second#^target-block]] over there.", "text");
    const { container } = render(<App />);

    const anchor = container.querySelector(
      'a[href^="#leotheca-wikilink="]',
    ) as HTMLAnchorElement;

    await act(async () => {
      fireEvent.click(anchor);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(activeTabPath.value).toBe("/vault/second.md");
    expect(outlineRevealRequest.value).toBeNull();
  });
});

describe("App: N-002 stale file-open completions", () => {
  it("an older open request completing after a newer one does not override the newer selection (latest-selection-wins)", async () => {
    workspacePath.value = "/vault";
    const pending: Record<
      string,
      { resolve: (v: string) => void; reject: (e: unknown) => void }
    > = {};
    readTextFile.mockImplementation(
      (path: string) =>
        new Promise<string>((resolve, reject) => {
          pending[path] = { resolve, reject };
        }),
    );
    const { getByRole } = render(<App />);

    await act(async () => {
      fireEvent.click(getByRole("button", { name: "Open mock note A" }));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.click(getByRole("button", { name: "Open mock note B" }));
      await Promise.resolve();
    });

    // B (the newer selection) resolves first...
    await act(async () => {
      pending["/vault/b.md"].resolve("b content");
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(activeTabPath.value).toBe("/vault/b.md");

    // ...then A's older read finally resolves too. A must not override
    // B, and must not even open a background tab for itself.
    await act(async () => {
      pending["/vault/a.md"].resolve("a content");
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(activeTabPath.value).toBe("/vault/b.md");
    expect(openTabs.value.map((t) => t.path)).toEqual(["/vault/b.md"]);
  });

  it("a workspace transition starting during an in-flight read prevents that read's completion from opening a tab", async () => {
    workspacePath.value = "/vault";
    let resolveRead: ((v: string) => void) | undefined;
    readTextFile.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveRead = resolve;
        }),
    );
    const { getByRole } = render(<App />);

    await act(async () => {
      fireEvent.click(getByRole("button", { name: "Open mock note A" }));
      await Promise.resolve();
    });

    // A real workspace switch (setWorkspacePath) runs its steps through
    // this same shared workspaceTransitions coordinator; simulate one
    // starting while A's read is still in flight.
    await act(async () => {
      await workspaceTransitions.run({
        prepareOutgoing: async () => {},
        connectIncoming: async () => {},
        loadIncoming: async () => undefined,
        publishIncoming: () => {},
      });
    });

    await act(async () => {
      resolveRead?.("a content");
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      openTabs.value.find((t) => t.path === "/vault/a.md"),
    ).toBeUndefined();
  });

  it("a rejected read for an already-superseded request does not throw or disturb the newer tab", async () => {
    workspacePath.value = "/vault";
    const pending: Record<
      string,
      { resolve: (v: string) => void; reject: (e: unknown) => void }
    > = {};
    readTextFile.mockImplementation(
      (path: string) =>
        new Promise<string>((resolve, reject) => {
          pending[path] = { resolve, reject };
        }),
    );
    const { getByRole } = render(<App />);

    await act(async () => {
      fireEvent.click(getByRole("button", { name: "Open mock note A" }));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.click(getByRole("button", { name: "Open mock note B" }));
      await Promise.resolve();
    });
    await act(async () => {
      pending["/vault/b.md"].resolve("b content");
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(activeTabPath.value).toBe("/vault/b.md");

    // A's own read, already stale, fails. This must not throw or reject
    // unhandled, and must not disturb the already-current B tab.
    await expect(
      act(async () => {
        pending["/vault/a.md"].reject(new Error("boom"));
        await Promise.resolve();
        await Promise.resolve();
      }),
    ).resolves.toBeUndefined();

    expect(activeTabPath.value).toBe("/vault/b.md");
    expect(openTabs.value.map((t) => t.path)).toEqual(["/vault/b.md"]);
  });
});

describe("App: Link Diagnostics moved to Settings, off the main screen (2026-09-03)", () => {
  it("has no Link Diagnostics toolbar button", () => {
    workspacePath.value = "/vault";
    const { queryByLabelText } = render(<App />);
    expect(queryByLabelText("Open Link Diagnostics")).toBeNull();
  });
});

describe("App: Collections gated by collectionsEnabled, off by default (2026-09-03)", () => {
  it("hides the Collections toolbar button when collectionsEnabled is off (the default)", () => {
    workspacePath.value = "/vault";
    const { queryByLabelText } = render(<App />);
    expect(queryByLabelText("Open Collections")).toBeNull();
  });

  it("shows the Collections toolbar button once collectionsEnabled is turned on", () => {
    workspacePath.value = "/vault";
    workspaceSettings.value = { ...DEFAULT_WORKSPACE_SETTINGS, collectionsEnabled: true };
    const { queryByLabelText } = render(<App />);
    expect(queryByLabelText("Open Collections")).toBeTruthy();
  });
});

describe("App: Tags toolbar button gated by tagsEnabled (2026-09-04)", () => {
  it("shows the Tags toolbar button when tagsEnabled is on (the default)", () => {
    workspacePath.value = "/vault";
    const { queryByLabelText } = render(<App />);
    expect(queryByLabelText("View tags")).toBeTruthy();
  });

  it("hides the Tags toolbar button once a workspace has tagsEnabled turned off", () => {
    workspacePath.value = "/vault";
    workspaceSettings.value = { ...DEFAULT_WORKSPACE_SETTINGS, tagsEnabled: false };
    const { queryByLabelText } = render(<App />);
    expect(queryByLabelText("View tags")).toBeNull();
  });
});

describe("App: Task Hub index stays fresh after an ordinary editor save (2026-09-04)", () => {
  it("updates LinkIndex.tasksByPath for a task checked by typing in the editor, without touching the Task Hub panel", async () => {
    vi.useFakeTimers();
    linkIndex.value = {
      ...emptyLinkIndex(),
      tasksByPath: new Map([["/vault/note.md", scanTasks("- [ ] Buy milk\n")]]),
    };
    openOrFocusTab("/vault/note.md", "note.md", "- [ ] Buy milk\n", "text");
    const { container } = render(<App />);

    const editor = container.querySelector(
      '[data-testid="mock-editor"]',
    ) as HTMLTextAreaElement;
    fireEvent.input(editor, { target: { value: "- [x] Buy milk\n" } });

    await act(async () => {
      fireEvent.keyDown(window, { key: "s", ctrlKey: true });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(writeTextFile).toHaveBeenCalledWith("/vault/note.md", "- [x] Buy milk\n");
    const tasks = linkIndex.value.tasksByPath.get("/vault/note.md");
    expect(tasks?.[0].checked).toBe(true);
  });

  it("leaves the index untouched on a save that fails, rather than recording tasks from unwritten content", async () => {
    vi.useFakeTimers();
    writeTextFile.mockRejectedValueOnce(new Error("disk full"));
    linkIndex.value = {
      ...emptyLinkIndex(),
      tasksByPath: new Map([["/vault/note.md", scanTasks("- [ ] Buy milk\n")]]),
    };
    openOrFocusTab("/vault/note.md", "note.md", "- [ ] Buy milk\n", "text");
    const { container } = render(<App />);

    const editor = container.querySelector(
      '[data-testid="mock-editor"]',
    ) as HTMLTextAreaElement;
    fireEvent.input(editor, { target: { value: "- [x] Buy milk\n" } });

    await act(async () => {
      fireEvent.keyDown(window, { key: "s", ctrlKey: true });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(writeTextFile).toHaveBeenCalledTimes(1);
    const tasks = linkIndex.value.tasksByPath.get("/vault/note.md");
    expect(tasks?.[0].checked).toBe(false);
  });
});
