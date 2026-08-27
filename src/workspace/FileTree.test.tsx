/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/preact";

// fileTreeStore.ts pulls in ../settings/store for workspaceSettings (whose
// module-load side effects call window.matchMedia, unimplemented in jsdom)
// and ./tauriBridge for the real filesystem calls. Mocking both keeps the
// rest of fileTreeStore — including the real dirChildren/expandedDirs/
// selectedDir signals this test drives directly — running for real.
vi.mock("../settings/store", () => ({
  workspaceSettings: { value: { sortOrder: "name-asc" } },
  updateWorkspaceSettings: vi.fn(),
}));
vi.mock("./tauriBridge", () => ({
  listDir: vi.fn(),
  createDir: vi.fn(),
  deletePathPermanent: vi.fn(),
  readTextFile: vi.fn(),
  renamePath: vi.fn(),
  trashPath: vi.fn(),
  writeTextFile: vi.fn(),
}));

import { FileTree } from "./FileTree";
import { dirChildren, expandedDirs, selectedDir, selectedPath, contextMenuTarget } from "./fileTreeStore";
import { listDir } from "./tauriBridge";
import type { FsEntry } from "./types";

const note: FsEntry = { name: "note.md", path: "/vault/note.md", isDir: false };
const folder: FsEntry = { name: "folder", path: "/vault/folder", isDir: true };
const nested: FsEntry = { name: "nested.md", path: "/vault/folder/nested.md", isDir: false };

afterEach(() => {
  cleanup();
  dirChildren.value = new Map();
  expandedDirs.value = new Set();
  selectedDir.value = null;
  selectedPath.value = null;
  contextMenuTarget.value = null;
  vi.mocked(listDir).mockReset();
});

describe("FileTree", () => {
  it("renders nothing until the root directory's listing has loaded", () => {
    vi.mocked(listDir).mockReturnValue(new Promise(() => {}));
    const { container } = render(<FileTree rootPath="/vault" onOpenFile={vi.fn()} />);
    expect(container.querySelector(".file-tree")).toBeNull();
  });

  it("renders the loaded, sorted entries once the root listing resolves", async () => {
    vi.mocked(listDir).mockResolvedValue([note, folder]);
    const { getByText } = render(<FileTree rootPath="/vault" onOpenFile={vi.fn()} />);
    await waitFor(() => expect(getByText("folder")).toBeTruthy());
    // Directories sort before files (sortEntries), regardless of listing order.
    expect(getByText("note.md")).toBeTruthy();
  });

  it("clicking a file opens it and sets the selected directory to its parent, without expanding anything", async () => {
    vi.mocked(listDir).mockResolvedValue([note]);
    const onOpenFile = vi.fn();
    const { getByText } = render(<FileTree rootPath="/vault" onOpenFile={onOpenFile} />);
    await waitFor(() => expect(getByText("note.md")).toBeTruthy());

    fireEvent.click(getByText("note.md"));
    expect(onOpenFile).toHaveBeenCalledWith("/vault/note.md", "note.md");
    expect(selectedDir.value).toBe("/vault");
    expect(listDir).toHaveBeenCalledTimes(1); // only the root listing, no extra loadChildren call
  });

  it("clicking an unexpanded folder loads its children and expands it", async () => {
    vi.mocked(listDir).mockImplementation(async (path: string) =>
      path === "/vault" ? [folder] : path === "/vault/folder" ? [nested] : [],
    );
    const { getByText } = render(<FileTree rootPath="/vault" onOpenFile={vi.fn()} />);
    await waitFor(() => expect(getByText("folder")).toBeTruthy());

    fireEvent.click(getByText("folder"));
    expect(selectedDir.value).toBe("/vault/folder");
    await waitFor(() => expect(getByText("nested.md")).toBeTruthy());
    expect(expandedDirs.value.has("/vault/folder")).toBe(true);
  });

  it("clicking an already-expanded folder collapses it again", async () => {
    vi.mocked(listDir).mockImplementation(async (path: string) =>
      path === "/vault" ? [folder] : path === "/vault/folder" ? [nested] : [],
    );
    const { getByText, queryByText } = render(<FileTree rootPath="/vault" onOpenFile={vi.fn()} />);
    await waitFor(() => expect(getByText("folder")).toBeTruthy());

    fireEvent.click(getByText("folder"));
    await waitFor(() => expect(getByText("nested.md")).toBeTruthy());

    fireEvent.click(getByText("folder"));
    expect(expandedDirs.value.has("/vault/folder")).toBe(false);
    expect(queryByText("nested.md")).toBeNull();
  });

  it("does not re-fetch a folder's children on re-expand once they're cached", async () => {
    vi.mocked(listDir).mockImplementation(async (path: string) =>
      path === "/vault" ? [folder] : path === "/vault/folder" ? [nested] : [],
    );
    const { getByText } = render(<FileTree rootPath="/vault" onOpenFile={vi.fn()} />);
    await waitFor(() => expect(getByText("folder")).toBeTruthy());

    fireEvent.click(getByText("folder")); // expand, fetches children
    await waitFor(() => expect(getByText("nested.md")).toBeTruthy());
    fireEvent.click(getByText("folder")); // collapse
    vi.mocked(listDir).mockClear();
    fireEvent.click(getByText("folder")); // re-expand
    expect(listDir).not.toHaveBeenCalled();
  });

  it("marks the selected entry, and only that one, as selected", async () => {
    vi.mocked(listDir).mockResolvedValue([note, folder]);
    const { getByText } = render(<FileTree rootPath="/vault" onOpenFile={vi.fn()} />);
    await waitFor(() => expect(getByText("note.md")).toBeTruthy());

    fireEvent.click(getByText("note.md"));
    expect(getByText("note.md").className).toContain("selected");
    expect(getByText("folder").className).not.toContain("selected");
  });

  it("clicking a file inside an expanded folder highlights the file, not its parent folder", async () => {
    // Regression test: selectedDir is set to a file's *parent* folder (so
    // New Note lands next to it), which is a different signal from the
    // tree's own visual highlight (selectedPath). If FileTree's "selected"
    // class were ever driven by selectedDir again, clicking a file would
    // wrongly highlight its parent folder's row instead of the file itself.
    vi.mocked(listDir).mockImplementation(async (path: string) =>
      path === "/vault" ? [folder] : path === "/vault/folder" ? [nested] : [],
    );
    const { getByText } = render(<FileTree rootPath="/vault" onOpenFile={vi.fn()} />);
    await waitFor(() => expect(getByText("folder")).toBeTruthy());
    fireEvent.click(getByText("folder"));
    await waitFor(() => expect(getByText("nested.md")).toBeTruthy());

    fireEvent.click(getByText("nested.md"));
    expect(selectedDir.value).toBe("/vault/folder");
    expect(getByText("nested.md").className).toContain("selected");
    expect(getByText("folder").className).not.toContain("selected");
  });

  it("right-clicking an entry opens the context menu targeting it, without toggling selection or expansion", async () => {
    vi.mocked(listDir).mockResolvedValue([note]);
    const { getByText } = render(<FileTree rootPath="/vault" onOpenFile={vi.fn()} />);
    await waitFor(() => expect(getByText("note.md")).toBeTruthy());

    fireEvent.contextMenu(getByText("note.md"), { clientX: 12, clientY: 34 });
    expect(contextMenuTarget.value).toEqual(note);
    expect(selectedDir.value).toBeNull();
  });
});
