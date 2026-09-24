/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/preact";
import { effect, signal } from "@preact/signals";
import { DEFAULT_WORKSPACE_SETTINGS } from "../settings/workspaceSettings";
import { scanTasks, type TaskRecord } from "../markdown/tasks";
import { pendingCapturesStore, addPendingCapture } from "../capture/pendingCaptures";

const { updateWorkspaceSettingsSpy, initSettings, addWorkspaceFromPathSpy } = vi.hoisted(() => ({
  updateWorkspaceSettingsSpy: vi.fn(),
  initSettings: vi.fn(),
  addWorkspaceFromPathSpy: vi.fn(async () => {}),
}));

vi.mock("../settings/store", () => {
  const workspacePath = signal<string | null>(null);
  const workspaceSettings = signal(DEFAULT_WORKSPACE_SETTINGS);
  const settingsLoaded = signal(false);
  const externalFileOpenEnabled = signal(true);
  return {
    workspacePath,
    workspaceSession: signal(0),
    settingsLoaded,
    waitForSettingsLoaded: (): Promise<void> => {
      if (settingsLoaded.value) return Promise.resolve();
      return new Promise((resolve) => {
        const dispose = effect(() => {
          if (settingsLoaded.value) {
            dispose();
            resolve();
          }
        });
      });
    },
    settingsPanelOpen: signal(false),
    workspaceSelectionError: signal<string | null>(null),
    viewMode: signal("source"),
    initSettings,
    workspaceSettings,
    workspaceProfiles: signal([]),
    activeWorkspaceId: signal<string | null>(null),
    activateWorkspaceProfile: vi.fn(),
    addWorkspaceFromPicker: vi.fn(),
    addWorkspaceFromPath: addWorkspaceFromPathSpy,
    externalFileOpenEnabled,
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

const { readTextFile, writeTextFile, takePendingExternalFile, externalFileOpenListeners } =
  vi.hoisted(() => ({
    readTextFile: vi.fn<(path: string) => Promise<string>>(() =>
      Promise.resolve(""),
    ),
    writeTextFile: vi.fn<(path: string, content: string) => Promise<void>>(() =>
      Promise.resolve(),
    ),
    takePendingExternalFile: vi.fn<() => Promise<string | null>>(async () => null),
    externalFileOpenListeners: [] as ((path: string) => void)[],
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
  updateFavoritesWidget: vi.fn(async () => {}),
  takePendingExternalFile,
  onExternalFileOpen: vi.fn((listener: (path: string) => void) => {
    externalFileOpenListeners.push(listener);
    return () => {};
  }),
}));

const { renameEntry, createNoteQuick, deleteEntry } = vi.hoisted(() => ({
  renameEntry: vi.fn<(oldPath: string, newName: string) => Promise<string>>(),
  createNoteQuick:
    vi.fn<(dirPath: string, content?: string) => Promise<{ path: string; name: string }>>(),
  deleteEntry: vi.fn<(rootPath: string, path: string) => Promise<void>>(async () => {}),
}));

vi.mock("../workspace/fileTreeStore", () => ({
  renameEntry,
  createNoteQuick,
  createNoteFromTemplate: vi.fn(),
  listTemplates: vi.fn(async () => []),
  runSearch: vi.fn(),
  resetWorkspaceTree: vi.fn(),
  selectedDir: signal<string | null>(null),
  deleteEntry,
  // Same real, pure implementation as fileTreeStore.ts's own -- this is
  // pure path-string arithmetic, not a workspace/bridge call, so there is
  // no fake to keep in sync and no reason to diverge from the real logic
  // the Document Header overflow menu's "Copy Relative Path" action (and
  // FileContextMenu.tsx, elsewhere) actually calls at runtime.
  relativePath: (rootPath: string, path: string): string =>
    path.startsWith(rootPath) ? path.slice(rootPath.length).replace(/^\//, "") : path,
}));

const { openUrlListeners } = vi.hoisted(() => ({
  openUrlListeners: [] as ((urls: string[]) => void)[],
}));

const { writeClipboardText } = vi.hoisted(() => ({
  writeClipboardText: vi.fn(async () => {}),
}));

vi.mock("@tauri-apps/plugin-deep-link", () => ({
  getCurrent: vi.fn(async () => null),
  onOpenUrl: vi.fn((listener: (urls: string[]) => void) => {
    openUrlListeners.push(listener);
    return Promise.resolve(() => {});
  }),
}));

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: writeClipboardText,
}));

const { pickMarkdownFileToOpen } = vi.hoisted(() => ({
  pickMarkdownFileToOpen: vi.fn<() => Promise<string | null>>(async () => null),
}));

vi.mock("../workspace/tauriBridgeImpl", () => ({
  exportTextFileViaDialog: vi.fn(),
  pickMarkdownFileToOpen,
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

vi.mock("../editor/SpeechRecognitionButton", () => ({
  SpeechRecognitionButton: () => (
    <button data-testid="mock-speech-button">Speak</button>
  ),
}));

const { App } = await import("./App");
const {
  activeTabPath,
  closeAllTabs,
  editorLayout,
  focusGroup,
  openDocuments,
  openInOtherGroup,
  openOrFocusTab,
  openTabs,
  secondaryOpenTabs,
} = await import("../workspace/store");
const { settingsLoaded, settingsPanelOpen, workspacePath, workspaceSettings, viewMode, externalFileOpenEnabled } =
  await import("../settings/store");
const { linkIndex, linkIndexBuilding, linkIndexUnreadablePaths } = await import("../linking/store");
const { outlineRevealRequest } = await import("../outline/outlineNavigation");
const { outlineAnnouncement } = await import("../outline/outlineAnnouncements");
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
  settingsLoaded.value = false;
  workspaceSettings.value = DEFAULT_WORKSPACE_SETTINGS;
  viewMode.value = "source";
  linkIndex.value = emptyLinkIndex();
  linkIndexBuilding.value = false;
  linkIndexUnreadablePaths.value = [];
  outlineRevealRequest.value = null;
  outlineAnnouncement.value = null;
  updateWorkspaceSettingsSpy.mockClear();
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: defaultViewportWidth,
  });
  writeTextFile.mockClear();
  readTextFile.mockClear();
  writeClipboardText.mockClear();
  renameEntry.mockReset();
  createNoteQuick.mockReset();
  initSettings.mockReset();
  openUrlListeners.length = 0;
  externalFileOpenListeners.length = 0;
  takePendingExternalFile.mockReset();
  takePendingExternalFile.mockResolvedValue(null);
  addWorkspaceFromPathSpy.mockClear();
  externalFileOpenEnabled.value = true;
  pendingCapturesStore.value = [];
  pickMarkdownFileToOpen.mockReset();
  pickMarkdownFileToOpen.mockResolvedValue(null);
});

describe("App: shared indexing status (UX-01 STATE-003)", () => {
  it("announces real indexing work as busy, then exposes unreadable notes as a warning", () => {
    const { getByText } = render(<App />);

    act(() => {
      linkIndexBuilding.value = true;
    });
    const progress = getByText("Indexing…").closest('[role="status"]');
    expect(progress?.getAttribute("aria-busy")).toBe("true");
    expect(getByText("Indexing…")).toBeTruthy();

    act(() => {
      linkIndexBuilding.value = false;
      linkIndexUnreadablePaths.value = ["/vault/locked.md"];
    });
    const warning = getByText("1 note couldn't be indexed").closest('[role="status"]');
    expect(warning?.className).toContain("status-indicator-warning");
    expect(warning?.getAttribute("title")).toContain("/vault/locked.md");
  });
});

describe("App: keyboard shortcuts", () => {
  it("Ctrl+W closes the active tab", () => {
    openOrFocusTab("/vault/a.md", "a.md", "", "text");
    openOrFocusTab("/vault/b.md", "b.md", "", "text");
    render(<App />);

    fireEvent.keyDown(window, { key: "w", ctrlKey: true });

    expect(openTabs.value.map((t) => t.path)).toEqual(["/vault/a.md"]);
  });

  it("Ctrl+Shift+P pins the current tab and Ctrl+Shift+U unpins it", () => {
    openOrFocusTab("/vault/a.md", "a.md", "", "text");
    openOrFocusTab("/vault/b.md", "b.md", "", "text");
    render(<App />);

    fireEvent.keyDown(window, { key: "p", ctrlKey: true, shiftKey: true });
    expect(editorLayout.value.groups.primary.pinnedPaths).toEqual(["/vault/b.md"]);

    fireEvent.keyDown(window, { key: "u", ctrlKey: true, shiftKey: true });
    expect(editorLayout.value.groups.primary.pinnedPaths).toEqual([]);
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

  it("allows editing a marked note when the workspace read-only feature is disabled", () => {
    const marked = "---\nleotheca-read-only: true\n---\nBody\n";
    openOrFocusTab("/vault/note.md", "note.md", marked, "text");
    workspaceSettings.value = {
      ...DEFAULT_WORKSPACE_SETTINGS,
      noteReadOnlyLockEnabled: false,
    };
    const { container } = render(<App />);

    const editor = container.querySelector(
      '[data-testid="mock-editor"]',
    ) as HTMLTextAreaElement;
    const edited = "---\nleotheca-read-only: true\n---\nEdited\n";
    fireEvent.input(editor, { target: { value: edited } });

    expect(openTabs.value[0].content).toBe(edited);
    expect(openTabs.value[0].dirty).toBe(true);
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

describe("App: breadcrumb navigation announcements (spec section 15.2)", () => {
  it("announces the destination heading and line when a breadcrumb segment is clicked", () => {
    viewMode.value = "split";
    // The heading starts at offset 0 so the mock editor's cursor stand-in
    // (which always reports position 0, see the MarkdownEditor mock above)
    // lands exactly on it, making it the Source-tracked active heading.
    openOrFocusTab("/vault/note.md", "note.md", "## Section one\n\nBody.", "text");
    const { getByRole, container } = render(<App />);
    fireEvent.click(container.querySelector('[data-testid="mock-editor-cursor-move"]')!);

    fireEvent.click(getByRole("button", { name: "Section one" }));

    expect(outlineAnnouncement.value?.message).toBe("Navigated to Section one, line 1.");
  });

  it("announces the note title and line 1 when the breadcrumb root segment is clicked", () => {
    viewMode.value = "split";
    openOrFocusTab("/vault/note.md", "note.md", "Intro\n\n## Section one\n\nBody.", "text");
    const { getByRole } = render(<App />);

    fireEvent.click(getByRole("button", { name: "note.md" }));

    expect(outlineAnnouncement.value?.message).toBe("Navigated to note.md, line 1.");
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

describe("App: speech-to-text dictation gated by speechToTextEnabled, off by default (2026-09-15)", () => {
  it("does not mount SpeechRecognitionButton for an open note when speechToTextEnabled is off (the default)", () => {
    workspacePath.value = "/vault";
    openOrFocusTab("/vault/a.md", "a.md", "", "text");
    const { queryByTestId } = render(<App />);
    expect(queryByTestId("mock-speech-button")).toBeNull();
  });

  it("mounts SpeechRecognitionButton for an open note once speechToTextEnabled is turned on", () => {
    workspacePath.value = "/vault";
    workspaceSettings.value = { ...DEFAULT_WORKSPACE_SETTINGS, speechToTextEnabled: true };
    openOrFocusTab("/vault/a.md", "a.md", "", "text");
    const { queryByTestId } = render(<App />);
    expect(queryByTestId("mock-speech-button")).toBeTruthy();
  });
});

describe("App: accent color applies live (2026-09-04 repro)", () => {
  it("updates document.documentElement's data-accent when workspaceSettings.accentColor changes after mount", () => {
    workspacePath.value = "/vault";
    render(<App />);
    expect(document.documentElement.getAttribute("data-accent")).toBe("warm");

    workspaceSettings.value = { ...workspaceSettings.value, accentColor: "ocean" };

    expect(document.documentElement.getAttribute("data-accent")).toBe("ocean");
  });
});

describe("App: Tags toolbar button gated by tagsEnabled (2026-09-04)", () => {
  it("shows the Tags toolbar button when tagsEnabled is on (the default)", () => {
    // Compact width: at Medium+ (the jsdom-default 1024px width otherwise
    // used here) the Activity Rail now takes over Tags navigation (spec
    // 13.2's "720px and above"), hiding this toolbar button in favor of
    // the rail's own -- this test is specifically about the toolbar one.
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 600 });
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

describe("App: a failed autosave shows a visible error and lets the user retry (maintenance review)", () => {
  it("shows an alert with the failure reason instead of failing silently", async () => {
    // Compact width: at Medium+ (the jsdom-default 1024px width otherwise
    // used here) a text note's save error surfaces through the terser
    // Document Header save-state area instead (spec 13.6), not this
    // detailed classic bar -- this test is specifically about that bar's
    // own full message.
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 600 });
    vi.useFakeTimers();
    writeTextFile.mockRejectedValueOnce(new Error("disk full"));
    openOrFocusTab("/vault/note.md", "note.md", "hello", "text");
    const { container, findByRole } = render(<App />);

    const editor = container.querySelector(
      '[data-testid="mock-editor"]',
    ) as HTMLTextAreaElement;
    fireEvent.input(editor, { target: { value: "hello world" } });

    await act(async () => {
      fireEvent.keyDown(window, { key: "s", ctrlKey: true });
      await Promise.resolve();
      await Promise.resolve();
    });

    const alert = await findByRole("alert");
    expect(alert.textContent).toMatch(/couldn't save "note\.md"/i);
    expect(alert.textContent).toMatch(/disk full/i);
  });

  it("clicking Retry clears the error once the write succeeds", async () => {
    vi.useFakeTimers();
    writeTextFile.mockRejectedValueOnce(new Error("disk full"));
    openOrFocusTab("/vault/note.md", "note.md", "hello", "text");
    const { container, findByRole, queryByRole, getByRole } = render(<App />);

    const editor = container.querySelector(
      '[data-testid="mock-editor"]',
    ) as HTMLTextAreaElement;
    fireEvent.input(editor, { target: { value: "hello world" } });

    await act(async () => {
      fireEvent.keyDown(window, { key: "s", ctrlKey: true });
      await Promise.resolve();
      await Promise.resolve();
    });
    await findByRole("alert");

    await act(async () => {
      fireEvent.click(getByRole("button", { name: "Retry" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(queryByRole("alert")).toBeNull());
    expect(writeTextFile).toHaveBeenCalledTimes(2);
  });
});

describe("App: open-note automation command (Android favorites-list widget)", () => {
  it("opens the note at the given path when it is inside the workspace", async () => {
    settingsLoaded.value = true;
    workspacePath.value = "/vault";
    readTextFile.mockResolvedValueOnce("note content");
    render(<App />);

    await act(async () => {
      openUrlListeners.at(-1)?.(["leotheca://open-note?path=%2Fvault%2Fnote.md"]);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(activeTabPath.value).toBe("/vault/note.md");
    expect(readTextFile).toHaveBeenCalledWith("/vault/note.md");
  });

  it("ignores a path outside the current workspace", async () => {
    settingsLoaded.value = true;
    workspacePath.value = "/vault";
    render(<App />);

    await act(async () => {
      openUrlListeners.at(-1)?.(["leotheca://open-note?path=%2Fother-vault%2Fnote.md"]);
      await Promise.resolve();
    });

    expect(activeTabPath.value).toBeNull();
    expect(readTextFile).not.toHaveBeenCalled();
  });

  it("ignores an open-note command with no path param", async () => {
    settingsLoaded.value = true;
    workspacePath.value = "/vault";
    render(<App />);

    await act(async () => {
      openUrlListeners.at(-1)?.(["leotheca://open-note"]);
      await Promise.resolve();
    });

    expect(activeTabPath.value).toBeNull();
    expect(readTextFile).not.toHaveBeenCalled();
  });

  it("is a silent no-op when no workspace is open", async () => {
    // settingsLoaded must be true here so the new cold-start guard in the
    // open-note branch (waitForSettingsLoaded) resolves immediately rather
    // than holding the command; this test exercises the genuine
    // "settings loaded, but no workspace was ever opened" case, which is
    // still a silent no-op.
    settingsLoaded.value = true;
    workspacePath.value = null;
    render(<App />);

    await act(async () => {
      openUrlListeners.at(-1)?.(["leotheca://open-note?path=%2Fvault%2Fnote.md"]);
      await Promise.resolve();
    });

    expect(readTextFile).not.toHaveBeenCalled();
  });

  it("ignores a path that escapes the workspace via a `..` segment", async () => {
    settingsLoaded.value = true;
    workspacePath.value = "/vault";
    render(<App />);

    await act(async () => {
      openUrlListeners.at(-1)?.(["leotheca://open-note?path=%2Fvault%2F..%2Fsecret.md"]);
      await Promise.resolve();
    });

    expect(readTextFile).not.toHaveBeenCalled();
  });

  it("ignores a path that escapes the workspace via a backslash traversal", async () => {
    settingsLoaded.value = true;
    workspacePath.value = "/vault";
    render(<App />);

    await act(async () => {
      openUrlListeners.at(-1)?.(["leotheca://open-note?path=%2Fvault%5C..%5Csecret.md"]);
      await Promise.resolve();
    });

    expect(readTextFile).not.toHaveBeenCalled();
  });

  it("ignores a path that is a sibling of the workspace (prefix trick)", async () => {
    settingsLoaded.value = true;
    workspacePath.value = "/vault";
    render(<App />);

    await act(async () => {
      openUrlListeners.at(-1)?.(["leotheca://open-note?path=%2Fvault-backdoor%2Fnote.md"]);
      await Promise.resolve();
    });

    expect(readTextFile).not.toHaveBeenCalled();
  });
});

describe("App: open-note automation command (Android favorites-list widget cold start)", () => {
  it("opens the note once settings finish loading, instead of silently dropping a command that raced ahead of them", async () => {
    // Simulates the real cold-start race: CapacitorApp.getLaunchUrl()
    // resolves and dispatches this command before initSettings's own
    // async chain (file reads, SAF access) has restored workspacePath.
    // Before the fix, the open-note branch checked workspacePath.value
    // immediately and silently no-opped, even though the workspace was
    // about to become available a moment later. The fix awaits
    // waitForSettingsLoaded() first (mirroring the new-note branch),
    // holding the command until the workspace is actually restored.
    initSettings.mockReturnValueOnce(new Promise<void>(() => {}));
    readTextFile.mockResolvedValueOnce("note content");
    render(<App />);

    await act(async () => {
      openUrlListeners.at(-1)?.(["leotheca://open-note?path=%2Fvault%2Fnote.md"]);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Settings are still "loading" (initSettings's promise never
    // resolved): the command must be held, not dropped.
    expect(readTextFile).not.toHaveBeenCalled();

    await act(async () => {
      workspacePath.value = "/vault";
      settingsLoaded.value = true;
      for (let i = 0; i < 6; i++) await Promise.resolve();
    });

    // The held command now resolves: the note is read and opened.
    expect(readTextFile).toHaveBeenCalledWith("/vault/note.md");
  });

  it("is a silent no-op once settings finish loading with no workspace ever opened", async () => {
    initSettings.mockReturnValueOnce(new Promise<void>(() => {}));
    render(<App />);

    await act(async () => {
      openUrlListeners.at(-1)?.(["leotheca://open-note?path=%2Fvault%2Fnote.md"]);
      await Promise.resolve();
    });

    await act(async () => {
      settingsLoaded.value = true;
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(readTextFile).not.toHaveBeenCalled();
  });
});

describe("App: new-note automation command (Android home-screen widget cold start)", () => {
  it("creates the note once settings finish loading, instead of silently dropping a command that raced ahead of them", async () => {
    // Simulates the real cold-start race: CapacitorApp.getLaunchUrl()
    // resolves and dispatches this command before initSettings's own
    // async chain (file reads, SAF access) has restored workspacePath.
    initSettings.mockReturnValueOnce(new Promise<void>(() => {}));
    createNoteQuick.mockResolvedValueOnce({
      path: "/vault/Untitled.md",
      name: "Untitled.md",
    });
    render(<App />);

    await act(async () => {
      openUrlListeners.at(-1)?.(["leotheca://new-note"]);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Settings are still "loading" (initSettings's promise never
    // resolved): the command must be held, not dropped.
    expect(createNoteQuick).not.toHaveBeenCalled();

    await act(async () => {
      workspacePath.value = "/vault";
      settingsLoaded.value = true;
      for (let i = 0; i < 6; i++) await Promise.resolve();
    });

    expect(createNoteQuick).toHaveBeenCalledWith("/vault", "");
    // handleOpenFile's own read confirms the created note was actually
    // opened, not just created (activeTabPath itself isn't asserted here:
    // it depends on fileOpenAuthority.ts's module-level generation counter,
    // which is shared and unreset across this whole test file, so it isn't
    // a reliable per-test signal; "open-note"'s own tests above already
    // cover that focus behavior in isolation).
    expect(readTextFile).toHaveBeenCalledWith("/vault/Untitled.md");
  });

  it("is a silent no-op once settings finish loading with no workspace ever opened", async () => {
    initSettings.mockReturnValueOnce(new Promise<void>(() => {}));
    render(<App />);

    await act(async () => {
      openUrlListeners.at(-1)?.(["leotheca://new-note"]);
      await Promise.resolve();
    });

    await act(async () => {
      settingsLoaded.value = true;
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(createNoteQuick).not.toHaveBeenCalled();
  });
});

describe("App: OS file-association external file open (ROADMAP.md desktop-only feature)", () => {
  it("opens the note directly, through the ordinary tab machinery, when the path is inside the current workspace", async () => {
    workspacePath.value = "/vault";
    readTextFile.mockResolvedValueOnce("note content");
    render(<App />);

    await act(async () => {
      externalFileOpenListeners.at(-1)?.("/vault/note.md");
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(activeTabPath.value).toBe("/vault/note.md");
    expect(readTextFile).toHaveBeenCalledWith("/vault/note.md");
  });

  it("shows a read-only scratch view, not an editable tab, when the path is outside the current workspace", async () => {
    workspacePath.value = "/vault";
    readTextFile.mockResolvedValueOnce("external content");
    const { findByText, getByText } = render(<App />);

    await act(async () => {
      externalFileOpenListeners.at(-1)?.("/elsewhere/other.md");
      await Promise.resolve();
      await Promise.resolve();
    });

    await findByText("external content");
    expect(getByText("/elsewhere/other.md")).toBeTruthy();
    expect(getByText(/Opened from outside your workspace/)).toBeTruthy();
    // Never routed through the workspace tab machinery: no tab opens for it.
    expect(activeTabPath.value).not.toBe("/elsewhere/other.md");
  });

  it("shows the scratch view when no workspace is open at all", async () => {
    workspacePath.value = null;
    readTextFile.mockResolvedValueOnce("orphan content");
    const { findByText } = render(<App />);

    await act(async () => {
      externalFileOpenListeners.at(-1)?.("/notes/orphan.md");
      await Promise.resolve();
      await Promise.resolve();
    });

    await findByText("orphan content");
  });

  it("does nothing when externalFileOpenEnabled is off", async () => {
    workspacePath.value = "/vault";
    externalFileOpenEnabled.value = false;
    render(<App />);

    await act(async () => {
      externalFileOpenListeners.at(-1)?.("/vault/note.md");
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(readTextFile).not.toHaveBeenCalled();
    expect(activeTabPath.value).toBeNull();
  });

  it("ignores a path that isn't a .md file", async () => {
    workspacePath.value = "/vault";
    render(<App />);

    await act(async () => {
      externalFileOpenListeners.at(-1)?.("/vault/image.png");
      await Promise.resolve();
    });

    expect(readTextFile).not.toHaveBeenCalled();
  });

  it("opens a cold-start pending file (fresh launch via OS file association) once settings finish loading", async () => {
    workspacePath.value = "/vault";
    readTextFile.mockResolvedValueOnce("note content");
    takePendingExternalFile.mockResolvedValueOnce("/vault/note.md");
    render(<App />);

    await act(async () => {
      settingsLoaded.value = true;
      for (let i = 0; i < 6; i++) await Promise.resolve();
    });

    expect(activeTabPath.value).toBe("/vault/note.md");
  });

  it("'Open containing folder as a workspace' activates that folder and closes the scratch view", async () => {
    workspacePath.value = "/vault";
    readTextFile.mockResolvedValueOnce("external content");
    const { findByText, getByText, queryByText } = render(<App />);

    await act(async () => {
      externalFileOpenListeners.at(-1)?.("/elsewhere/notes/other.md");
      await Promise.resolve();
      await Promise.resolve();
    });
    await findByText("external content");

    await act(async () => {
      fireEvent.click(getByText("Open containing folder as a workspace"));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(addWorkspaceFromPathSpy).toHaveBeenCalledWith("/elsewhere/notes");
    expect(queryByText("external content")).toBeNull();
  });

  it("shows an error and keeps the scratch view open when 'Open containing folder as a workspace' fails", async () => {
    workspacePath.value = "/vault";
    readTextFile.mockResolvedValueOnce("external content");
    addWorkspaceFromPathSpy.mockRejectedValueOnce(new Error("permission denied"));
    const { findByText, getByText, queryByText } = render(<App />);

    await act(async () => {
      externalFileOpenListeners.at(-1)?.("/elsewhere/notes/other.md");
      await Promise.resolve();
      await Promise.resolve();
    });
    await findByText("external content");

    await act(async () => {
      fireEvent.click(getByText("Open containing folder as a workspace"));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(addWorkspaceFromPathSpy).toHaveBeenCalledWith("/elsewhere/notes");
    // The scratch view stays open (unlike the success case above) with the
    // failure surfaced, rather than silently reverting to its normal state
    // with no indication anything went wrong.
    expect(queryByText("external content")).toBeTruthy();
    expect(getByText("permission denied")).toBeTruthy();
    expect(getByText("Open containing folder as a workspace")).toBeTruthy();

    // A second attempt clears the stale error rather than leaving it stuck
    // once the underlying problem is fixed.
    addWorkspaceFromPathSpy.mockResolvedValueOnce(undefined);
    await act(async () => {
      fireEvent.click(getByText("Open containing folder as a workspace"));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(queryByText("permission denied")).toBeNull();
    expect(queryByText("external content")).toBeNull();
  });
});

describe("App: 'Open file from outside the vault...' in-app command (ROADMAP.md desktop-only feature)", () => {
  const openCommandPalette = async () => {
    fireEvent.click(document.querySelector('[aria-label="Command palette"]')!);
    await Promise.resolve();
  };

  const runOpenFromOutsideVaultCommand = async (getByPlaceholderText: (t: string) => HTMLElement, getByText: (t: string) => HTMLElement) => {
    await act(async () => {
      await openCommandPalette();
    });
    fireEvent.input(getByPlaceholderText("Type a command..."), {
      target: { value: "outside the vault" },
    });
    await act(async () => {
      fireEvent.click(getByText("Open file from outside the vault..."));
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  it("reuses the ordinary tab machinery when the picked file is inside the current workspace", async () => {
    workspacePath.value = "/vault";
    readTextFile.mockResolvedValueOnce("note content");
    pickMarkdownFileToOpen.mockResolvedValueOnce("/vault/note.md");
    const { getByPlaceholderText, getByText } = render(<App />);

    await runOpenFromOutsideVaultCommand(getByPlaceholderText, getByText);

    expect(pickMarkdownFileToOpen).toHaveBeenCalledTimes(1);
    expect(activeTabPath.value).toBe("/vault/note.md");
    expect(readTextFile).toHaveBeenCalledWith("/vault/note.md");
  });

  it("shows the read-only scratch view when the picked file is outside the current workspace", async () => {
    workspacePath.value = "/vault";
    readTextFile.mockResolvedValueOnce("external content");
    pickMarkdownFileToOpen.mockResolvedValueOnce("/elsewhere/other.md");
    const { getByPlaceholderText, getByText, findByText } = render(<App />);

    await runOpenFromOutsideVaultCommand(getByPlaceholderText, getByText);

    await findByText("external content");
    expect(getByText("/elsewhere/other.md")).toBeTruthy();
    expect(activeTabPath.value).not.toBe("/elsewhere/other.md");
  });

  it("does nothing when the dialog is cancelled", async () => {
    workspacePath.value = "/vault";
    pickMarkdownFileToOpen.mockResolvedValueOnce(null);
    const { getByPlaceholderText, getByText } = render(<App />);

    await runOpenFromOutsideVaultCommand(getByPlaceholderText, getByText);

    expect(pickMarkdownFileToOpen).toHaveBeenCalledTimes(1);
    expect(readTextFile).not.toHaveBeenCalled();
    expect(activeTabPath.value).toBeNull();
  });
});

describe("App: pending captures require explicit review before writing (spec F05-FR-03)", () => {
  it("does not auto-commit a queued deep-link capture just because a workspace becomes available", async () => {
    // Simulates an external deep link received while no workspace was open:
    // queueCaptureIfNoWorkspace stages it in pendingCapturesStore with
    // status "pending", awaiting explicit review/commit through
    // PendingCapturesPanel or the Capture Sheet. Merely opening a
    // workspace afterwards must never silently write it to disk.
    addPendingCapture({
      source: "deep-link",
      text: "Secret draft captured before any workspace was open",
      mode: "append",
      openAfterCommit: false,
    });

    render(<App />);

    await act(async () => {
      workspacePath.value = "/vault";
      settingsLoaded.value = true;
      for (let i = 0; i < 6; i++) await Promise.resolve();
      await new Promise((r) => setTimeout(r, 50));
    });

    // Asserted by content rather than call count: this suite's shared
    // writeTextFile spy can also observe unrelated delayed writes from
    // other tests' autosave timers landing in this window, which is not
    // what this regression is about.
    expect(writeTextFile).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("Secret draft captured before any workspace was open")
    );
    expect(pendingCapturesStore.value).toHaveLength(1);
    expect(pendingCapturesStore.value[0].status).toBe("pending");
  });

  it("does not auto-commit a queued Android share capture just because a workspace becomes available", async () => {
    addPendingCapture({
      source: "android-share",
      text: "Shared text staged before the app finished starting",
      mode: "append",
      openAfterCommit: true,
    });

    render(<App />);

    await act(async () => {
      workspacePath.value = "/vault";
      settingsLoaded.value = true;
      for (let i = 0; i < 6; i++) await Promise.resolve();
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(writeTextFile).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("Shared text staged before the app finished starting")
    );
    expect(pendingCapturesStore.value).toHaveLength(1);
    expect(pendingCapturesStore.value[0].status).toBe("pending");
  });
});

describe("App: F07 Phase 3 split pane", () => {
  it("'Split right' creates an empty secondary pane; 'Close reference group' removes it", () => {
    workspacePath.value = "/vault";
    openOrFocusTab("/vault/a.md", "a.md", "hello", "text");
    const { container, getByRole } = render(<App />);

    expect(container.querySelector(".secondary-group")).toBeNull();

    fireEvent.click(getByRole("button", { name: "Split right" }));

    expect(editorLayout.value.splitEnabled).toBe(true);
    const secondary = container.querySelector(".secondary-group");
    expect(secondary).toBeTruthy();
    expect(secondary?.textContent).toContain("No note open in this group.");

    fireEvent.click(getByRole("button", { name: "Close reference group" }));

    expect(editorLayout.value.splitEnabled).toBe(false);
    expect(container.querySelector(".secondary-group")).toBeNull();
  });

  it("'Move active tab to the other group' moves primary's active tab into a freshly split secondary pane", () => {
    workspacePath.value = "/vault";
    openOrFocusTab("/vault/a.md", "a.md", "hello", "text");
    const { container, getByRole } = render(<App />);

    fireEvent.click(getByRole("button", { name: "Split right" }));
    fireEvent.click(getByRole("button", { name: "Move active tab to the other group" }));

    expect(openTabs.value).toEqual([]);
    expect(secondaryOpenTabs.value.map((t) => t.path)).toEqual(["/vault/a.md"]);
    const secondary = container.querySelector(".secondary-group");
    expect(secondary?.querySelector(".tab-bar")?.textContent).toContain("a.md");
  });

  it("the secondary pane's own view-mode toggle is independent of primary's", () => {
    workspacePath.value = "/vault";
    openOrFocusTab("/vault/a.md", "a.md", "primary note", "text");
    openOrFocusTab("/vault/b.md", "b.md", "secondary note", "text");
    const { container, getByRole } = render(<App />);

    fireEvent.click(getByRole("button", { name: "Split right" }));
    fireEvent.click(getByRole("button", { name: "Move active tab to the other group" }));
    // "/vault/b.md" (the active tab at split time) is now secondary's only tab.

    const secondary = container.querySelector(".secondary-group") as HTMLElement;
    const previewButton = secondary.querySelector('button[title="Preview"]') as HTMLButtonElement;
    fireEvent.click(previewButton);

    expect(editorLayout.value.groups.secondary?.viewMode).toBe("preview");
    expect(editorLayout.value.groups.primary.viewMode).toBe("source"); // untouched
  });

  it("'Move current tab here' in the secondary empty state moves primary's active tab there", () => {
    workspacePath.value = "/vault";
    openOrFocusTab("/vault/a.md", "a.md", "hello", "text");
    const { container, getByRole, getByText } = render(<App />);

    fireEvent.click(getByRole("button", { name: "Split right" }));
    // Split right with no target leaves an empty secondary and primary active;
    // its own empty-state button exercises the same move, from inside the pane.
    fireEvent.click(getByText("Move current tab here"));

    expect(openTabs.value).toEqual([]);
    expect(secondaryOpenTabs.value.map((t) => t.path)).toEqual(["/vault/a.md"]);
    expect(container.querySelector(".secondary-group")?.textContent).not.toContain(
      "No note open in this group.",
    );
  });
});

describe("App: F07 Phase 3 close blocks on an unresolved save error", () => {
  it("blocks 'Close reference group' when a secondary tab has a save error, and lets it through once resolved", () => {
    workspacePath.value = "/vault";
    openOrFocusTab("/vault/a.md", "a.md", "hello", "text");
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const { getByRole } = render(<App />);

    fireEvent.click(getByRole("button", { name: "Split right" }));
    fireEvent.click(getByRole("button", { name: "Move active tab to the other group" }));
    expect(secondaryOpenTabs.value.map((t) => t.path)).toEqual(["/vault/a.md"]);

    // Simulate a failed save on the note now sitting in the secondary
    // group: openDocuments is the canonical, group-agnostic source of
    // truth secondaryOpenTabs derives from.
    openDocuments.value = openDocuments.value.map((d) =>
      d.path === "/vault/a.md" ? { ...d, saveError: "disk full" } : d,
    );

    fireEvent.click(getByRole("button", { name: "Close reference group" }));

    expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining("a.md"));
    expect(editorLayout.value.splitEnabled).toBe(true); // still open, not closed
    expect(secondaryOpenTabs.value.map((t) => t.path)).toEqual(["/vault/a.md"]);

    openDocuments.value = openDocuments.value.map((d) => (d.path === "/vault/a.md" ? { ...d, saveError: null } : d));
    fireEvent.click(getByRole("button", { name: "Close reference group" }));

    expect(editorLayout.value.splitEnabled).toBe(false);
    alertSpy.mockRestore();
  });
});

describe("App: F07 Phase 3 follow-up -- tab reordering", () => {
  it("the tab bar's context menu 'Move right' reorders the real primary tab list", () => {
    workspacePath.value = "/vault";
    openOrFocusTab("/vault/a.md", "a.md", "", "text");
    openOrFocusTab("/vault/b.md", "b.md", "", "text");
    const { container, getByText } = render(<App />);

    fireEvent.contextMenu(getByText("a.md"));
    fireEvent.click(getByText("Move right"));

    expect(openTabs.value.map((t) => t.path)).toEqual(["/vault/b.md", "/vault/a.md"]);
    const names = Array.from(container.querySelectorAll(".tab-name")).map((el) => el.textContent);
    expect(names).toEqual(["b.md", "a.md"]);
  });

});

describe("App: F07 Phase 5 -- Ctrl/Cmd-click opens a wikilink in the other group", () => {
  it("creates a split and opens the target there, leaving the current note in primary", async () => {
    linkIndex.value = {
      ...emptyLinkIndex(),
      pathsByNoteName: new Map([["second", ["/vault/second.md"]]]),
    };
    viewMode.value = "split";
    workspacePath.value = "/vault";
    readTextFile.mockResolvedValue("second file content");
    openOrFocusTab("/vault/first.md", "first.md", "See [[Second]] over there.", "text");
    const { container } = render(<App />);

    const anchor = container.querySelector('a[href^="#leotheca-wikilink="]') as HTMLAnchorElement;
    expect(anchor).toBeTruthy();

    await act(async () => {
      fireEvent.click(anchor, { ctrlKey: true });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(editorLayout.value.splitEnabled).toBe(true);
    expect(secondaryOpenTabs.value.map((t) => t.path)).toEqual(["/vault/second.md"]);
    expect(openTabs.value.map((t) => t.path)).toEqual(["/vault/first.md"]);
  });

  it("at a narrow viewport, shows the secondary pane (not primary) for the note it just opened there (regression)", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 600 });
    linkIndex.value = {
      ...emptyLinkIndex(),
      pathsByNoteName: new Map([["second", ["/vault/second.md"]]]),
    };
    viewMode.value = "split";
    workspacePath.value = "/vault";
    readTextFile.mockResolvedValue("second file content");
    openOrFocusTab("/vault/first.md", "first.md", "See [[Second]] over there.", "text");
    const { container } = render(<App />);

    const anchor = container.querySelector('a[href^="#leotheca-wikilink="]') as HTMLAnchorElement;
    expect(anchor).toBeTruthy();

    await act(async () => {
      fireEvent.click(anchor, { ctrlKey: true });
      await Promise.resolve();
      await Promise.resolve();
    });

    // Regression: openInOtherGroup used to leave compactVisibleGroupId
    // pointed at primary, so the note it just opened into secondary was
    // invisible at a narrow width until the user manually tapped the
    // switcher.
    expect(editorLayout.value.compactVisibleGroupId).toBe("secondary");
    expect(container.querySelector(".secondary-group")).toBeTruthy();
    expect(container.querySelector(".editor-area:not(.secondary-group)")).toBeNull();
  });

  it("targets primary for an image link Ctrl/Cmd-clicked in the secondary pane while primary is still the active group (regression)", async () => {
    // The image branch of handleOpenFile calls openInOtherGroup with no
    // await in between (unlike the text-note branch, which awaits
    // readTextFile first), so it's the one that actually reproduces this
    // bug: resolving "other" from the global activeGroupId instead of
    // the clicked-in pane's own note.
    linkIndex.value = {
      ...emptyLinkIndex(),
      pathsByNoteName: new Map([["photo", ["/vault/photo.png"]]]),
    };
    workspacePath.value = "/vault";
    openOrFocusTab("/vault/first.md", "first.md", "Working note.", "text");
    openInOtherGroup("/vault/second.md", "second.md", "See [[Photo]] over there.", "text");
    // Realistic sequence this regression needs: the user opened a
    // reference note into secondary, then went back to working in
    // primary -- activeGroupId is "primary" again by the time they
    // Ctrl/Cmd-click a link inside the secondary pane they're reading.
    focusGroup("primary");
    const { container } = render(<App />);

    const anchor = container.querySelector(
      '.secondary-group a[href^="#leotheca-wikilink="]',
    ) as HTMLAnchorElement;
    expect(anchor).toBeTruthy();

    await act(async () => {
      fireEvent.click(anchor, { ctrlKey: true });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(openTabs.value.map((t) => t.path)).toEqual(["/vault/first.md", "/vault/photo.png"]);
    expect(secondaryOpenTabs.value.map((t) => t.path)).toEqual(["/vault/second.md"]);
  });
});

describe("App: F07 Phase 4 -- compact layout and group switching", () => {
  it("shows only the primary pane and no switcher when unsplit, even at a narrow width", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 600 });
    workspacePath.value = "/vault";
    openOrFocusTab("/vault/a.md", "a.md", "hello", "text");
    const { container } = render(<App />);

    expect(container.querySelector(".compact-group-switcher")).toBeNull();
    expect(container.querySelector(".editor-area")).toBeTruthy();
  });

  it("at a narrow width, a split shows the switcher and only the active group's pane", () => {
    workspacePath.value = "/vault";
    openOrFocusTab("/vault/a.md", "a.md", "hello", "text");
    const { container, getByRole } = render(<App />);

    fireEvent.click(getByRole("button", { name: "Split right" }));

    Object.defineProperty(window, "innerWidth", { configurable: true, value: 600 });
    fireEvent(window, new Event("resize"));

    const switcher = container.querySelector(".compact-group-switcher");
    expect(switcher).toBeTruthy();
    expect(container.querySelector(".editor-area")).toBeTruthy();
    expect(container.querySelector(".secondary-group")).toBeNull();
    expect(container.querySelector(".split-separator")).toBeNull();
  });

  it("switching groups from the compact switcher swaps the visible pane without touching activeGroupId", () => {
    workspacePath.value = "/vault";
    openOrFocusTab("/vault/a.md", "a.md", "hello", "text");
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 600 });
    const { container, getByRole } = render(<App />);

    fireEvent.click(getByRole("button", { name: "Split right" }));
    const activeGroupBefore = editorLayout.value.activeGroupId;
    expect(editorLayout.value.compactVisibleGroupId).toBe("primary");

    fireEvent.click(getByRole("tab", { name: /Reference:/ }));

    expect(editorLayout.value.compactVisibleGroupId).toBe("secondary");
    expect(editorLayout.value.activeGroupId).toBe(activeGroupBefore);
    expect(container.querySelector(".secondary-group")).toBeTruthy();
    expect(container.querySelector(".editor-area:not(.secondary-group)")).toBeNull();
  });

  it("rotating back to a wide viewport shows both panes again without altering editorLayout state", () => {
    workspacePath.value = "/vault";
    openOrFocusTab("/vault/a.md", "a.md", "hello", "text");
    const { container, getByRole } = render(<App />);

    fireEvent.click(getByRole("button", { name: "Split right" }));

    Object.defineProperty(window, "innerWidth", { configurable: true, value: 600 });
    fireEvent(window, new Event("resize"));
    expect(container.querySelector(".secondary-group")).toBeNull();

    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
    fireEvent(window, new Event("resize"));

    expect(container.querySelector(".compact-group-switcher")).toBeNull();
    expect(container.querySelector(".editor-area")).toBeTruthy();
    expect(container.querySelector(".secondary-group")).toBeTruthy();
    expect(container.querySelector(".split-separator")).toBeTruthy();
    expect(editorLayout.value.splitEnabled).toBe(true);
  });
});

/** sidebarOpen/bookmarksOpen/etc. are module-level signals internal to
 * App.tsx (not exported, and not reset by this file's own afterEach,
 * which -- like every other pre-existing test here -- never needed to
 * know their value directly). Selecting Files is idempotent from any
 * starting destination except when Files is already exclusively active,
 * where it closes the panel instead, so one conditional click reaches a
 * known baseline regardless of what an earlier test in this file left
 * behind. */
function ensureFilesActive(getByLabelText: (text: string) => HTMLElement): void {
  if (getByLabelText("Files").getAttribute("aria-current") !== "true") {
    fireEvent.click(getByLabelText("Files"));
  }
}

/** Same reasoning as ensureFilesActive above: inspectorOpen is another
 * not-exported, not-reset-by-afterEach module-level signal internal to
 * App.tsx, this time toggled by the Document Header's own Inspector
 * button (only present with a text note open). DOM-checked and closed
 * via a real click rather than assumed, so a leftover open Inspector from
 * an earlier test in this file can't flip a later test's own toggle
 * click the wrong way. */
function ensureInspectorClosed(
  container: Element,
  getByLabelText: (text: string) => HTMLElement,
): void {
  if (container.querySelector(".inspector")) {
    fireEvent.click(getByLabelText("Close Inspector"));
  }
}

describe("App: UX-01 Activity Rail (Medium+ layout)", () => {
  it("shows the Activity Rail and hides its now-duplicated toolbar buttons at Wide width", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
    workspacePath.value = "/vault";
    const { container, getByLabelText, queryByLabelText } = render(<App />);

    expect(container.querySelector(".activity-rail")).toBeTruthy();
    expect(getByLabelText("Files")).toBeTruthy();
    expect(getByLabelText("Bookmarks")).toBeTruthy();
    expect(getByLabelText("Tags")).toBeTruthy();
    expect(getByLabelText("Graph view")).toBeTruthy();
    expect(getByLabelText("Settings")).toBeTruthy();
    // The toolbar's own versions of these five are now hidden, not
    // duplicated (aria-label collisions would otherwise make getByLabelText
    // above ambiguous, and did fail loudly during development of this
    // feature until the toolbar-side buttons were actually hidden).
    expect(queryByLabelText("Toggle file browser")).toBeNull();
    expect(queryByLabelText("View bookmarks")).toBeNull();
    expect(queryByLabelText("View tags")).toBeNull();
  });

  it("keeps the pre-existing toolbar (no rail) below the Medium threshold, e.g. at Compact width", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 600 });
    workspacePath.value = "/vault";
    const { container, getByLabelText, queryByLabelText } = render(<App />);

    expect(container.querySelector(".activity-rail")).toBeNull();
    expect(getByLabelText("Toggle file browser")).toBeTruthy();
    expect(getByLabelText("View bookmarks")).toBeTruthy();
    expect(getByLabelText("View tags")).toBeTruthy();
    expect(queryByLabelText("Files")).toBeNull();
  });

  it("shows the Activity Rail at Medium width too, per spec 13.2's '720px and above'", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 900 });
    workspacePath.value = "/vault";
    const { container, queryByLabelText } = render(<App />);

    expect(container.querySelector(".activity-rail")).toBeTruthy();
    expect(queryByLabelText("Toggle file browser")).toBeNull();
  });

  it("crossing the Medium boundary on resize swaps between the two without losing the open note", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 600 });
    workspacePath.value = "/vault";
    openOrFocusTab("/vault/a.md", "a.md", "hello", "text");
    const { container } = render(<App />);

    Object.defineProperty(window, "innerWidth", { configurable: true, value: 900 });
    fireEvent(window, new Event("resize"));
    expect(container.querySelector(".activity-rail")).toBeTruthy();
    expect(openTabs.value.map((t) => t.path)).toEqual(["/vault/a.md"]);

    Object.defineProperty(window, "innerWidth", { configurable: true, value: 600 });
    fireEvent(window, new Event("resize"));
    expect(container.querySelector(".activity-rail")).toBeNull();
    expect(openTabs.value.map((t) => t.path)).toEqual(["/vault/a.md"]);
  });

  it("selecting Bookmarks from the rail swaps the Navigation Panel content and marks Bookmarks active", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
    workspacePath.value = "/vault";
    const { getByLabelText, getByText } = render(<App />);
    ensureFilesActive(getByLabelText);

    fireEvent.click(getByLabelText("Bookmarks"));

    // No bookmarks are seeded in this test, so BookmarksPanel renders its
    // own empty state rather than a populated .bookmarks-list -- its text
    // is still an unambiguous signal that BookmarksPanel, not the file
    // tree, is what the Navigation Panel is now showing.
    expect(getByText("No bookmarks yet.")).toBeTruthy();
    expect(getByLabelText("Bookmarks").getAttribute("aria-current")).toBe("true");
    expect(getByLabelText("Files").getAttribute("aria-current")).toBeNull();
  });

  it("re-selecting the already-active Files destination closes the Navigation Panel", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
    workspacePath.value = "/vault";
    const { container, getByLabelText } = render(<App />);
    ensureFilesActive(getByLabelText);

    expect(getByLabelText("Files").getAttribute("aria-current")).toBe("true");
    expect(container.querySelector(".sidebar")).toBeTruthy();

    fireEvent.click(getByLabelText("Files"));

    expect(container.querySelector(".sidebar")).toBeNull();
  });

  it("selecting Files after Bookmarks switches the panel back rather than closing it", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
    workspacePath.value = "/vault";
    const { container, getByLabelText, getByText, queryByText } = render(<App />);
    ensureFilesActive(getByLabelText);

    fireEvent.click(getByLabelText("Bookmarks"));
    expect(getByText("No bookmarks yet.")).toBeTruthy();

    fireEvent.click(getByLabelText("Files"));

    expect(container.querySelector(".sidebar")).toBeTruthy();
    expect(queryByText("No bookmarks yet.")).toBeNull();
    expect(getByLabelText("Files").getAttribute("aria-current")).toBe("true");
  });
});

describe("App: UX-01 Medium width Navigation Panel overlay (spec 12.1/12.4)", () => {
  it("renders the Navigation Panel as an overlay with a backdrop at Medium width", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 900 });
    workspacePath.value = "/vault";
    const { container, getByLabelText } = render(<App />);
    ensureFilesActive(getByLabelText);

    expect(container.querySelector(".sidebar--overlay")).toBeTruthy();
    expect(container.querySelector(".sidebar-overlay-backdrop")).toBeTruthy();
  });

  it("stays docked, with no overlay backdrop, at Wide width", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
    workspacePath.value = "/vault";
    const { container, getByLabelText } = render(<App />);
    ensureFilesActive(getByLabelText);

    expect(container.querySelector(".sidebar")).toBeTruthy();
    expect(container.querySelector(".sidebar--overlay")).toBeNull();
    expect(container.querySelector(".sidebar-overlay-backdrop")).toBeNull();
  });

  it("clicking the backdrop closes the overlay Navigation Panel", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 900 });
    workspacePath.value = "/vault";
    const { container, getByLabelText } = render(<App />);
    ensureFilesActive(getByLabelText);
    expect(container.querySelector(".sidebar")).toBeTruthy();

    fireEvent.click(container.querySelector(".sidebar-overlay-backdrop")!);

    expect(container.querySelector(".sidebar")).toBeNull();
  });

  it("pressing Escape closes the overlay Navigation Panel", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 900 });
    workspacePath.value = "/vault";
    const { container, getByLabelText } = render(<App />);
    ensureFilesActive(getByLabelText);
    expect(container.querySelector(".sidebar")).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(container.querySelector(".sidebar")).toBeNull();
  });

  it("does not react to Escape when the Navigation Panel is already closed", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 900 });
    workspacePath.value = "/vault";
    const { container } = render(<App />);
    expect(container.querySelector(".sidebar")).toBeNull();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(container.querySelector(".sidebar")).toBeNull();
  });
});

describe("App: UX-01 Document Header (Medium+ layout)", () => {
  it("shows the Document Header for an open note at Wide width, with the toolbar's own view-mode/bookmark buttons hidden", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
    workspacePath.value = "/vault";
    openOrFocusTab("/vault/a.md", "a.md", "hello", "text");
    const { container } = render(<App />);

    expect(container.querySelector(".document-header")).toBeTruthy();
    expect(container.querySelector(".document-header-title")?.textContent).toBe("a.md");
    // Exactly one Source/Split/Preview switch should exist (inside the
    // header, now DocumentHeader's SegmentedControl), not a second copy
    // left behind in the toolbar (still the old .view-mode-switch markup).
    expect(container.querySelectorAll(".view-mode-switch").length).toBe(0);
    expect(container.querySelector(".document-header .segmented")).toBeTruthy();
  });

  it("has no Document Header at Compact width; the toolbar keeps its own view-mode switch instead", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 600 });
    workspacePath.value = "/vault";
    openOrFocusTab("/vault/a.md", "a.md", "hello", "text");
    const { container } = render(<App />);

    expect(container.querySelector(".document-header")).toBeNull();
    expect(container.querySelectorAll(".view-mode-switch").length).toBe(1);
    expect(container.querySelector(".toolbar .view-mode-switch")).toBeTruthy();
  });

  it("shows the Document Header at Medium width too, per spec 13.2's '720px and above'", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 900 });
    workspacePath.value = "/vault";
    openOrFocusTab("/vault/a.md", "a.md", "hello", "text");
    const { container } = render(<App />);

    expect(container.querySelector(".document-header")).toBeTruthy();
  });

  it("switching view mode from the Document Header updates the rendered pane", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
    workspacePath.value = "/vault";
    openOrFocusTab("/vault/a.md", "a.md", "hello", "text");
    const { container, getByLabelText } = render(<App />);

    expect(viewMode.value).toBe("source");
    fireEvent.click(getByLabelText("Preview"));

    expect(viewMode.value).toBe("preview");
    expect(container.querySelector(".markdown-preview")).toBeTruthy();
  });

  it("does not show the Document Header when no note is open, even at Wide width", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
    workspacePath.value = "/vault";
    const { container } = render(<App />);

    expect(container.querySelector(".document-header")).toBeNull();
  });

  it("shows the full path as the title's tooltip", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
    workspacePath.value = "/vault";
    openOrFocusTab("/vault/notes/a.md", "a.md", "hello", "text");
    const { container } = render(<App />);

    expect(container.querySelector(".document-header-path")?.getAttribute("title")).toBe(
      "/vault/notes/a.md",
    );
  });

  it("surfaces a save error through the Document Header's own save-state area instead of the classic save-error-bar", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
    workspacePath.value = "/vault";
    openOrFocusTab("/vault/a.md", "a.md", "hello", "text");
    openDocuments.value = openDocuments.value.map((d) =>
      d.path === "/vault/a.md" ? { ...d, saveError: "disk full" } : d,
    );
    const { container, getByText } = render(<App />);

    expect(container.querySelector(".document-header-savestate")?.textContent).toContain(
      "Save failed",
    );
    expect(container.querySelector(".save-error-bar")).toBeNull();
    expect(getByText("Save failed")).toBeTruthy();
  });

  it("keeps the classic save-error-bar at Compact width, where there is no Document Header", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 600 });
    workspacePath.value = "/vault";
    openOrFocusTab("/vault/a.md", "a.md", "hello", "text");
    openDocuments.value = openDocuments.value.map((d) =>
      d.path === "/vault/a.md" ? { ...d, saveError: "disk full" } : d,
    );
    const { container } = render(<App />);

    expect(container.querySelector(".save-error-bar")).toBeTruthy();
  });

  it("shows a dirty indicator in the Document Header for unsaved changes", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
    workspacePath.value = "/vault";
    openOrFocusTab("/vault/a.md", "a.md", "hello", "text");
    openDocuments.value = openDocuments.value.map((d) =>
      d.path === "/vault/a.md" ? { ...d, dirty: true } : d,
    );
    const { getByLabelText } = render(<App />);

    expect(getByLabelText("Unsaved changes")).toBeTruthy();
  });

  describe("overflow menu (spec 13.5: 'lower-frequency current-note actions and Help entries')", () => {
    it("opens Rename with the current note's name pre-filled", () => {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
      workspacePath.value = "/vault";
      openOrFocusTab("/vault/notes/a.md", "a.md", "hello", "text");
      const { getByLabelText, getByText, container } = render(<App />);

      fireEvent.click(getByLabelText("More note actions"));
      fireEvent.click(getByText("Rename"));

      const dialog = container.querySelector(".name-prompt");
      expect(dialog).toBeTruthy();
      expect(dialog?.querySelector("h2")?.textContent).toBe("Rename");
      expect((dialog?.querySelector("input") as HTMLInputElement | null)?.value).toBe("a.md");
    });

    it("copies the note's path relative to the workspace root, not the absolute path", async () => {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
      const writeText = vi.fn(async () => {});
      Object.assign(navigator, { clipboard: { writeText } });
      workspacePath.value = "/vault";
      openOrFocusTab("/vault/notes/a.md", "a.md", "hello", "text");
      const { getByLabelText, getByText } = render(<App />);

      fireEvent.click(getByLabelText("More note actions"));
      fireEvent.click(getByText("Copy Relative Path"));

      await waitFor(() => expect(writeText).toHaveBeenCalledWith("notes/a.md"));
    });

    it("opens Markdown Help", () => {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
      workspacePath.value = "/vault";
      openOrFocusTab("/vault/a.md", "a.md", "hello", "text");
      const { getByLabelText, getByText, container } = render(<App />);

      fireEvent.click(getByLabelText("More note actions"));
      fireEvent.click(getByText("Markdown Help"));

      expect(getByText("Markdown formatting")).toBeTruthy();

      // markdownHelpOpen is a module-level signal App.tsx never exports, so
      // there is no afterEach hook that can reset it for us: leaving this
      // dialog open here would leak into every later test in this file
      // (its own ".modal" node would then coexist with any dialog a later
      // test opens, breaking a plain ".modal" query/waitFor there).
      fireEvent.click(container.querySelector(".modal-close")!);
    });

    it("deletes the note and closes its tab without a confirmation prompt when trashing (the default deleteBehavior)", async () => {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
      workspacePath.value = "/vault";
      workspaceSettings.value = { ...DEFAULT_WORKSPACE_SETTINGS, deleteBehavior: "project-trash" };
      openOrFocusTab("/vault/a.md", "a.md", "hello", "text");
      const { getByLabelText, getByText, container } = render(<App />);

      fireEvent.click(getByLabelText("More note actions"));
      fireEvent.click(getByText("Delete"));

      await waitFor(() => expect(deleteEntry).toHaveBeenCalledWith("/vault", "/vault/a.md"));
      await waitFor(() => expect(container.querySelector(".document-header")).toBeNull());
    });

    it("asks for confirmation before a permanent delete, and does not delete on Cancel", async () => {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
      workspacePath.value = "/vault";
      workspaceSettings.value = { ...DEFAULT_WORKSPACE_SETTINGS, deleteBehavior: "permanent" };
      openOrFocusTab("/vault/a.md", "a.md", "hello", "text");
      deleteEntry.mockClear();
      const { getByLabelText, getByText, container } = render(<App />);

      fireEvent.click(getByLabelText("More note actions"));
      fireEvent.click(getByText("Delete"));

      await waitFor(() => expect(container.querySelector(".modal")).toBeTruthy());
      fireEvent.click(getByText("Cancel"));
      await waitFor(() => expect(container.querySelector(".modal")).toBeNull());

      expect(deleteEntry).not.toHaveBeenCalled();
      expect(container.querySelector(".document-header")).toBeTruthy();
    });

    it("surfaces a delete failure instead of leaving it silent", async () => {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
      workspacePath.value = "/vault";
      workspaceSettings.value = { ...DEFAULT_WORKSPACE_SETTINGS, deleteBehavior: "project-trash" };
      openOrFocusTab("/vault/a.md", "a.md", "hello", "text");
      deleteEntry.mockRejectedValueOnce(new Error("disk full"));
      const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
      const { getByLabelText, getByText, container } = render(<App />);

      fireEvent.click(getByLabelText("More note actions"));
      fireEvent.click(getByText("Delete"));

      await waitFor(() => expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining("disk full")));
      // The tab must still be open: a failed delete must not silently
      // close the note out from under the user.
      expect(container.querySelector(".document-header")).toBeTruthy();
      alertSpy.mockRestore();
    });
  });
});

describe("App: UX-01 Inspector (Medium+ layout, spec 13.7)", () => {
  it("moves Properties/Backlinks out of their old always-visible spots at Medium+", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
    workspacePath.value = "/vault";
    workspaceSettings.value = { ...DEFAULT_WORKSPACE_SETTINGS, frontmatterPropertiesEnabled: true };
    openOrFocusTab("/vault/a.md", "a.md", "---\ntitle: Hello\n---\nBody", "text");
    const { container, getByLabelText } = render(<App />);
    ensureInspectorClosed(container, getByLabelText);

    expect(container.querySelector(".frontmatter-properties")).toBeNull();
    expect(container.querySelector(".backlinks-panel")).toBeNull();
    // Closed by default -- opening it is the whole point of this test file's
    // other cases below.
    expect(container.querySelector(".inspector")).toBeNull();
  });

  it("keeps the pre-Inspector inline Properties and sidebar Backlinks at Compact width", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 600 });
    workspacePath.value = "/vault";
    workspaceSettings.value = { ...DEFAULT_WORKSPACE_SETTINGS, frontmatterPropertiesEnabled: true };
    openOrFocusTab("/vault/a.md", "a.md", "---\ntitle: Hello\n---\nBody", "text");
    const { container, getByLabelText } = render(<App />);
    // sidebarOpen (BacklinksPanel's own ancestor) is another not-reset
    // module-level signal; a Medium-width test earlier in this file may
    // have left it closed. Compact width uses the toolbar's own sidebar
    // toggle, not the rail, so ensureFilesActive doesn't apply here.
    if (!container.querySelector(".sidebar")) {
      fireEvent.click(getByLabelText("Toggle file browser"));
    }

    // No Document Header (and so no Inspector trigger) exists at Compact
    // width at all, so a leaked-open inspectorOpen from an earlier test
    // cannot affect this one the way it could the Medium+ tests below.
    expect(container.querySelector(".frontmatter-properties")).toBeTruthy();
    expect(container.querySelector(".backlinks-panel")).toBeTruthy();
    expect(container.querySelector(".inspector")).toBeNull();
  });

  it("opens the Inspector via the Document Header trigger, defaulting to Properties", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
    workspacePath.value = "/vault";
    workspaceSettings.value = { ...DEFAULT_WORKSPACE_SETTINGS, frontmatterPropertiesEnabled: true };
    openOrFocusTab("/vault/a.md", "a.md", "---\ntitle: Hello\n---\nBody", "text");
    const { container, getByLabelText, getByRole } = render(<App />);
    ensureInspectorClosed(container, getByLabelText);

    fireEvent.click(getByLabelText("Inspector"));

    expect(container.querySelector(".inspector")).toBeTruthy();
    expect(getByRole("tab", { name: "Properties" }).getAttribute("aria-selected")).toBe("true");
    expect(getByLabelText("Inspector").getAttribute("aria-pressed")).toBe("true");
  });

  it("switches to the Backlinks tab and shows real backlink data", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
    workspacePath.value = "/vault";
    linkIndex.value = {
      ...emptyLinkIndex(),
      backlinksByPath: new Map([["/vault/a.md", ["/vault/b.md"]]]),
    };
    openOrFocusTab("/vault/a.md", "a.md", "hello", "text");
    const { container, getByLabelText, getByRole, getByText } = render(<App />);
    ensureInspectorClosed(container, getByLabelText);

    fireEvent.click(getByLabelText("Inspector"));
    fireEvent.click(getByRole("tab", { name: "Backlinks" }));

    expect(getByText("b.md")).toBeTruthy();
  });

  it("closes via its own close button", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
    workspacePath.value = "/vault";
    openOrFocusTab("/vault/a.md", "a.md", "hello", "text");
    const { container, getByLabelText } = render(<App />);
    ensureInspectorClosed(container, getByLabelText);

    fireEvent.click(getByLabelText("Inspector"));
    expect(container.querySelector(".inspector")).toBeTruthy();

    fireEvent.click(getByLabelText("Close Inspector"));
    expect(container.querySelector(".inspector")).toBeNull();
  });

  it("closes on Escape", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
    workspacePath.value = "/vault";
    openOrFocusTab("/vault/a.md", "a.md", "hello", "text");
    const { container, getByLabelText } = render(<App />);
    ensureInspectorClosed(container, getByLabelText);

    fireEvent.click(getByLabelText("Inspector"));
    expect(container.querySelector(".inspector")).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(container.querySelector(".inspector")).toBeNull();
  });

  it("closes when clicking its own backdrop", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
    workspacePath.value = "/vault";
    openOrFocusTab("/vault/a.md", "a.md", "hello", "text");
    const { container, getByLabelText } = render(<App />);
    ensureInspectorClosed(container, getByLabelText);

    fireEvent.click(getByLabelText("Inspector"));
    fireEvent.click(container.querySelector(".inspector-overlay-backdrop")!);

    expect(container.querySelector(".inspector")).toBeNull();
  });

  it("hides the Properties tab and defaults to Backlinks when frontmatterPropertiesEnabled is off", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
    workspacePath.value = "/vault";
    workspaceSettings.value = { ...DEFAULT_WORKSPACE_SETTINGS, frontmatterPropertiesEnabled: false };
    openOrFocusTab("/vault/a.md", "a.md", "hello", "text");
    const { container, getByLabelText, getByRole, queryByRole } = render(<App />);
    ensureInspectorClosed(container, getByLabelText);

    fireEvent.click(getByLabelText("Inspector"));

    expect(queryByRole("tab", { name: "Properties" })).toBeNull();
    expect(getByRole("tab", { name: "Backlinks" }).getAttribute("aria-selected")).toBe("true");
  });

  it("at Wide width, opening the Inspector leaves an open Navigation Panel untouched", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
    workspacePath.value = "/vault";
    openOrFocusTab("/vault/a.md", "a.md", "hello", "text");
    const { container, getByLabelText } = render(<App />);
    ensureInspectorClosed(container, getByLabelText);
    ensureFilesActive(getByLabelText);
    expect(container.querySelector(".sidebar")).toBeTruthy();

    fireEvent.click(getByLabelText("Inspector"));

    expect(container.querySelector(".sidebar")).toBeTruthy();
    expect(container.querySelector(".inspector")).toBeTruthy();
  });

  it("at Medium width, opening the Inspector and the Navigation Panel are mutually exclusive (spec 12.4)", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 900 });
    workspacePath.value = "/vault";
    openOrFocusTab("/vault/a.md", "a.md", "hello", "text");
    const { container, getByLabelText } = render(<App />);
    ensureInspectorClosed(container, getByLabelText);
    ensureFilesActive(getByLabelText);
    expect(container.querySelector(".sidebar")).toBeTruthy();

    fireEvent.click(getByLabelText("Inspector"));
    expect(container.querySelector(".sidebar")).toBeNull();
    expect(container.querySelector(".inspector")).toBeTruthy();

    fireEvent.click(getByLabelText("Files"));
    expect(container.querySelector(".sidebar")).toBeTruthy();
    expect(container.querySelector(".inspector")).toBeNull();
  });
});

describe("App: read-current-note automation command (leotheca://read-current-note)", () => {
  it("copies the active text note's content to the clipboard", async () => {
    workspacePath.value = "/vault";
    openOrFocusTab("/vault/note.md", "note.md", "hello world", "text");
    render(<App />);

    await act(async () => {
      openUrlListeners.at(-1)?.(["leotheca://read-current-note"]);
      await Promise.resolve();
    });

    expect(writeClipboardText).toHaveBeenCalledTimes(1);
    expect(writeClipboardText).toHaveBeenCalledWith("hello world");
  });

  it("does not touch the clipboard when the active tab is not a text note", async () => {
    workspacePath.value = "/vault";
    // A PDF tab is open and active — read-current-note must not copy it.
    openOrFocusTab("/vault/doc.pdf", "doc.pdf", "", "pdf");
    render(<App />);

    await act(async () => {
      openUrlListeners.at(-1)?.(["leotheca://read-current-note"]);
      await Promise.resolve();
    });

    expect(writeClipboardText).not.toHaveBeenCalled();
  });

  it("is a silent no-op when no note is open at all", async () => {
    workspacePath.value = "/vault";
    render(<App />);

    await act(async () => {
      openUrlListeners.at(-1)?.(["leotheca://read-current-note"]);
      await Promise.resolve();
    });

    expect(writeClipboardText).not.toHaveBeenCalled();
  });
});
