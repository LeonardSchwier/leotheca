import { useEffect } from "preact/hooks";
import { closeContextMenu, contextMenuPos, contextMenuTarget, relativePath } from "./fileTreeStore";
import type { FsEntry } from "./types";

interface FileContextMenuProps {
  rootPath: string;
  onNewNote: (dir: string) => void;
  onNewFolder: (dir: string) => void;
  onRename: (entry: FsEntry) => void;
  onDelete: (entry: FsEntry) => void;
}

export function FileContextMenu({ rootPath, onNewNote, onNewFolder, onRename, onDelete }: FileContextMenuProps) {
  const entry = contextMenuTarget.value;

  useEffect(() => {
    if (!entry) return;
    const dismiss = () => closeContextMenu();
    window.addEventListener("click", dismiss);
    window.addEventListener("blur", dismiss);
    return () => {
      window.removeEventListener("click", dismiss);
      window.removeEventListener("blur", dismiss);
    };
  }, [entry]);

  if (!entry) return null;
  const { x, y } = contextMenuPos.value;

  const copyRelativePath = async () => {
    await navigator.clipboard.writeText(relativePath(rootPath, entry.path));
    closeContextMenu();
  };

  return (
    <div class="context-menu" style={{ left: `${x}px`, top: `${y}px` }}>
      {entry.isDir && (
        <>
          <button
            onClick={() => {
              closeContextMenu();
              onNewNote(entry.path);
            }}
          >
            New Note
          </button>
          <button
            onClick={() => {
              closeContextMenu();
              onNewFolder(entry.path);
            }}
          >
            New Folder
          </button>
        </>
      )}
      <button
        onClick={() => {
          closeContextMenu();
          onRename(entry);
        }}
      >
        Rename
      </button>
      <button
        onClick={() => {
          closeContextMenu();
          onDelete(entry);
        }}
      >
        Delete
      </button>
      <button onClick={copyRelativePath}>Copy Relative Path</button>
    </div>
  );
}
