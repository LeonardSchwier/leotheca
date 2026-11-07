/** @vitest-environment jsdom */
import { signal } from "@preact/signals";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FsEntry } from "./types";

const { findAllFiles, readTextFilesBatch } = vi.hoisted(() => ({
  findAllFiles: vi.fn<(path: string) => Promise<FsEntry[]>>(),
  readTextFilesBatch: vi.fn<(paths: string[]) => Promise<(string | null)[]>>(),
}));

vi.mock("./tauriBridge", () => ({
  createWorkspaceDir: vi.fn(),
  deleteWorkspacePathPermanent: vi.fn(),
  findAllEntries: vi.fn(async () => []),
  findAllFiles,
  listDir: vi.fn(async () => []),
  readTextFile: vi.fn(async () => ""),
  readTextFilesBatch,
  renameWorkspacePath: vi.fn(),
  trashPath: vi.fn(),
  writeTextFile: vi.fn(),
}));

const workspaceSession = signal(1);
const workspaceSettings = signal({
  sortOrder: "name-asc" as const,
  templatesFolder: "Templates",
});
vi.mock("../settings/store", () => ({
  workspaceSession,
  workspaceSettings,
  updateWorkspaceSettings: vi.fn(),
}));

vi.mock("../linking/store", () => ({
  linkIndex: signal({ tagsByPath: new Map<string, string[]>() }),
}));

const {
  clearSearch,
  resetWorkspaceTree,
  runSearch,
  searchInProgress,
  searchQuery,
  searchResults,
} = await import("./fileTreeStore");

function entry(name: string): FsEntry {
  return { name, path: `/workspace/${name}`, isDir: false, size: 100 };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("search request ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceSession.value = 1;
    clearSearch();
    findAllFiles.mockResolvedValue([]);
    readTextFilesBatch.mockImplementation(async (paths) =>
      paths.map(() => null),
    );
  });

  it("keeps the newer search authoritative when B resolves before A", async () => {
    const a = deferred<FsEntry[]>();
    const b = deferred<FsEntry[]>();
    findAllFiles
      .mockImplementationOnce(() => a.promise)
      .mockImplementationOnce(() => b.promise);

    const searchA = runSearch("/workspace", "alpha");
    const searchB = runSearch("/workspace", "beta");

    b.resolve([entry("beta.md")]);
    await searchB;
    expect(searchQuery.value).toBe("beta");
    expect(searchResults.value?.map((item) => item.name)).toEqual(["beta.md"]);
    expect(searchInProgress.value).toBe(false);

    a.resolve([entry("alpha.md")]);
    await searchA;
    expect(searchQuery.value).toBe("beta");
    expect(searchResults.value?.map((item) => item.name)).toEqual(["beta.md"]);
    expect(searchInProgress.value).toBe(false);
  });

  it("does not publish A when A resolves before the newer B", async () => {
    const a = deferred<FsEntry[]>();
    const b = deferred<FsEntry[]>();
    findAllFiles
      .mockImplementationOnce(() => a.promise)
      .mockImplementationOnce(() => b.promise);

    const searchA = runSearch("/workspace", "alpha");
    const searchB = runSearch("/workspace", "beta");

    a.resolve([entry("alpha.md")]);
    await searchA;
    expect(searchQuery.value).toBe("beta");
    expect(searchResults.value).toBeNull();
    expect(searchInProgress.value).toBe(true);

    b.resolve([entry("beta.md")]);
    await searchB;
    expect(searchResults.value?.map((item) => item.name)).toEqual(["beta.md"]);
    expect(searchInProgress.value).toBe(false);
  });

  it("keeps a clear authoritative while an older enumeration finishes", async () => {
    const pending = deferred<FsEntry[]>();
    findAllFiles.mockImplementationOnce(() => pending.promise);

    const search = runSearch("/workspace", "alpha");
    expect(searchInProgress.value).toBe(true);
    clearSearch();
    expect(searchQuery.value).toBe("");
    expect(searchResults.value).toBeNull();
    expect(searchInProgress.value).toBe(false);

    pending.resolve([entry("alpha.md")]);
    await search;
    expect(searchQuery.value).toBe("");
    expect(searchResults.value).toBeNull();
    expect(searchInProgress.value).toBe(false);
  });

  it("does not let a content batch from A overwrite a completed B", async () => {
    const content = deferred<(string | null)[]>();
    findAllFiles
      .mockResolvedValueOnce([entry("note.md")])
      .mockResolvedValueOnce([entry("beta.md")]);
    readTextFilesBatch.mockImplementationOnce(() => content.promise);

    const searchA = runSearch("/workspace", "alpha");
    await Promise.resolve();
    await Promise.resolve();
    const searchB = runSearch("/workspace", "beta");
    await searchB;
    expect(searchResults.value?.map((item) => item.name)).toEqual(["beta.md"]);

    content.resolve(["alpha in content"]);
    await searchA;
    expect(searchQuery.value).toBe("beta");
    expect(searchResults.value?.map((item) => item.name)).toEqual(["beta.md"]);
    expect(searchInProgress.value).toBe(false);
  });

  it("invalidates an older search when the workspace session changes", async () => {
    const pending = deferred<FsEntry[]>();
    findAllFiles.mockImplementationOnce(() => pending.promise);

    const search = runSearch("/workspace", "alpha");
    workspaceSession.value += 1;
    resetWorkspaceTree();

    pending.resolve([entry("alpha.md")]);
    await search;
    expect(searchQuery.value).toBe("");
    expect(searchResults.value).toBeNull();
    expect(searchInProgress.value).toBe(false);
  });
});
