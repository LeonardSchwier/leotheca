/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/preact";
import { signal } from "@preact/signals";
import { DEFAULT_WORKSPACE_SETTINGS } from "../settings/workspaceSettings";

// A minimal, narrowly-scoped harness for one specific interaction (the
// rename/autosave race documented in ROADMAP.md's "Still open for v1"),
// not general App.tsx coverage. Everything not needed to reach
// handleTabRenameSubmit is mocked away or simply never triggered (no
// workspace is opened, so Sidebar/BookmarksPanel/BacklinksPanel/GraphView/
// WelcomeDialog are never even reached and don't need mocking).
vi.mock("../settings/store", () => ({
  workspacePath: signal<string | null>(null),
  settingsLoaded: signal(false),
  settingsPanelOpen: signal(false),
  viewMode: signal("source"),
  initSettings: vi.fn(),
  workspaceSettings: signal(DEFAULT_WORKSPACE_SETTINGS),
}));

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
  runSearch: vi.fn(),
  selectedDir: signal<string | null>(null),
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
const { settingsPanelOpen } = await import("../settings/store");

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  openTabs.value = [];
  activeTabPath.value = null;
  settingsPanelOpen.value = false;
  writeTextFile.mockClear();
  readTextFile.mockClear();
  renameEntry.mockReset();
});

describe("App: tab rename while an autosave is still pending", () => {
  it("flushes the pending write to the old path before renaming, so the renamed file doesn't lose the last edit", async () => {
    vi.useFakeTimers();
    renameEntry.mockResolvedValue("/vault/renamed.md");
    openOrFocusTab("/vault/note.md", "note.md", "initial content", "text");

    const { container, getByRole } = render(<App />);

    const editor = container.querySelector('[data-testid="mock-editor"]') as HTMLTextAreaElement;
    fireEvent.input(editor, { target: { value: "typed content" } });
    // No fake time has been advanced yet, so the 400ms debounce timer
    // hasn't fired on its own — anything written before this point must
    // have been flushed deliberately, not raced.
    expect(writeTextFile).not.toHaveBeenCalled();

    // Rename the tab well before the 400ms autosave debounce would fire.
    fireEvent.contextMenu(container.querySelector(".tab")!);
    fireEvent.click(getByRole("button", { name: "Rename" }));

    const nameInput = container.querySelector(".name-prompt input") as HTMLInputElement;
    fireEvent.input(nameInput, { target: { value: "renamed.md" } });
    await act(async () => {
      fireEvent.click(getByRole("button", { name: "Rename" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    // Immediately after the rename resolves — still with zero fake time
    // advanced — the pending write must already have been flushed
    // synchronously to the *old* path, not still waiting on its original
    // timer to eventually fire against a path that no longer has a tab.
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

    // No stale second write once the original timer's delay would have
    // elapsed: it must have been cancelled outright, not merely outraced.
    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });
    expect(writeTextFile).toHaveBeenCalledTimes(1);
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
});
