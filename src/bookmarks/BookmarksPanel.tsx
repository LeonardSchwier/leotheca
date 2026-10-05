import { useState } from "preact/hooks";
import { bookmarks, removeBookmark } from "./store";
import type { Bookmark } from "./types";
import { EmptyState } from "../ui/EmptyState";
import "./bookmarks.css";

interface BookmarksPanelProps {
  onOpenFile: (path: string, name: string) => void | Promise<void>;
  onRunSearch: (query: string) => void;
  /** Reveals a file bookmark's folder in the sidebar tree (expanding
   * every ancestor between the workspace root and the file). Optional so
   * existing callers that only need "open in editor" keep working; when
   * omitted, no "Open in sidebar" button is rendered for file
   * bookmarks. */
  onRevealInSidebar?: (path: string) => void | Promise<void>;
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/** Small folder icon, matching the inline-SVG convention used across the
 * sidebar (see NewNoteIcon/NewFolderIcon in workspace/Sidebar.tsx): plain
 * strokes, no emoji, so it renders the same on Android and desktop. */
function RevealInSidebarIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M2.5 5.5a1 1 0 0 1 1-1h4l1.5 2h7a1 1 0 0 1 1 1v8.5a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5.5z" />
      <path d="M10 10.5v4M8 12.5h4" />
    </svg>
  );
}

export function BookmarksPanel({
  onOpenFile,
  onRunSearch,
  onRevealInSidebar,
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
            {bookmark.kind === "file" && onRevealInSidebar && (
              <button
                class="icon-button bookmarks-reveal"
                title={`Show "${bookmark.label}" in the sidebar tree`}
                aria-label={`Show "${bookmark.label}" in the sidebar tree`}
                onClick={() => void onRevealInSidebar(bookmark.path)}
              >
                <RevealInSidebarIcon />
              </button>
            )}
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
