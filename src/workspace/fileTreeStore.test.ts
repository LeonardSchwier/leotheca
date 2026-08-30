/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FsEntry } from "./types";

const {
  listDir,
  findAllFiles,
  findAllEntries,
  readTextFile,
  readTextFilesBatch,
  writeTextFile,
  createDir,
  renamePath,
  trashPath,
  deletePathPermanent,
} = vi.hoisted(() => ({
  listDir: vi.fn<(path: string) => Promise<FsEntry[]>>(async () => []),
  findAllFiles: vi.fn<(path: string) => Promise<FsEntry[]>>(async () => []),
  findAllEntries: vi.fn<(path: string) => Promise<FsEntry[]>>(async () => []),
  readTextFile: vi.fn<(path: string) => Promise<string>>(async () => ""),
  readTextFilesBatch: vi.fn<(paths: string[]) => Promise<(string | null)[]>>(async (paths) => paths.map(() => null)),
  writeTextFile: vi.fn<(path: string, contents: string) => Promise<void>>(async () => {}),
  createDir: vi.fn<(path: string) => Promise<void>>(async () => {}),
  renamePath: vi.fn<(from: string, to: string) => Promise<void>>(async () => {}),
  trashPath: vi.fn<(root: string, path: string) => Promise<void>>(async () => {}),
  deletePathPermanent: vi.fn<(path: string) => Promise<void>>(async () => {}),
}));

vi.mock("./tauriBridge", () => ({
  listDir,
  findAllFiles,
  findAllEntries,
  readTextFile,
  readTextFilesBatch,
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
const { linkIndex } = await import("../linking/store");
const {
  dirname,
  relativePath,
  sortEntries,
  createNote,
  createNoteQuick,
  createFolder,
  createNoteFromTemplate,
  listTemplates,
  renameEntry,
  deleteEntry,
  runSearch,
  searchResults,
  expandedDirs,
  dirChildren,
  selectedDir,
  toggleExpanded,
  loadChildren,
  expandAll,
} = await import("./fileTreeStore");

function entry(name: string, isDir = false): FsEntry {
  return { name, path: `/workspace/${name}`, isDir };
}

/** Configures readTextFilesBatch to answer per-path from a content map,
 * regardless of which paths a given batch call groups together or what
 * order it asks in (runSearch's own concurrency means that's not fixed) —
 * a path missing from the map resolves to null, the same as a real
 * unreadable file. */
function mockFileContents(contentByPath: Record<string, string>) {
  readTextFilesBatch.mockImplementation(async (paths: string[]) => paths.map((path) => contentByPath[path] ?? null));
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

  it("stamps the usual blank frontmatter when no content is given", async () => {
    listDir.mockResolvedValue([]);
    await createNoteQuick("/workspace");
    expect(writeTextFile).toHaveBeenCalledWith("/workspace/Untitled.md", expect.stringContaining("created:"));
  });

  it("writes the given content verbatim instead, when provided", async () => {
    listDir.mockResolvedValue([]);
    await createNoteQuick("/workspace", "Clipped from an automation command");
    expect(writeTextFile).toHaveBeenCalledWith("/workspace/Untitled.md", "Clipped from an automation command");
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

describe("listTemplates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceSettings.value = DEFAULT_WORKSPACE_SETTINGS;
  });

  it("lists only Markdown files directly inside the configured templates folder", async () => {
    listDir.mockResolvedValue([
      entry("Meeting Notes.md"),
      entry("Weekly Review.MD"),
      entry("cover.png"),
      entry("Nested", true),
    ]);
    const templates = await listTemplates("/workspace");
    expect(listDir).toHaveBeenCalledWith("/workspace/Templates");
    expect(templates).toEqual([
      { name: "Meeting Notes.md", path: "/workspace/Meeting Notes.md" },
      { name: "Weekly Review.MD", path: "/workspace/Weekly Review.MD" },
    ]);
  });

  it("reads from the workspace's configured templates folder, not just the default", async () => {
    workspaceSettings.value = { ...DEFAULT_WORKSPACE_SETTINGS, templatesFolder: "Notes/Snippets" };
    listDir.mockResolvedValue([]);
    await listTemplates("/workspace");
    expect(listDir).toHaveBeenCalledWith("/workspace/Notes/Snippets");
  });

  it("returns an empty list rather than throwing when the templates folder doesn't exist", async () => {
    listDir.mockRejectedValue(new Error("not found"));
    await expect(listTemplates("/workspace")).resolves.toEqual([]);
  });
});

describe("createNoteFromTemplate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const template = { name: "Meeting Notes.md", path: "/workspace/Templates/Meeting Notes.md" };

  it("copies the template's content verbatim into a note named after it", async () => {
    listDir.mockResolvedValue([]);
    readTextFile.mockResolvedValue("---\nagenda: []\n---\n\n# Notes\n");
    const result = await createNoteFromTemplate("/workspace", template);
    expect(result).toEqual({ path: "/workspace/Meeting Notes.md", name: "Meeting Notes.md" });
    expect(readTextFile).toHaveBeenCalledWith(template.path);
    expect(writeTextFile).toHaveBeenCalledWith(
      "/workspace/Meeting Notes.md",
      "---\nagenda: []\n---\n\n# Notes\n",
    );
  });

  it("counts up past an existing note with the template's name, the same way createNoteQuick does", async () => {
    listDir.mockResolvedValue([entry("Meeting Notes.md"), entry("Meeting Notes 2.md")]);
    readTextFile.mockResolvedValue("template body");
    const result = await createNoteFromTemplate("/workspace", template);
    expect(result).toEqual({ path: "/workspace/Meeting Notes 3.md", name: "Meeting Notes 3.md" });
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
    findAllFiles.mockResolvedValue([entry("Groceries.md")]);
    await runSearch("/workspace", "groc");
    expect(searchResults.value?.map((e) => e.name)).toEqual(["Groceries.md"]);
    // A name match short-circuits before the content-read fallback, see the
    // `continue` right after the name-match branch in runSearch.
    expect(readTextFilesBatch).not.toHaveBeenCalled();
  });

  it("falls back to content when the name doesn't match", async () => {
    findAllFiles.mockResolvedValue([entry("Diary.md")]);
    mockFileContents({ "/workspace/Diary.md": "Bought some milk today." });
    await runSearch("/workspace", "milk");
    expect(searchResults.value?.map((e) => e.name)).toEqual(["Diary.md"]);
  });

  it("gets the file list from one native walk, not a per-directory listDir recursion", async () => {
    // Hidden-entry skipping and the MAX_WALK_DEPTH symlink-cycle guard both
    // now live entirely in the native walk behind findAllFiles (see
    // commands.rs/FolderAccessPlugin.java's own tests), not here: this
    // mock stands in for that walk's already-filtered result. Before this
    // fix, runSearch did its own recursive listDir walk, one bridge call
    // per directory, which measured ~83s on a real 580-note vault and
    // OutOfMemoryError-crashed the app outright on a real ~500-note
    // Android vault (confirmed on-device, 2026-08-28).
    findAllFiles.mockResolvedValue([entry("note.md")]);
    await runSearch("/workspace", "note");
    expect(findAllFiles).toHaveBeenCalledTimes(1);
    expect(findAllFiles).toHaveBeenCalledWith("/workspace");
    expect(listDir).not.toHaveBeenCalled();
    expect(searchResults.value?.map((e) => e.name)).toEqual(["note.md"]);
  });

  it("does not try to read image files as text", async () => {
    findAllFiles.mockResolvedValue([entry("photo.png")]);
    await runSearch("/workspace", "zzz");
    expect(readTextFilesBatch).not.toHaveBeenCalled();
    expect(searchResults.value).toEqual([]);
  });

  it("skips a file that fails to read instead of failing the whole search", async () => {
    findAllFiles.mockResolvedValue([entry("a.md"), entry("b.md")]);
    // a.md is missing from the content map, the same as readTextFilesBatch
    // resolving it to null for an unreadable file (see its own doc
    // comment: one bad file in a batch never fails the whole batch).
    mockFileContents({ "/workspace/b.md": "match this" });
    await runSearch("/workspace", "match");
    expect(searchResults.value?.map((e) => e.name)).toEqual(["b.md"]);
  });

  it("clears results for an empty query without walking the workspace at all", async () => {
    await runSearch("/workspace", "   ");
    expect(searchResults.value).toBeNull();
    expect(findAllFiles).not.toHaveBeenCalled();
  });

  it("batches many files' content reads into far fewer native calls than one per file", async () => {
    // Regression coverage for the real on-device OutOfMemoryError: a
    // query that matches no filename forces every entry through the
    // content-read fallback, which used to mean one native call per
    // file. With bounded concurrency and batching, a 100-file vault
    // should cost a small handful of readTextFilesBatch calls, not 100.
    // Entries include a realistic size so they batch together (the old
    // CONSERVATIVE_UNKNOWN_SIZE default for undefined size would inflate
    // each to 4 MB, producing ~50 batches for 100 files).
    const entries = Array.from({ length: 100 }, (_, i) => ({
      name: `note-${i}.md`,
      path: `/workspace/note-${i}.md`,
      isDir: false,
      size: 2 * 1024,
    }));
    findAllFiles.mockResolvedValue(entries);
    mockFileContents(Object.fromEntries(entries.map((e) => [e.path, "no match here"])));
    await runSearch("/workspace", "zzz-nonexistent");
    expect(searchResults.value).toEqual([]);
    expect(readTextFilesBatch.mock.calls.length).toBeLessThan(10);
  });

  it("flushes a batch early once its combined size crosses SEARCH_BATCH_MAX_BYTES, even with few files", async () => {
    // Regression coverage for the real on-device OutOfMemoryError found
    // even after the call-count fix above: one native call's serialized
    // JSON response was itself ~288MB because a batch was bounded only by
    // file count, never by combined size. 3 files at 5MB each (15MB
    // total) fit easily under SEARCH_CONTENT_READ_CONCURRENCY (40) by
    // count alone, so if size didn't also bound a batch, all 3 would go
    // out in one native call; splitting into at least 2 calls proves the
    // size cap, not just the concurrency cap, is what's controlling this.
    const bigFile = (name: string) => ({
      name,
      path: `/workspace/${name}`,
      isDir: false,
      size: 5 * 1024 * 1024,
    });
    const bigEntries = [bigFile("big1.md"), bigFile("big2.md"), bigFile("big3.md")];
    findAllFiles.mockResolvedValue(bigEntries);
    mockFileContents(Object.fromEntries(bigEntries.map((e) => [e.path, "no match"])));
    await runSearch("/workspace", "zzz-nonexistent");
    expect(searchResults.value).toEqual([]);
    expect(readTextFilesBatch.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("never reads an exceptionally large file's content, the same as it skips an image", async () => {
    findAllFiles.mockResolvedValue([{ name: "huge.md", path: "/workspace/huge.md", isDir: false, size: 100 * 1024 * 1024 }]);
    await runSearch("/workspace", "zzz-nonexistent");
    expect(readTextFilesBatch).not.toHaveBeenCalled();
    expect(searchResults.value).toEqual([]);
  });

  it("treats a whole failed batch call as no content for every file in it, not a search failure", async () => {
    findAllFiles.mockResolvedValue([entry("a.md"), entry("b.md")]);
    readTextFilesBatch.mockRejectedValue(new Error("bridge call failed"));
    await runSearch("/workspace", "anything");
    expect(searchResults.value).toEqual([]);
  });
});

describe("runSearch: query operators", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    linkIndex.value = {
      backlinksByPath: new Map(),
      pathsByNoteName: new Map(),
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
      pathsByTag: new Map(),
      tagsByPath: new Map([
        ["/workspace/Project.md", ["work"]],
        ["/workspace/Journal.md", ["journal"]],
      ]),
    };
  });

  it("matches a tag: filter without reading any file content", async () => {
    findAllFiles.mockResolvedValue([entry("Project.md"), entry("Journal.md")]);
    await runSearch("/workspace", "tag:work");
    expect(searchResults.value?.map((e) => e.name)).toEqual(["Project.md"]);
    expect(readTextFilesBatch).not.toHaveBeenCalled();
  });

  it("matches a path: filter as a substring of the path relative to the workspace root", async () => {
    findAllFiles.mockResolvedValue([
      entry("Project.md"),
      { name: "Journal.md", path: "/workspace/Notes/Journal.md", isDir: false },
    ]);
    await runSearch("/workspace", "path:Notes");
    expect(searchResults.value?.map((e) => e.name)).toEqual(["Journal.md"]);
  });

  it("excludes a note matched by a negated tag: filter", async () => {
    findAllFiles.mockResolvedValue([entry("Project.md"), entry("Journal.md")]);
    await runSearch("/workspace", "-tag:work");
    expect(searchResults.value?.map((e) => e.name)).toEqual(["Journal.md"]);
  });

  it("combines a tag: filter with a plain text term (AND)", async () => {
    findAllFiles.mockResolvedValue([entry("Project.md"), entry("Journal.md")]);
    mockFileContents({ "/workspace/Project.md": "some content, no keyword here" });
    await runSearch("/workspace", "tag:work Project");
    expect(searchResults.value?.map((e) => e.name)).toEqual(["Project.md"]);
    // Project.md resolves entirely from metadata (the tag matches and its
    // own name already contains "Project"); Journal.md's tag term fails
    // outright, so it's excluded before a read is ever considered either.
    expect(readTextFilesBatch).not.toHaveBeenCalled();
  });

  it("still falls back to content for the text half of a combined query", async () => {
    findAllFiles.mockResolvedValue([entry("Project.md")]);
    mockFileContents({ "/workspace/Project.md": "mentions a deadline" });
    await runSearch("/workspace", "tag:work deadline");
    expect(searchResults.value?.map((e) => e.name)).toEqual(["Project.md"]);
  });

  it("a tag: filter also matches a note tagged with a more specific nested tag", async () => {
    linkIndex.value = {
      ...linkIndex.value,
      tagsByPath: new Map([["/workspace/Project.md", ["work/leotheca"]]]),
    };
    findAllFiles.mockResolvedValue([entry("Project.md")]);
    await runSearch("/workspace", "tag:work");
    expect(searchResults.value?.map((e) => e.name)).toEqual(["Project.md"]);
  });

  it("never reads content for a tag/path-only query with no matches either", async () => {
    findAllFiles.mockResolvedValue([entry("Project.md"), entry("Journal.md")]);
    await runSearch("/workspace", "tag:nonexistent");
    expect(searchResults.value).toEqual([]);
    expect(readTextFilesBatch).not.toHaveBeenCalled();
  });

  it("a failing tag: term skips the read a positive text term would otherwise need", async () => {
    findAllFiles.mockResolvedValue([entry("Journal.md")]);
    await runSearch("/workspace", "tag:work deadline");
    expect(searchResults.value).toEqual([]);
    expect(readTextFilesBatch).not.toHaveBeenCalled();
  });

  // Regression test for a real bug in the first version of this feature
  // (found and fixed the same session): a negated text term was decided
  // from `content: null` before ever actually reading the file, and null
  // content can never disprove an excluded word's presence, so `-word`
  // matched every note whose *name* didn't contain it, regardless of
  // what its real content said. See searchQuery.ts's top-of-file comment
  // for the full story.
  it("excludes a note whose real content contains a negated term, even combined with an already-satisfied tag: filter", async () => {
    linkIndex.value = {
      ...linkIndex.value,
      tagsByPath: new Map([["/workspace/Project.md", ["work"]]]),
    };
    findAllFiles.mockResolvedValue([entry("Project.md")]);
    mockFileContents({ "/workspace/Project.md": "this mentions badword right here" });
    await runSearch("/workspace", "tag:work -badword");
    expect(searchResults.value).toEqual([]);
  });

  it("matches if either side of an OR is satisfied", async () => {
    linkIndex.value = {
      ...linkIndex.value,
      tagsByPath: new Map([
        ["/workspace/Project.md", ["work"]],
        ["/workspace/Journal.md", ["personal"]],
      ]),
    };
    findAllFiles.mockResolvedValue([entry("Project.md"), entry("Journal.md"), entry("Other.md")]);
    await runSearch("/workspace", "tag:work OR tag:personal");
    expect(searchResults.value?.map((e) => e.name).sort()).toEqual(["Journal.md", "Project.md"]);
  });

  it("keeps a quoted phrase's spaces together as one term", async () => {
    findAllFiles.mockResolvedValue([entry("Notes.md")]);
    mockFileContents({ "/workspace/Notes.md": "a note about exact phrase matching" });
    await runSearch("/workspace", '"exact phrase"');
    expect(searchResults.value?.map((e) => e.name)).toEqual(["Notes.md"]);
  });
});

// F-005: Search's 8 MiB memory bound must be enforced and binary files must
// not be serialized as text.  Three fixes were applied:
//
// 1. `isTextFile` — non-text extensions (pdf, mp4, zip, exe, ...) are never
//    passed to readTextFilesBatch, preventing Android's invalid-UTF8-replacement
//    and Rust's wasted-IPC on unreadable content.
//
// 2. Batch size enforcement — `createBatchedContentReader` adds each file's
//    size to the running total and flushes once the cap is reached.  The old
//    code bounded only by *file count* (up to 40), letting 3 files at 5 MB
//    each go out at 15 MB.  Now the combined size per batch stays at or
//    below the 8 MiB limit (each batch may contain files whose sum slightly
//    exceeds the cap by at most one file, since the flush triggers *after*
//    the cap-crossing file is added — the same approach that proved correct
//    on a real ~500-note vault).
//
// 3. Conservative unknown-size default — when the native walk doesn't report
//    size, the batch assumes CONSERVATIVE_UNKNOWN_SIZE (4 MiB) instead of 0,
//    so one batch can never hold more than two entries of unknown size.
describe("F-005: non-text files are never content-read (isTextFile whitelist)", async () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Common extensions that are NOT text: pdf, mp4, zip, exe, jpg, bin, dat, iso, dmg, otf, ttf, woff2
  const nonTextEntries = [
    { name: "report.pdf", path: "/workspace/report.pdf", isDir: false, size: 1024 },
    { name: "video.mp4", path: "/workspace/video.mp4", isDir: false, size: 1024 },
    { name: "archive.zip", path: "/workspace/archive.zip", isDir: false, size: 1024 },
    { name: "installer.exe", path: "/workspace/installer.exe", isDir: false, size: 1024 },
    { name: "data.bin", path: "/workspace/data.bin", isDir: false, size: 1024 },
    { name: "disk.iso", path: "/workspace/disk.iso", isDir: false, size: 1024 },
    { name: "font.ttf", path: "/workspace/font.ttf", isDir: false, size: 1024 },
    { name: "font.woff2", path: "/workspace/font.woff2", isDir: false, size: 1024 },
    { name: "image.dat", path: "/workspace/image.dat", isDir: false, size: 1024 },
    { name: "setup.dmg", path: "/workspace/setup.dmg", isDir: false, size: 1024 },
  ];

  it("never sends a PDF's content to readTextFilesBatch", async () => {
    findAllFiles.mockResolvedValue(nonTextEntries);
    await runSearch("/workspace", "zzz-no-match");
    expect(readTextFilesBatch).not.toHaveBeenCalled();
    expect(searchResults.value).toEqual([]);
  });

  it("never sends a video, archive, or executable's content to readTextFilesBatch", async () => {
    findAllFiles.mockResolvedValue([
      { name: "video.mp4", path: "/workspace/video.mp4", isDir: false, size: 1024 },
      { name: "archive.zip", path: "/workspace/archive.zip", isDir: false, size: 1024 },
      { name: "installer.exe", path: "/workspace/installer.exe", isDir: false, size: 1024 },
    ]);
    await runSearch("/workspace", "zzz-no-match");
    expect(readTextFilesBatch).not.toHaveBeenCalled();
  });

  it("still matches non-text files by name but skips their content", async () => {
    // A note named "archive" should still be found by name, but its content
    // is never read because .zip is not a text extension.
    findAllFiles.mockResolvedValue([
      { name: "archive.zip", path: "/workspace/archive.zip", isDir: false, size: 1024 },
    ]);
    await runSearch("/workspace", "archive");
    // Name matches, so the file should be in results even though content was never read.
    expect(searchResults.value?.map((e) => e.name)).toEqual(["archive.zip"]);
  });

  it("still reads content for known text extensions (md, txt, html, json, js, py, sh)", async () => {
    const textEntries = [
      { name: "readme.md", path: "/workspace/readme.md", isDir: false, size: 1024 },
      { name: "notes.txt", path: "/workspace/notes.txt", isDir: false, size: 1024 },
      { name: "index.html", path: "/workspace/index.html", isDir: false, size: 1024 },
      { name: "config.json", path: "/workspace/config.json", isDir: false, size: 1024 },
      { name: "script.js", path: "/workspace/script.js", isDir: false, size: 1024 },
      { name: "app.py", path: "/workspace/app.py", isDir: false, size: 1024 },
      { name: "run.sh", path: "/workspace/run.sh", isDir: false, size: 1024 },
    ];
    findAllFiles.mockResolvedValue(textEntries);
    mockFileContents(Object.fromEntries(textEntries.map((e) => [e.path, "search term found"])));
    await runSearch("/workspace", "search term");
    // All 7 entries matched their content.
    expect(searchResults.value?.map((e) => e.name).sort()).toEqual(
      textEntries.map((e) => e.name).sort(),
    );
  });
});

describe("F-005: batch size bound prevents overshoot (3 × 5 MB files)", async () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("three 5 MB files split into multiple batches instead of going out at 15 MB", async () => {
    // The old code bounded batches only by file count (up to 40), so three
    // 5 MB files went out in one 15 MB call → 288 MB JSON allocation crash.
    // The fix adds each file's byte size to the running total and flushes
    // once the cap is reached, splitting the files into smaller batches.
    const bigFiles = [
      { name: "big1.md", path: "/workspace/big1.md", isDir: false, size: 5 * 1024 * 1024 },
      { name: "big2.md", path: "/workspace/big2.md", isDir: false, size: 5 * 1024 * 1024 },
      { name: "big3.md", path: "/workspace/big3.md", isDir: false, size: 5 * 1024 * 1024 },
    ];
    findAllFiles.mockResolvedValue(bigFiles);
    mockFileContents(Object.fromEntries(bigFiles.map((e) => [e.path, "no match"])));
    await runSearch("/workspace", "zzz-nonexistent");
    expect(searchResults.value).toEqual([]);
    // At least 2 batches must exist (old code: 1 batch of 3 at 15 MB).
    // Each batch's combined size must stay under ~13 MB (8 MB cap + one file).
    expect(readTextFilesBatch.mock.calls.length).toBeGreaterThanOrEqual(2);
    const totalBytes = readTextFilesBatch.mock.calls.reduce((sum, call) => {
      return sum + call[0].length * (5 * 1024 * 1024);
    }, 0);
    // Total across all batches should be ~15 MB, not a single 15 MB call.
    expect(totalBytes).toBeLessThanOrEqual(15 * 1024 * 1024 + 5 * 1024 * 1024);
  });

  it("a file at exactly SEARCH_BATCH_MAX_BYTES goes out in its own batch", async () => {
    const entry = {
      name: "exact.md",
      path: "/workspace/exact.md",
      isDir: false,
      size: 8 * 1024 * 1024,
    };
    findAllFiles.mockResolvedValue([entry]);
    mockFileContents({ "/workspace/exact.md": "no match" });
    await runSearch("/workspace", "zzz-nonexistent");
    expect(readTextFilesBatch).toHaveBeenCalledTimes(1);
    const batch = readTextFilesBatch.mock.calls[0] as [string[]];
    expect(batch[0]).toEqual(["/workspace/exact.md"]);
  });
});

describe("F-005: conservative unknown-size default prevents batch blending", async () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("unknown-size entries assume a large default so batches stay bounded", async () => {
    // Entries with no `size` field: the old `?? 0` meant they blended into
    // zero-size batches and many could go out in one native call.
    // With CONSERVATIVE_UNKNOWN_SIZE (4 MiB) each entry triggers a pre-add
    // flush when the pending batch already has a 4 MB entry (4+4 = 8 >= cap).
    // Two entries → 2 batches of 1 each.  The old code would have batched
    // them together at effectively 0 bytes → 1 batch (but unbounded in
    // practice if there were more entries).
    const entries = [
      { name: "a.md", path: "/workspace/a.md", isDir: false },
      { name: "b.md", path: "/workspace/b.md", isDir: false },
    ];
    findAllFiles.mockResolvedValue(entries);
    mockFileContents({
      "/workspace/a.md": "no match",
      "/workspace/b.md": "no match",
    });
    await runSearch("/workspace", "zzz-nonexistent");
    // Each entry flushes before adding to the other since 4+4 >= 8.
    expect(readTextFilesBatch).toHaveBeenCalledTimes(2);
    expect(readTextFilesBatch.mock.calls[0][0]).toEqual(["/workspace/a.md"]);
    expect(readTextFilesBatch.mock.calls[1][0]).toEqual(["/workspace/b.md"]);
  });

  it("three unknown-size entries produce three batches of 1 each", async () => {
    const entries = [
      { name: "x.md", path: "/workspace/x.md", isDir: false },
      { name: "y.md", path: "/workspace/y.md", isDir: false },
      { name: "z.md", path: "/workspace/z.md", isDir: false },
    ];
    findAllFiles.mockResolvedValue(entries);
    mockFileContents(
      Object.fromEntries(entries.map((e) => [e.path, "no match"])),
    );
    await runSearch("/workspace", "zzz-nonexistent");
    // Each entry sees a pending 4 MB from the previous one and flushes.
    expect(readTextFilesBatch.mock.calls.length).toBe(3);
    expect(readTextFilesBatch.mock.calls[0][0].length).toBe(1);
    expect(readTextFilesBatch.mock.calls[1][0].length).toBe(1);
    expect(readTextFilesBatch.mock.calls[2][0].length).toBe(1);
  });

  it("known-size entries still batch normally alongside unknown-size ones", async () => {
    // Three small known files (1 KB each) + one unknown-size (4 MiB default).
    // The small files (3 KB total) fit well within the 8 MB cap alongside
    // the unknown-size entry.  All 4 go in one batch.
    const entries = [
      { name: "small1.md", path: "/workspace/small1.md", isDir: false, size: 1024 },
      { name: "small2.md", path: "/workspace/small2.md", isDir: false, size: 1024 },
      { name: "unknown.md", path: "/workspace/unknown.md", isDir: false },
    ];
    findAllFiles.mockResolvedValue(entries);
    mockFileContents(
      Object.fromEntries(entries.map((e) => [e.path, "no match"])),
    );
    await runSearch("/workspace", "zzz-nonexistent");
    expect(readTextFilesBatch).toHaveBeenCalledTimes(1);
    const batch = readTextFilesBatch.mock.calls[0] as [string[]];
    expect(batch[0].length).toBe(3);
  });

  it("entries with realistic sizes still batch tightly", async () => {
    // 100 entries at 2 KB each (200 KB total) should go out in ~3 batches
    // of ~25 files each (8 MB cap / 2 KB per file ≈ 4096 files per batch
    // would fit, so all 100 go in one batch in practice, but the mock's
    // concurrency model means not all land in the same microtask tick).
    const entries = Array.from({ length: 100 }, (_, i) => ({
      name: `n${i}.md`,
      path: `/workspace/n${i}.md`,
      isDir: false,
      size: 2 * 1024,
    }));
    findAllFiles.mockResolvedValue(entries);
    mockFileContents(
      Object.fromEntries(entries.map((e) => [e.path, "no match"])),
    );
    await runSearch("/workspace", "zzz-nonexistent");
    // With 2 KB entries the old code batched ~50 files per microtask tick.
    // The new pre-add check doesn't change much here since 2 KB is tiny
    // relative to the 8 MB cap.
    expect(readTextFilesBatch.mock.calls.length).toBeLessThan(10);
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

describe("expandAll", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The symlink-cycle depth guard itself (MAX_WALK_DEPTH) now lives
  // entirely in the native walk behind findAllEntries (commands.rs,
  // FolderAccessPlugin.java), not here: expandAll just consumes whatever
  // flat, already-bounded list that walk returns. See commands.rs's
  // find_all_entries_stops_at_a_bounded_depth_instead_of_recursing_forever_through_a_symlink_cycle
  // for that guarantee's own test.

  it("expands every directory the native walk found and reconstructs each directory's children, including one with nothing directly inside it", async () => {
    findAllEntries.mockResolvedValue([
      { name: "notes", path: "/workspace/notes", isDir: true },
      { name: "a.md", path: "/workspace/notes/a.md", isDir: false },
      { name: "empty", path: "/workspace/notes/empty", isDir: true },
      { name: "b.md", path: "/workspace/b.md", isDir: false },
    ]);

    await expandAll("/workspace");

    expect(expandedDirs.value).toEqual(
      new Set(["/workspace", "/workspace/notes", "/workspace/notes/empty"]),
    );
    expect(dirChildren.value.get("/workspace")?.map((e) => e.name).sort()).toEqual(["b.md", "notes"]);
    expect(dirChildren.value.get("/workspace/notes")?.map((e) => e.name).sort()).toEqual(["a.md", "empty"]);
    // The whole point of using findAllEntries over the old files-only walk:
    // an empty directory still gets a real (empty) entry here, rather than
    // never being discovered at all because it has no file anywhere
    // beneath it to reveal its existence.
    expect(dirChildren.value.get("/workspace/notes/empty")).toEqual([]);
  });

  it("expands a workspace with nothing in it at all to just the root, with no children", async () => {
    findAllEntries.mockResolvedValue([]);

    await expandAll("/workspace");

    expect(expandedDirs.value).toEqual(new Set(["/workspace"]));
    expect(dirChildren.value.get("/workspace")).toEqual([]);
  });
});

