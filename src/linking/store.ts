import { signal } from "@preact/signals";
import {
  findMarkdownFiles as walkMarkdownFiles,
  isNativePlatform,
  readTextFile,
  writeWorkspaceTextFile,
} from "../workspace/tauriBridge";
import { mapWithConcurrency } from "../workspace/concurrency";
import type { FsEntry } from "../workspace/types";
import { extractAliases } from "./frontmatter";
import { extractTags } from "../tags/tags";
import { scanTasks, type TaskRecord } from "../markdown/tasks";
import {
  hasFrontmatterBlock,
  parseFrontmatterProperties,
  type FrontmatterProperty,
} from "../editor/frontmatterEdits";
import { parseWikiLinks, type WikiLinkRecord } from "./wikiSyntax";
import { scanHeadings, type HeadingRecord } from "../markdown/headings";
import { scanBlockIds, type BlockRecord } from "../markdown/blocks";

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
  /** Note path -> the GFM task-list items found in it (see
   * markdown/tasks.ts's scanTasks), for the Task Hub panel (F02 Phase 1,
   * spec/f02-workspace-task-hub.md). Unlike pathsByTag/tagsByPath, this
   * has no workspace-settings on/off gate: F02 is a standalone spec-driven
   * feature, not net-new functionality queued from the daily competitor
   * scan, so CONSTITUTION.md's opt-out-toggle requirement for that queue
   * doesn't apply here. Only paths with at least one task are present,
   * same sparse-map convention as pathsByTag. */
  tasksByPath: Map<string, TaskRecord[]>;
  /** Note path -> its filesystem modification time (milliseconds since the
   * epoch, see workspace/types.ts's FsEntry), for F09's "Modified" system
   * query field (spec/f09-smart-collections-property-views.md section
   * 6.2). Populated from the same findMarkdownFiles walk every other field
   * here already uses, not a second listing call. Absent for a path whose
   * entry had no mtime available (see FsEntry's own doc comment on when
   * that happens), so a collection's "Modified" clauses simply don't match
   * that note rather than treating a missing value as any particular date.
   * Optional on the interface (rather than always present in every object
   * literal) so the many existing LinkIndex test fixtures across the
   * codebase that predate F09 don't all need updating for a field they
   * don't exercise. */
  mtimeByPath?: Map<string, number>;
  /** Note path -> whether it has a YAML frontmatter delimiter block at all
   * (see editor/frontmatterEdits.ts's hasFrontmatterBlock), for F09's "Has
   * frontmatter" system field. A path absent from this map has no block.
   * Same optionality rationale as mtimeByPath above. */
  hasFrontmatterByPath?: Set<string>;
  /** Note path -> its own top-level frontmatter fields, parsed by the same
   * lossless parser the Properties panel and F09's inline editing (a later
   * phase) both use (editor/frontmatterEdits.ts's parseFrontmatterProperties),
   * for F09's property query fields and type inference
   * (collections/collectionTypesInference.ts). A path with no frontmatter
   * block, or one with no top-level fields, is simply absent from this map
   * rather than mapped to an empty array. Same optionality rationale as
   * mtimeByPath above. */
  frontmatterPropertiesByPath?: Map<string, FrontmatterProperty[]>;
  /** Note path -> the structured wikilink records found in it (F04
   * Phase 1's `parseWikiLinks`, `linking/wikiSyntax.ts`), for F03 Phase
   * 1's workspace-wide diagnostics (`diagnostics/diagnostics.ts`).
   * Populated from the same note read already used for
   * wikilinks/aliases/tags/tasks above, not a second workspace walk; see
   * that doc comment for why this and `headingsByPath` exist as a
   * dedicated pair rather than being derived from the plain-string
   * `wikilinks` field, which throws away fragments and source ranges a
   * diagnostic needs. Optional on the type (unlike the maps above) so
   * every pre-existing test fixture across the codebase that builds a
   * `LinkIndex` literal without these two fields still type-checks;
   * every real `rebuildLinkIndex` call always populates both. Only
   * notes with at least one wikilink are present, same sparse-map
   * convention as `tasksByPath`. */
  wikiLinksByPath?: Map<string, WikiLinkRecord[]>;
  /** Note path -> that note's own scanned headings (`markdown/headings.ts`'s
   * `scanHeadings`), kept for the same reason and from the same read as
   * `wikiLinksByPath`: F03 diagnostics needs every note's headings, not
   * just the currently-open note's (which is all `MarkdownPreview.tsx`
   * itself scans), to verify a *cross-note* `[[Note#Heading]]` fragment
   * without a second file read per link. Only notes with at least one
   * heading are present, same sparse-map convention as `tasksByPath`. */
  headingsByPath?: Map<string, HeadingRecord[]>;
  /** Note path -> that note's own scanned block IDs (`markdown/blocks.ts`'s
   * `scanBlockIds`), the exact same-shaped sparse map as `headingsByPath`
   * above and for the same reason (F04 Phase 5c): verifying a *cross-note*
   * `[[Note#^block-id]]` fragment without a second file read per link.
   * Only notes with at least one block ID are present, same sparse-map
   * convention as `headingsByPath`/`tasksByPath`. */
  blocksByPath?: Map<string, BlockRecord[]>;
}

const emptyLinkIndex = (): LinkIndex => ({
  backlinksByPath: new Map(),
  pathsByNoteName: new Map(),
  pathsByAlias: new Map(),
  aliasesByPath: new Map(),
  pathsByTag: new Map(),
  tagsByPath: new Map(),
  tasksByPath: new Map(),
  mtimeByPath: new Map(),
  hasFrontmatterByPath: new Set(),
  frontmatterPropertiesByPath: new Map(),
  wikiLinksByPath: new Map(),
  headingsByPath: new Map(),
  blocksByPath: new Map(),
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
// index, see mapWithConcurrency's doc comment for why. 8 was originally
// chosen for Android SAF compatibility (a SAF content provider can choke
// on a much larger burst of concurrent document reads) and applied
// uniformly to every platform. On Tauri desktop, IPC round trips to the
// Rust backend are far cheaper than SAF document-provider calls, so the
// same cap was leaving real cold-start rebuild time on the table there;
// bumped desktop's own cap to 24 (within the 16-32 range this gap
// originally suggested, chosen as a middle value rather than the extreme
// end since a markdown vault's individual file reads are already small
// and the concurrency win has diminishing returns past this). Android
// keeps its original 8.
const DESKTOP_LINK_INDEX_READ_CONCURRENCY = 24;
const ANDROID_LINK_INDEX_READ_CONCURRENCY = 8;

function linkIndexReadConcurrency(): number {
  return isNativePlatform()
    ? ANDROID_LINK_INDEX_READ_CONCURRENCY
    : DESKTOP_LINK_INDEX_READ_CONCURRENCY;
}

/** Audit follow-ups F-008/F-012 both flagged this as left open: the
 * persisted cache file is parsed with a raw type assertion, no runtime
 * decoder. This is a genuine crash risk, not just a hygiene gap: a
 * cache-hit path below (`cached.aliases.length`, `for...of cached.tags`,
 * etc.) assumes every field is exactly the shape `CachedNote` declares,
 * and a malformed entry (hand-edited file, a partial write, a future
 * format change) throwing there propagates out of `mapWithConcurrency`'s
 * `Promise.all` and aborts the *entire* rebuild, not just the one bad
 * entry, the same class of "one bad note takes down the whole index"
 * bug F-012 already fixed for read failures. Isolating one malformed
 * entry (drop it, force a real re-read for that note) costs nothing:
 * this cache is a pure, fully-derivable optimization, never the source
 * of truth, so silently discarding a bad entry is always safe. */
/** F02 Phase 1: `tasks` is the newest CachedNote field, gaining the same
 * defensive validation the F-008/F-012 decoder already applies to the
 * older fields rather than trusting it wholesale just because it's new;
 * a malformed `TaskRecord` (wrong field type, a marker character outside
 * " "/"x"/"X") drops the whole entry the same way a malformed `tags`
 * array would, forcing a real re-read instead of feeding a bad shape
 * into the Task Hub panel. */
function isValidTaskRecord(raw: unknown): raw is TaskRecord {
  if (typeof raw !== "object" || raw === null) return false;
  const record = raw as Record<string, unknown>;
  const isFiniteNumber = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v);
  return (
    typeof record.checked === "boolean" &&
    (record.marker === " " || record.marker === "x" || record.marker === "X") &&
    typeof record.text === "string" &&
    typeof record.displayText === "string" &&
    isFiniteNumber(record.indentationColumns) &&
    isFiniteNumber(record.nestingDepth) &&
    isFiniteNumber(record.line) &&
    isFiniteNumber(record.column) &&
    isFiniteNumber(record.sourceFrom) &&
    isFiniteNumber(record.sourceTo) &&
    isFiniteNumber(record.markerFrom) &&
    isFiniteNumber(record.markerTo) &&
    isFiniteNumber(record.textFrom) &&
    isFiniteNumber(record.textTo)
  );
}

/** F09 Phase 1: `hasFrontmatter`/`frontmatterProperties` are the newest
 * CachedNote fields, gaining the same defensive validation as every field
 * before them rather than trusting a persisted cache entry's shape just
 * because it's new. A malformed `FrontmatterProperty` (wrong `kind`, a
 * missing range) drops the whole cache entry, forcing a real re-read,
 * same as an invalid TaskRecord already does above. */
function isValidSourceRange(raw: unknown): raw is { start: number; end: number } {
  if (typeof raw !== "object" || raw === null) return false;
  const range = raw as Record<string, unknown>;
  return (
    typeof range.start === "number" &&
    Number.isFinite(range.start) &&
    typeof range.end === "number" &&
    Number.isFinite(range.end)
  );
}

function isValidFrontmatterProperty(raw: unknown): raw is FrontmatterProperty {
  if (typeof raw !== "object" || raw === null) return false;
  const record = raw as Record<string, unknown>;
  if (typeof record.key !== "string") return false;
  const isStringArray = (v: unknown): v is string[] =>
    Array.isArray(v) && v.every((item) => typeof item === "string");
  if (record.kind === "readonly") {
    return (
      record.editable === false &&
      typeof record.value === "string" &&
      isValidSourceRange(record.removeRange)
    );
  }
  if (record.kind === "scalar") {
    return (
      record.editable === true &&
      typeof record.value === "string" &&
      (record.style === "plain" || record.style === "single" || record.style === "double") &&
      isValidSourceRange(record.replaceRange) &&
      isValidSourceRange(record.removeRange)
    );
  }
  if (record.kind === "list") {
    return (
      record.editable === true &&
      isStringArray(record.value) &&
      isValidSourceRange(record.replaceRange) &&
      isValidSourceRange(record.removeRange)
    );
  }
  return false;
}

/** F03 Phase 1: `wikiLinks` is a structured `WikiLinkRecord` (see
 * wikiSyntax.ts), not a plain string, so its validator has to check every
 * field individually the same way isValidTaskRecord does, rather than a
 * one-line array-of-strings check. A malformed entry drops the whole
 * cached note (same policy as a malformed task above), forcing a real
 * re-read/re-parse instead of feeding a bad shape into diagnostics. */
function isValidWikiLinkRecord(raw: unknown): raw is WikiLinkRecord {
  if (typeof raw !== "object" || raw === null) return false;
  const record = raw as Record<string, unknown>;
  const isFiniteNumber = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v);
  const isOptionalFiniteNumber = (v: unknown): boolean =>
    v === undefined || isFiniteNumber(v);
  const isOptionalString = (v: unknown): boolean =>
    v === undefined || typeof v === "string";
  let fragmentValid = record.fragment === undefined;
  if (!fragmentValid && typeof record.fragment === "object" && record.fragment !== null) {
    const fragment = record.fragment as Record<string, unknown>;
    fragmentValid =
      (fragment.kind === "heading" || fragment.kind === "block") &&
      typeof fragment.value === "string";
  }
  return (
    (record.kind === "link" || record.kind === "embed") &&
    typeof record.raw === "string" &&
    typeof record.noteTarget === "string" &&
    fragmentValid &&
    isOptionalString(record.label) &&
    isFiniteNumber(record.sourceFrom) &&
    isFiniteNumber(record.sourceTo) &&
    isFiniteNumber(record.targetFrom) &&
    isFiniteNumber(record.targetTo) &&
    isOptionalFiniteNumber(record.fragmentFrom) &&
    isOptionalFiniteNumber(record.fragmentTo) &&
    isOptionalFiniteNumber(record.labelFrom) &&
    isOptionalFiniteNumber(record.labelTo) &&
    (record.parseStatus === "valid" ||
      record.parseStatus === "malformed" ||
      record.parseStatus === "legacy-fallback") &&
    typeof record.legacyRaw === "string"
  );
}

/** Same rationale as isValidWikiLinkRecord above, for the other new F03
 * Phase 1 cached field: a `HeadingRecord` (markdown/headings.ts) has enough
 * numeric/array fields that a malformed one is a real, not just
 * theoretical, decode risk (a hand-edited cache file, a future format
 * change). `childIndexes` is checked element-by-element rather than just
 * `Array.isArray` since a garbage array of non-numbers would otherwise
 * pass through into hierarchy computation downstream. */
function isValidHeadingRecord(raw: unknown): raw is HeadingRecord {
  if (typeof raw !== "object" || raw === null) return false;
  const record = raw as Record<string, unknown>;
  const isFiniteNumber = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v);
  return (
    typeof record.key === "string" &&
    isFiniteNumber(record.occurrence) &&
    isFiniteNumber(record.level) &&
    record.level >= 1 &&
    record.level <= 6 &&
    typeof record.rawText === "string" &&
    typeof record.displayText === "string" &&
    isFiniteNumber(record.sourceFrom) &&
    isFiniteNumber(record.sourceTo) &&
    isFiniteNumber(record.contentFrom) &&
    isFiniteNumber(record.contentTo) &&
    isFiniteNumber(record.line) &&
    isFiniteNumber(record.column) &&
    isFiniteNumber(record.sectionFrom) &&
    isFiniteNumber(record.sectionTo) &&
    (record.parentIndex === undefined || isFiniteNumber(record.parentIndex)) &&
    Array.isArray(record.childIndexes) &&
    record.childIndexes.every(isFiniteNumber)
  );
}

/** Same rationale as isValidHeadingRecord above, for the F04 Phase 5c
 * cached field: a `BlockRecord` (markdown/blocks.ts) has enough
 * numeric/kind fields that a malformed one is a real decode risk. */
function isValidBlockRecord(raw: unknown): raw is BlockRecord {
  if (typeof raw !== "object" || raw === null) return false;
  const record = raw as Record<string, unknown>;
  const isFiniteNumber = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v);
  return (
    typeof record.id === "string" &&
    typeof record.key === "string" &&
    isFiniteNumber(record.occurrence) &&
    (record.kind === "paragraph" ||
      record.kind === "list-item" ||
      record.kind === "blockquote" ||
      record.kind === "fenced-code") &&
    isFiniteNumber(record.sourceFrom) &&
    isFiniteNumber(record.sourceTo) &&
    isFiniteNumber(record.contentFrom) &&
    isFiniteNumber(record.contentTo) &&
    isFiniteNumber(record.idFrom) &&
    isFiniteNumber(record.idTo) &&
    isFiniteNumber(record.line) &&
    isFiniteNumber(record.column)
  );
}

function isValidCachedNote(raw: unknown): raw is CachedNote {
  if (typeof raw !== "object" || raw === null) return false;
  const record = raw as Record<string, unknown>;
  if (typeof record.mtime !== "number" || !Number.isFinite(record.mtime)) {
    return false;
  }
  if (
    record.size !== undefined &&
    (typeof record.size !== "number" || !Number.isFinite(record.size))
  ) {
    return false;
  }
  const isStringArray = (v: unknown): v is string[] =>
    Array.isArray(v) && v.every((item) => typeof item === "string");
  return (
    isStringArray(record.wikilinks) &&
    isStringArray(record.aliases) &&
    isStringArray(record.tags) &&
    Array.isArray(record.tasks) &&
    record.tasks.every(isValidTaskRecord) &&
    typeof record.hasFrontmatter === "boolean" &&
    Array.isArray(record.frontmatterProperties) &&
    record.frontmatterProperties.every(isValidFrontmatterProperty) &&
    Array.isArray(record.wikiLinks) &&
    record.wikiLinks.every(isValidWikiLinkRecord) &&
    Array.isArray(record.headings) &&
    record.headings.every(isValidHeadingRecord) &&
    Array.isArray(record.blocks) &&
    record.blocks.every(isValidBlockRecord)
  );
}

/** Validates the whole persisted cache file's shape before any entry is
 * trusted. Returns `null` (start fresh, same as today's "no cache file
 * yet" behavior) for anything not shaped like the current cache version
 * (see LINK_INDEX_CACHE_VERSION) at all; otherwise keeps only the entries
 * that individually pass
 * `isValidCachedNote`; a malformed entry is dropped rather than
 * poisoning the whole load. */
function decodePersistedLinkIndexCache(
  raw: unknown,
): Record<string, CachedNote> | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  if (record.version !== LINK_INDEX_CACHE_VERSION) return null;
  if (
    typeof record.entries !== "object" ||
    record.entries === null ||
    Array.isArray(record.entries)
  ) {
    return null;
  }
  const entries: Record<string, CachedNote> = {};
  for (const [path, value] of Object.entries(
    record.entries as Record<string, unknown>,
  )) {
    if (isValidCachedNote(value)) entries[path] = value;
  }
  return entries;
}

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
  tasks: TaskRecord[];
  /** F09 Phase 1: whether this note has a YAML frontmatter block at all,
   * and its parsed top-level fields, so a cache hit doesn't need to
   * re-parse frontmatter it already read once. See LinkIndex's own
   * hasFrontmatterByPath/frontmatterPropertiesByPath doc comments for what
   * consumes this. */
  hasFrontmatter: boolean;
  frontmatterProperties: FrontmatterProperty[];
  /** F03 Phase 1: this note's structured wikilink records (see
   * LinkIndex.wikiLinksByPath's doc comment for why this exists alongside
   * the plain-string `wikilinks` above rather than replacing it). */
  wikiLinks: WikiLinkRecord[];
  /** F03 Phase 1: this note's own scanned headings (see
   * LinkIndex.headingsByPath's doc comment). */
  headings: HeadingRecord[];
  /** F04 Phase 5c: this note's own scanned block IDs (see
   * LinkIndex.blocksByPath's doc comment). */
  blocks: BlockRecord[];
}

// Bumped from 3 (audit follow-up F-012): cache identity now also requires
// `size` to match, not just `mtime`, since a coarse or colliding mtime
// (some filesystems and SAF providers report only second-level
// resolution) could otherwise let two different writes to the same note
// within the same tick look identical and hide the newer content behind
// a stale cache hit. An old-shaped cache file's entries have no `size`,
// so bumping the version forces a real re-read for all of them rather
// than treating an absent field as coincidentally already "matching."
//
// Bumped again from 4 (F02 Phase 1): CachedNote gained `tasks`, so an
// old-shaped cache entry read from disk has no `tasks` field at all;
// without the bump, that entry's `mtime`/`size` could still "match" a
// current file and be reused as a cache hit, silently reporting the
// note as having no tasks forever until it's next edited. Forcing a
// version bump for every cache-shape change, not just this one, is the
// standing precedent this comment continues.
//
// Bumped again from 5 (F09 Phase 1): CachedNote gained `hasFrontmatter` and
// `frontmatterProperties`. An old-shaped cache entry has neither, so
// without the bump it could "match" a current file on mtime/size and be
// reused as a cache hit, silently reporting the note as having no
// frontmatter at all until it's next edited.
// Bumped again from 5 (F03 Phase 1): CachedNote gained `wikiLinks` and
// `headings`, following the exact same precedent as the `tasks` bump
// above, for the exact same reason: an old-shaped cache entry has neither
// field, and without the bump it could still "match" a current file's
// mtime/size and be reused as a cache hit, silently reporting the note as
// having no wikilinks or headings at all to the new diagnostics feature
// until it's next edited.
// Bumped again from 6 (F04 Phase 5c): CachedNote gained `blocks`, the same
// precedent again: an old-shaped cache entry has no `blocks` field, and
// without the bump could still "match" a current file's mtime/size and be
// reused as a cache hit, silently reporting the note as having zero block
// IDs to the new cross-note block pre-check until it's next edited.
const LINK_INDEX_CACHE_VERSION = 7;
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
    const entries = decodePersistedLinkIndexCache(JSON.parse(raw));
    if (entries) {
      for (const [path, cached] of Object.entries(entries)) {
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
    const tasksByPath = new Map<string, TaskRecord[]>();
    const mtimeByPath = new Map<string, number>();
    const hasFrontmatterByPath = new Set<string>();
    const frontmatterPropertiesByPath = new Map<string, FrontmatterProperty[]>();
    const wikiLinksByPath = new Map<string, WikiLinkRecord[]>();
    const headingsByPath = new Map<string, HeadingRecord[]>();
    const blocksByPath = new Map<string, BlockRecord[]>();

    for (const entry of noteEntries) {
      const key = noteNameFromPath(entry.path).toLocaleLowerCase();
      const paths = pathsByNoteName.get(key) ?? [];
      paths.push(entry.path);
      pathsByNoteName.set(key, paths);
      backlinksByPath.set(entry.path, []);
      if (entry.mtime !== undefined) mtimeByPath.set(entry.path, entry.mtime);
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
      linkIndexReadConcurrency(),
      async (entry) => {
        if (!isCurrentRequest()) return;
        const cached = wikilinkCache.get(entry.path);
        let wikilinks: string[];
        let aliases: string[];
        let tags: string[];
        let tasks: TaskRecord[];
        let hasFrontmatter: boolean;
        let frontmatterProperties: FrontmatterProperty[];
        let wikiLinks: WikiLinkRecord[];
        let headings: HeadingRecord[];
        let blocks: BlockRecord[];
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
          tasks = cached.tasks;
          hasFrontmatter = cached.hasFrontmatter;
          frontmatterProperties = cached.frontmatterProperties;
          wikiLinks = cached.wikiLinks;
          headings = cached.headings;
          blocks = cached.blocks;
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
            if (cached?.tasks.length) tasksByPath.set(entry.path, cached.tasks);
            if (cached?.hasFrontmatter) hasFrontmatterByPath.add(entry.path);
            if (cached?.frontmatterProperties.length) {
              frontmatterPropertiesByPath.set(entry.path, cached.frontmatterProperties);
            }
            if (cached?.wikiLinks.length) wikiLinksByPath.set(entry.path, cached.wikiLinks);
            if (cached?.headings.length) headingsByPath.set(entry.path, cached.headings);
            if (cached?.blocks.length) blocksByPath.set(entry.path, cached.blocks);
            return;
          }
          if (!isCurrentRequest()) return;
          wikilinks = extractWikilinks(source);
          aliases = extractAliases(source);
          tags = extractTags(source);
          tasks = scanTasks(source);
          hasFrontmatter = hasFrontmatterBlock(source);
          frontmatterProperties = parseFrontmatterProperties(source).properties;
          wikiLinks = parseWikiLinks(source);
          headings = scanHeadings(source);
          blocks = scanBlockIds(source);
        }
        if (entry.mtime !== undefined && entry.size !== undefined) {
          freshCache.set(entry.path, {
            mtime: entry.mtime,
            size: entry.size,
            wikilinks,
            aliases,
            tags,
            tasks,
            hasFrontmatter,
            frontmatterProperties,
            wikiLinks,
            headings,
            blocks,
          });
        }
        wikilinksByPath.set(entry.path, wikilinks);
        if (tasks.length > 0) tasksByPath.set(entry.path, tasks);
        if (hasFrontmatter) hasFrontmatterByPath.add(entry.path);
        if (frontmatterProperties.length > 0) {
          frontmatterPropertiesByPath.set(entry.path, frontmatterProperties);
        }
        if (wikiLinks.length > 0) wikiLinksByPath.set(entry.path, wikiLinks);
        if (headings.length > 0) headingsByPath.set(entry.path, headings);
        if (blocks.length > 0) blocksByPath.set(entry.path, blocks);

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
      tasksByPath,
      mtimeByPath,
      hasFrontmatterByPath,
      frontmatterPropertiesByPath,
      wikiLinksByPath,
      headingsByPath,
      blocksByPath,
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
