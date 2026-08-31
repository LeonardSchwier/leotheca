import { beforeEach, describe, expect, it, vi } from "vitest";
import { linkIndex, rebuildLinkIndex, resetLinkIndexCache } from "./store";

const { findMarkdownFiles, readTextFile, writeTextFile } = vi.hoisted(() => ({
  findMarkdownFiles: vi.fn(),
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
}));

vi.mock("../workspace/tauriBridge", () => ({ findMarkdownFiles, readTextFile, writeTextFile }));

const CACHE_PATH = "/workspace/.leotheca/link-index-cache.json";

function resetIndex(): void {
  linkIndex.value = {
    backlinksByPath: new Map(),
    pathsByNoteName: new Map(),
    pathsByAlias: new Map(),
    aliasesByPath: new Map(),
    pathsByTag: new Map(),
    tagsByPath: new Map(),
  };
  resetLinkIndexCache();
}

describe("F-012 negative controls", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    writeTextFile.mockResolvedValue(undefined);
    resetIndex();
  });

  it("isolates one unreadable note instead of rejecting the whole rebuild", async () => {
    findMarkdownFiles.mockResolvedValue([
      { name: "good.md", path: "/workspace/good.md", isDir: false },
      { name: "bad.md", path: "/workspace/bad.md", isDir: false },
    ]);
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) throw new Error("no cache");
      if (path.endsWith("bad.md")) throw new Error("unreadable");
      return "[[good]]";
    });

    await expect(rebuildLinkIndex("/workspace")).resolves.toBeUndefined();
    expect(linkIndex.value.pathsByNoteName.has("good")).toBe(true);
  });

  it("does not let a pre-reset rebuild become authoritative again", async () => {
    let finishOldWalk!: (entries: Array<{ name: string; path: string; isDir: false }>) => void;
    const oldWalk = new Promise<Array<{ name: string; path: string; isDir: false }>>((resolve) => {
      finishOldWalk = resolve;
    });
    findMarkdownFiles.mockImplementation((rootPath: string) => {
      if (rootPath === "/old") return oldWalk;
      return Promise.resolve([{ name: "new.md", path: "/new/new.md", isDir: false as const }]);
    });
    readTextFile.mockImplementation(async (path: string) => {
      if (path.endsWith("link-index-cache.json")) throw new Error("no cache");
      return "";
    });

    const oldRebuild = rebuildLinkIndex("/old");
    await new Promise((resolve) => setTimeout(resolve, 0));
    resetLinkIndexCache();
    await rebuildLinkIndex("/new");
    finishOldWalk([{ name: "old.md", path: "/old/old.md", isDir: false }]);
    await oldRebuild;

    expect(linkIndex.value.pathsByNoteName.has("new")).toBe(true);
    expect(linkIndex.value.pathsByNoteName.has("old")).toBe(false);
  });
});
