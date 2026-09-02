import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  extractWikilinks,
  linkIndex,
  linkIndexBuilding,
  linkIndexUnreadablePaths,
  rebuildLinkIndex,
  resetLinkIndexCache,
  resolveWikilink,
} from "./store";

const { findMarkdownFiles, readTextFile, writeWorkspaceTextFile, isNativePlatform } =
  vi.hoisted(() => ({
    findMarkdownFiles: vi.fn(),
    readTextFile: vi.fn(),
    writeWorkspaceTextFile: vi.fn(),
    // Defaults to true (Android/native) so every existing test, written
    // before platform-specific concurrency existed, keeps exercising the
    // original 8-way cap without needing its own override.
    isNativePlatform: vi.fn(() => true),
  }));

vi.mock("../workspace/tauriBridge", () => ({
  findMarkdownFiles,
  readTextFile,
  writeWorkspaceTextFile,
  isNativePlatform,
}));

const CACHE_PATH = "/workspace/.leotheca/link-index-cache.json";
const CACHE_RELATIVE_PATH = ".leotheca/link-index-cache.json";

/** No cache file exists yet by default — the realistic starting state for
 * a workspace that's never been indexed with this feature before. Tests
 * that want a specific cache file present override this per-call. */
function rejectCacheLoad() {
  readTextFile.mockImplementation(async (path: string) => {
    if (path === CACHE_PATH) throw new Error("no cache file yet");
    throw new Error(`unexpected readTextFile call: ${path}`);
  });
}

describe("wikilink index", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    writeWorkspaceTextFile.mockResolvedValue(undefined);
    isNativePlatform.mockReturnValue(true);
    linkIndex.value = {
      backlinksByPath: new Map(),
      pathsByNoteName: new Map(),
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
      pathsByTag: new Map(),
      tagsByPath: new Map(),
      tasksByPath: new Map(),
    };
    resetLinkIndexCache();
  });

  it("extracts trimmed wikilink targets", () => {
    expect(
      extractWikilinks("See [[Note Name]] and [[ another note ]]."),
    ).toEqual(["Note Name", "another note"]);
  });

  it("indexes case-insensitive links and backlinks", async () => {
    findMarkdownFiles.mockResolvedValue([
      { name: "Alpha.md", path: "/workspace/Alpha.md", isDir: false },
      { name: "Beta.MD", path: "/workspace/Notes/Beta.MD", isDir: false },
    ]);
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) throw new Error("no cache file yet");
      return path.endsWith("Alpha.md")
        ? "[[beta]] [[Missing]] [[Beta]]"
        : "[[ALPHA]]";
    });

    await rebuildLinkIndex("/workspace");

    expect(resolveWikilink("BeTa")).toBe("/workspace/Notes/Beta.MD");
    expect(
      linkIndex.value.backlinksByPath.get("/workspace/Notes/Beta.MD"),
    ).toEqual(["/workspace/Alpha.md"]);
    expect(linkIndex.value.backlinksByPath.get("/workspace/Alpha.md")).toEqual([
      "/workspace/Notes/Beta.MD",
    ]);
  });

  it("sets linkIndexBuilding while rebuilding and clears it once done", async () => {
    findMarkdownFiles.mockResolvedValueOnce([
      { name: "Alpha.md", path: "/workspace/Alpha.md", isDir: false },
    ]);
    // Call order: the cache-file load happens first, then the note read.
    readTextFile.mockImplementationOnce(async () => {
      throw new Error("no cache file yet");
    });
    readTextFile.mockResolvedValueOnce("no links here");

    expect(linkIndexBuilding.value).toBe(false);
    const promise = rebuildLinkIndex("/workspace");
    expect(linkIndexBuilding.value).toBe(true);
    await promise;
    expect(linkIndexBuilding.value).toBe(false);
  });

  it("keeps a completed newer workspace index when an older walk finishes later", async () => {
    let finishOlderWalk!: (
      entries: Array<{ name: string; path: string; isDir: boolean }>,
    ) => void;
    const olderWalk = new Promise<
      Array<{ name: string; path: string; isDir: boolean }>
    >((resolve) => {
      finishOlderWalk = resolve;
    });
    findMarkdownFiles.mockImplementation((rootPath: string) => {
      if (rootPath === "/older") return olderWalk;
      return Promise.resolve([
        { name: "newer.md", path: "/newer/newer.md", isDir: false },
      ]);
    });
    readTextFile.mockImplementation(async (path: string) => {
      if (path.endsWith("link-index-cache.json"))
        throw new Error("no cache file yet");
      return "[[newer]]";
    });

    const olderRebuild = rebuildLinkIndex("/older");
    await new Promise((resolve) => setTimeout(resolve, 0));
    await rebuildLinkIndex("/newer");
    finishOlderWalk([
      { name: "older.md", path: "/older/older.md", isDir: false },
    ]);
    await olderRebuild;

    expect(linkIndex.value.pathsByNoteName.has("newer")).toBe(true);
    expect(linkIndex.value.pathsByNoteName.has("older")).toBe(false);
    expect(readTextFile).not.toHaveBeenCalledWith("/older/older.md");
    expect(linkIndexBuilding.value).toBe(false);
  });

  it("clears linkIndexBuilding, never has more than the concurrency cap in flight, and (audit follow-up F-012) does not abort the whole rebuild when one read fails", async () => {
    const paths = Array.from(
      { length: 20 },
      (_, i) => `/workspace/note-${i}.md`,
    );
    findMarkdownFiles.mockResolvedValueOnce(
      paths.map((path, i) => ({ name: `note-${i}.md`, path, isDir: false })),
    );

    let inFlight = 0;
    let maxInFlight = 0;
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) throw new Error("no cache file yet");
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight--;
      if (path.endsWith("note-5.md")) throw new Error("simulated read failure");
      return "";
    });

    await expect(rebuildLinkIndex("/workspace")).resolves.toBeUndefined();

    expect(linkIndexBuilding.value).toBe(false);
    // The concurrency cap in rebuildLinkIndex is 8; asserting a looser bound
    // here so this test isn't coupled to that exact constant, just that it
    // isn't dispatching all 20 reads at once like Promise.all(...) would.
    expect(maxInFlight).toBeLessThanOrEqual(8);
    expect(maxInFlight).toBeGreaterThan(1);
    // The other 19 notes still indexed successfully despite the one failure.
    expect(linkIndex.value.backlinksByPath.size).toBe(20);
    expect(linkIndexUnreadablePaths.value).toEqual(["/workspace/note-5.md"]);
  });

  it("uses a higher read concurrency on desktop than on Android", async () => {
    const paths = Array.from(
      { length: 40 },
      (_, i) => `/workspace/note-${i}.md`,
    );
    findMarkdownFiles.mockResolvedValue(
      paths.map((path, i) => ({ name: `note-${i}.md`, path, isDir: false })),
    );

    async function measureMaxInFlight(): Promise<number> {
      resetLinkIndexCache();
      let inFlight = 0;
      let maxInFlight = 0;
      readTextFile.mockImplementation(async (path: string) => {
        if (path === CACHE_PATH) throw new Error("no cache file yet");
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 1));
        inFlight--;
        return "";
      });
      await rebuildLinkIndex("/workspace");
      return maxInFlight;
    }

    isNativePlatform.mockReturnValue(true);
    const androidMaxInFlight = await measureMaxInFlight();
    expect(androidMaxInFlight).toBeLessThanOrEqual(8);

    isNativePlatform.mockReturnValue(false);
    const desktopMaxInFlight = await measureMaxInFlight();
    expect(desktopMaxInFlight).toBeGreaterThan(8);
    expect(desktopMaxInFlight).toBeLessThanOrEqual(24);
  });

  it("reports an empty linkIndexUnreadablePaths after a rebuild in which every note reads successfully (audit follow-up F-012)", async () => {
    findMarkdownFiles.mockResolvedValue([
      { name: "a.md", path: "/workspace/a.md", isDir: false },
    ]);
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) throw new Error("no cache file yet");
      return "content";
    });

    await rebuildLinkIndex("/workspace");
    expect(linkIndexUnreadablePaths.value).toEqual([]);
  });

  it("keeps a note's last-known wikilinks, aliases, and tags when a later rebuild fails to re-read it, instead of dropping them (audit follow-up F-012)", async () => {
    findMarkdownFiles.mockResolvedValue([
      { name: "a.md", path: "/workspace/a.md", isDir: false, mtime: 1000, size: 5 },
    ]);
    rejectCacheLoad();
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) throw new Error("no cache file yet");
      return "[[b]]";
    });

    await rebuildLinkIndex("/workspace");
    expect(linkIndex.value.pathsByNoteName.has("a")).toBe(true);
    const firstBacklinkTargets = [...linkIndex.value.backlinksByPath.keys()];

    // The note's mtime/size changed (so it's no longer a cache hit), but
    // this time the read itself fails, e.g. a sync tool briefly locked it
    // mid-write.
    findMarkdownFiles.mockResolvedValue([
      { name: "a.md", path: "/workspace/a.md", isDir: false, mtime: 2000, size: 9 },
    ]);
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) throw new Error("no cache file yet");
      throw new Error("simulated transient lock");
    });

    await expect(rebuildLinkIndex("/workspace")).resolves.toBeUndefined();
    expect(linkIndexUnreadablePaths.value).toEqual(["/workspace/a.md"]);
    // Still resolvable and still contributing the same backlinks as the
    // last successful read, not silently emptied out by the failure.
    expect(linkIndex.value.pathsByNoteName.has("a")).toBe(true);
    expect([...linkIndex.value.backlinksByPath.keys()]).toEqual(
      firstBacklinkTargets,
    );

    // A third rebuild where the file becomes readable again (the lock
    // cleared): the retained cache entry still reflects the last
    // *confirmed* mtime/size (from the first, successful read), not the
    // failed attempt's unconfirmed one, so this mismatches the file's
    // real current mtime/size and triggers a genuine re-read rather than
    // wrongly trusting stale content paired with an identity nobody ever
    // actually verified.
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) throw new Error("no cache file yet");
      return "[[c]]";
    });
    readTextFile.mockClear();
    await rebuildLinkIndex("/workspace");
    expect(readTextFile).toHaveBeenCalledWith("/workspace/a.md");
    expect(linkIndexUnreadablePaths.value).toEqual([]);
  });
});

describe("rebuildLinkIndex: mtime-based caching", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    writeWorkspaceTextFile.mockResolvedValue(undefined);
    isNativePlatform.mockReturnValue(true);
    linkIndex.value = {
      backlinksByPath: new Map(),
      pathsByNoteName: new Map(),
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
      pathsByTag: new Map(),
      tagsByPath: new Map(),
      tasksByPath: new Map(),
    };
    resetLinkIndexCache();
  });

  it("does not re-read a note's content on a second call when its mtime hasn't changed", async () => {
    findMarkdownFiles.mockResolvedValue([
      { name: "a.md", path: "/workspace/a.md", isDir: false, mtime: 1000, size: 10 },
    ]);
    rejectCacheLoad();
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) throw new Error("no cache file yet");
      return "[[b]]";
    });

    await rebuildLinkIndex("/workspace");
    expect(readTextFile).toHaveBeenCalledWith("/workspace/a.md");
    readTextFile.mockClear();

    await rebuildLinkIndex("/workspace");
    expect(readTextFile).not.toHaveBeenCalledWith("/workspace/a.md");
    // The links extracted the first time are still reflected in the index.
    expect(
      linkIndex.value.backlinksByPath.get("/workspace/a.md"),
    ).toBeDefined();
  });

  it("does re-read a note's content when its mtime has changed since the last call", async () => {
    let mtime = 1000;
    findMarkdownFiles.mockImplementation(async () => [
      { name: "a.md", path: "/workspace/a.md", isDir: false, mtime, size: 10 },
    ]);
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) throw new Error("no cache file yet");
      return "content";
    });

    await rebuildLinkIndex("/workspace");
    readTextFile.mockClear();
    mtime = 2000; // note was edited since the last rebuild

    await rebuildLinkIndex("/workspace");
    expect(readTextFile).toHaveBeenCalledWith("/workspace/a.md");
  });

  it("always re-reads a note with no mtime available, rather than risking a stale cache hit", async () => {
    findMarkdownFiles.mockResolvedValue([
      { name: "a.md", path: "/workspace/a.md", isDir: false },
    ]);
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) throw new Error("no cache file yet");
      return "content";
    });

    await rebuildLinkIndex("/workspace");
    readTextFile.mockClear();

    await rebuildLinkIndex("/workspace");
    expect(readTextFile).toHaveBeenCalledWith("/workspace/a.md");
  });

  it("always re-reads a note with mtime but no size available, rather than risking a stale cache hit (audit follow-up F-012)", async () => {
    findMarkdownFiles.mockResolvedValue([
      { name: "a.md", path: "/workspace/a.md", isDir: false, mtime: 1000 },
    ]);
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) throw new Error("no cache file yet");
      return "content";
    });

    await rebuildLinkIndex("/workspace");
    readTextFile.mockClear();

    await rebuildLinkIndex("/workspace");
    expect(readTextFile).toHaveBeenCalledWith("/workspace/a.md");
  });

  it("re-reads a note whose mtime is unchanged but whose size differs, the same-tick-edit case a coarse or colliding mtime alone would hide (audit follow-up F-012)", async () => {
    let content = "[[b]]"; // 5 bytes
    findMarkdownFiles.mockImplementation(async () => [
      { name: "a.md", path: "/workspace/a.md", isDir: false, mtime: 1000, size: content.length },
    ]);
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) throw new Error("no cache file yet");
      return content;
    });

    await rebuildLinkIndex("/workspace");
    readTextFile.mockClear();

    // Same mtime as before (a coarse filesystem clock or a same-tick
    // rewrite), but the content, and therefore the byte size, changed.
    content = "[[c]][[d]]"; // 10 bytes: mtime alone would have missed this
    await rebuildLinkIndex("/workspace");
    expect(readTextFile).toHaveBeenCalledWith("/workspace/a.md");
  });

  it("still misses a same-mtime, same-size content change, the accepted residual risk mtime-plus-size narrows but does not eliminate (audit follow-up F-012)", async () => {
    let content = "[[b]]"; // 5 bytes
    findMarkdownFiles.mockImplementation(async () => [
      { name: "a.md", path: "/workspace/a.md", isDir: false, mtime: 1000, size: content.length },
    ]);
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) throw new Error("no cache file yet");
      return content;
    });

    await rebuildLinkIndex("/workspace");
    readTextFile.mockClear();

    // Same mtime and same byte length, different content: this exact
    // pathological case is documented, not silently assumed, as the one
    // this fix narrows rather than fully closes.
    content = "[[c]]"; // also 5 bytes
    await rebuildLinkIndex("/workspace");
    expect(readTextFile).not.toHaveBeenCalledWith("/workspace/a.md");
  });

  it("loads a persisted cache file and uses it to skip a read on the very first call in a session", async () => {
    findMarkdownFiles.mockResolvedValue([
      { name: "a.md", path: "/workspace/a.md", isDir: false, mtime: 1000, size: 10 },
    ]);
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) {
        return JSON.stringify({
          version: 6,
          entries: {
            "/workspace/a.md": {
              mtime: 1000,
              size: 10,
              wikilinks: ["b"],
              aliases: [],
              tags: [],
              tasks: [],
              hasFrontmatter: false,
              frontmatterProperties: [],
            },
          },
        });
      }
      throw new Error(`unexpected content read: ${path}`);
    });

    await rebuildLinkIndex("/workspace");

    // The only readTextFile call should have been for the cache file
    // itself — the note's own content was never read, because the
    // persisted cache already had a matching mtime for it.
    expect(readTextFile).toHaveBeenCalledTimes(1);
    expect(readTextFile).toHaveBeenCalledWith(CACHE_PATH);
  });

  it("ignores a persisted cache file from an incompatible version", async () => {
    findMarkdownFiles.mockResolvedValue([
      { name: "a.md", path: "/workspace/a.md", isDir: false, mtime: 1000 },
    ]);
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) {
        return JSON.stringify({
          version: 999,
          entries: { "/workspace/a.md": { mtime: 1000, wikilinks: ["b"] } },
        });
      }
      return "[[c]]";
    });

    await rebuildLinkIndex("/workspace");

    expect(readTextFile).toHaveBeenCalledWith("/workspace/a.md");
  });

  it("ignores an old pre-size (version 3) cache file rather than trusting an entry with no size to compare (audit follow-up F-012)", async () => {
    findMarkdownFiles.mockResolvedValue([
      { name: "a.md", path: "/workspace/a.md", isDir: false, mtime: 1000, size: 5 },
    ]);
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) {
        return JSON.stringify({
          version: 3,
          entries: {
            "/workspace/a.md": {
              mtime: 1000,
              wikilinks: ["b"],
              aliases: [],
              tags: [],
            },
          },
        });
      }
      return "[[c]]";
    });

    await rebuildLinkIndex("/workspace");

    expect(readTextFile).toHaveBeenCalledWith("/workspace/a.md");
  });

  it("audit follow-ups F-008/F-012: does not crash the whole rebuild when a persisted cache entry has a malformed field, and re-reads that note instead of trusting it", async () => {
    findMarkdownFiles.mockResolvedValue([
      { name: "a.md", path: "/workspace/a.md", isDir: false, mtime: 1000, size: 5 },
    ]);
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) {
        // aliases is a string, not an array: without a runtime decoder,
        // the cache-hit path's `cached.aliases.length`/`for...of
        // cached.aliases` would either misbehave or throw, and a thrown
        // error inside mapWithConcurrency's worker propagates out of the
        // whole rebuildLinkIndex call, not just this one entry.
        return JSON.stringify({
          version: 6,
          entries: {
            "/workspace/a.md": {
              mtime: 1000,
              size: 5,
              wikilinks: ["b"],
              aliases: "not-an-array",
              tags: [],
              tasks: [],
              hasFrontmatter: false,
              frontmatterProperties: [],
            },
          },
        });
      }
      return "[[c]]";
    });

    await expect(rebuildLinkIndex("/workspace")).resolves.toBeUndefined();

    // The malformed entry was dropped, not trusted, so the note was read
    // fresh from disk instead of taking a false cache hit.
    expect(readTextFile).toHaveBeenCalledWith("/workspace/a.md");
    expect(linkIndex.value.pathsByNoteName.get("a")).toEqual([
      "/workspace/a.md",
    ]);
    expect(linkIndexUnreadablePaths.value).toEqual([]);
    expect(linkIndexBuilding.value).toBe(false);
  });

  it("F02 Phase 1: drops a persisted cache entry whose tasks field is malformed, forcing a real re-read instead of trusting it", async () => {
    findMarkdownFiles.mockResolvedValue([
      { name: "a.md", path: "/workspace/a.md", isDir: false, mtime: 1000, size: 5 },
    ]);
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) {
        // tasks holds an object missing every required TaskRecord field:
        // without validating this newest field the same way the older
        // ones already are, `cached.tasks.length`/`tasks =
        // cached.tasks` downstream would trust a garbage shape instead
        // of forcing a real re-read.
        return JSON.stringify({
          version: 6,
          entries: {
            "/workspace/a.md": {
              mtime: 1000,
              size: 5,
              wikilinks: ["b"],
              aliases: [],
              tags: [],
              tasks: [{ checked: "not-a-boolean" }],
              hasFrontmatter: false,
              frontmatterProperties: [],
            },
          },
        });
      }
      return "[[c]]";
    });

    await expect(rebuildLinkIndex("/workspace")).resolves.toBeUndefined();

    expect(readTextFile).toHaveBeenCalledWith("/workspace/a.md");
    expect(linkIndexUnreadablePaths.value).toEqual([]);
  });

  it("drops only the malformed entry from a persisted cache file, keeping every other valid entry", async () => {
    findMarkdownFiles.mockResolvedValue([
      { name: "a.md", path: "/workspace/a.md", isDir: false, mtime: 1000, size: 5 },
      { name: "b.md", path: "/workspace/b.md", isDir: false, mtime: 2000, size: 7 },
    ]);
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) {
        return JSON.stringify({
          version: 6,
          entries: {
            "/workspace/a.md": {
              mtime: 1000,
              size: 5,
              wikilinks: null,
              aliases: [],
              tags: [],
              tasks: [],
              hasFrontmatter: false,
              frontmatterProperties: [],
            },
            "/workspace/b.md": {
              mtime: 2000,
              size: 7,
              wikilinks: ["good"],
              aliases: [],
              tags: [],
              tasks: [],
              hasFrontmatter: false,
              frontmatterProperties: [],
            },
          },
        });
      }
      throw new Error(`unexpected content read: ${path}`);
    });

    await rebuildLinkIndex("/workspace");

    // a.md's malformed entry forced a real read (which the mock doesn't
    // provide, and would throw if attempted); b.md's valid entry was kept
    // and used as a cache hit, so only a.md was ever actually re-read.
    expect(readTextFile).toHaveBeenCalledWith("/workspace/a.md");
    expect(readTextFile).not.toHaveBeenCalledWith("/workspace/b.md");
  });

  it("starts fresh rather than crashing when the persisted cache file's top-level shape is not a version-4 object at all", async () => {
    findMarkdownFiles.mockResolvedValue([
      { name: "a.md", path: "/workspace/a.md", isDir: false, mtime: 1000, size: 5 },
    ]);
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) return JSON.stringify(["not", "an", "object"]);
      return "[[c]]";
    });

    await expect(rebuildLinkIndex("/workspace")).resolves.toBeUndefined();
    expect(readTextFile).toHaveBeenCalledWith("/workspace/a.md");
  });

  it("starts fresh rather than crashing when the persisted cache file's entries field is itself the wrong shape", async () => {
    findMarkdownFiles.mockResolvedValue([
      { name: "a.md", path: "/workspace/a.md", isDir: false, mtime: 1000, size: 5 },
    ]);
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) {
        return JSON.stringify({ version: 6, entries: ["not", "a", "record"] });
      }
      return "[[c]]";
    });

    await expect(rebuildLinkIndex("/workspace")).resolves.toBeUndefined();
    expect(readTextFile).toHaveBeenCalledWith("/workspace/a.md");
  });

  it("saves the rebuilt cache to disk after a successful call", async () => {
    findMarkdownFiles.mockResolvedValue([
      { name: "a.md", path: "/workspace/a.md", isDir: false, mtime: 1000, size: 5 },
    ]);
    rejectCacheLoad();
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) throw new Error("no cache file yet");
      return "[[b]]";
    });

    await rebuildLinkIndex("/workspace");

    expect(writeWorkspaceTextFile).toHaveBeenCalledTimes(1);
    const [savedRoot, savedRelativePath, savedContent] =
      writeWorkspaceTextFile.mock.calls[0];
    expect(savedRoot).toBe("/workspace");
    expect(savedRelativePath).toBe(CACHE_RELATIVE_PATH);
    const saved = JSON.parse(savedContent);
    expect(saved.version).toBe(6);
    expect(saved.entries["/workspace/a.md"]).toEqual({
      mtime: 1000,
      size: 5,
      wikilinks: ["b"],
      aliases: [],
      tags: [],
      tasks: [],
      hasFrontmatter: false,
      frontmatterProperties: [],
    });
  });

  it("prunes a note that no longer exists out of the cache on the next call", async () => {
    let entries: {
      name: string;
      path: string;
      isDir: boolean;
      mtime: number;
      size: number;
    }[] = [
      { name: "a.md", path: "/workspace/a.md", isDir: false, mtime: 1000, size: 0 },
      { name: "b.md", path: "/workspace/b.md", isDir: false, mtime: 1000, size: 0 },
    ];
    findMarkdownFiles.mockImplementation(async () => entries);
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) throw new Error("no cache file yet");
      return "";
    });

    await rebuildLinkIndex("/workspace");
    entries = entries.filter((e) => e.name !== "b.md"); // b.md deleted

    await rebuildLinkIndex("/workspace");

    const lastSave = writeWorkspaceTextFile.mock.calls.at(-1)!;
    const saved = JSON.parse(lastSave[2]);
    expect(Object.keys(saved.entries)).toEqual(["/workspace/a.md"]);
  });

  it("a failure to save the cache does not fail the whole rebuild", async () => {
    findMarkdownFiles.mockResolvedValue([
      { name: "a.md", path: "/workspace/a.md", isDir: false, mtime: 1000 },
    ]);
    rejectCacheLoad();
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) throw new Error("no cache file yet");
      return "[[b]]";
    });
    writeWorkspaceTextFile.mockRejectedValue(new Error("read-only filesystem"));

    await expect(rebuildLinkIndex("/workspace")).resolves.toBeUndefined();
    expect(linkIndex.value.backlinksByPath.size).toBeGreaterThan(0);
  });

  it("forces a real re-read after resetLinkIndexCache even when mtime and size would otherwise still match, the workspace-transition-switch case (audit follow-up N-001/N-003 wires this to a workspace switch)", async () => {
    findMarkdownFiles.mockResolvedValue([
      { name: "a.md", path: "/workspace/a.md", isDir: false, mtime: 1000, size: 5 },
    ]);
    rejectCacheLoad();
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) throw new Error("no cache file yet");
      return "[[b]]";
    });

    await rebuildLinkIndex("/workspace");
    readTextFile.mockClear();

    // Simulates App.tsx's workspaceTransitions.registerReset(resetLinkIndexCache)
    // firing on a workspace switch, even back to the exact same root with
    // files reporting the exact same mtime/size as before (a pathological
    // edge case, but the reset must not depend on anything actually having
    // changed on disk to take effect).
    resetLinkIndexCache();
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) throw new Error("no cache file yet");
      return "[[b]]";
    });

    await rebuildLinkIndex("/workspace");
    expect(readTextFile).toHaveBeenCalledWith("/workspace/a.md");
    expect(linkIndexUnreadablePaths.value).toEqual([]);
  });
});

describe("rebuildLinkIndex: aliases", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    writeWorkspaceTextFile.mockResolvedValue(undefined);
    isNativePlatform.mockReturnValue(true);
    linkIndex.value = {
      backlinksByPath: new Map(),
      pathsByNoteName: new Map(),
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
      pathsByTag: new Map(),
      tagsByPath: new Map(),
      tasksByPath: new Map(),
    };
    resetLinkIndexCache();
  });

  function setupTwoNotes(betaFrontmatter: string, alphaBody: string) {
    findMarkdownFiles.mockResolvedValue([
      { name: "Alpha.md", path: "/workspace/Alpha.md", isDir: false },
      { name: "Beta.md", path: "/workspace/Beta.md", isDir: false },
    ]);
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) throw new Error("no cache file yet");
      if (path.endsWith("Beta.md")) return betaFrontmatter;
      return alphaBody;
    });
  }

  it("resolves a wikilink by another note's alias, not just its file name", async () => {
    setupTwoNotes(
      "---\naliases: [B, Second Letter]\n---\n",
      "[[Second Letter]]",
    );

    await rebuildLinkIndex("/workspace");

    expect(resolveWikilink("second letter")).toBe("/workspace/Beta.md");
  });

  it("attributes a backlink to the note an alias resolves to (the two-pass fix)", async () => {
    // Beta declares the alias "B" but is read concurrently with Alpha, so
    // whichever finishes first can't yet know the other's aliases; this is
    // exactly the race the second, in-memory-only pass exists to avoid.
    setupTwoNotes("---\naliases: [B]\n---\n", "[[B]]");

    await rebuildLinkIndex("/workspace");

    expect(linkIndex.value.backlinksByPath.get("/workspace/Beta.md")).toEqual([
      "/workspace/Alpha.md",
    ]);
  });

  it("populates aliasesByPath with the alias's original casing, for display", async () => {
    setupTwoNotes("---\naliases: [Second Letter]\n---\n", "no links here");

    await rebuildLinkIndex("/workspace");

    expect(linkIndex.value.aliasesByPath.get("/workspace/Beta.md")).toEqual([
      "Second Letter",
    ]);
  });

  it("prefers a real note name over a same-text alias declared by another note", async () => {
    findMarkdownFiles.mockResolvedValue([
      { name: "Alpha.md", path: "/workspace/Alpha.md", isDir: false },
      { name: "Beta.md", path: "/workspace/Beta.md", isDir: false },
    ]);
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) throw new Error("no cache file yet");
      // Beta claims "Alpha" as its own alias, colliding with Alpha's real name.
      if (path.endsWith("Beta.md")) return "---\naliases: [Alpha]\n---\n";
      return "";
    });

    await rebuildLinkIndex("/workspace");

    expect(resolveWikilink("Alpha")).toBe("/workspace/Alpha.md");
  });

  it("does not resolve, autocomplete, or attribute backlinks by alias when the setting is off", async () => {
    setupTwoNotes("---\naliases: [Second Letter]\n---\n", "[[Second Letter]]");

    await rebuildLinkIndex("/workspace", false);

    expect(resolveWikilink("second letter")).toBeNull();
    expect(linkIndex.value.aliasesByPath.size).toBe(0);
    expect(linkIndex.value.backlinksByPath.get("/workspace/Beta.md")).toEqual(
      [],
    );
    // Name-based resolution is unaffected by the setting.
    expect(resolveWikilink("Beta")).toBe("/workspace/Beta.md");
  });

  it("caches aliases the same way it caches wikilinks (no re-read when mtime is unchanged)", async () => {
    findMarkdownFiles.mockResolvedValue([
      { name: "a.md", path: "/workspace/a.md", isDir: false, mtime: 1000, size: 24 },
    ]);
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) throw new Error("no cache file yet");
      return "---\naliases: [Foo]\n---\n";
    });

    await rebuildLinkIndex("/workspace");
    expect(linkIndex.value.aliasesByPath.get("/workspace/a.md")).toEqual([
      "Foo",
    ]);
    readTextFile.mockClear();

    await rebuildLinkIndex("/workspace");
    expect(readTextFile).not.toHaveBeenCalledWith("/workspace/a.md");
    expect(linkIndex.value.aliasesByPath.get("/workspace/a.md")).toEqual([
      "Foo",
    ]);
  });
});

describe("rebuildLinkIndex: tags", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    writeWorkspaceTextFile.mockResolvedValue(undefined);
    isNativePlatform.mockReturnValue(true);
    linkIndex.value = {
      backlinksByPath: new Map(),
      pathsByNoteName: new Map(),
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
      pathsByTag: new Map(),
      tagsByPath: new Map(),
      tasksByPath: new Map(),
    };
    resetLinkIndexCache();
  });

  function setupTwoNotes(alphaBody: string, betaBody: string) {
    findMarkdownFiles.mockResolvedValue([
      { name: "Alpha.md", path: "/workspace/Alpha.md", isDir: false },
      { name: "Beta.md", path: "/workspace/Beta.md", isDir: false },
    ]);
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) throw new Error("no cache file yet");
      if (path.endsWith("Alpha.md")) return alphaBody;
      return betaBody;
    });
  }

  it("combines inline #tags and the frontmatter tags field into tagsByPath", async () => {
    setupTwoNotes(
      "---\ntags: [work]\n---\n\nAlso #journal today.",
      "no tags here",
    );

    await rebuildLinkIndex("/workspace");

    expect(linkIndex.value.tagsByPath.get("/workspace/Alpha.md")).toEqual([
      "work",
      "journal",
    ]);
    expect(linkIndex.value.tagsByPath.has("/workspace/Beta.md")).toBe(false);
  });

  it("groups every note carrying a tag under pathsByTag, regardless of which note wrote it first", async () => {
    setupTwoNotes("#shared", "#shared");

    await rebuildLinkIndex("/workspace");

    expect(linkIndex.value.pathsByTag.get("shared")).toEqual([
      "/workspace/Alpha.md",
      "/workspace/Beta.md",
    ]);
  });

  it("does not populate pathsByTag or tagsByPath when the setting is off", async () => {
    setupTwoNotes("#work", "#work");

    await rebuildLinkIndex("/workspace", true, false);

    expect(linkIndex.value.pathsByTag.size).toBe(0);
    expect(linkIndex.value.tagsByPath.size).toBe(0);
  });

  it("caches tags the same way it caches wikilinks and aliases (no re-read when mtime is unchanged)", async () => {
    findMarkdownFiles.mockResolvedValue([
      { name: "a.md", path: "/workspace/a.md", isDir: false, mtime: 1000, size: 4 },
    ]);
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) throw new Error("no cache file yet");
      return "#foo";
    });

    await rebuildLinkIndex("/workspace");
    expect(linkIndex.value.tagsByPath.get("/workspace/a.md")).toEqual(["foo"]);
    readTextFile.mockClear();

    await rebuildLinkIndex("/workspace");
    expect(readTextFile).not.toHaveBeenCalledWith("/workspace/a.md");
    expect(linkIndex.value.tagsByPath.get("/workspace/a.md")).toEqual(["foo"]);
  });
});

describe("rebuildLinkIndex: tasks (F02 Phase 1)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    writeWorkspaceTextFile.mockResolvedValue(undefined);
    isNativePlatform.mockReturnValue(true);
    linkIndex.value = {
      backlinksByPath: new Map(),
      pathsByNoteName: new Map(),
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
      pathsByTag: new Map(),
      tagsByPath: new Map(),
      tasksByPath: new Map(),
    };
    resetLinkIndexCache();
  });

  it("populates tasksByPath from the same note read used for wikilinks/tags, with no second workspace walk", async () => {
    findMarkdownFiles.mockResolvedValue([
      { name: "Alpha.md", path: "/workspace/Alpha.md", isDir: false },
      { name: "Beta.md", path: "/workspace/Beta.md", isDir: false },
    ]);
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) throw new Error("no cache file yet");
      if (path.endsWith("Alpha.md")) return "- [ ] Open task\n- [x] Done task\n";
      return "No tasks in this note.";
    });

    await rebuildLinkIndex("/workspace");

    expect(findMarkdownFiles).toHaveBeenCalledTimes(1);
    const alphaTasks = linkIndex.value.tasksByPath.get("/workspace/Alpha.md");
    expect(alphaTasks?.map((t) => [t.text, t.checked])).toEqual([
      ["Open task", false],
      ["Done task", true],
    ]);
    expect(linkIndex.value.tasksByPath.has("/workspace/Beta.md")).toBe(false);
  });

  it("caches tasks the same way it caches wikilinks and tags (no re-read when mtime is unchanged)", async () => {
    findMarkdownFiles.mockResolvedValue([
      { name: "a.md", path: "/workspace/a.md", isDir: false, mtime: 1000, size: 12 },
    ]);
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) throw new Error("no cache file yet");
      return "- [ ] A task";
    });

    await rebuildLinkIndex("/workspace");
    expect(linkIndex.value.tasksByPath.get("/workspace/a.md")).toHaveLength(1);
    readTextFile.mockClear();

    await rebuildLinkIndex("/workspace");
    expect(readTextFile).not.toHaveBeenCalledWith("/workspace/a.md");
    expect(linkIndex.value.tasksByPath.get("/workspace/a.md")).toHaveLength(1);
  });

  it("has no on/off setting: tasks are always extracted, unlike tags/aliases", async () => {
    findMarkdownFiles.mockResolvedValue([
      { name: "a.md", path: "/workspace/a.md", isDir: false },
    ]);
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) throw new Error("no cache file yet");
      return "- [ ] A task\n#atag";
    });

    // Both toggles off; tasksByPath is still populated since F02 has no
    // opt-out toggle (see LinkIndex.tasksByPath's own doc comment).
    await rebuildLinkIndex("/workspace", false, false);

    expect(linkIndex.value.tasksByPath.get("/workspace/a.md")).toHaveLength(1);
    expect(linkIndex.value.tagsByPath.size).toBe(0);
  });

  it("carries a previously-read note's tasks forward when a later read fails, rather than losing them", async () => {
    findMarkdownFiles.mockResolvedValueOnce([
      { name: "a.md", path: "/workspace/a.md", isDir: false, mtime: 1000, size: 12 },
    ]);
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) throw new Error("no cache file yet");
      return "- [ ] A task";
    });
    await rebuildLinkIndex("/workspace");
    expect(linkIndex.value.tasksByPath.get("/workspace/a.md")).toHaveLength(1);

    findMarkdownFiles.mockResolvedValueOnce([
      { name: "a.md", path: "/workspace/a.md", isDir: false, mtime: 2000, size: 99 },
    ]);
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) throw new Error("no cache file yet");
      throw new Error("transient read failure");
    });
    await rebuildLinkIndex("/workspace");

    expect(linkIndex.value.tasksByPath.get("/workspace/a.md")).toHaveLength(1);
    expect(linkIndexUnreadablePaths.value).toEqual(["/workspace/a.md"]);
  });
});

describe("F09 Phase 1: mtime and frontmatter property indexing", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    writeWorkspaceTextFile.mockResolvedValue(undefined);
    isNativePlatform.mockReturnValue(true);
    resetLinkIndexCache();
  });

  it("populates mtimeByPath from the same walk entries used for everything else", async () => {
    findMarkdownFiles.mockResolvedValue([
      { name: "a.md", path: "/workspace/a.md", isDir: false, mtime: 1_700_000_000_000, size: 4 },
    ]);
    rejectCacheLoad();
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) throw new Error("no cache file yet");
      return "body";
    });

    await rebuildLinkIndex("/workspace");

    expect(linkIndex.value.mtimeByPath?.get("/workspace/a.md")).toBe(1_700_000_000_000);
  });

  it("leaves a note out of mtimeByPath when the walk reported no mtime for it", async () => {
    findMarkdownFiles.mockResolvedValue([
      { name: "a.md", path: "/workspace/a.md", isDir: false },
    ]);
    rejectCacheLoad();
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) throw new Error("no cache file yet");
      return "body";
    });

    await rebuildLinkIndex("/workspace");

    expect(linkIndex.value.mtimeByPath?.has("/workspace/a.md")).toBe(false);
  });

  it("indexes hasFrontmatter and parsed top-level frontmatter properties", async () => {
    findMarkdownFiles.mockResolvedValue([
      { name: "a.md", path: "/workspace/a.md", isDir: false, mtime: 1000, size: 30 },
      { name: "b.md", path: "/workspace/b.md", isDir: false, mtime: 1000, size: 4 },
    ]);
    rejectCacheLoad();
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) throw new Error("no cache file yet");
      if (path.endsWith("a.md")) return "---\nstatus: active\nrating: 4\n---\nBody\n";
      return "No frontmatter here.";
    });

    await rebuildLinkIndex("/workspace");

    expect(linkIndex.value.hasFrontmatterByPath?.has("/workspace/a.md")).toBe(true);
    expect(linkIndex.value.hasFrontmatterByPath?.has("/workspace/b.md")).toBe(false);
    const aProps = linkIndex.value.frontmatterPropertiesByPath?.get("/workspace/a.md");
    expect(aProps?.map((p) => p.key)).toEqual(["status", "rating"]);
    expect(linkIndex.value.frontmatterPropertiesByPath?.has("/workspace/b.md")).toBe(false);
  });

  it("caches frontmatter properties the same way it caches wikilinks (no re-read when mtime is unchanged)", async () => {
    findMarkdownFiles.mockResolvedValue([
      { name: "a.md", path: "/workspace/a.md", isDir: false, mtime: 1000, size: 20 },
    ]);
    rejectCacheLoad();
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) throw new Error("no cache file yet");
      return "---\nkey: value\n---\n";
    });

    await rebuildLinkIndex("/workspace");
    expect(linkIndex.value.frontmatterPropertiesByPath?.get("/workspace/a.md")).toHaveLength(1);
    readTextFile.mockClear();

    await rebuildLinkIndex("/workspace");
    expect(readTextFile).not.toHaveBeenCalledWith("/workspace/a.md");
    expect(linkIndex.value.frontmatterPropertiesByPath?.get("/workspace/a.md")).toHaveLength(1);
  });

  it("drops a persisted cache entry with a malformed frontmatterProperties field, forcing a real re-read", async () => {
    findMarkdownFiles.mockResolvedValue([
      { name: "a.md", path: "/workspace/a.md", isDir: false, mtime: 1000, size: 5 },
    ]);
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) {
        return JSON.stringify({
          version: 6,
          entries: {
            "/workspace/a.md": {
              mtime: 1000,
              size: 5,
              wikilinks: [],
              aliases: [],
              tags: [],
              tasks: [],
              hasFrontmatter: true,
              frontmatterProperties: [{ kind: "scalar", key: "x" }], // missing required fields
            },
          },
        });
      }
      return "---\nx: 1\n---\n";
    });

    await expect(rebuildLinkIndex("/workspace")).resolves.toBeUndefined();

    expect(readTextFile).toHaveBeenCalledWith("/workspace/a.md");
    expect(linkIndex.value.frontmatterPropertiesByPath?.get("/workspace/a.md")).toHaveLength(1);
  });
});
