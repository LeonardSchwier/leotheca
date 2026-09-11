import { useEffect, useMemo } from "preact/hooks";
import { memo } from "preact/compat";
import {
  dirChildren,
  dirname,
  expandedDirs,
  expandFirstLevel,
  loadChildren,
  memoizedSortEntries,
  openContextMenu,
  selectedDir,
  selectedPath,
  toggleExpanded,
} from "./fileTreeStore";
import { workspaceSession } from "../settings/store";
import type { FsEntry } from "./types";

interface FileTreeProps {
  rootPath: string;
  onOpenFile: (path: string, name: string) => void;
}

export function FileTree({ rootPath, onOpenFile }: FileTreeProps) {
  // Re-expand first level when rootPath changes. We read workspaceSession.value
  // inside the effect to ensure the effect runs when the session changes (F20
  // Phase 2b-iii-b in-session transition-failure recovery), but we don't include
  // it in the dependency array because signals trigger their own reactivity.
  useEffect(() => {
    // Reading workspaceSession.value here ensures we get the current session
    // even when rootPath hasn't changed but the session has.
    void (workspaceSession.value);
    void expandFirstLevel(rootPath);
  }, [rootPath]);

  const entries = dirChildren.value.get(rootPath);

  // Use memoized sortEntries to prevent unnecessary re-sorting. Depending on
  // `entries` itself (not just `rootPath`) matters: `dirChildren` is
  // populated asynchronously by expandFirstLevel()/loadChildren() after
  // this component's first render, which does not change `rootPath`, so a
  // `[rootPath]`-only dependency array left `sortedEntries` frozen at its
  // first-render value ([], since `entries` was still undefined then) even
  // after the real listing arrived -- the sidebar file tree rendered
  // permanently empty.
  const sortedEntries = useMemo(() => {
    return entries ? memoizedSortEntries(entries) : [];
  }, [entries]);

  if (!entries) return null;

  return (
    <ul class="file-tree">
      {sortedEntries.map((entry) => (
        <FileTreeNode key={entry.path} entry={entry} onOpenFile={onOpenFile} />
      ))}
    </ul>
  );
}

// Memoized version of FileTreeNode to prevent unnecessary re-renders
const FileTreeNodeComponent = function FileTreeNode({
  entry,
  onOpenFile,
}: {
  entry: FsEntry;
  onOpenFile: (path: string, name: string) => void;
}) {
  const expanded = expandedDirs.value.has(entry.path);
  const children = dirChildren.value.get(entry.path);
  const selected = selectedPath.value === entry.path;

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

  // Memoize children rendering
  const renderedChildren = useMemo(() => {
    if (!entry.isDir || !expanded || !children) return null;
    const sortedChildren = memoizedSortEntries(children);
    return (
      <ul class="file-tree">
        {sortedChildren.map((child) => (
          <FileTreeNode key={child.path} entry={child} onOpenFile={onOpenFile} />
        ))}
      </ul>
    );
  }, [entry.isDir, expanded, children, onOpenFile]);

  return (
    <li>
      <button
        class={`file-tree-item ${selected ? "selected" : ""}`}
        onClick={handleClick}
        onContextMenu={(e) => {
          e.preventDefault();
          openContextMenu(entry, e.clientX, e.clientY);
        }}
      >
        <span class="file-tree-marker">{entry.isDir ? (expanded ? "▾" : "▸") : ""}</span>
        {entry.name}
      </button>
      {renderedChildren}
    </li>
  );
};

// Memoize the FileTreeNode component to prevent re-renders when props haven't changed
export const FileTreeNode = memo(FileTreeNodeComponent, (prevProps, nextProps) => {
  // Only re-render if entry or onOpenFile changes
  return (
    prevProps.entry.path === nextProps.entry.path &&
    prevProps.entry.name === nextProps.entry.name &&
    prevProps.entry.isDir === nextProps.entry.isDir &&
    prevProps.onOpenFile === nextProps.onOpenFile
  );
});
