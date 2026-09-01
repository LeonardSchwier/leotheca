import { signal } from "@preact/signals";
import {
  findMarkdownFiles as walkMarkdownFiles,
  readTextFile,
  writeWorkspaceTextFile,
} from "../workspace/tauriBridge";
import { mapWithConcurrency } from "../workspace/concurrency";
import type { FsEntry } from "../workspace/types";
import { extractAliases } from "./frontmatter";
import { extractTags } from "../tags/tags";

export interface LinkIndex {
  backlinksByPath: Map<string, string[]>;
  pathsByNoteName: Map<string, string[]>;
  /** Lowercased alias -> the path(s) of the note(s) declaring it, for
   * resolution (resolveWikilink) and backlink computation. Populated only
   * when workspaceSettings.frontmatterAliasesEnabled is on. */
  pathsByAlias: Map<string, string[]>;
  /** Note path -> its own aliases, original casing, for display (the
   * wikilink autocomplete in MarkdownEditor.tsx). Same on/off gating as
   * pathsByAlias. */
  aliasesByPath: Map<string, string[]>;
  /** Lowercased tag (see tags/tags.ts's extractTags) -> the notes carrying
   * it, for the Tags panel. Populated only when
   * workspaceSettings.tagsEnabled is on. */
  pathsByTag: Map<string, string[]>;
  /** Note path -> its own tags, for a note's own tag display. Same on/off
   * gating as pathsByTag. */
  tagsByPath: Map<string, string[]>;
}

const emptyLinkIndex = (): LinkIndex => ({
  backlinksByPath: new Map(),
  pathsByNoteName: new Map(),
  pathsByAlias: new Map(),
  aliasesByPath: new Map(),
  pathsByTag: new Map(),
  tagsByPath: new Map(),
});

export const linkIndex = signal<LinkIndex>(emptyLinkIndex());
// True while rebuildLinkIndex is walking the workspace, so the UI can show
// a subtle hint instead of looking stuck on a large vault (see the
// concurrency note on rebuildLinkIndex below for why that can take a while).
export const linkIndexBuilding = signal(false);
// Paths that failed to read during the most recent completed rebuild
// (audit follow-up F-012): a note can be temporarily unreadable (a lock,
// a permission change, a sync tool mid-write) without that aborting the
// whole rebuild or silently pretending the workspace is fully indexed.
// Set once a rebuild finishes, only by the request that's still current
// at that point (an older, superseded rebuild never overwrites it); an
// empty array after a successful rebuild means every note read cleanly.
export const linkIndexUnreadablePaths = signal<string[]>([]);

const WIKILINK_PATTERN = /\[\[([^\]]+)\]\]/g;

export function extractWikilinks(source: string): string[] {
  return Array.from(source.matchAll(WIKILINK_PATTERN), ([, target]) =>
    target.trim(),
  ).filter(Boolean);
}

function noteNameFromPath(path: string): string {
  return path.split("/").pop()?.replace(/\.md$/i, "") ?? path;
}

/** Delegates to a single native recursive walk (see tauriBridge.ts's
 * findMarkdownFiles) instead of recursing here via repeated `listDir`
 * calls, one per directory: that per-directory approach measured at ~83s
 * across ~514 calls on a real 580-note vault (see ROADMAP.md's "Directory
 * Walk Caching"), almost entirely IPC/bridge overhead rather than actual
 * disk time. The depth cap against a workspace symlink cycle now lives
 * natively too (commands.rs's MAX_WALK_DEPTH, FolderAccessPlugin.java's own
 * copy), not here. */
async function findMarkdownFiles(rootPath: string): Promise<FsEntry[]> {
  const files = await walkMarkdownFiles(rootPath);
  return files.slice().sort((a, b) => a.path.localeCompare(b.path));
}

// At most this many notes are read concurrently while rebuilding the link
// index, see mapWithConcurrency's doc comment for why.
const LINK_INDEX_READ_CONCURRENCY = 8;

interface CachedNote {
  mtime: number;
  /** Audit follow-up F-012: undefined when the walk that produced this
   * entry couldn't report a size (should not happen for a real file on
   * either platform's markdown walk today, but a decode of an old,
   * pre-size cache file entry from disk also lands here). Treated as a
   * hard requirement for a cache hit, not an optional bonus check, so a
   * missing size degrades to a real re-read rather than trusting mtime
   * alone. */
  size?: number;
  wikilinks: string[];
  aliases: string[];
  tags: string[];
}

// Bumped from 3 (audit follow-up F-012): cache identity now also requires
// `size` to match, not just `mtime`, since a coarse or colliding mtime
// (some filesystems and SAF providers report only second-level
// resolution) could otherwise let two different writes to the same note
// within the same tick look identical and hide the newer content behind
// a stale cache hit. An old-shaped cache file's entries have no `size`,
// so bumping the version forces a real re-read for all of them rather
// than treating an absent field as coincidentally already "matching."
const LINK_INDEX_CACHE_VERSION = 4;
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
// A workspace can change while a recursive walk is still in flight. Keep
// only the newest request authoritative so an older workspace can neither
// start unnecessary note reads nor replace the visible index when it ends.
let latestIndexRequest = 0;

function cacheFilePath(rootPath: string): string {
  return `${rootPath}/${LINK_INDEX_CACHE_FILENAME}`;
}

async function loadPersistedCacheIfNeeded(rootPath: string): Promise<void> {
  if (loadedCacheRoots.has(rootPath)) return;
  loadedCacheRoots.add(rootPath);
  try {
    const raw = await readTextFile(cacheFilePath(rootPath));
    const parsed = JSON.parse(raw) as {
      version: number;
      entries: Record<string, CachedNote>;
    };
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

async function savePersistedCache(
  rootPath: string,
  entries: Map<string, CachedNote>,
): Promise<void> {
  try {
    await writeWorkspaceTextFile(
      rootPath,
      LINK_INDEX_CACHE_FILENAME,
      JSON.stringify(
        {
          version: LINK_INDEX_CACHE_VERSION,
          entries: Object.fromEntries(entries),
        },
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

/** Drops all cached wikilink/mtime/size state, in memory and the "already
 * loaded this session" tracking, so the next rebuildLinkIndex call starts
 * from a clean slate. Registered with the workspace transition coordinator
 * (App.tsx's `workspaceTransitions.registerReset(resetLinkIndexCache)`, see
 * audit follow-up N-001/N-003) so switching workspaces never carries one
 * workspace's cached identities into another's; also used directly by
 * tests to isolate themselves from each other's cache state, since the
 * cache is deliberately module-level (persists across calls) in
 * production. */
export function resetLinkIndexCache(): void {
  wikilinkCache = new Map();
  loadedCacheRoots.clear();
  latestIndexRequest = 0;
  linkIndexUnreadablePaths.value = [];
}

/** `aliasesEnabled`/`tagsEnabled` each default to on, matching
 * WorkspaceSettings' own defaults (see settings/workspaceSettings.ts): the
 * caller (App.tsx) passes the live workspace settings explicitly so this
 * module doesn't need to import settings/store.ts itself, which would pull
 * in that module's top-level DOM/window side effects (it applies the theme
 * and font-size CSS variables at import time) into every environment this
 * module is used from, including this file's own tests, which
 * intentionally run in the plain "node" test environment, not jsdom. */
export async function rebuildLinkIndex(
  rootPath: string,
  aliasesEnabled = true,
  tagsEnabled = true,
): Promise<void> {
  const request = ++latestIndexRequest;
  const isCurrentRequest = () => request === latestIndexRequest;
  linkIndexBuilding.value = true;
  try {
    await loadPersistedCacheIfNeeded(rootPath);
    if (!isCurrentRequest()) return;

    const noteEntries = await findMarkdownFiles(rootPath);
    if (!isCurrentRequest()) return;
    const pathsByNoteName = new Map<string, string[]>();
    const backlinksByPath = new Map<string, string[]>();
    const pathsByAlias = new Map<string, string[]>();
    const aliasesByPath = new Map<string, string[]>();
    const pathsByTag = new Map<string, string[]>();
    const tagsByPath = new Map<string, string[]>();

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
    // Every note's own wikilinks, kept aside until every note's aliases
    // are known (populated below, this same pass) so backlinks can be
    // resolved in a second, purely in-memory pass afterward. Resolving a
    // wikilink against pathsByAlias inside this same concurrent pass would
    // race: the note the link targets by alias might not have been read
    // yet, since which note gets read first isn't ordered.
    const wikilinksByPath = new Map<string, string[]>();
    // Audit follow-up F-012: notes that failed to read during this pass,
    // so one unreadable file (a transient lock, a permission change, a
    // sync tool mid-write) never aborts indexing the rest of the
    // workspace. Reported via linkIndexUnreadablePaths once this request
    // finishes, so the UI can show a visible incomplete/error state
    // instead of silently pretending the index is fully current.
    const unreadablePaths: string[] = [];

    await mapWithConcurrency(
      noteEntries,
      LINK_INDEX_READ_CONCURRENCY,
      async (entry) => {
        if (!isCurrentRequest()) return;
        const cached = wikilinkCache.get(entry.path);
        let wikilinks: string[];
        let aliases: string[];
        let tags: string[];
        if (
          cached &&
          entry.mtime !== undefined &&
          cached.mtime === entry.mtime &&
          entry.size !== undefined &&
          cached.size === entry.size
        ) {
          wikilinks = cached.wikilinks;
          aliases = cached.aliases;
          tags = cached.tags;
        } else {
          let source: string;
          try {
            source = await readTextFile(entry.path);
          } catch {
            if (!isCurrentRequest()) return;
            unreadablePaths.push(entry.path);
            // A previous successful read is better than nothing: keep
            // contributing its last-known wikilinks/aliases/tags to this
            // pass's index, and carry its old cache entry forward
            // unchanged (not this entry's own, possibly-different,
            // mtime/size) so a note that becomes readable again later
            // with the exact same content is still recognized as
            // unchanged rather than forced through a needless re-read.
            // With no prior cache entry at all, this note simply
            // contributes nothing this pass and is left out of
            // freshCache, so the next rebuild retries reading it fresh
            // rather than caching a real gap.
            if (cached) freshCache.set(entry.path, cached);
            wikilinksByPath.set(entry.path, cached?.wikilinks ?? []);
            if (aliasesEnabled && cached?.aliases.length) {
              aliasesByPath.set(entry.path, cached.aliases);
              for (const alias of cached.aliases) {
                const key = alias.toLocaleLowerCase();
                const paths = pathsByAlias.get(key) ?? [];
                paths.push(entry.path);
                pathsByAlias.set(key, paths);
              }
            }
            if (tagsEnabled && cached?.tags.length) {
              tagsByPath.set(entry.path, cached.tags);
              for (const tag of cached.tags) {
                const paths = pathsByTag.get(tag) ?? [];
                paths.push(entry.path);
                pathsByTag.set(tag, paths);
              }
            }
            return;
          }
          if (!isCurrentRequest()) return;
          wikilinks = extractWikilinks(source);
          aliases = extractAliases(source);
          tags = extractTags(source);
        }
        if (entry.mtime !== undefined && entry.size !== undefined) {
          freshCache.set(entry.path, {
            mtime: entry.mtime,
            size: entry.size,
            wikilinks,
            aliases,
            tags,
          });
        }
        wikilinksByPath.set(entry.path, wikilinks);

        if (aliasesEnabled && aliases.length > 0) {
          aliasesByPath.set(entry.path, aliases);
          for (const alias of aliases) {
            const key = alias.toLocaleLowerCase();
            const paths = pathsByAlias.get(key) ?? [];
            paths.push(entry.path);
            pathsByAlias.set(key, paths);
          }
        }

        if (tagsEnabled && tags.length > 0) {
          tagsByPath.set(entry.path, tags);
          for (const tag of tags) {
            const paths = pathsByTag.get(tag) ?? [];
            paths.push(entry.path);
            pathsByTag.set(tag, paths);
          }
        }
      },
    );

    if (!isCurrentRequest()) return;

    for (const [path, wikilinks] of wikilinksByPath) {
      for (const targetName of wikilinks) {
        const key = targetName.toLocaleLowerCase();
        const targetPaths =
          pathsByNoteName.get(key) ?? pathsByAlias.get(key) ?? [];
        for (const targetPath of targetPaths) {
          const backlinks = backlinksByPath.get(targetPath);
          if (backlinks && !backlinks.includes(path)) backlinks.push(path);
        }
      }
    }

    wikilinkCache = freshCache;
    linkIndex.value = {
      backlinksByPath,
      pathsByNoteName,
      pathsByAlias,
      aliasesByPath,
      pathsByTag,
      tagsByPath,
    };
    linkIndexUnreadablePaths.value = unreadablePaths;
    await savePersistedCache(rootPath, freshCache);
  } finally {
    if (isCurrentRequest()) linkIndexBuilding.value = false;
  }
}

export function resolveWikilink(target: string): string | null {
  const key = target.trim().toLocaleLowerCase();
  return (
    linkIndex.value.pathsByNoteName.get(key)?.[0] ??
    linkIndex.value.pathsByAlias.get(key)?.[0] ??
    null
  );
}

export function fileNameFromPath(path: string): string {
  return path.split("/").pop() ?? path;
}
