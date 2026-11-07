import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { folderAccess } = vi.hoisted(() => ({
  folderAccess: {
    pickFolder: vi.fn(),
    listDir: vi.fn(),
    findMarkdownFiles: vi.fn(),
    findAllFiles: vi.fn(),
    findAllEntries: vi.fn(),
    readTextFile: vi.fn(),
    readTextFilesBatch: vi.fn(),
    writeTextFile: vi.fn(),
    writeBinaryFile: vi.fn(),
    createTextFileNew: vi.fn(),
    createBinaryFileNew: vi.fn(),
    createDir: vi.fn(),
    createDirNew: vi.fn(),
    renamePath: vi.fn(),
    renamePathNoReplace: vi.fn(),
    movePath: vi.fn(),
    deletePath: vi.fn(),
    readFileAsDataUrl: vi.fn(),
  },
}));

vi.mock("@capacitor/core", () => ({ registerPlugin: () => folderAccess }));

import {
  WORKSPACE_ROOT,
  createWorkspaceDirNew,
  createWorkspaceTextFileNew,
  readTextFile,
  renameWorkspacePathNoReplace,
  restoreWorkspaceAccess,
} from "./capacitorBridgeImpl";

beforeEach(async () => {
  vi.clearAllMocks();
  await restoreWorkspaceAccess(WORKSPACE_ROOT, "content://tree-a");
});

afterEach(async () => {
  await restoreWorkspaceAccess(WORKSPACE_ROOT, "content://tree-a");
  vi.clearAllMocks();
});

describe("Android workspace mutation capability contract", () => {
  it("creates a nested text file through the active tree grant and native no-replace method", async () => {
    folderAccess.listDir.mockResolvedValue({
      entries: [{ name: "notes", uri: "content://a-notes", isDir: true }],
    });
    folderAccess.createTextFileNew.mockResolvedValue({
      uri: "content://a-notes/new-note",
    });

    await createWorkspaceTextFileNew(
      WORKSPACE_ROOT,
      "notes/new-note.md",
      "hello",
    );

    expect(folderAccess.listDir).toHaveBeenCalledWith({
      uri: "content://tree-a",
    });
    expect(folderAccess.createTextFileNew).toHaveBeenCalledWith({
      parentUri: "content://a-notes",
      name: "new-note.md",
      contents: "hello",
    });
    expect(folderAccess.writeTextFile).not.toHaveBeenCalled();
  });

  it("creates a directory through the provider no-replace method, not the idempotent ensure-directory path", async () => {
    folderAccess.createDirNew.mockResolvedValue({ uri: "content://new-folder" });

    await createWorkspaceDirNew(WORKSPACE_ROOT, "New Folder");

    expect(folderAccess.createDirNew).toHaveBeenCalledWith({
      parentUri: "content://tree-a",
      name: "New Folder",
    });
    expect(folderAccess.createDir).not.toHaveBeenCalled();
  });

  it("renames through the source parent grant and preserves a native collision rejection", async () => {
    folderAccess.listDir.mockResolvedValue({
      entries: [{ name: "old.md", uri: "content://old", isDir: false }],
    });
    folderAccess.renamePathNoReplace.mockRejectedValue(
      new Error("already_exists: target already exists: new.md"),
    );

    await expect(
      renameWorkspacePathNoReplace(WORKSPACE_ROOT, "old.md", "new.md"),
    ).rejects.toThrow("already_exists");

    expect(folderAccess.renamePathNoReplace).toHaveBeenCalledWith({
      uri: "content://old",
      parentUri: "content://tree-a",
      newName: "new.md",
    });
    expect(folderAccess.renamePath).not.toHaveBeenCalled();
  });

  it("evicts a failed rename's cached source so the next read resolves the provider's current document", async () => {
    folderAccess.listDir
      .mockResolvedValueOnce({
        entries: [{ name: "note.md", uri: "content://old-note", isDir: false }],
      })
      .mockResolvedValueOnce({
        entries: [{ name: "note.md", uri: "content://current-note", isDir: false }],
      });
    folderAccess.renamePathNoReplace.mockRejectedValue(
      new Error("permission_denied: denied"),
    );
    folderAccess.readTextFile.mockResolvedValue({ content: "current" });

    await expect(
      renameWorkspacePathNoReplace(WORKSPACE_ROOT, "note.md", "renamed.md"),
    ).rejects.toThrow("permission_denied");
    await expect(readTextFile("/workspace/note.md")).resolves.toBe("current");

    expect(folderAccess.listDir).toHaveBeenCalledTimes(2);
    expect(folderAccess.readTextFile).toHaveBeenCalledWith({
      uri: "content://current-note",
    });
  });

  it("clears every cached child URI when a new grant replaces the same synthetic workspace path", async () => {
    folderAccess.listDir.mockImplementation(
      async ({ uri }: { uri: string }) => {
        if (uri === "content://tree-a") {
          return {
            entries: [{ name: "notes", uri: "content://a-notes", isDir: true }],
          };
        }
        if (uri === "content://tree-b") {
          return {
            entries: [{ name: "notes", uri: "content://b-notes", isDir: true }],
          };
        }
        throw new Error(`unexpected URI: ${uri}`);
      },
    );
    folderAccess.createTextFileNew
      .mockResolvedValueOnce({ uri: "content://a-created" })
      .mockResolvedValueOnce({ uri: "content://b-created" });

    await createWorkspaceTextFileNew(WORKSPACE_ROOT, "notes/a.md", "A");
    await restoreWorkspaceAccess(WORKSPACE_ROOT, "content://tree-b");
    await createWorkspaceTextFileNew(WORKSPACE_ROOT, "notes/b.md", "B");

    expect(folderAccess.createTextFileNew.mock.calls).toEqual([
      [
        {
          parentUri: "content://a-notes",
          name: "a.md",
          contents: "A",
        },
      ],
      [
        {
          parentUri: "content://b-notes",
          name: "b.md",
          contents: "B",
        },
      ],
    ]);
  });
});
