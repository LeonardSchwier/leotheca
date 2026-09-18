import { useState } from "preact/hooks";
import { bookmarks, removeBookmark } from "./store";
import type { Bookmark } from "./types";
import { EmptyState } from "../ui/EmptyState";
import "./bookmarks.css";

interface BookmarksPanelProps {
  onOpenFile: (path: string, name: string) => void | Promise<void>;
  onRunSearch: (query: string) => void;
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export function BookmarksPanel({
  onOpenFile,
  onRunSearch,
}: BookmarksPanelProps) {
  // A bookmark's target can go stale (deleted, renamed outside a live
  // rename's own metadata migration, or moved/removed by an external
  // tool), so onOpenFile can reject even though this panel never
  // re-validates a bookmark's path itself. Tracks which single bookmark's
  // open attempt most recently failed, so its own row can show an inline
  // error instead of leaving a rejected promise unhandled and the click
  // silently doing nothing.
  const [openErrorId, setOpenErrorId] = useState<string | null>(null);

  if (bookmarks.value.length === 0)
    return (
      <EmptyState
        size="sm"
        icon="bookmark"
        title="No bookmarks yet."
        description="Bookmark a note or saved search to find it here."
      />
    );

  async function handleOpenFileBookmark(
    bookmark: Extract<Bookmark, { kind: "file" }>,
  ) {
    setOpenErrorId(null);
    try {
      await onOpenFile(bookmark.path, fileName(bookmark.path));
    } catch {
      setOpenErrorId(bookmark.id);
    }
  }

  return (
    <ul class="bookmarks-list" aria-label="Bookmarks">
      {bookmarks.value.map((bookmark) => (
        <li key={bookmark.id} class="bookmarks-item-row">
          <div class="bookmarks-item">
            <button
              class="file-tree-item bookmarks-open"
              onClick={() => {
                if (bookmark.kind === "file") void handleOpenFileBookmark(bookmark);
                else onRunSearch(bookmark.query);
              }}
            >
              <span>{bookmark.label}</span>
              <span class="bookmarks-kind">
                {bookmark.kind === "file" ? "File" : "Search"}
              </span>
            </button>
            <button
              class="icon-button bookmarks-remove"
              title={`Remove ${bookmark.label}`}
              aria-label={`Remove ${bookmark.label}`}
              onClick={() => void removeBookmark(bookmark.id)}
            >
              ×
            </button>
          </div>
          {openErrorId === bookmark.id && (
            <p class="bookmarks-error-message" role="alert">
              Couldn't open "{bookmark.label}" — it may have been moved, renamed, or deleted.
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
