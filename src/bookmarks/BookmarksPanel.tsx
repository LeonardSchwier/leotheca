import { useEffect, useState } from "preact/hooks";
import {
  bookmarks,
  bookmarksCorrupted,
  removeBookmark,
  repairBookmarksFile,
} from "./store";
import type { Bookmark } from "./types";
import { EmptyState, Icon } from "@leonardschwier/leoforma";
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
  const [rewriteFailed, setRewriteFailed] = useState(false);
  const unreadable = bookmarksCorrupted.value;

  // A failed rewrite belongs to the file it was tried on. Once the flag is
  // gone (another workspace was opened, or the rewrite worked), the next
  // unreadable file starts without it.
  useEffect(() => {
    if (!unreadable) setRewriteFailed(false);
  }, [unreadable]);

  async function handleRewrite() {
    setRewriteFailed(false);
    try {
      await repairBookmarksFile();
    } catch {
      setRewriteFailed(true);
    }
  }

  // A bookmarks file that exists but could not be read is left on disk, so an
  // empty list here does not mean "no bookmarks", and anything added now is
  // not saved. Shown with or without entries: the user can add some before
  // seeing why nothing was kept.
  const unreadableNotice = unreadable ? (
    <div class="bookmarks-corrupt">
      <p role="alert">
        The bookmarks file could not be read. It is left as it is on disk, so
        bookmarks you add now are not saved until you rewrite it.
      </p>
      {rewriteFailed && (
        <p role="alert">
          The bookmarks file could not be rewritten. Check that the folder is
          writable and try again.
        </p>
      )}
      <button
        type="button"
        class="bookmarks-corrupt-action"
        onClick={() => void handleRewrite()}
      >
        Rewrite bookmarks file
      </button>
    </div>
  ) : null;

  if (bookmarks.value.length === 0)
    return (
      <>
        {unreadableNotice}
        <EmptyState
          size="sm"
          icon={<Icon name="bookmark" size={20} />}
          title="No bookmarks yet."
          description="Bookmark a note or saved search to find it here."
        />
      </>
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
    <>
      {unreadableNotice}
      <ul class="bookmarks-list" aria-label="Bookmarks">
        {bookmarks.value.map((bookmark) => (
          <li key={bookmark.id} class="bookmarks-item-row">
            <div class="bookmarks-item">
              <button
                class="file-tree-item bookmarks-open"
                onClick={() => {
                  if (bookmark.kind === "file")
                    void handleOpenFileBookmark(bookmark);
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
                Couldn't open "{bookmark.label}": it may have been moved,
                renamed, or deleted.
              </p>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
