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

let loadSequence = 0;

/** Invalidates both visible bookmarks and any older read that is still
 * resolving. Called before a new workspace session is published. */
export function resetBookmarks(): void {
  loadSequence += 1;
  bookmarks.value = EMPTY_BOOKMARKS;
}

export async function loadBookmarks(rootPath: string): Promise<void> {
  const sequence = ++loadSequence;
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
