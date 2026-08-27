/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FsEntry } from "./types";

const { listDir, readTextFile, writeTextFile, createDir, renamePath, trashPath, deletePathPermanent } =
  vi.hoisted(() => ({
    listDir: vi.fn<(path: string) => Promise<FsEntry[]>>(async () => []),
    readTextFile: vi.fn<(path: string) => Promise<string>>(async () => ""),
    writeTextFile: vi.fn<(path: string, contents: string) => Promise<void>>(async () => {}),
    createDir: vi.fn<(path: string) => Promise<void>>(async () => {}),
    renamePath: vi.fn<(from: string, to: string) => Promise<void>>(async () => {}),
    trashPath: vi.fn<(root: string, path: string) => Promise<void>>(async () => {}),
    deletePathPermanent: vi.fn<(path: string) => Promise<void>>(async () => {}),
  }));

vi.mock("./tauriBridge", () => ({
  listDir,
  readTextFile,
  writeTextFile,
  createDir,
  renamePath,
  trashPath,
  deletePathPermanent,
  getAppVersion: vi.fn(async () => "1.0"),
  restoreWorkspaceAccess: vi.fn(async () => {}),
  setStatusBarAppearance: vi.fn(async () => {}),
  getAppConfigFilePath: vi.fn(async (name: string) => `/config/${name}`),
}));

// fileTreeStore.ts imports workspaceSettings from settings/store.ts, which
// reads window.matchMedia/document at module load time; same jsdom +
// dynamic-import setup as the other store tests, see their comments.
window.matchMedia = vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
})) as unknown as typeof window.matchMedia;

const { workspaceSettings } = await import("../settings/store");
const { DEFAULT_WORKSPACE_SETTINGS } = await import("../settings/workspaceSettings");
const {
  dirname,
  relativePath,
  sortEntries,
  createNote,
  createNoteQuick,
  createFolder,
  renameEntry,
  deleteEntry,
  runSearch,
  searchResults,
  expandedDirs,
  dirChildren,
  selectedDir,
  toggleExpanded,
  loadChildren,
} = await import("./fileTreeStore");

function entry(name: string, isDir = false): FsEntry {
  return { name, path: `/workspace/${name}`, isDir };
}

describe("dirname", () => {
  it("returns the parent directory of a nested path", () => {
    expect(dirname("/workspace/folder/note.md")).toBe("/workspace/folder");
  });

  it("returns the path itself when there's no parent to go up to", () => {
    expect(dirname("/workspace")).toBe("/workspace");
  });
});

describe("relativePath", () => {
  it("strips the root and the leading slash", () => {
    expect(relativePath("/workspace", "/workspace/folder/note.md")).toBe("folder/note.md");
  });

  it("returns the path unchanged when it isn't under the given root", () => {
    expect(relativePath("/workspace", "/elsewhere/note.md")).toBe("/elsewhere/note.md");
  });
});

describe("sortEntries", () => {
  beforeEach(() => {
    workspaceSettings.value = DEFAULT_WORKSPACE_SETTINGS;
  });

  it("puts directories before files, case-insensitively alphabetical within each group", () => {
    const entries = [entry("zebra.md"), entry("Apples", true), entry("banana.md"), entry("bears", true)];
    const sorted = sortEntries(entries).map((e) => e.name);
    expect(sorted).toEqual(["Apples", "bears", "banana.md", "zebra.md"]);
  });

  it("reverses the order when sortOrder is name-desc", () => {
    workspaceSettings.value = { ...DEFAULT_WORKSPACE_SETTINGS, sortOrder: "name-desc" };
    const entries = [entry("a.md"), entry("b.md")];
    expect(sortEntries(entries).map((e) => e.name)).toEqual(["b.md", "a.md"]);
  });
});

describe("createNote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listDir.mockResolvedValue([]);
  });

  it("appends .md if the given name doesn't already have it", async () => {
    const path = await createNote("/workspace", "My Note");
    expect(path).toBe("/workspace/My Note.md");
    expect(writeTextFile).toHaveBeenCalledWith("/workspace/My Note.md", expect.any(String));
  });

  it("doesn't double up the extension if it's already there", async () => {
    const path = await createNote("/workspace", "My Note.md");
    expect(path).toBe("/workspace/My Note.md");
  });

  it("refuses to overwrite an existing file with the same name", async () => {
    listDir.mockResolvedValue([entry("My Note.md")]);
    await expect(createNote("/workspace", "My Note")).rejects.toThrow(/already exists/);
    expect(writeTextFile).not.toHaveBeenCalled();
  });
});

describe("createNoteQuick", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses Untitled.md when nothing collides", async () => {
    listDir.mockResolvedValue([]);
    const result = await createNoteQuick("/workspace");
    expect(result.name).toBe("Untitled.md");
  });

  it("counts up past existing Untitled notes to find a free name", async () => {
    listDir.mockResolvedValue([entry("Untitled.md"), entry("Untitled 2.md"), entry("Untitled 3.md")]);
    const result = await createNoteQuick("/workspace");
    expect(result.name).toBe("Untitled 4.md");
    expect(result.path).toBe("/workspace/Untitled 4.md");
  });
});

describe("createFolder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a folder when the name is free", async () => {
    listDir.mockResolvedValue([]);
    const path = await createFolder("/workspace", "New Folder");
    expect(path).toBe("/workspace/New Folder");
    expect(createDir).toHaveBeenCalledWith("/workspace/New Folder");
  });

  it("refuses to create a folder that already exists", async () => {
    listDir.mockResolvedValue([entry("New Folder", true)]);
    await expect(createFolder("/workspace", "New Folder")).rejects.toThrow(/already exists/);
    expect(createDir).not.toHaveBeenCalled();
  });
});

describe("renameEntry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renames when the new name is free in the same folder", async () => {
    listDir.mockResolvedValue([entry("old.md")]);
    const newPath = await renameEntry("/workspace/old.md", "new.md");
    expect(newPath).toBe("/workspace/new.md");
    expect(renamePath).toHaveBeenCalledWith("/workspace/old.md", "/workspace/new.md");
  });

  it("refuses to rename onto an existing sibling", async () => {
    listDir.mockResolvedValue([entry("old.md"), entry("taken.md")]);
    await expect(renameEntry("/workspace/old.md", "taken.md")).rejects.toThrow(/already exists/);
    expect(renamePath).not.toHaveBeenCalled();
  });
});

describe("deleteEntry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listDir.mockResolvedValue([]);
  });

  it("moves to the project trash by default", async () => {
    workspaceSettings.value = DEFAULT_WORKSPACE_SETTINGS;
    await deleteEntry("/workspace", "/workspace/note.md");
    expect(trashPath).toHaveBeenCalledWith("/workspace", "/workspace/note.md");
    expect(deletePathPermanent).not.toHaveBeenCalled();
  });

  it("deletes permanently when that workspace setting is chosen", async () => {
    workspaceSettings.value = { ...DEFAULT_WORKSPACE_SETTINGS, deleteBehavior: "permanent" };
    await deleteEntry("/workspace", "/workspace/note.md");
    expect(deletePathPermanent).toHaveBeenCalledWith("/workspace/note.md");
    expect(trashPath).not.toHaveBeenCalled();
  });
});

describe("runSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("matches by file name without needing to read that file's content", async () => {
    listDir.mockResolvedValue([entry("Groceries.md")]);
    await runSearch("/workspace", "groc");
    expect(searchResults.value?.map((e) => e.name)).toEqual(["Groceries.md"]);
    // A name match short-circuits before the content-read fallback, see the
    // `continue` right after the name-match branch in runSearch.
    expect(readTextFile).not.toHaveBeenCalled();
  });

  it("falls back to content when the name doesn't match", async () => {
    listDir.mockResolvedValue([entry("Diary.md")]);
    readTextFile.mockResolvedValue("Bought some milk today.");
    await runSearch("/workspace", "milk");
    expect(searchResults.value?.map((e) => e.name)).toEqual(["Diary.md"]);
  });

  it("skips hidden entries like .trash and .leotheca", async () => {
    listDir.mockResolvedValue([entry(".trash", true), entry(".leotheca", true), entry("note.md")]);
    await runSearch("/workspace", "note");
    expect(listDir).toHaveBeenCalledTimes(1);
    expect(searchResults.value?.map((e) => e.name)).toEqual(["note.md"]);
  });

  it("does not try to read image files as text", async () => {
    listDir.mockResolvedValue([entry("photo.png")]);
    await runSearch("/workspace", "zzz");
    expect(readTextFile).not.toHaveBeenCalled();
    expect(searchResults.value).toEqual([]);
  });

  it("skips a file that fails to read instead of failing the whole search", async () => {
    listDir.mockResolvedValue([entry("a.md"), entry("b.md")]);
    readTextFile.mockImplementation(async (path: string) => {
      if (path.endsWith("a.md")) throw new Error("permission denied");
      return "match this";
    });
    await runSearch("/workspace", "match");
    expect(searchResults.value?.map((e) => e.name)).toEqual(["b.md"]);
  });

  it("clears results for an empty query", async () => {
    await runSearch("/workspace", "   ");
    expect(searchResults.value).toBeNull();
  });
});

// A folder that was expanded/selected when it got renamed or deleted used
// to stay "expanded"/"selected" under a path that no longer meant
// anything: the expand state silently didn't carry over to the entry's new
// path on rename, and on delete the next New Note/New Folder action would
// try to list a directory that no longer existed. Both renameEntry and
// deleteEntry now forget any cached state for the affected path (and
// anything nested under it) via the same forgetPath helper.
describe("renameEntry and deleteEntry forget stale expand/selection state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listDir.mockResolvedValue([]);
    expandedDirs.value = new Set(["/workspace/folder", "/workspace/folder/nested", "/workspace/other"]);
    dirChildren.value = new Map([
      ["/workspace/folder", [entry("nested", true)]],
      ["/workspace/folder/nested", [entry("child.md")]],
      ["/workspace/other", [entry("x.md")]],
    ]);
    selectedDir.value = "/workspace/folder/nested";
  });

  it("renameEntry clears expand/children state for the old path and anything nested under it", async () => {
    await renameEntry("/workspace/folder", "renamed");
    expect(expandedDirs.value.has("/workspace/folder")).toBe(false);
    expect(expandedDirs.value.has("/workspace/folder/nested")).toBe(false);
    expect(expandedDirs.value.has("/workspace/other")).toBe(true); // unrelated, untouched
    expect(dirChildren.value.has("/workspace/folder")).toBe(false);
    expect(dirChildren.value.has("/workspace/folder/nested")).toBe(false);
    expect(dirChildren.value.has("/workspace/other")).toBe(true);
  });

  it("renameEntry clears the selected folder when it was under the renamed path", async () => {
    await renameEntry("/workspace/folder", "renamed");
    expect(selectedDir.value).toBeNull();
  });

  it("renameEntry leaves the selected folder alone when it wasn't affected", async () => {
    selectedDir.value = "/workspace/other";
    await renameEntry("/workspace/folder", "renamed");
    expect(selectedDir.value).toBe("/workspace/other");
  });

  it("deleteEntry clears expand/children/selection state for the deleted path", async () => {
    await deleteEntry("/workspace", "/workspace/folder");
    expect(expandedDirs.value.has("/workspace/folder")).toBe(false);
    expect(expandedDirs.value.has("/workspace/folder/nested")).toBe(false);
    expect(dirChildren.value.has("/workspace/folder/nested")).toBe(false);
    expect(selectedDir.value).toBeNull();
  });
});

describe("toggleExpanded and loadChildren", () => {
  it("loadChildren stores what it loaded, keyed by path", async () => {
    listDir.mockResolvedValue([entry("a.md")]);
    await loadChildren("/workspace");
    expect(dirChildren.value.get("/workspace")?.map((e) => e.name)).toEqual(["a.md"]);
  });

  it("toggleExpanded flips a path in and back out of the expanded set", () => {
    expandedDirs.value = new Set();
    toggleExpanded("/workspace/folder");
    expect(expandedDirs.value.has("/workspace/folder")).toBe(true);
    toggleExpanded("/workspace/folder");
    expect(expandedDirs.value.has("/workspace/folder")).toBe(false);
  });
});
