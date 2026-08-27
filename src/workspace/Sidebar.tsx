import { useEffect, useRef, useState } from "preact/hooks";
import { FileTree } from "./FileTree";
import { FileContextMenu } from "./FileContextMenu";
import { NamePrompt } from "./NamePrompt";
import {
  clearSearch,
  createFolder,
  createNote,
  deleteEntry,
  renameEntry,
  runSearch,
  searchQuery,
  searchResults,
  selectedDir,
  toggleSortOrder,
} from "./fileTreeStore";
import { closeTabsUnder, renameOpenTab } from "./store";
import type { FsEntry } from "./types";
import { workspaceSettings } from "../settings/store";

const SEARCH_DEBOUNCE_MS = 200;

// Plain inline SVGs, not the page/folder emoji this used to use: those
// specific glyphs are absent from Android's bundled font and rendered as
// nothing at all there, even though they showed up fine on desktop.
function NewNoteIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M5 2.5h7l3 3v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-14a1 1 0 0 1 1-1z" />
      <path d="M12 2.5v3h3" />
      <path d="M10 10v5M7.5 12.5h5" />
    </svg>
  );
}

function NewFolderIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M2.5 5.5a1 1 0 0 1 1-1h4l1.5 2h7a1 1 0 0 1 1 1v8.5a1 1 0 0 1-1 1h-13.5a1 1 0 0 1-1-1v-10.5z" />
      <path d="M10 10.5v4M8 12.5h4" />
    </svg>
  );
}

interface SidebarProps {
  rootPath: string;
  onOpenFile: (path: string, name: string) => void;
  /** Flushes any pending debounced autosave for `path` before it moves, so
   * renaming a file whose open tab has unsaved keystrokes doesn't lose
   * them. See the identical need (and fuller explanation) at App.tsx's own
   * tab-rename flow, which owns the autosave timers this reaches into. */
  flushPendingAutosave: (path: string) => Promise<void>;
}

interface CreatePromptState {
  mode: "note" | "folder";
  targetDir: string;
}

interface RenamePromptState {
  path: string;
  name: string;
}

export function Sidebar({ rootPath, onOpenFile, flushPendingAutosave }: SidebarProps) {
  const [createPrompt, setCreatePrompt] = useState<CreatePromptState | null>(null);
  const [renamePrompt, setRenamePrompt] = useState<RenamePromptState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  // A pending debounced search (see handleSearchInput below) captured the
  // *old* rootPath in its closure. Without this, switching workspaces
  // while a search is mid-debounce would still run that search against
  // the workspace just left, and its results would land in the shared
  // searchResults signal now displayed for the *new* workspace's sidebar.
  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [rootPath]);

  const handleCreate = async (name: string) => {
    if (!createPrompt) return;
    try {
      const path =
        createPrompt.mode === "note"
          ? await createNote(createPrompt.targetDir, name)
          : await createFolder(createPrompt.targetDir, name);
      const mode = createPrompt.mode;
      setCreatePrompt(null);
      setError(null);
      if (mode === "note") {
        onOpenFile(path, name.endsWith(".md") ? name : `${name}.md`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleRename = async (name: string) => {
    if (!renamePrompt) return;
    try {
      await flushPendingAutosave(renamePrompt.path);
      const newPath = await renameEntry(renamePrompt.path, name);
      renameOpenTab(renamePrompt.path, newPath, name);
      setRenamePrompt(null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDelete = async (entry: FsEntry) => {
    if (workspaceSettings.value.deleteBehavior === "permanent") {
      const confirmed = window.confirm(`Permanently delete "${entry.name}"? This cannot be undone.`);
      if (!confirmed) return;
    }
    // Same reasoning as the rename flush above: without this, a still-
    // pending autosave for this exact file would otherwise fire after the
    // delete moved/removed it, silently recreating it at the path the user
    // just deleted.
    await flushPendingAutosave(entry.path);
    await deleteEntry(rootPath, entry.path);
    closeTabsUnder(entry.path);
  };

  const handleSearchInput = (value: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => runSearch(rootPath, value), SEARCH_DEBOUNCE_MS);
  };

  return (
    <div class="sidebar-inner">
      <div class="sidebar-toolbar">
        <button
          class="icon-button"
          title="New note"
          aria-label="New note"
          onClick={() => setCreatePrompt({ mode: "note", targetDir: selectedDir.value ?? rootPath })}
        >
          <NewNoteIcon />
        </button>
        <button
          class="icon-button"
          title="New folder"
          aria-label="New folder"
          onClick={() => setCreatePrompt({ mode: "folder", targetDir: selectedDir.value ?? rootPath })}
        >
          <NewFolderIcon />
        </button>
        <button class="icon-button" title="Toggle sort order" aria-label="Toggle sort order" onClick={toggleSortOrder}>
          {workspaceSettings.value.sortOrder === "name-asc" ? "↓" : "↑"}
        </button>
      </div>
      <div class="sidebar-search">
        <input
          type="text"
          placeholder="Search notes..."
          value={searchQuery.value}
          onInput={(e) => {
            const value = (e.target as HTMLInputElement).value;
            searchQuery.value = value;
            handleSearchInput(value);
          }}
        />
        {searchQuery.value && (
          <button
            class="search-clear"
            onClick={() => {
              // Without this, a pending debounced search from typing right
              // before hitting Clear would still fire ~200ms later and
              // silently repopulate results, undoing the clear.
              if (searchTimer.current) clearTimeout(searchTimer.current);
              clearSearch();
            }}
            aria-label="Clear search"
          >
            x
          </button>
        )}
      </div>
      {searchResults.value ? (
        <ul class="search-results">
          {searchResults.value.length === 0 && <li class="empty-hint">No matches.</li>}
          {searchResults.value.map((entry) => (
            <li key={entry.path}>
              <button class="file-tree-item" onClick={() => onOpenFile(entry.path, entry.name)}>
                {entry.name}
                <span class="search-result-path">{entry.path.replace(rootPath, "")}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <FileTree rootPath={rootPath} onOpenFile={onOpenFile} />
      )}
      <FileContextMenu
        rootPath={rootPath}
        onNewNote={(dir) => setCreatePrompt({ mode: "note", targetDir: dir })}
        onNewFolder={(dir) => setCreatePrompt({ mode: "folder", targetDir: dir })}
        onRename={(entry) => setRenamePrompt({ path: entry.path, name: entry.name })}
        onDelete={handleDelete}
      />
      {createPrompt && (
        <NamePrompt
          title={createPrompt.mode === "note" ? "New note" : "New folder"}
          placeholder={createPrompt.mode === "note" ? "note-name" : "folder-name"}
          error={error}
          onSubmit={handleCreate}
          onCancel={() => {
            setCreatePrompt(null);
            setError(null);
          }}
        />
      )}
      {renamePrompt && (
        <NamePrompt
          title="Rename"
          submitLabel="Rename"
          placeholder={renamePrompt.name}
          initialValue={renamePrompt.name}
          error={error}
          onSubmit={handleRename}
          onCancel={() => {
            setRenamePrompt(null);
            setError(null);
          }}
        />
      )}
    </div>
  );
}
