/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/preact";
import { effect, signal } from "@preact/signals";
import { DEFAULT_WORKSPACE_SETTINGS } from "../settings/workspaceSettings";
import { scanTasks, type TaskRecord } from "../markdown/tasks";
import { pendingCapturesStore, addPendingCapture } from "../capture/pendingCaptures";

const { updateWorkspaceSettingsSpy, initSettings } = vi.hoisted(() => ({
  updateWorkspaceSettingsSpy: vi.fn(),
  initSettings: vi.fn(),
}));

vi.mock("../settings/store", () => {
  const workspacePath = signal<string | null>(null);
  const workspaceSettings = signal(DEFAULT_WORKSPACE_SETTINGS);
  const settingsLoaded = signal(false);
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
  updateFavoritesWidget: vi.fn(async () => {}),
}));

const { renameEntry, createNoteQuick } = vi.hoisted(() => ({
  renameEntry: vi.fn<(oldPath: string, newName: string) => Promise<string>>(),
  createNoteQuick:
    vi.fn<(dirPath: string, content?: string) => Promise<{ path: string; name: string }>>(),
}));

vi.mock("../workspace/fileTreeStore", () => ({
  renameEntry,
  createNoteQuick,
  createNoteFromTemplate: vi.fn(),
  listTemplates: vi.fn(async () => []),
  runSearch: vi.fn(),
  resetWorkspaceTree: vi.fn(),
  selectedDir: signal<string | null>(null),
}));

const { openUrlListeners } = vi.hoisted(() => ({
  openUrlListeners: [] as ((urls: string[]) => void)[],
}));

vi.mock("@tauri-apps/plugin-deep-link", () => ({
  getCurrent: vi.fn(async () => null),
  onOpenUrl: vi.fn((listener: (urls: string[]) => void) => {
    openUrlListeners.push(listener);
    return Promise.resolve(() => {});
  }),
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

vi.mock("../editor/SpeechRecognitionButton", () => ({
  SpeechRecognitionButton: () => (
    <button data-testid="mock-speech-button">Speak</button>
  ),
}));

const { App } = await import("./App");
const { activeTabPath, closeAllTabs, editorLayout, openDocuments, openOrFocusTab, openTabs, secondaryOpenTabs } =
  await import("../workspace/store");
const { settingsLoaded, settingsPanelOpen, workspacePath, workspaceSettings, viewMode } =
  await import("../settings/store");
const { linkIndex } = await import("../linking/store");
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
  outlineRevealRequest.value = null;
  outlineAnnouncement.value = null;
  updateWorkspaceSettingsSpy.mockClear();
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: defaultViewportWidth,
  });
  writeTextFile.mockClear();
  readTextFile.mockClear();
  renameEntry.mockReset();
  createNoteQuick.mockReset();
  initSettings.mockReset();
  openUrlListeners.length = 0;
  pendingCapturesStore.value = [];
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
    workspacePath.value = null;
    render(<App />);

    await act(async () => {
      openUrlListeners.at(-1)?.(["leotheca://open-note?path=%2Fvault%2Fnote.md"]);
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
