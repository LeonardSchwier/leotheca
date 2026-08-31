import { useEffect } from "preact/hooks";
import {
  dirChildren,
  dirname,
  expandedDirs,
  expandFirstLevel,
  loadChildren,
  openContextMenu,
  selectedDir,
  selectedPath,
  sortEntries,
  toggleExpanded,
} from "./fileTreeStore";
import type { FsEntry } from "./types";

interface FileTreeProps {
  rootPath: string;
  onOpenFile: (path: string, name: string) => void;
}

export function FileTree({ rootPath, onOpenFile }: FileTreeProps) {
  useEffect(() => {
    void expandFirstLevel(rootPath);
  }, [rootPath]);

  const entries = dirChildren.value.get(rootPath);
  if (!entries) return null;

  return (
    <ul class="file-tree">
      {sortEntries(entries).map((entry) => (
        <FileTreeNode key={entry.path} entry={entry} onOpenFile={onOpenFile} />
      ))}
    </ul>
  );
}

function FileTreeNode({
  entry,
  onOpenFile,
}: {
  entry: FsEntry;
  onOpenFile: (path: string, name: string) => void;
}) {
  const expanded = expandedDirs.value.has(entry.path);
  const children = dirChildren.value.get(entry.path);

  const handleClick = async () => {
    selectedPath.value = entry.path;
    if (!entry.isDir) {
      selectedDir.value = dirname(entry.path);
      onOpenFile(entry.path, entry.name);
      return;
    }
    selectedDir.value = entry.path;
    if (!expanded && !children) {
      await loadChildren(entry.path);
    }
    toggleExpanded(entry.path);
  };

  return (
    <li>
      <button
        class={`file-tree-item ${selectedPath.value === entry.path ? "selected" : ""}`}
        onClick={handleClick}
        onContextMenu={(e) => {
          e.preventDefault();
          openContextMenu(entry, e.clientX, e.clientY);
        }}
      >
        <span class="file-tree-marker">{entry.isDir ? (expanded ? "▾" : "▸") : ""}</span>
        {entry.name}
      </button>
      {entry.isDir && expanded && children && (
        <ul class="file-tree">
          {sortEntries(children).map((child) => (
            <FileTreeNode key={child.path} entry={child} onOpenFile={onOpenFile} />
          ))}
        </ul>
      )}
    </li>
  );
}
