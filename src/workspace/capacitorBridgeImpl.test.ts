import { afterEach, describe, expect, it, vi } from "vitest";

const { folderAccess } = vi.hoisted(() => ({
  folderAccess: {
    createDir: vi.fn(),
    deletePath: vi.fn(),
    findAllEntries: vi.fn(),
    findAllFiles: vi.fn(),
    findMarkdownFiles: vi.fn(),
    listDir: vi.fn(),
    movePath: vi.fn(),
    pickFolder: vi.fn(),
    readFileAsDataUrl: vi.fn(),
    readTextFile: vi.fn(),
    readTextFilesBatch: vi.fn(),
    renamePath: vi.fn(),
    writeBinaryFile: vi.fn(),
    writeTextFile: vi.fn(),
  },
}));

vi.mock("@capacitor/core", () => ({ registerPlugin: () => folderAccess }));

import {
  WORKSPACE_ROOT,
  bytesToBase64,
  createWorkspaceDir,
  deletePathPermanent,
  deleteWorkspacePathPermanent,
  findAllEntries,
  findAllFiles,
  findMarkdownFiles,
  getWorkspaceStats,
  pickWorkspaceFolder,
  readTextFile,
  renamePath,
  renameWorkspacePath,
  restoreWorkspaceAccess,
  trashPath,
  writeWorkspaceBinaryFile,
  writeWorkspaceTextFile,
} from "./capacitorBridgeImpl";

afterEach(async () => {
  await restoreWorkspaceAccess(WORKSPACE_ROOT, "content://workspace");
  vi.clearAllMocks();
});

describe("pickWorkspaceFolder", () => {
  it("returns null when the picker is cancelled", async () => {
    folderAccess.pickFolder.mockResolvedValue({ uri: null });

    await expect(pickWorkspaceFolder()).resolves.toBeNull();
  });

  it("surfaces the picked tree's real display name (F20 Phase 2b-iv)", async () => {
    folderAccess.pickFolder.mockResolvedValue({
      uri: "content://tree/abc",
      name: "MyNotes",
    });

    await expect(pickWorkspaceFolder()).resolves.toEqual({
      path: WORKSPACE_ROOT,
      token: "content://tree/abc",
      name: "MyNotes",
    });
  });

  it("omits name when the native side has none for this provider", async () => {
    folderAccess.pickFolder.mockResolvedValue({
      uri: "content://tree/abc",
      name: null,
    });

    await expect(pickWorkspaceFolder()).resolves.toEqual({
      path: WORKSPACE_ROOT,
      token: "content://tree/abc",
      name: undefined,
    });
  });
});

interface NativeMarkdownFile {
  relativePath: string;
  uri: string;
  mtime?: number;
}

function walkResult(
  overrides: {
    markdownFiles?: NativeMarkdownFile[];
    folderCount?: number;
    imageCount?: number;
  } = {},
) {
  return { markdownFiles: [], folderCount: 0, imageCount: 0, ...overrides };
}

describe("findMarkdownFiles (Android)", () => {
  it("prefixes each discovered file's relative path with the walked root", async () => {
    const walk = vi.fn(async () =>
      walkResult({
        markdownFiles: [
          { relativePath: "a.md", uri: "content://a" },
          { relativePath: "notes/b.md", uri: "content://b", mtime: 1234 },
        ],
      }),
    );

    const files = await findMarkdownFiles("/vault", { walk });

    expect(files).toEqual([
      { name: "a.md", path: "/vault/a.md", isDir: false },
      { name: "b.md", path: "/vault/notes/b.md", isDir: false, mtime: 1234 },
    ]);
  });

  it("returns an empty list for a workspace with no markdown files", async () => {
    const walk = vi.fn(async () => walkResult());

    expect(await findMarkdownFiles("/vault", { walk })).toEqual([]);
  });
});

describe("findAllFiles (Android)", () => {
  it("prefixes each discovered file's relative path with the walked root, any extension", async () => {
    const walk = vi.fn(async () => ({
      files: [
        { relativePath: "a.md", uri: "content://a" },
        {
          relativePath: "attachments/photo.png",
          uri: "content://photo",
          mtime: 1234,
        },
      ],
    }));

    const files = await findAllFiles("/vault", { walk });

    expect(files).toEqual([
      { name: "a.md", path: "/vault/a.md", isDir: false },
      {
        name: "photo.png",
        path: "/vault/attachments/photo.png",
        isDir: false,
        mtime: 1234,
      },
    ]);
  });

  it("carries each file's size through, for runSearch's content-read batching", async () => {
    const walk = vi.fn(async () => ({
      files: [{ relativePath: "big.md", uri: "content://big", size: 123456 }],
    }));

    const files = await findAllFiles("/vault", { walk });

    expect(files).toEqual([
      { name: "big.md", path: "/vault/big.md", isDir: false, size: 123456 },
    ]);
  });

  it("returns an empty list for an empty workspace", async () => {
    const walk = vi.fn(async () => ({ files: [] }));

    expect(await findAllFiles("/vault", { walk })).toEqual([]);
  });
});

describe("findAllEntries (Android)", () => {
  it("prefixes each discovered entry's relative path with the walked root, files and directories alike", async () => {
    const walk = vi.fn(async () => ({
      entries: [
        { relativePath: "notes", uri: "content://notes", isDir: true },
        {
          relativePath: "notes/a.md",
          uri: "content://a",
          isDir: false,
          mtime: 1234,
        },
        { relativePath: "notes/empty", uri: "content://empty", isDir: true },
      ],
    }));

    const entries = await findAllEntries("/vault", { walk });

    expect(entries).toEqual([
      { name: "notes", path: "/vault/notes", isDir: true },
      { name: "a.md", path: "/vault/notes/a.md", isDir: false, mtime: 1234 },
      { name: "empty", path: "/vault/notes/empty", isDir: true },
    ]);
  });

  it("returns an empty list for an empty workspace", async () => {
    const walk = vi.fn(async () => ({ entries: [] }));

    expect(await findAllEntries("/vault", { walk })).toEqual([]);
  });
});

describe("getWorkspaceStats (Android)", () => {
  it("counts folders, notes, and images from a single native walk", async () => {
    const walk = vi.fn(async () =>
      walkResult({
        markdownFiles: [
          { relativePath: "a.md", uri: "content://a" },
          { relativePath: "notes/b.md", uri: "content://b" },
        ],
        folderCount: 1,
        imageCount: 1,
      }),
    );
    const readTextFile = vi.fn(async () => "one\ntwo\nthree");

    const stats = await getWorkspaceStats("/vault", { walk, readTextFile });

    expect(stats.folderCount).toBe(1);
    expect(stats.noteCount).toBe(2);
    expect(stats.imageCount).toBe(1);
  });

  it("reads each note's content by its full workspace-relative path", async () => {
    const walk = vi.fn(async () =>
      walkResult({ markdownFiles: [{ relativePath: "notes/a.md", uri: "x" }] }),
    );
    const readTextFile = vi.fn(async () => "one\ntwo");

    await getWorkspaceStats("/vault", { walk, readTextFile });

    expect(readTextFile).toHaveBeenCalledWith("/vault/notes/a.md");
  });

  it("computes the average lines per note, and 0 with no notes at all", async () => {
    const readTextFile = vi.fn(async (path: string) =>
      path.endsWith("a.md") ? "one\ntwo" : "one\ntwo\nthree\nfour",
    );
    const walk = vi.fn(async () =>
      walkResult({
        markdownFiles: [
          { relativePath: "a.md", uri: "1" },
          { relativePath: "b.md", uri: "2" },
        ],
      }),
    );

    const stats = await getWorkspaceStats("/vault", { walk, readTextFile });
    expect(stats.averageLinesPerNote).toBe(3); // (2 + 4) / 2

    const emptyStats = await getWorkspaceStats("/empty", {
      walk: vi.fn(async () => walkResult()),
      readTextFile: vi.fn(),
    });
    expect(emptyStats.averageLinesPerNote).toBe(0);
    expect(emptyStats.noteCount).toBe(0);
  });

  it("never has more than a bounded number of note reads in flight at once", async () => {
    const markdownFiles = Array.from({ length: 20 }, (_, i) => ({
      relativePath: `note-${i}.md`,
      uri: `${i}`,
    }));
    const walk = vi.fn(async () => walkResult({ markdownFiles }));

    let inFlight = 0;
    let maxInFlight = 0;
    const readTextFile = vi.fn(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight--;
      return "";
    });

    await getWorkspaceStats("/vault", { walk, readTextFile });

    // Loosely bounded (not coupled to the exact concurrency constant): just
    // confirming this doesn't dispatch all 20 reads at once.
    expect(maxInFlight).toBeLessThanOrEqual(8);
    expect(maxInFlight).toBeGreaterThan(1);
  });
});

/** Decodes base64 back to bytes via the platform's own atob, an
 * independent implementation from bytesToBase64 under test, so a
 * round-trip genuinely exercises correctness rather than checking the
 * function against itself. */
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

describe("bytesToBase64", () => {
  it("encodes an empty buffer as an empty string", () => {
    expect(bytesToBase64(new Uint8Array())).toBe("");
  });

  it("matches a known base64 encoding for a small buffer", () => {
    const bytes = new TextEncoder().encode(
      "Hello, world! This is a paste-image test.",
    );
    expect(bytesToBase64(bytes)).toBe(
      "SGVsbG8sIHdvcmxkISBUaGlzIGlzIGEgcGFzdGUtaW1hZ2UgdGVzdC4=",
    );
  });

  it("round-trips a buffer exactly at the chunk boundary (0x8000 bytes)", () => {
    const bytes = new Uint8Array(0x8000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7) % 256;
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it("round-trips a buffer spanning multiple chunks with an uneven remainder", () => {
    const bytes = new Uint8Array(0x8000 * 2 + 137);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });
});

describe("Android URI cache mutations", () => {
  async function seedNestedCache() {
    await restoreWorkspaceAccess(WORKSPACE_ROOT, "content://workspace");
    await findAllEntries(WORKSPACE_ROOT, {
      walk: vi.fn(async () => ({
        entries: [
          { relativePath: "a", uri: "content://a", isDir: true },
          {
            relativePath: "a/note.md",
            uri: "content://old-note",
            isDir: false,
          },
          { relativePath: "ab", uri: "content://ab", isDir: true },
          {
            relativePath: "ab/note.md",
            uri: "content://ab-note",
            isDir: false,
          },
        ],
      })),
    });
  }

  it("evicts a renamed directory's descendants so a recreated path resolves from the current tree", async () => {
    await seedNestedCache();
    folderAccess.renamePath.mockResolvedValue({ uri: "content://b" });

    await renamePath("/workspace/a", "/workspace/b");

    folderAccess.listDir.mockImplementation(
      async ({ uri }: { uri: string }) => {
        if (uri === "content://workspace") {
          return {
            entries: [
              { name: "a", uri: "content://new-a", isDir: true },
              { name: "ab", uri: "content://ab", isDir: true },
              { name: "b", uri: "content://b", isDir: true },
            ],
          };
        }
        if (uri === "content://new-a")
          return {
            entries: [
              { name: "note.md", uri: "content://new-note", isDir: false },
            ],
          };
        if (uri === "content://b")
          return {
            entries: [
              { name: "note.md", uri: "content://moved-note", isDir: false },
            ],
          };
        throw new Error(`Unexpected URI: ${uri}`);
      },
    );
    folderAccess.readTextFile.mockResolvedValue({ content: "current" });

    await expect(readTextFile("/workspace/ab/note.md")).resolves.toBe(
      "current",
    );
    await expect(readTextFile("/workspace/a/note.md")).resolves.toBe("current");
    await expect(readTextFile("/workspace/b/note.md")).resolves.toBe("current");

    expect(folderAccess.readTextFile).toHaveBeenNthCalledWith(1, {
      uri: "content://ab-note",
    });
    expect(folderAccess.readTextFile).toHaveBeenNthCalledWith(2, {
      uri: "content://new-note",
    });
    expect(folderAccess.readTextFile).toHaveBeenNthCalledWith(3, {
      uri: "content://moved-note",
    });
  });

  it("evicts complete subtrees after trash and permanent deletion without evicting sibling prefixes", async () => {
    await seedNestedCache();
    folderAccess.listDir.mockResolvedValue({ entries: [] });
    folderAccess.createDir.mockResolvedValue({ uri: "content://trash" });
    folderAccess.movePath.mockResolvedValue({ uri: "content://trashed-a" });
    folderAccess.deletePath.mockResolvedValue(undefined);

    await trashPath(WORKSPACE_ROOT, "/workspace/a");
    await deletePathPermanent("/workspace/ab");
    await expect(readTextFile("/workspace/a/note.md")).rejects.toThrow(
      '"a" was not found.',
    );
    await expect(readTextFile("/workspace/ab/note.md")).rejects.toThrow(
      '"ab" was not found.',
    );

    expect(folderAccess.deletePath).toHaveBeenCalledWith({
      uri: "content://ab",
    });
    expect(folderAccess.readTextFile).not.toHaveBeenCalled();
  });

  it("evicts both rename prefixes after a rejected native mutation", async () => {
    await seedNestedCache();
    folderAccess.renamePath.mockRejectedValue(new Error("provider failure"));
    folderAccess.listDir.mockImplementation(
      async ({ uri }: { uri: string }) => {
        if (uri === "content://workspace")
          return {
            entries: [{ name: "a", uri: "content://new-a", isDir: true }],
          };
        if (uri === "content://new-a")
          return {
            entries: [
              { name: "note.md", uri: "content://new-note", isDir: false },
            ],
          };
        throw new Error(`Unexpected URI: ${uri}`);
      },
    );
    folderAccess.readTextFile.mockResolvedValue({ content: "current" });

    await expect(renamePath("/workspace/a", "/workspace/b")).rejects.toThrow(
      "provider failure",
    );
    await expect(readTextFile("/workspace/a/note.md")).resolves.toBe("current");

    expect(folderAccess.readTextFile).toHaveBeenCalledWith({
      uri: "content://new-note",
    });
  });

  it("clears cached descendants when a new workspace session restores the same synthetic root", async () => {
    await seedNestedCache();
    await restoreWorkspaceAccess(WORKSPACE_ROOT, "content://next-workspace");
    folderAccess.listDir.mockImplementation(
      async ({ uri }: { uri: string }) => {
        if (uri === "content://next-workspace")
          return {
            entries: [{ name: "a", uri: "content://next-a", isDir: true }],
          };
        if (uri === "content://next-a")
          return {
            entries: [
              { name: "note.md", uri: "content://next-note", isDir: false },
            ],
          };
        throw new Error(`Unexpected URI: ${uri}`);
      },
    );
    folderAccess.readTextFile.mockResolvedValue({ content: "next" });

    await expect(readTextFile("/workspace/a/note.md")).resolves.toBe("next");

    expect(folderAccess.readTextFile).toHaveBeenCalledWith({
      uri: "content://next-note",
    });
  });

  // Audit follow-up F-004: on Android these functions have no Rust resolver
  // to delegate to (see documentation/ARCHITECTURE.md), so all they do is
  // rejoin workspaceRoot with the caller's relative path and hand off to the
  // existing, already-isWorkspacePath-gated function above. These tests only
  // prove that rejoining is correct, not a new containment guarantee here.
  it("writeWorkspaceTextFile rejoins the root and relative path before writing", async () => {
    folderAccess.writeTextFile.mockResolvedValue({ uri: "content://new-note" });

    await writeWorkspaceTextFile(WORKSPACE_ROOT, "new.md", "hello");

    expect(folderAccess.writeTextFile).toHaveBeenCalledWith(
      expect.objectContaining({ name: "new.md", contents: "hello" }),
    );
  });

  it("writeWorkspaceBinaryFile rejoins the root and relative path before writing", async () => {
    folderAccess.writeBinaryFile.mockResolvedValue({
      uri: "content://new-image",
    });

    await writeWorkspaceBinaryFile(
      WORKSPACE_ROOT,
      "pic.png",
      new Uint8Array([1, 2, 3]),
    );

    expect(folderAccess.writeBinaryFile).toHaveBeenCalledWith(
      expect.objectContaining({ name: "pic.png" }),
    );
  });

  it("createWorkspaceDir rejoins the root and relative path before creating", async () => {
    folderAccess.createDir.mockResolvedValue({ uri: "content://new-folder" });
    folderAccess.listDir.mockResolvedValue({ entries: [] });

    await createWorkspaceDir(WORKSPACE_ROOT, "New Folder");

    expect(folderAccess.createDir).toHaveBeenCalledWith(
      expect.objectContaining({ name: "New Folder" }),
    );
  });

  it("renameWorkspacePath rejoins the root for both the from and to relative paths", async () => {
    await seedNestedCache();
    folderAccess.renamePath.mockResolvedValue({ uri: "content://renamed" });

    await renameWorkspacePath(WORKSPACE_ROOT, "a", "renamed");

    expect(folderAccess.renamePath).toHaveBeenCalledWith(
      expect.objectContaining({ newName: "renamed" }),
    );
  });

  it("deleteWorkspacePathPermanent rejoins the root and relative path before deleting", async () => {
    await seedNestedCache();
    folderAccess.deletePath.mockResolvedValue(undefined);

    await deleteWorkspacePathPermanent(WORKSPACE_ROOT, "a");

    expect(folderAccess.deletePath).toHaveBeenCalledWith({
      uri: "content://a",
    });
  });
});
