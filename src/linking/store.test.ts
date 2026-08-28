import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  extractWikilinks,
  linkIndex,
  linkIndexBuilding,
  rebuildLinkIndex,
  resetLinkIndexCache,
  resolveWikilink,
} from "./store";

const { listDir, readTextFile, writeTextFile } = vi.hoisted(() => ({
  listDir: vi.fn(),
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
}));

vi.mock("../workspace/tauriBridge", () => ({ listDir, readTextFile, writeTextFile }));

const CACHE_PATH = "/workspace/.leotheca/link-index-cache.json";

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
    writeTextFile.mockResolvedValue(undefined);
    linkIndex.value = {
      backlinksByPath: new Map(),
      pathsByNoteName: new Map(),
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
      pathsByTag: new Map(),
      tagsByPath: new Map(),
    };
    resetLinkIndexCache();
  });

  it("extracts trimmed wikilink targets", () => {
    expect(extractWikilinks("See [[Note Name]] and [[ another note ]].")).toEqual(["Note Name", "another note"]);
  });

  it("indexes case-insensitive links and backlinks", async () => {
    listDir.mockImplementation(async (path: string) => {
      if (path === "/workspace") {
        return [
          { name: "Notes", path: "/workspace/Notes", isDir: true },
          { name: "Alpha.md", path: "/workspace/Alpha.md", isDir: false },
        ];
      }
      return [{ name: "Beta.MD", path: "/workspace/Notes/Beta.MD", isDir: false }];
    });
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) throw new Error("no cache file yet");
      return path.endsWith("Alpha.md") ? "[[beta]] [[Missing]] [[Beta]]" : "[[ALPHA]]";
    });

    await rebuildLinkIndex("/workspace");

    expect(resolveWikilink("BeTa")).toBe("/workspace/Notes/Beta.MD");
    expect(linkIndex.value.backlinksByPath.get("/workspace/Notes/Beta.MD")).toEqual(["/workspace/Alpha.md"]);
    expect(linkIndex.value.backlinksByPath.get("/workspace/Alpha.md")).toEqual(["/workspace/Notes/Beta.MD"]);
  });

  it("sets linkIndexBuilding while rebuilding and clears it once done", async () => {
    listDir.mockResolvedValueOnce([{ name: "Alpha.md", path: "/workspace/Alpha.md", isDir: false }]);
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

  it("clears linkIndexBuilding even if a read fails, and never has more than the concurrency cap in flight", async () => {
    const paths = Array.from({ length: 20 }, (_, i) => `/workspace/note-${i}.md`);
    listDir.mockResolvedValueOnce(paths.map((path, i) => ({ name: `note-${i}.md`, path, isDir: false })));

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

    await expect(rebuildLinkIndex("/workspace")).rejects.toThrow("simulated read failure");

    expect(linkIndexBuilding.value).toBe(false);
    // The concurrency cap in rebuildLinkIndex is 8; asserting a looser bound
    // here so this test isn't coupled to that exact constant, just that it
    // isn't dispatching all 20 reads at once like Promise.all(...) would.
    expect(maxInFlight).toBeLessThanOrEqual(8);
    expect(maxInFlight).toBeGreaterThan(1);
  });
});

describe("rebuildLinkIndex: mtime-based caching", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    writeTextFile.mockResolvedValue(undefined);
    linkIndex.value = {
      backlinksByPath: new Map(),
      pathsByNoteName: new Map(),
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
      pathsByTag: new Map(),
      tagsByPath: new Map(),
    };
    resetLinkIndexCache();
  });

  it("does not re-read a note's content on a second call when its mtime hasn't changed", async () => {
    listDir.mockImplementation(async (path: string) =>
      path === "/workspace"
        ? [{ name: "a.md", path: "/workspace/a.md", isDir: false, mtime: 1000 }]
        : [],
    );
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
    expect(linkIndex.value.backlinksByPath.get("/workspace/a.md")).toBeDefined();
  });

  it("does re-read a note's content when its mtime has changed since the last call", async () => {
    let mtime = 1000;
    listDir.mockImplementation(async (path: string) =>
      path === "/workspace"
        ? [{ name: "a.md", path: "/workspace/a.md", isDir: false, mtime }]
        : [],
    );
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
    listDir.mockImplementation(async (path: string) =>
      path === "/workspace" ? [{ name: "a.md", path: "/workspace/a.md", isDir: false }] : [],
    );
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) throw new Error("no cache file yet");
      return "content";
    });

    await rebuildLinkIndex("/workspace");
    readTextFile.mockClear();

    await rebuildLinkIndex("/workspace");
    expect(readTextFile).toHaveBeenCalledWith("/workspace/a.md");
  });

  it("loads a persisted cache file and uses it to skip a read on the very first call in a session", async () => {
    listDir.mockImplementation(async (path: string) =>
      path === "/workspace"
        ? [{ name: "a.md", path: "/workspace/a.md", isDir: false, mtime: 1000 }]
        : [],
    );
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) {
        return JSON.stringify({
          version: 3,
          entries: { "/workspace/a.md": { mtime: 1000, wikilinks: ["b"], aliases: [], tags: [] } },
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
    listDir.mockImplementation(async (path: string) =>
      path === "/workspace"
        ? [{ name: "a.md", path: "/workspace/a.md", isDir: false, mtime: 1000 }]
        : [],
    );
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

  it("saves the rebuilt cache to disk after a successful call", async () => {
    listDir.mockImplementation(async (path: string) =>
      path === "/workspace"
        ? [{ name: "a.md", path: "/workspace/a.md", isDir: false, mtime: 1000 }]
        : [],
    );
    rejectCacheLoad();
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) throw new Error("no cache file yet");
      return "[[b]]";
    });

    await rebuildLinkIndex("/workspace");

    expect(writeTextFile).toHaveBeenCalledTimes(1);
    const [savedPath, savedContent] = writeTextFile.mock.calls[0];
    expect(savedPath).toBe(CACHE_PATH);
    const saved = JSON.parse(savedContent);
    expect(saved.version).toBe(3);
    expect(saved.entries["/workspace/a.md"]).toEqual({
      mtime: 1000,
      wikilinks: ["b"],
      aliases: [],
      tags: [],
    });
  });

  it("prunes a note that no longer exists out of the cache on the next call", async () => {
    let entries: { name: string; path: string; isDir: boolean; mtime: number }[] = [
      { name: "a.md", path: "/workspace/a.md", isDir: false, mtime: 1000 },
      { name: "b.md", path: "/workspace/b.md", isDir: false, mtime: 1000 },
    ];
    listDir.mockImplementation(async (path: string) => (path === "/workspace" ? entries : []));
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) throw new Error("no cache file yet");
      return "";
    });

    await rebuildLinkIndex("/workspace");
    entries = entries.filter((e) => e.name !== "b.md"); // b.md deleted

    await rebuildLinkIndex("/workspace");

    const lastSave = writeTextFile.mock.calls.at(-1)!;
    const saved = JSON.parse(lastSave[1]);
    expect(Object.keys(saved.entries)).toEqual(["/workspace/a.md"]);
  });

  it("a failure to save the cache does not fail the whole rebuild", async () => {
    listDir.mockImplementation(async (path: string) =>
      path === "/workspace"
        ? [{ name: "a.md", path: "/workspace/a.md", isDir: false, mtime: 1000 }]
        : [],
    );
    rejectCacheLoad();
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) throw new Error("no cache file yet");
      return "[[b]]";
    });
    writeTextFile.mockRejectedValue(new Error("read-only filesystem"));

    await expect(rebuildLinkIndex("/workspace")).resolves.toBeUndefined();
    expect(linkIndex.value.backlinksByPath.size).toBeGreaterThan(0);
  });
});

describe("rebuildLinkIndex: aliases", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    writeTextFile.mockResolvedValue(undefined);
    linkIndex.value = {
      backlinksByPath: new Map(),
      pathsByNoteName: new Map(),
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
      pathsByTag: new Map(),
      tagsByPath: new Map(),
    };
    resetLinkIndexCache();
  });

  function setupTwoNotes(betaFrontmatter: string, alphaBody: string) {
    listDir.mockImplementation(async (path: string) =>
      path === "/workspace"
        ? [
            { name: "Alpha.md", path: "/workspace/Alpha.md", isDir: false },
            { name: "Beta.md", path: "/workspace/Beta.md", isDir: false },
          ]
        : [],
    );
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) throw new Error("no cache file yet");
      if (path.endsWith("Beta.md")) return betaFrontmatter;
      return alphaBody;
    });
  }

  it("resolves a wikilink by another note's alias, not just its file name", async () => {
    setupTwoNotes("---\naliases: [B, Second Letter]\n---\n", "[[Second Letter]]");

    await rebuildLinkIndex("/workspace");

    expect(resolveWikilink("second letter")).toBe("/workspace/Beta.md");
  });

  it("attributes a backlink to the note an alias resolves to (the two-pass fix)", async () => {
    // Beta declares the alias "B" but is read concurrently with Alpha, so
    // whichever finishes first can't yet know the other's aliases; this is
    // exactly the race the second, in-memory-only pass exists to avoid.
    setupTwoNotes("---\naliases: [B]\n---\n", "[[B]]");

    await rebuildLinkIndex("/workspace");

    expect(linkIndex.value.backlinksByPath.get("/workspace/Beta.md")).toEqual(["/workspace/Alpha.md"]);
  });

  it("populates aliasesByPath with the alias's original casing, for display", async () => {
    setupTwoNotes("---\naliases: [Second Letter]\n---\n", "no links here");

    await rebuildLinkIndex("/workspace");

    expect(linkIndex.value.aliasesByPath.get("/workspace/Beta.md")).toEqual(["Second Letter"]);
  });

  it("prefers a real note name over a same-text alias declared by another note", async () => {
    listDir.mockImplementation(async (path: string) =>
      path === "/workspace"
        ? [
            { name: "Alpha.md", path: "/workspace/Alpha.md", isDir: false },
            { name: "Beta.md", path: "/workspace/Beta.md", isDir: false },
          ]
        : [],
    );
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
    expect(linkIndex.value.backlinksByPath.get("/workspace/Beta.md")).toEqual([]);
    // Name-based resolution is unaffected by the setting.
    expect(resolveWikilink("Beta")).toBe("/workspace/Beta.md");
  });

  it("caches aliases the same way it caches wikilinks (no re-read when mtime is unchanged)", async () => {
    listDir.mockImplementation(async (path: string) =>
      path === "/workspace"
        ? [{ name: "a.md", path: "/workspace/a.md", isDir: false, mtime: 1000 }]
        : [],
    );
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) throw new Error("no cache file yet");
      return "---\naliases: [Foo]\n---\n";
    });

    await rebuildLinkIndex("/workspace");
    expect(linkIndex.value.aliasesByPath.get("/workspace/a.md")).toEqual(["Foo"]);
    readTextFile.mockClear();

    await rebuildLinkIndex("/workspace");
    expect(readTextFile).not.toHaveBeenCalledWith("/workspace/a.md");
    expect(linkIndex.value.aliasesByPath.get("/workspace/a.md")).toEqual(["Foo"]);
  });
});

describe("rebuildLinkIndex: tags", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    writeTextFile.mockResolvedValue(undefined);
    linkIndex.value = {
      backlinksByPath: new Map(),
      pathsByNoteName: new Map(),
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
      pathsByTag: new Map(),
      tagsByPath: new Map(),
    };
    resetLinkIndexCache();
  });

  function setupTwoNotes(alphaBody: string, betaBody: string) {
    listDir.mockImplementation(async (path: string) =>
      path === "/workspace"
        ? [
            { name: "Alpha.md", path: "/workspace/Alpha.md", isDir: false },
            { name: "Beta.md", path: "/workspace/Beta.md", isDir: false },
          ]
        : [],
    );
    readTextFile.mockImplementation(async (path: string) => {
      if (path === CACHE_PATH) throw new Error("no cache file yet");
      if (path.endsWith("Alpha.md")) return alphaBody;
      return betaBody;
    });
  }

  it("combines inline #tags and the frontmatter tags field into tagsByPath", async () => {
    setupTwoNotes("---\ntags: [work]\n---\n\nAlso #journal today.", "no tags here");

    await rebuildLinkIndex("/workspace");

    expect(linkIndex.value.tagsByPath.get("/workspace/Alpha.md")).toEqual(["work", "journal"]);
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
    listDir.mockImplementation(async (path: string) =>
      path === "/workspace"
        ? [{ name: "a.md", path: "/workspace/a.md", isDir: false, mtime: 1000 }]
        : [],
    );
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
