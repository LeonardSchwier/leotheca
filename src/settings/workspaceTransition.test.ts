/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

const {
  drainWorkspaceOperations,
  listDir,
  readTextFile,
  writeTextFile,
  writeActiveWorkspaceTextFile,
  restoreWorkspaceAccess,
} = vi.hoisted(() => ({
  drainWorkspaceOperations: vi.fn<() => Promise<void>>(async () => {}),
  listDir: vi.fn<(path: string) => Promise<unknown[]>>(async () => []),
  readTextFile: vi.fn<(path: string) => Promise<string>>(),
  writeTextFile: vi.fn<(path: string, contents: string) => Promise<void>>(),
  writeActiveWorkspaceTextFile: vi.fn<
    (path: string, contents: string) => Promise<void>
  >(),
  restoreWorkspaceAccess: vi.fn<(path: string, token?: string) => Promise<void>>(async () => {}),
}));

vi.mock("../workspace/tauriBridge", () => ({
  drainWorkspaceOperations,
  listDir,
  readTextFile,
  writeTextFile,
  writeActiveWorkspaceTextFile,
  restoreWorkspaceAccess,
  getAppVersion: vi.fn(async () => "1.0"),
  setStatusBarAppearance: vi.fn(async () => {}),
  getAppConfigFilePath: vi.fn(async (name: string) => `/config/${name}`),
}));

window.matchMedia = vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
})) as unknown as typeof window.matchMedia;

const {
  setWorkspacePath,
  workspacePath,
  workspaceSelectionError,
  workspaceSession,
} = await import("./store");
const { createSaveCoordinator } = await import("../workspace/saveCoordinator");

beforeEach(() => {
  vi.useRealTimers();
  drainWorkspaceOperations.mockReset();
  drainWorkspaceOperations.mockResolvedValue();
  listDir.mockReset();
  listDir.mockResolvedValue([]);
  readTextFile.mockReset();
  writeTextFile.mockReset();
  writeActiveWorkspaceTextFile.mockReset();
  restoreWorkspaceAccess.mockReset();
  restoreWorkspaceAccess.mockResolvedValue();
  readTextFile.mockRejectedValue(new Error("no settings yet"));
  writeTextFile.mockResolvedValue();
  writeActiveWorkspaceTextFile.mockResolvedValue();
  workspaceSelectionError.value = null;
});

describe("workspace transition integration", () => {
  it("drains the outgoing write before activating a different Android token for /workspace", async () => {
    vi.useFakeTimers();
    const oldWrite = deferred<void>();
    writeActiveWorkspaceTextFile.mockImplementation((path) =>
      path === "/workspace/note.md" ? oldWrite.promise : Promise.resolve(),
    );
    const saves = createSaveCoordinator();

    await setWorkspacePath("/workspace", "token-A");
    const oldSession = workspaceSession.value;
    restoreWorkspaceAccess.mockClear();
    drainWorkspaceOperations.mockClear();

    saves.change(oldSession, "/workspace/note.md", "old workspace edit");
    await vi.advanceTimersByTimeAsync(400);
    expect(writeActiveWorkspaceTextFile).toHaveBeenCalledWith(
      "/workspace/note.md",
      "old workspace edit",
    );

    let switched = false;
    const switching = setWorkspacePath("/workspace", "token-B").then(() => { switched = true; });
    await Promise.resolve();

    expect(restoreWorkspaceAccess.mock.calls).toEqual([["/workspace", "token-A"]]);
    expect(switched).toBe(false);

    oldWrite.resolve();
    await switching;

    expect(drainWorkspaceOperations).toHaveBeenCalledTimes(1);
    expect(restoreWorkspaceAccess.mock.calls).toEqual([
      ["/workspace", "token-A"],
      ["/workspace", "token-B"],
    ]);
    expect(workspacePath.value).toBe("/workspace");
    expect(workspaceSession.value).toBe(oldSession + 1);
    vi.useRealTimers();
  });

  it("keeps B authoritative when setWorkspacePath(A) finishes loading after B", async () => {
    const loadA = deferred<string>();
    const loadB = deferred<string>();
    readTextFile.mockImplementation((path) => {
      if (path === "/A/.leotheca/settings.json") return loadA.promise;
      if (path === "/B/.leotheca/settings.json") return loadB.promise;
      return Promise.reject(new Error("missing"));
    });
    createSaveCoordinator();

    await setWorkspacePath("/start");
    const a = setWorkspacePath("/A");
    await Promise.resolve();
    await Promise.resolve();
    const b = setWorkspacePath("/B");
    await Promise.resolve();
    await Promise.resolve();

    loadB.resolve("{}");
    await b;
    expect(workspacePath.value).toBe("/B");

    loadA.resolve("{}");
    await a;
    expect(workspacePath.value).toBe("/B");
  });

  it("fails closed when the incoming grant cannot be restored", async () => {
    createSaveCoordinator();
    await setWorkspacePath("/old", "old-token");
    const previousSession = workspaceSession.value;
    restoreWorkspaceAccess.mockImplementation(async (_path, token) => {
      if (token === "bad-token") throw new Error("grant expired");
    });

    await expect(setWorkspacePath("/workspace", "bad-token")).rejects.toThrow("grant expired");

    expect(workspacePath.value).toBeNull();
    expect(workspaceSession.value).toBe(previousSession + 1);
    expect(workspaceSelectionError.value).toContain("Could not open that workspace");
    expect(workspaceSelectionError.value).not.toContain("bad-token");
  });

  it("fails closed when the incoming root is no longer readable", async () => {
    createSaveCoordinator();
    await setWorkspacePath("/old", "old-token");
    listDir.mockImplementation(async (path) => {
      if (path === "/unreadable") throw new Error("permission denied");
      return [];
    });

    await expect(setWorkspacePath("/unreadable", "new-token")).rejects.toThrow("permission denied");
    expect(workspacePath.value).toBeNull();
    expect(workspaceSelectionError.value).toContain("permission denied");
  });
});
