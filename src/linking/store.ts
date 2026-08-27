import { signal } from "@preact/signals";
import { listDir, readTextFile, writeTextFile } from "../workspace/tauriBridge";
import { mapWithConcurrency } from "../workspace/concurrency";
import type { FsEntry } from "../workspace/types";

export interface LinkIndex {
  backlinksByPath: Map<string, string[]>;
  pathsByNoteName: Map<string, string[]>;
}

const emptyLinkIndex = (): LinkIndex => ({
  backlinksByPath: new Map(),
  pathsByNoteName: new Map(),
});

export const linkIndex = signal<LinkIndex>(emptyLinkIndex());
// True while rebuildLinkIndex is walking the workspace, so the UI can show
// a subtle hint instead of looking stuck on a large vault (see the
// concurrency note on rebuildLinkIndex below for why that can take a while).
export const linkIndexBuilding = signal(false);

const WIKILINK_PATTERN = /\[\[([^\]]+)\]\]/g;

export function extractWikilinks(source: string): string[] {
  return Array.from(source.matchAll(WIKILINK_PATTERN), ([, target]) =>
    target.trim(),
  ).filter(Boolean);
}

function noteNameFromPath(path: string): string {
  return path.split("/").pop()?.replace(/\.md$/i, "") ?? path;
}

async function findMarkdownFiles(rootPath: string): Promise<FsEntry[]> {
  const files: FsEntry[] = [];

  async function walk(path: string) {
    const entries = await listDir(path);
    for (const entry of entries) {
      if (entry.isDir) await walk(entry.path);
      else if (entry.name.toLowerCase().endsWith(".md")) files.push(entry);
    }
  }

  await walk(rootPath);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

// At most this many notes are read concurrently while rebuilding the link
// index, see mapWithConcurrency's doc comment for why.
const LINK_INDEX_READ_CONCURRENCY = 8;

interface CachedNote {
  mtime: number;
  wikilinks: string[];
}

const LINK_INDEX_CACHE_VERSION = 1;
const LINK_INDEX_CACHE_FILENAME = ".leotheca/link-index-cache.json";

/** path -> the wikilinks extracted from that note the last time it was
 * actually read, plus the mtime it had then. A note is only re-read when
 * its current mtime doesn't match what's here, so every rebuild after the
 * first only pays the read cost for notes that actually changed (or that
 * have no mtime available at all, which always re-reads — degrading to
 * the old always-read behavior rather than risking a wrong cache hit).
 * Module-level so it survives across every rebuildLinkIndex call within
 * one running session (every graph-view-open, not just the first); see
 * loadPersistedCacheIfNeeded/savePersistedCache below for the parallel
 * on-disk copy that extends this across app restarts too. */
let wikilinkCache = new Map<string, CachedNote>();
// Which workspace roots have already had their persisted cache file
// loaded into wikilinkCache this session, so a given root's file is only
// ever read once per session, not once per rebuildLinkIndex call.
const loadedCacheRoots = new Set<string>();

function cacheFilePath(rootPath: string): string {
  return `${rootPath}/${LINK_INDEX_CACHE_FILENAME}`;
}

async function loadPersistedCacheIfNeeded(rootPath: string): Promise<void> {
  if (loadedCacheRoots.has(rootPath)) return;
  loadedCacheRoots.add(rootPath);
  try {
    const raw = await readTextFile(cacheFilePath(rootPath));
    const parsed = JSON.parse(raw) as { version: number; entries: Record<string, CachedNote> };
    if (parsed.version === LINK_INDEX_CACHE_VERSION) {
      for (const [path, cached] of Object.entries(parsed.entries)) {
        wikilinkCache.set(path, cached);
      }
    }
  } catch {
    // No cache file yet (first time this workspace has been opened), or
    // it's unreadable/corrupt — either way, start fresh rather than
    // failing the whole index build over a cache that's purely an
    // optimization, never the source of truth.
  }
}

async function savePersistedCache(rootPath: string, entries: Map<string, CachedNote>): Promise<void> {
  try {
    await writeTextFile(
      cacheFilePath(rootPath),
      JSON.stringify(
        { version: LINK_INDEX_CACHE_VERSION, entries: Object.fromEntries(entries) },
        null,
        2,
      ),
    );
  } catch {
    // Saving the cache is an optimization for next time, not something
    // that should surface as a user-facing error if e.g. the workspace
    // turns out to be on read-only storage.
  }
}

/** Drops all cached wikilink/mtime state, in memory and the "already
 * loaded this session" tracking, so the next rebuildLinkIndex call starts
 * from a clean slate. Not wired to any UI today; exists mainly so tests
 * can isolate themselves from each other's cache state, since the cache
 * is deliberately module-level (persists across calls) in production. */
export function resetLinkIndexCache(): void {
  wikilinkCache = new Map();
  loadedCacheRoots.clear();
}

export async function rebuildLinkIndex(rootPath: string): Promise<void> {
  linkIndexBuilding.value = true;
  try {
    await loadPersistedCacheIfNeeded(rootPath);

    const noteEntries = await findMarkdownFiles(rootPath);
    const pathsByNoteName = new Map<string, string[]>();
    const backlinksByPath = new Map<string, string[]>();

    for (const entry of noteEntries) {
      const key = noteNameFromPath(entry.path).toLocaleLowerCase();
      const paths = pathsByNoteName.get(key) ?? [];
      paths.push(entry.path);
      pathsByNoteName.set(key, paths);
      backlinksByPath.set(entry.path, []);
    }

    // Rebuilt from scratch on every call (rather than mutating
    // wikilinkCache in place) so a note that's been renamed or deleted
    // since the last call doesn't linger in the cache forever.
    const freshCache = new Map<string, CachedNote>();

    await mapWithConcurrency(noteEntries, LINK_INDEX_READ_CONCURRENCY, async (entry) => {
      const cached = wikilinkCache.get(entry.path);
      let wikilinks: string[];
      if (cached && entry.mtime !== undefined && cached.mtime === entry.mtime) {
        wikilinks = cached.wikilinks;
      } else {
        const source = await readTextFile(entry.path);
        wikilinks = extractWikilinks(source);
      }
      if (entry.mtime !== undefined) {
        freshCache.set(entry.path, { mtime: entry.mtime, wikilinks });
      }

      for (const targetName of wikilinks) {
        const targetPaths =
          pathsByNoteName.get(targetName.toLocaleLowerCase()) ?? [];
        for (const targetPath of targetPaths) {
          const backlinks = backlinksByPath.get(targetPath);
          if (backlinks && !backlinks.includes(entry.path))
            backlinks.push(entry.path);
        }
      }
    });

    wikilinkCache = freshCache;
    linkIndex.value = { backlinksByPath, pathsByNoteName };
    await savePersistedCache(rootPath, freshCache);
  } finally {
    linkIndexBuilding.value = false;
  }
}

export function resolveWikilink(target: string): string | null {
  return (
    linkIndex.value.pathsByNoteName.get(
      target.trim().toLocaleLowerCase(),
    )?.[0] ?? null
  );
}

export function fileNameFromPath(path: string): string {
  return path.split("/").pop() ?? path;
}
