/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signal } from "@preact/signals";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import type { FsEntry } from "./types";

// vi.mock factories run lazily (after this file's own top-level imports
// and consts are initialized), so plain module-scope consts like these
// are safe to close over inside them below. vi.hoisted is not used here:
// its callback runs before those imports are linked, and would throw
// trying to call `signal` from one.
const runSearch = vi.fn<(rootPath: string, query: string) => Promise<void>>(async () => {});
const searchQuery = signal("");
const searchResults = signal<FsEntry[] | null>(null);
const searchInProgress = signal(false);
const clearSearch = vi.fn(() => {
  searchQuery.value = "";
  searchResults.value = null;
});
const selectedDir = signal<string | null>(null);
const dirChildren = signal<Map<string, FsEntry[]>>(new Map());
const expandedDirs = signal<Set<string>>(new Set());
const contextMenuTarget = signal<FsEntry | null>(null);
const contextMenuPos = signal({ x: 0, y: 0 });
const deleteEntry = vi.fn<(root: string, path: string) => Promise<void>>(async () => {});
const renameEntry = vi.fn<(oldPath: string, newName: string) => Promise<string>>(
  async (_oldPath, newName) => `/workspace/${newName}`,
);

vi.mock("./fileTreeStore", () => ({
  runSearch,
  clearSearch,
  searchQuery,
  searchResults,
  searchInProgress,
  selectedDir,
  dirChildren,
  expandedDirs,
  contextMenuTarget,
  contextMenuPos,
  createFolder: vi.fn(),
  createNote: vi.fn(),
  deleteEntry,
  renameEntry,
  toggleSortOrder: vi.fn(),
  loadChildren: vi.fn(async () => []),
  expandFirstLevel: vi.fn(async () => {}),
  openContextMenu: vi.fn(),
  closeContextMenu: vi.fn(() => {
    contextMenuTarget.value = null;
  }),
  sortEntries: (entries: FsEntry[]) => entries,
  toggleExpanded: vi.fn(),
  dirname: (path: string) => path.split("/").slice(0, -1).join("/"),
  relativePath: (root: string, path: string) => path.replace(root, ""),
}));

vi.mock("./store", () => ({
  closeTabsUnder: vi.fn(),
  renameOpenTab: vi.fn(),
}));

vi.mock("../settings/store", () => ({
  workspaceSettings: signal({ deleteBehavior: "project-trash", sortOrder: "name-asc" }),
  workspaceSession: signal(0),
}));

const { Sidebar } = await import("./Sidebar");

const note: FsEntry = { name: "note.md", path: "/workspace/note.md", isDir: false };

describe("Sidebar search debounce", () => {
  const flushPendingAutosave = vi.fn(async () => {});

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    searchQuery.value = "";
    searchResults.value = null;
    searchInProgress.value = false;
    contextMenuTarget.value = null;
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("debounces search input instead of searching on every keystroke", () => {
    const { getByPlaceholderText } = render(
      <Sidebar rootPath="/workspace" onOpenFile={vi.fn()} flushPendingAutosave={flushPendingAutosave} />,
    );
    const input = getByPlaceholderText("Search notes...") as HTMLInputElement;

    fireEvent.input(input, { target: { value: "note" } });
    expect(runSearch).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    expect(runSearch).toHaveBeenCalledWith("/workspace", "note");
    expect(runSearch).toHaveBeenCalledTimes(1);
  });

  it("clicking Clear cancels a pending debounced search instead of letting it fire afterward", () => {
    const { getByPlaceholderText, getByLabelText } = render(
      <Sidebar rootPath="/workspace" onOpenFile={vi.fn()} flushPendingAutosave={flushPendingAutosave} />,
    );
    const input = getByPlaceholderText("Search notes...") as HTMLInputElement;

    fireEvent.input(input, { target: { value: "note" } });
    fireEvent.click(getByLabelText("Clear search"));

    vi.advanceTimersByTime(200);
    // This is the bug session 29 fixed: without cancelling the timer, this
    // would still be called once the debounce elapsed, undoing the clear.
    expect(runSearch).not.toHaveBeenCalled();
  });

  it("switching to a different workspace cancels a pending debounced search against the old one", () => {
    const { getByPlaceholderText, rerender } = render(
      <Sidebar rootPath="/workspaceA" onOpenFile={vi.fn()} flushPendingAutosave={flushPendingAutosave} />,
    );
    const input = getByPlaceholderText("Search notes...") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "note" } });

    rerender(<Sidebar rootPath="/workspaceB" onOpenFile={vi.fn()} flushPendingAutosave={flushPendingAutosave} />);

    vi.advanceTimersByTime(200);
    // This is the more serious bug session 29 fixed: without cancelling on
    // a rootPath change, this would still fire against "/workspaceA" after
    // the switch to workspace B, and its results would show up in B's
    // sidebar (searchResults is a single shared signal).
    expect(runSearch).not.toHaveBeenCalled();
  });
});

describe("Sidebar rename/delete flush the pending autosave for the affected file first", () => {
  const flushPendingAutosave = vi.fn(async () => {});

  beforeEach(() => {
    vi.clearAllMocks();
    contextMenuTarget.value = null;
  });

  afterEach(() => {
    cleanup();
  });

  it("renaming a file flushes its pending autosave before renameEntry runs", async () => {
    contextMenuTarget.value = note;
    const { getByText, getByRole, container } = render(
      <Sidebar rootPath="/workspace" onOpenFile={vi.fn()} flushPendingAutosave={flushPendingAutosave} />,
    );
    fireEvent.click(getByText("Rename"));

    const nameInput = container.querySelector(".name-prompt input") as HTMLInputElement;
    fireEvent.input(nameInput, { target: { value: "renamed.md" } });
    await fireEvent.click(getByRole("button", { name: "Rename" }));

    expect(flushPendingAutosave).toHaveBeenCalledWith("/workspace/note.md");
    expect(renameEntry).toHaveBeenCalledWith("/workspace/note.md", "renamed.md");
    // Order matters: the flush must land before the rename moves the file,
    // not just happen at some point during the submit.
    const flushOrder = flushPendingAutosave.mock.invocationCallOrder[0];
    const renameOrder = renameEntry.mock.invocationCallOrder[0];
    expect(flushOrder).toBeLessThan(renameOrder);
  });

  it("deleting a file flushes its pending autosave before deleteEntry runs", async () => {
    contextMenuTarget.value = note;
    const { getByText } = render(
      <Sidebar rootPath="/workspace" onOpenFile={vi.fn()} flushPendingAutosave={flushPendingAutosave} />,
    );
    await fireEvent.click(getByText("Delete"));

    expect(flushPendingAutosave).toHaveBeenCalledWith("/workspace/note.md");
    expect(deleteEntry).toHaveBeenCalledWith("/workspace", "/workspace/note.md");
    const flushOrder = flushPendingAutosave.mock.invocationCallOrder[0];
    const deleteOrder = deleteEntry.mock.invocationCallOrder[0];
    expect(flushOrder).toBeLessThan(deleteOrder);
  });
});
