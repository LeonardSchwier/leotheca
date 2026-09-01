/**
 * App integration contract: import `BookmarksPanel` and render it in the
 * sidebar behind a toggle next to the existing Settings control. Call
 * `loadBookmarks(workspacePath)` whenever the active workspace changes.
 */
import { signal } from "@preact/signals";
import { workspacePath } from "../settings/store";
import { readTextFile, writeWorkspaceTextFile } from "../workspace/tauriBridge";
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
 * exercise it directly, without a native file read in the way. */
export function decodeBookmarks(raw: string): {
  bookmarks: Bookmark[];
  corrupt: boolean;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { bookmarks: EMPTY_BOOKMARKS, corrupt: true };
  }
  if (!Array.isArray(parsed)) {
    return { bookmarks: EMPTY_BOOKMARKS, corrupt: true };
  }
  const kept = parsed.filter(isValidBookmark);
  return { bookmarks: kept, corrupt: kept.length !== parsed.length };
}

export const bookmarks = signal<Bookmark[]>(EMPTY_BOOKMARKS);

// Plain string join, not a path-resolution API call: every workspace path
// this app hands back to the frontend, on every platform including
// Windows, is already forward-slash-separated (see workspace/paths.ts's
// own comment on where that's normalized), and this is always relative to
// a workspace path this app already owns. Matches the same pattern in
// src/settings/workspaceSettings.ts.
function bookmarksPath(rootPath: string): string {
  return `${rootPath}/.leotheca/bookmarks.json`;
}

async function saveBookmarks(): Promise<void> {
  if (!workspacePath.value) return;
  await writeWorkspaceTextFile(
    workspacePath.value,
    ".leotheca/bookmarks.json",
    JSON.stringify(bookmarks.value, null, 2),
  );
}

// Bumped on every loadBookmarks call so a call superseded by a newer one
// (the user switched workspaces again before the first load finished) can
// tell it's stale and not overwrite the newer, correct result once it
// eventually resolves.
let loadSequence = 0;

export async function loadBookmarks(rootPath: string): Promise<void> {
  const sequence = ++loadSequence;
  // Cleared synchronously, before the read even starts: without this, the
  // previous workspace's bookmarks stay on screen for the moment it takes
  // this to resolve, which reads as "these are workspace B's bookmarks"
  // when they're actually still workspace A's.
  bookmarks.value = EMPTY_BOOKMARKS;
  try {
    const raw = await readTextFile(bookmarksPath(rootPath));
    if (sequence !== loadSequence) return;
    bookmarks.value = decodeBookmarks(raw).bookmarks;
  } catch {
    if (sequence !== loadSequence) return;
    bookmarks.value = EMPTY_BOOKMARKS;
  }
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
