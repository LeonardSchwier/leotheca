import { fileNameFromPath } from "../linking/store";
import type { NoteRecord } from "./collectionQuery";
import "./collections.css";

export interface CollectionResultsProps {
  results: NoteRecord[];
  onOpenFile: (path: string, name: string) => void;
}

function formatModified(ms: number | undefined): string | null {
  if (ms === undefined) return null;
  try {
    return new Date(ms).toLocaleDateString();
  } catch {
    return null;
  }
}

/**
 * F09 Phase 1's read-only list view (spec section 9.2), the only result
 * view this phase ships (table and card views are F09 Phase 2, per this
 * feature's own roadmap entry). Each row shows the note's name, its
 * folder for disambiguation, its tags, and its modified date when known;
 * clicking a row opens the note. Selecting a result opens it the same
 * plain way TagsPanel/BookmarksPanel already do (`onOpenFile`): a
 * collection match is a whole note, not a location inside one, so there
 * is no text range to reveal the way TaskHubPanel's task rows have.
 */
export function CollectionResults({ results, onOpenFile }: CollectionResultsProps) {
  if (results.length === 0) {
    return <p class="empty-hint">No notes match this collection.</p>;
  }

  return (
    <ul class="collections-results-list" aria-label="Collection results">
      {results.map((note) => {
        const modified = formatModified(note.modified);
        return (
          <li key={note.path} class="collections-result-item">
            <button
              class="file-tree-item collections-result-open"
              onClick={() => onOpenFile(note.path, fileNameFromPath(note.path))}
            >
              <span class="collections-result-name">{note.noteName}</span>
              {note.folder && <span class="collections-result-folder">{note.folder}</span>}
              <span class="collections-result-meta">
                {note.tags.length > 0 && (
                  <span class="collections-result-tags">{note.tags.map((t) => `#${t}`).join(" ")}</span>
                )}
                {modified && <span class="collections-result-modified">{modified}</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
