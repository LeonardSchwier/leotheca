/**
 * App integration contract: import `BookmarksPanel` and render it in the
 * sidebar behind a toggle next to the existing Settings control. Call
 * `loadBookmarks(workspacePath)` whenever the active workspace changes.
 */
import { signal } from "@preact/signals";
import { workspacePath } from "../settings/store";
import { readTextFile, writeTextFile } from "../workspace/tauriBridge";
import type { Bookmark } from "./types";

const EMPTY_BOOKMARKS: Bookmark[] = [];

export const bookmarks = signal<Bookmark[]>(EMPTY_BOOKMARKS);

// Plain string join, not a path-resolution API call: both target platforms
// (Linux, Android) use forward slashes, and this is always relative to a
// workspace path this app already owns. Matches the same pattern in
// src/settings/workspaceSettings.ts.
function bookmarksPath(rootPath: string): string {
  return `${rootPath}/.leotheca/bookmarks.json`;
}

async function saveBookmarks(): Promise<void> {
  if (!workspacePath.value) return;
  await writeTextFile(
    bookmarksPath(workspacePath.value),
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
    const parsed: unknown = JSON.parse(raw);
    if (sequence !== loadSequence) return;
    bookmarks.value = Array.isArray(parsed)
      ? (parsed as Bookmark[])
      : EMPTY_BOOKMARKS;
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
