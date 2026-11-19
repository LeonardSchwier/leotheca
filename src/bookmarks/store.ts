/**
 * App integration contract: import `BookmarksPanel` and render it in the
 * sidebar behind a toggle next to the existing Settings control. Call
 * `loadBookmarks(workspacePath)` whenever the active workspace changes.
 */
import { effect, signal } from "@preact/signals";
import { isMissingFileError } from "../settings/globalConfig";
import { workspacePath } from "../settings/store";
import {
  readTextFile,
  updateFavoritesWidget,
  writeWorkspaceTextFile,
} from "../workspace/tauriBridge";
import { workspaceTransitions } from "../workspace/workspaceTransition";
import type { Bookmark } from "./types";

const EMPTY_BOOKMARKS: Bookmark[] = [];

function isValidBookmark(entry: unknown): entry is Bookmark {
  if (typeof entry !== "object" || entry === null) return false;
  const candidate = entry as Record<string, unknown>;
  if (typeof candidate.id !== "string" || candidate.id === "") return false;
  if (typeof candidate.label !== "string") return false;
  if (candidate.kind === "file") return typeof candidate.path === "string";
  if (candidate.kind === "search") return typeof candidate.query === "string";
  return false;
}

/** Audit follow-up F-008: `JSON.parse(raw) as Bookmark[]` used to trust
 * every array entry's shape outright, including a missing `id` (breaking
 * `removeBookmark`'s own `id` match) or an unrecognized `kind`. A
 * malformed individual entry is dropped rather than discarding the whole
 * list alongside it, since the other bookmarks in the same file are
 * still perfectly good, real user data; there is no way to "recover" a
 * bookmark missing its own id, so there is nothing to preserve for that
 * one entry either, unlike a rejected settings *value* which still has
 * an obvious safe default to fall back to. Exported so its fixtures can
 * exercise it directly, without a native file read in the way.
 *
 * `unreadable` is the stronger case of `corrupt`: the text is not a JSON array
 * at all, so there is nothing to keep of it and an empty list stands in for it.
 * The loader keeps such a file on disk (see `bookmarksCorrupted`); a file with
 * only some invalid entries is not unreadable, its valid entries are shown. */
export function decodeBookmarks(raw: string): {
  bookmarks: Bookmark[];
  corrupt: boolean;
  unreadable: boolean;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { bookmarks: EMPTY_BOOKMARKS, corrupt: true, unreadable: true };
  }
  if (!Array.isArray(parsed)) {
    return { bookmarks: EMPTY_BOOKMARKS, corrupt: true, unreadable: true };
  }
  const kept = parsed.filter(isValidBookmark);
  return {
    bookmarks: kept,
    corrupt: kept.length !== parsed.length,
    unreadable: false,
  };
}

export const bookmarks = signal<Bookmark[]>(EMPTY_BOOKMARKS);

/** True when this workspace's bookmarks.json exists but could not be read
 * (permission, I/O or encoding error) or is not a JSON array. The list is then
 * empty, and no ordinary add or remove writes the file: the empty list shown
 * for it must not replace the user's bytes. Only `repairBookmarksFile`, which
 * the panel offers, writes through the flag. A missing file is not this: that
 * is a first use. Cleared by every load and by `resetBookmarks`. */
export const bookmarksCorrupted = signal(false);

// A home-screen widget's practical list length: enough to be useful,
// bounded so a very large bookmark list doesn't bloat the native
// SharedPreferences blob or the on-screen widget itself.
const MAX_WIDGET_FAVORITES = 25;

// Mirrors "file" bookmarks (favorites) to the Android home-screen widget
// (LeothecaFavoritesListWidgetProvider) on every change: initial load,
// add, remove, and workspace switch/removal (resetBookmarks below clears
// the signal, which this reacts to the same as any other change). Search
// bookmarks have no note to open and are excluded. Runs unconditionally;
// updateFavoritesWidget is a no-op on desktop (tauriBridgeImpl's stub),
// so this never needs its own platform check.
effect(() => {
  const entries = bookmarks.value
    .filter(
      (bookmark): bookmark is Extract<Bookmark, { kind: "file" }> =>
        bookmark.kind === "file",
    )
    .slice(0, MAX_WIDGET_FAVORITES)
    .map((bookmark) => ({ label: bookmark.label, path: bookmark.path }));
  void updateFavoritesWidget(entries);
});

// Plain string join, not a path-resolution API call: every workspace path
// this app hands back to the frontend, on every platform including
// Windows, is already forward-slash-separated (see workspace/paths.ts's
// own comment on where that's normalized), and this is always relative to
// a workspace path this app already owns. Matches the same pattern in
// src/settings/workspaceSettings.ts.
function bookmarksPath(rootPath: string): string {
  return `${rootPath}/.leotheca/bookmarks.json`;
}

// Serializes writes so two overlapping mutations (e.g. a quick add followed
// by a remove, before the first write lands) can never have their native
// writeWorkspaceTextFile calls resolve out of order and let the earlier
// call's now-stale snapshot of `bookmarks.value` overwrite the later one's
// on disk, silently reverting the newer change. Each queued write reads
// `bookmarks.value` only once its own turn begins, mirroring
// settings/store.ts's saveGlobalConfigOrdered, so the last write to
// actually run always persists whatever is genuinely current at that time.
let bookmarksWriteTail: Promise<void> = Promise.resolve();

function saveBookmarks(throughCorrupted = false): Promise<void> {
  const root = workspacePath.value;
  if (!root) return Promise.resolve();
  const write = bookmarksWriteTail.then(() => {
    // Both checks are made at this write's own turn, not when it was queued:
    // the list read below is the current workspace's, so a write for a
    // workspace that is no longer current would put that other list into
    // this one's file, and a file flagged in the meantime must be left alone.
    if (workspacePath.value !== root) return;
    if (bookmarksCorrupted.value && !throughCorrupted) return;
    return writeWorkspaceTextFile(
      root,
      ".leotheca/bookmarks.json",
      JSON.stringify(bookmarks.value, null, 2),
    );
  });
  // Keep the tail settled even on failure, so one rejected write doesn't
  // permanently wedge every later one behind it.
  bookmarksWriteTail = write.then(
    () => undefined,
    () => undefined,
  );
  return write;
}

// Bumped on every loadBookmarks call so a call superseded by a newer one
// (the user switched workspaces again before the first load finished) can
// tell it's stale and not overwrite the newer, correct result once it
// eventually resolves.
let loadSequence = 0;

/** Invalidates both visible bookmarks and any older read that is still
 * resolving. Registered with the authoritative transition so stale workspace
 * bookmarks disappear before the incoming workspace is published. */
export function resetBookmarks(): void {
  loadSequence += 1;
  bookmarks.value = EMPTY_BOOKMARKS;
  bookmarksCorrupted.value = false;
}
workspaceTransitions.registerReset(resetBookmarks);

export async function loadBookmarks(rootPath: string): Promise<void> {
  const sequence = ++loadSequence;
  // Cleared synchronously, before the read even starts: without this, the
  // previous workspace's bookmarks stay on screen for the moment it takes
  // this to resolve, which reads as "these are workspace B's bookmarks"
  // when they're actually still workspace A's. The same goes for its warning.
  bookmarks.value = EMPTY_BOOKMARKS;
  bookmarksCorrupted.value = false;
  let raw: string;
  try {
    raw = await readTextFile(bookmarksPath(rootPath));
  } catch (error) {
    if (sequence !== loadSequence) return;
    // No file yet is a first use. Any other failure leaves a file that may
    // well exist; the empty list shown for it must not replace it.
    bookmarksCorrupted.value = !isMissingFileError(error);
    return;
  }
  if (sequence !== loadSequence) return;
  const decoded = decodeBookmarks(raw);
  bookmarks.value = decoded.bookmarks;
  bookmarksCorrupted.value = decoded.unreadable;
}

/** The explicit recovery for a bookmarks.json that could not be read: writes
 * the list as it is now over the file and, only once that succeeded, clears the
 * flag. A rejected write keeps the flag and reaches the caller. Never called
 * by a load or an ordinary mutation, so the user can still repair the file by
 * hand before choosing this. */
export async function repairBookmarksFile(): Promise<void> {
  if (!bookmarksCorrupted.value) return;
  const sequence = loadSequence;
  await saveBookmarks(true);
  // Another workspace may have been opened while the write ran; the flag then
  // describes that workspace's file, not the one just rewritten.
  if (sequence === loadSequence) bookmarksCorrupted.value = false;
}

function newId(): string {
  return crypto.randomUUID();
}

export async function addFileBookmark(
  path: string,
  label: string,
): Promise<void> {
  const next = {
    id: newId(),
    kind: "file" as const,
    path,
    label: label.trim(),
  };
  bookmarks.value = [...bookmarks.value, next];
  await saveBookmarks();
}

export async function addSearchBookmark(
  query: string,
  label: string,
): Promise<void> {
  const next = {
    id: newId(),
    kind: "search" as const,
    query,
    label: label.trim(),
  };
  bookmarks.value = [...bookmarks.value, next];
  await saveBookmarks();
}

export async function removeBookmark(id: string): Promise<void> {
  bookmarks.value = bookmarks.value.filter((bookmark) => bookmark.id !== id);
  await saveBookmarks();
}
