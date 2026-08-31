/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { readTextFile, writeWorkspaceTextFile } = vi.hoisted(() => ({
  readTextFile: vi.fn<(path: string) => Promise<string>>(async () => {
    throw new Error("not found");
  }),
  writeWorkspaceTextFile: vi.fn<
    (root: string, relativePath: string, contents: string) => Promise<void>
  >(async () => {}),
}));

vi.mock("../workspace/tauriBridge", () => ({
  readTextFile,
  writeWorkspaceTextFile,
  getAppVersion: vi.fn(async () => "1.0"),
  listDir: vi.fn(async () => []),
  restoreWorkspaceAccess: vi.fn(async () => {}),
  setStatusBarAppearance: vi.fn(async () => {}),
  getAppConfigFilePath: vi.fn(async (name: string) => `/config/${name}`),
}));

// bookmarks/store.ts imports workspacePath from settings/store.ts, which
// reads window.matchMedia/document at module load time; same jsdom +
// dynamic-import setup as settings/store.test.ts, see its own comment.
window.matchMedia = vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
})) as unknown as typeof window.matchMedia;

const { workspacePath } = await import("../settings/store");
const {
  bookmarks,
  decodeBookmarks,
  loadBookmarks,
  addFileBookmark,
  addSearchBookmark,
  removeBookmark,
} = await import("./store");

function lastWrite():
  { root: string; relativePath: string; content: unknown } | undefined {
  const call = writeWorkspaceTextFile.mock.calls.at(-1);
  if (!call) return undefined;
  return { root: call[0], relativePath: call[1], content: JSON.parse(call[2]) };
}

describe("bookmarks store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspacePath.value = "/workspace";
    bookmarks.value = [];
  });

  it("loadBookmarks falls back to an empty list when no bookmarks file exists yet", async () => {
    await loadBookmarks("/workspace");
    expect(bookmarks.value).toEqual([]);
  });

  it("loadBookmarks falls back to an empty list for corrupted (non-array) content", async () => {
    readTextFile.mockResolvedValueOnce(JSON.stringify({ not: "an array" }));
    await loadBookmarks("/workspace");
    expect(bookmarks.value).toEqual([]);
  });

  it("loadBookmarks reads a real bookmarks file into the signal", async () => {
    const saved = [
      { id: "1", kind: "file", label: "Note", path: "/workspace/note.md" },
    ];
    readTextFile.mockResolvedValueOnce(JSON.stringify(saved));
    await loadBookmarks("/workspace");
    expect(bookmarks.value).toEqual(saved);
  });

  it("clears bookmarks synchronously when a load starts, before the read resolves", async () => {
    bookmarks.value = [
      { id: "1", kind: "file", label: "Stale", path: "/old-workspace/note.md" },
    ];
    let resolveRead!: (value: string) => void;
    readTextFile.mockReturnValueOnce(
      new Promise((resolve) => (resolveRead = resolve)),
    );

    const promise = loadBookmarks("/new-workspace");
    // The previous workspace's bookmark must already be gone, even though
    // the read for the new workspace hasn't resolved yet — otherwise the
    // UI would show the old workspace's bookmarks for a moment, which is
    // exactly the stale-flash bug this guards against.
    expect(bookmarks.value).toEqual([]);

    resolveRead(JSON.stringify([]));
    await promise;
  });

  it("a stale load doesn't clobber a newer one that resolves first", async () => {
    let resolveFirst!: (value: string) => void;
    let resolveSecond!: (value: string) => void;
    readTextFile
      .mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
      .mockReturnValueOnce(new Promise((resolve) => (resolveSecond = resolve)));

    const firstLoad = loadBookmarks("/workspace-a"); // superseded before it resolves
    const secondLoad = loadBookmarks("/workspace-b");

    const secondBookmarks = [
      { id: "2", kind: "file", label: "B", path: "/workspace-b/note.md" },
    ];
    resolveSecond(JSON.stringify(secondBookmarks));
    await secondLoad;
    expect(bookmarks.value).toEqual(secondBookmarks);

    // The first (stale) load finally resolves after the second — its
    // result must be discarded, not overwrite workspace B's bookmarks
    // with workspace A's.
    const staleBookmarks = [
      { id: "1", kind: "file", label: "A", path: "/workspace-a/note.md" },
    ];
    resolveFirst(JSON.stringify(staleBookmarks));
    await firstLoad;
    expect(bookmarks.value).toEqual(secondBookmarks);
  });

  it("addFileBookmark appends a bookmark and persists it to .leotheca/bookmarks.json", async () => {
    await addFileBookmark("/workspace/note.md", "Note");
    expect(bookmarks.value).toHaveLength(1);
    expect(bookmarks.value[0]).toMatchObject({
      kind: "file",
      path: "/workspace/note.md",
      label: "Note",
    });

    const write = lastWrite();
    expect(write?.root).toBe("/workspace");
    expect(write?.relativePath).toBe(".leotheca/bookmarks.json");
    expect(write?.content).toEqual(bookmarks.value);
  });

  it("addSearchBookmark appends a search bookmark", async () => {
    await addSearchBookmark("todo", "My search");
    expect(bookmarks.value).toEqual([
      {
        id: expect.any(String),
        kind: "search",
        query: "todo",
        label: "My search",
      },
    ]);
  });

  it("trims the label when adding a bookmark", async () => {
    await addFileBookmark("/workspace/note.md", "  Note  ");
    expect(bookmarks.value[0].label).toBe("Note");
  });

  it("removeBookmark removes only the matching bookmark and persists the change", async () => {
    await addFileBookmark("/workspace/a.md", "A");
    await addFileBookmark("/workspace/b.md", "B");
    const idToRemove = bookmarks.value[0].id;

    await removeBookmark(idToRemove);

    expect(bookmarks.value).toHaveLength(1);
    expect(bookmarks.value[0].label).toBe("B");
    expect(lastWrite()?.content).toEqual(bookmarks.value);
  });

  it("does not write to disk when no workspace is open", async () => {
    workspacePath.value = null;
    await addFileBookmark("/workspace/note.md", "Note");
    // The bookmark still gets added to the in-memory signal (matches the
    // existing behavior: only the persistence step is guarded), but
    // nothing should be written with no workspace to write it into.
    expect(writeWorkspaceTextFile).not.toHaveBeenCalled();
  });
});

// Audit follow-up F-008.
describe("decodeBookmarks", () => {
  it("treats a JSON syntax error as corrupt and falls back to an empty list", () => {
    const { bookmarks: decoded, corrupt } = decodeBookmarks("{ not valid json");
    expect(decoded).toEqual([]);
    expect(corrupt).toBe(true);
  });

  it("treats non-array top-level content as corrupt", () => {
    const { bookmarks: decoded, corrupt } = decodeBookmarks(
      JSON.stringify({ not: "an array" }),
    );
    expect(decoded).toEqual([]);
    expect(corrupt).toBe(true);
  });

  it("keeps a well-formed list as not corrupt", () => {
    const saved = [
      { id: "1", kind: "file", label: "Note", path: "/workspace/note.md" },
      { id: "2", kind: "search", label: "Todos", query: "todo" },
    ];
    const { bookmarks: decoded, corrupt } = decodeBookmarks(
      JSON.stringify(saved),
    );
    expect(decoded).toEqual(saved);
    expect(corrupt).toBe(false);
  });

  it("drops an entry missing its id, keeping the other valid entries", () => {
    const valid = {
      id: "1",
      kind: "file",
      label: "Note",
      path: "/workspace/note.md",
    };
    const { bookmarks: decoded, corrupt } = decodeBookmarks(
      JSON.stringify([
        valid,
        { kind: "file", label: "No id", path: "/workspace/other.md" },
      ]),
    );
    expect(decoded).toEqual([valid]);
    expect(corrupt).toBe(true);
  });

  it("drops a file bookmark missing its path", () => {
    const { bookmarks: decoded, corrupt } = decodeBookmarks(
      JSON.stringify([{ id: "1", kind: "file", label: "No path" }]),
    );
    expect(decoded).toEqual([]);
    expect(corrupt).toBe(true);
  });

  it("drops a search bookmark missing its query", () => {
    const { bookmarks: decoded, corrupt } = decodeBookmarks(
      JSON.stringify([{ id: "1", kind: "search", label: "No query" }]),
    );
    expect(decoded).toEqual([]);
    expect(corrupt).toBe(true);
  });

  it("drops an entry with an unrecognized kind", () => {
    const { bookmarks: decoded, corrupt } = decodeBookmarks(
      JSON.stringify([{ id: "1", kind: "folder", label: "Unknown kind" }]),
    );
    expect(decoded).toEqual([]);
    expect(corrupt).toBe(true);
  });
});
