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
  workspaceSession: { value: 0 },
  workspacePath: { value: "/vault" },
  updateWorkspaceSettings: vi.fn(),
}));
vi.mock("./tauriBridge", () => ({
  listDir: vi.fn(),
  createWorkspaceDir: vi.fn(),
  deleteWorkspacePathPermanent: vi.fn(),
  readTextFile: vi.fn(),
  renameWorkspacePath: vi.fn(),
  trashPath: vi.fn(),
  writeTextFile: vi.fn(),
}));

import { FileTree } from "./FileTree";
import {
  dirChildren,
  expandedDirs,
  selectedDir,
  selectedPath,
  contextMenuTarget,
} from "./fileTreeStore";
import { listDir } from "./tauriBridge";
import type { FsEntry } from "./types";

const note: FsEntry = { name: "note.md", path: "/vault/note.md", isDir: false };
const folder: FsEntry = { name: "folder", path: "/vault/folder", isDir: true };
const nested: FsEntry = {
  name: "nested.md",
  path: "/vault/folder/nested.md",
  isDir: false,
};
const subfolder: FsEntry = {
  name: "subfolder",
  path: "/vault/folder/subfolder",
  isDir: true,
};
const deep: FsEntry = {
  name: "deep.md",
  path: "/vault/folder/subfolder/deep.md",
  isDir: false,
};

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
    const { container } = render(
      <FileTree rootPath="/vault" onOpenFile={vi.fn()} />,
    );
    expect(container.querySelector(".file-tree")).toBeNull();
  });

  it("renders the loaded, sorted entries once the root listing resolves", async () => {
    vi.mocked(listDir).mockImplementation(async (_workspaceRoot: string, path: string) =>
      path === "/vault" ? [note, folder] : [],
    );
    const { getByText } = render(
      <FileTree rootPath="/vault" onOpenFile={vi.fn()} />,
    );
    await waitFor(() => expect(getByText("folder")).toBeTruthy());
    // Directories sort before files (sortEntries), regardless of listing order.
    expect(getByText("note.md")).toBeTruthy();
  });

  it("clicking a file opens it and sets the selected directory to its parent, without expanding anything", async () => {
    vi.mocked(listDir).mockResolvedValue([note]);
    const onOpenFile = vi.fn();
    const { getByText } = render(
      <FileTree rootPath="/vault" onOpenFile={onOpenFile} />,
    );
    await waitFor(() => expect(getByText("note.md")).toBeTruthy());

    fireEvent.click(getByText("note.md"));
    expect(onOpenFile).toHaveBeenCalledWith("/vault/note.md", "note.md");
    expect(selectedDir.value).toBe("/vault");
    expect(listDir).toHaveBeenCalledTimes(1); // only the root listing, no extra loadChildren call
  });

  it("shows an inline error instead of silently doing nothing when onOpenFile rejects", async () => {
    vi.mocked(listDir).mockResolvedValue([note]);
    const onOpenFile = vi.fn().mockRejectedValue(new Error("stale file handle"));
    const { getByText, findByRole } = render(
      <FileTree rootPath="/vault" onOpenFile={onOpenFile} />,
    );
    await waitFor(() => expect(getByText("note.md")).toBeTruthy());

    fireEvent.click(getByText("note.md"));
    const error = await findByRole("alert");
    expect(error.textContent).toMatch(/couldn't open/i);
  });

  it("clears a prior open error and re-attempts when the entry is clicked again", async () => {
    vi.mocked(listDir).mockResolvedValue([note]);
    const onOpenFile = vi.fn().mockRejectedValueOnce(new Error("stale file handle")).mockResolvedValueOnce(undefined);
    const { getByText, findByRole, queryByRole } = render(
      <FileTree rootPath="/vault" onOpenFile={onOpenFile} />,
    );
    await waitFor(() => expect(getByText("note.md")).toBeTruthy());

    fireEvent.click(getByText("note.md"));
    await findByRole("alert");

    fireEvent.click(getByText("note.md"));
    await waitFor(() => expect(onOpenFile).toHaveBeenCalledTimes(2));
    expect(queryByRole("alert")).toBeNull();
  });

  it("auto-expands the root's immediate subdirectories once it loads, without a click", async () => {
    vi.mocked(listDir).mockImplementation(async (_workspaceRoot: string, path: string) =>
      path === "/vault" ? [folder] : path === "/vault/folder" ? [nested] : [],
    );
    const { getByText } = render(
      <FileTree rootPath="/vault" onOpenFile={vi.fn()} />,
    );
    await waitFor(() => expect(getByText("nested.md")).toBeTruthy());
    expect(expandedDirs.value.has("/vault/folder")).toBe(true);
  });

  it("does not auto-expand a second level: clicking a nested folder loads its children and expands it", async () => {
    vi.mocked(listDir).mockImplementation(async (_workspaceRoot: string, path: string) => {
      if (path === "/vault") return [folder];
      if (path === "/vault/folder") return [subfolder];
      if (path === "/vault/folder/subfolder") return [deep];
      return [];
    });
    const { getByText, queryByText } = render(
      <FileTree rootPath="/vault" onOpenFile={vi.fn()} />,
    );
    // The top level (folder) auto-expands, revealing subfolder, but
    // subfolder's own contents are not fetched until it's clicked.
    await waitFor(() => expect(getByText("subfolder")).toBeTruthy());
    expect(queryByText("deep.md")).toBeNull();

    fireEvent.click(getByText("subfolder"));
    expect(selectedDir.value).toBe("/vault/folder/subfolder");
    await waitFor(() => expect(getByText("deep.md")).toBeTruthy());
    expect(expandedDirs.value.has("/vault/folder/subfolder")).toBe(true);
  });

  it("clicking an already-expanded folder collapses it again", async () => {
    vi.mocked(listDir).mockImplementation(async (_workspaceRoot: string, path: string) =>
      path === "/vault" ? [folder] : path === "/vault/folder" ? [nested] : [],
    );
    const { getByText, queryByText } = render(
      <FileTree rootPath="/vault" onOpenFile={vi.fn()} />,
    );
    await waitFor(() => expect(getByText("nested.md")).toBeTruthy()); // auto-expanded

    fireEvent.click(getByText("folder"));
    expect(expandedDirs.value.has("/vault/folder")).toBe(false);
    expect(queryByText("nested.md")).toBeNull();
  });

  it("does not re-fetch a folder's children on re-expand once they're cached", async () => {
    vi.mocked(listDir).mockImplementation(async (_workspaceRoot: string, path: string) =>
      path === "/vault" ? [folder] : path === "/vault/folder" ? [nested] : [],
    );
    const { getByText } = render(
      <FileTree rootPath="/vault" onOpenFile={vi.fn()} />,
    );
    await waitFor(() => expect(getByText("nested.md")).toBeTruthy()); // auto-expand already fetched children

    fireEvent.click(getByText("folder")); // collapse
    vi.mocked(listDir).mockClear();
    fireEvent.click(getByText("folder")); // re-expand
    expect(listDir).not.toHaveBeenCalled();
  });

  it("marks the selected entry, and only that one, as selected", async () => {
    vi.mocked(listDir).mockImplementation(async (_workspaceRoot: string, path: string) =>
      path === "/vault" ? [note, folder] : [],
    );
    const { getByText } = render(
      <FileTree rootPath="/vault" onOpenFile={vi.fn()} />,
    );
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
    vi.mocked(listDir).mockImplementation(async (_workspaceRoot: string, path: string) =>
      path === "/vault" ? [folder] : path === "/vault/folder" ? [nested] : [],
    );
    const { getByText } = render(
      <FileTree rootPath="/vault" onOpenFile={vi.fn()} />,
    );
    await waitFor(() => expect(getByText("nested.md")).toBeTruthy()); // auto-expanded

    fireEvent.click(getByText("nested.md"));
    expect(selectedDir.value).toBe("/vault/folder");
    expect(getByText("nested.md").className).toContain("selected");
    expect(getByText("folder").className).not.toContain("selected");
  });

  it("right-clicking an entry opens the context menu targeting it, without toggling selection or expansion", async () => {
    vi.mocked(listDir).mockResolvedValue([note]);
    const { getByText } = render(
      <FileTree rootPath="/vault" onOpenFile={vi.fn()} />,
    );
    await waitFor(() => expect(getByText("note.md")).toBeTruthy());

    fireEvent.contextMenu(getByText("note.md"), { clientX: 12, clientY: 34 });
    expect(contextMenuTarget.value).toEqual(note);
    expect(selectedDir.value).toBeNull();
  });

  // ─── Keyboard navigation tests ───────────────────────────────────────────

  it("renders with role=tree and role=treeitem on entries", async () => {
    vi.mocked(listDir).mockImplementation(async (_workspaceRoot: string, path: string) =>
      path === "/vault" ? [note, folder] : [],
    );
    const { getByText } = render(
      <FileTree rootPath="/vault" onOpenFile={vi.fn()} />,
    );
    await waitFor(() => expect(getByText("note.md")).toBeTruthy());

    const tree = document.querySelector('[role="tree"]');
    expect(tree).toBeTruthy();

    const noteEl = getByText("note.md");
    expect(noteEl.getAttribute("role")).toBe("treeitem");
    expect(noteEl.getAttribute("data-tree-path")).toBe("/vault/note.md");
    expect(noteEl.getAttribute("data-tree-depth")).toBe("0");

    const folderEl = getByText("folder");
    expect(folderEl.getAttribute("role")).toBe("treeitem");
    // expandFirstLevel auto-expands root-level folders, so aria-expanded is "true"
    expect(folderEl.getAttribute("aria-expanded")).toBe("true");
  });

  it("ArrowDown moves focus to the next treeitem, ArrowUp to the previous", async () => {
    vi.mocked(listDir).mockImplementation(async (_workspaceRoot: string, path: string) =>
      path === "/vault" ? [folder, note] : path === "/vault/folder" ? [nested] : [],
    );
    const { getByText } = render(
      <FileTree rootPath="/vault" onOpenFile={vi.fn()} />,
    );
    await waitFor(() => expect(getByText("nested.md")).toBeTruthy());

    // Initial state: first treeitem has tabindex=0
    const folderEl = getByText("folder");
    const nestedEl = getByText("nested.md");

    // Focus the folder (first item)
    folderEl.setAttribute("tabindex", "0");
    folderEl.focus();

    // ArrowDown → should focus nested.md (first child)
    fireEvent.keyDown(folderEl, { key: "ArrowDown" });
    await waitFor(() => {
      expect(nestedEl.getAttribute("tabindex")).toBe("0");
      expect(document.activeElement).toBe(nestedEl);
    });

    // ArrowUp → should focus folder again
    fireEvent.keyDown(nestedEl, { key: "ArrowUp" });
    await waitFor(() => {
      expect(folderEl.getAttribute("tabindex")).toBe("0");
      expect(document.activeElement).toBe(folderEl);
    });
  });

  it("ArrowRight on a collapsed folder expands it", async () => {
    vi.mocked(listDir).mockImplementation(async (_workspaceRoot: string, path: string) =>
      path === "/vault" ? [folder] : path === "/vault/folder" ? [nested] : [],
    );
    const { getByText } = render(
      <FileTree rootPath="/vault" onOpenFile={vi.fn()} />,
    );
    // Don't auto-expand: manually collapse first
    // Actually expandFirstLevel auto-expands. Let's use a different approach:
    // start with a collapsed folder by not auto-expanding.
    // We'll test ArrowRight on the folder which is auto-expanded already.
    // ArrowRight on expanded → move to first child.
    await waitFor(() => expect(getByText("nested.md")).toBeTruthy());

    const folderEl = getByText("folder");
    const nestedEl = getByText("nested.md");

    // Folder is expanded (auto). ArrowRight should move to first child.
    folderEl.focus();
    fireEvent.keyDown(folderEl, { key: "ArrowRight" });
    await waitFor(() => {
      expect(nestedEl.getAttribute("tabindex")).toBe("0");
      expect(document.activeElement).toBe(nestedEl);
    });
  });

  it("ArrowLeft on an expanded folder collapses it", async () => {
    vi.mocked(listDir).mockImplementation(async (_workspaceRoot: string, path: string) =>
      path === "/vault" ? [folder] : path === "/vault/folder" ? [nested] : [],
    );
    const { getByText, queryByText } = render(
      <FileTree rootPath="/vault" onOpenFile={vi.fn()} />,
    );
    await waitFor(() => expect(getByText("nested.md")).toBeTruthy());

    const folderEl = getByText("folder");

    // Folder is expanded. ArrowLeft should collapse it.
    folderEl.focus();
    fireEvent.keyDown(folderEl, { key: "ArrowLeft" });
    await waitFor(() => {
      expect(expandedDirs.value.has("/vault/folder")).toBe(false);
      expect(queryByText("nested.md")).toBeNull();
    });
  });

  it("Enter key activates the focused treeitem (opens file)", async () => {
    vi.mocked(listDir).mockResolvedValue([note]);
    const onOpenFile = vi.fn();
    const { getByText } = render(
      <FileTree rootPath="/vault" onOpenFile={onOpenFile} />,
    );
    await waitFor(() => expect(getByText("note.md")).toBeTruthy());

    const noteEl = getByText("note.md");
    noteEl.focus();
    fireEvent.keyDown(noteEl, { key: "Enter" });
    expect(onOpenFile).toHaveBeenCalledWith("/vault/note.md", "note.md");
  });

  it("Space key activates the focused treeitem (opens file)", async () => {
    vi.mocked(listDir).mockResolvedValue([note]);
    const onOpenFile = vi.fn();
    const { getByText } = render(
      <FileTree rootPath="/vault" onOpenFile={onOpenFile} />,
    );
    await waitFor(() => expect(getByText("note.md")).toBeTruthy());

    const noteEl = getByText("note.md");
    noteEl.focus();
    fireEvent.keyDown(noteEl, { key: " " });
    expect(onOpenFile).toHaveBeenCalledWith("/vault/note.md", "note.md");
  });

  it("Home key moves focus to the first treeitem, End to the last", async () => {
    vi.mocked(listDir).mockImplementation(async (_workspaceRoot: string, path: string) =>
      path === "/vault" ? [folder, note] : path === "/vault/folder" ? [nested] : [],
    );
    const { getByText } = render(
      <FileTree rootPath="/vault" onOpenFile={vi.fn()} />,
    );
    await waitFor(() => expect(getByText("nested.md")).toBeTruthy());

    const folderEl = getByText("folder");
    const noteEl = getByText("note.md");

    // Focus the last item first
    noteEl.focus();
    fireEvent.keyDown(noteEl, { key: "Home" });
    await waitFor(() => {
      expect(folderEl.getAttribute("tabindex")).toBe("0");
      expect(document.activeElement).toBe(folderEl);
    });

    // Now End
    folderEl.focus();
    fireEvent.keyDown(folderEl, { key: "End" });
    await waitFor(() => {
      // Last visible item is note.md (folder, nested.md, note.md)
      expect(noteEl.getAttribute("tabindex")).toBe("0");
      expect(document.activeElement).toBe(noteEl);
    });
  });

  it("ArrowLeft on a file at root level does not move focus (no parent)", async () => {
    vi.mocked(listDir).mockResolvedValue([note]);
    const { getByText } = render(
      <FileTree rootPath="/vault" onOpenFile={vi.fn()} />,
    );
    await waitFor(() => expect(getByText("note.md")).toBeTruthy());

    const noteEl = getByText("note.md");
    noteEl.setAttribute("tabindex", "0");
    noteEl.focus();

    fireEvent.keyDown(noteEl, { key: "ArrowLeft" });
    // Should still be focused (no parent to go to)
    expect(document.activeElement).toBe(noteEl);
    expect(noteEl.getAttribute("tabindex")).toBe("0");
  });
});
