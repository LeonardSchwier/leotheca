import { describe, expect, it, vi } from "vitest";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

const { listDirImpl, writeTextFileImpl } = vi.hoisted(() => ({
  listDirImpl: vi.fn(),
  writeTextFileImpl: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false },
}));

vi.mock("./tauriBridgeImpl", () => ({
  listDir: listDirImpl,
  writeTextFile: writeTextFileImpl,
  pickWorkspaceFolder: vi.fn(),
  restoreWorkspaceAccess: vi.fn(),
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
  getAppConfigFilePath: vi.fn(),
  getAppVersion: vi.fn(),
  fileSrc: vi.fn(),
  getWorkspaceStats: vi.fn(),
  setStatusBarAppearance: vi.fn(),
}));
vi.mock("./capacitorBridgeImpl", () => ({}));

const { drainWorkspaceOperations, listDir, writeTextFile } = await import("./tauriBridge");

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
