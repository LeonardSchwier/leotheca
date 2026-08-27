import { bookmarks, removeBookmark } from "./store";
import "./bookmarks.css";

interface BookmarksPanelProps {
  onOpenFile: (path: string, name: string) => void;
  onRunSearch: (query: string) => void;
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export function BookmarksPanel({
  onOpenFile,
  onRunSearch,
}: BookmarksPanelProps) {
  if (bookmarks.value.length === 0)
    return <p class="empty-hint">No bookmarks yet.</p>;

  return (
    <ul class="bookmarks-list" aria-label="Bookmarks">
      {bookmarks.value.map((bookmark) => (
        <li key={bookmark.id} class="bookmarks-item">
          <button
            class="file-tree-item bookmarks-open"
            onClick={() => {
              if (bookmark.kind === "file")
                onOpenFile(bookmark.path, fileName(bookmark.path));
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
        </li>
      ))}
    </ul>
  );
}
