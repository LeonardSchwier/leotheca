import { beforeEach, describe, expect, it, vi } from "vitest";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

const {
  listDirImpl,
  writeTextFileImpl,
  restoreWorkspaceAccessImpl,
  writeWorkspaceTextFileImpl,
} = vi.hoisted(() => ({
  listDirImpl: vi.fn(),
  writeTextFileImpl: vi.fn(),
  restoreWorkspaceAccessImpl: vi.fn(),
  writeWorkspaceTextFileImpl: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false },
}));

vi.mock("./tauriBridgeImpl", () => ({
  listDir: listDirImpl,
  writeTextFile: writeTextFileImpl,
  pickWorkspaceFolder: vi.fn(),
  restoreWorkspaceAccess: restoreWorkspaceAccessImpl,
  findMarkdownFiles: vi.fn(),
  findAllFiles: vi.fn(),
  findAllEntries: vi.fn(),
  readTextFile: vi.fn(),
  readTextFilesBatch: vi.fn(),
  writeBinaryFile: vi.fn(),
  createDir: vi.fn(),
  renamePath: vi.fn(),
  trashPath: vi.fn(),
  deletePathPermanent: vi.fn(),
  writeWorkspaceTextFile: writeWorkspaceTextFileImpl,
  writeWorkspaceBinaryFile: vi.fn(),
  createWorkspaceDir: vi.fn(),
  renameWorkspacePath: vi.fn(),
  deleteWorkspacePathPermanent: vi.fn(),
  getAppConfigFilePath: vi.fn(),
  getAppVersion: vi.fn(),
  fileSrc: vi.fn(),
  getWorkspaceStats: vi.fn(),
  setStatusBarAppearance: vi.fn(),
}));
vi.mock("./capacitorBridgeImpl", () => ({}));

const {
  drainWorkspaceOperations,
  listDir,
  restoreWorkspaceAccess,
  writeActiveWorkspaceTextFile,
  writeTextFile,
} = await import("./tauriBridge");

beforeEach(() => {
  restoreWorkspaceAccessImpl.mockReset();
  restoreWorkspaceAccessImpl.mockResolvedValue(undefined);
  writeWorkspaceTextFileImpl.mockReset();
  writeWorkspaceTextFileImpl.mockResolvedValue(undefined);
});

describe("workspace bridge operation drain", () => {
  it("does not resolve until every already-invoked workspace operation settles", async () => {
    const read = deferred<unknown[]>();
    const write = deferred<void>();
    listDirImpl.mockReturnValueOnce(read.promise);
    writeTextFileImpl.mockReturnValueOnce(write.promise);

    const readPromise = listDir("/workspace");
    const writePromise = writeTextFile("/workspace/note.md", "content");
    let drained = false;
    const drainPromise = drainWorkspaceOperations().then(() => { drained = true; });

    await Promise.resolve();
    expect(drained).toBe(false);

    read.resolve([]);
    await readPromise;
    await Promise.resolve();
    expect(drained).toBe(false);

    write.resolve();
    await writePromise;
    await drainPromise;
    expect(drained).toBe(true);
  });

  it("resolves immediately when no workspace operation is active", async () => {
    await expect(drainWorkspaceOperations()).resolves.toBeUndefined();
  });
});

describe("active workspace write capability", () => {
  it("routes an active workspace file through the contained relative-path writer", async () => {
    await restoreWorkspaceAccess("/workspace", "token-A");

    await writeActiveWorkspaceTextFile("/workspace/nested/note.md", "content");

    expect(writeWorkspaceTextFileImpl).toHaveBeenCalledWith(
      "/workspace",
      "nested/note.md",
      "content",
    );
  });

  it("rejects a path outside the active workspace before native mutation", async () => {
    await restoreWorkspaceAccess("/workspace", "token-A");

    await expect(
      writeActiveWorkspaceTextFile("/outside/note.md", "content"),
    ).rejects.toThrow("outside workspace root");
    expect(writeWorkspaceTextFileImpl).not.toHaveBeenCalled();
  });

  it("clears the previous capability when a later activation fails", async () => {
    await restoreWorkspaceAccess("/workspace", "token-A");
    restoreWorkspaceAccessImpl.mockRejectedValueOnce(new Error("grant expired"));

    await expect(restoreWorkspaceAccess("/other", "bad-token")).rejects.toThrow("grant expired");
    await expect(
      writeActiveWorkspaceTextFile("/workspace/note.md", "content"),
    ).rejects.toThrow("No active workspace");
    expect(writeWorkspaceTextFileImpl).not.toHaveBeenCalled();
  });
});
