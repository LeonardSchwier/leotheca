import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
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
  onOpenFile: (path: string, name: string) => void | Promise<void>;
}

/** Collect all visible (rendered) treeitem buttons in DOM order. */
function getVisibleTreeItems(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[role="treeitem"]'));
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

  const treeRef = useRef<HTMLUListElement>(null);

  // Set the first treeitem's tabindex to 0 on mount so Tab key can enter
  // the tree. After that, roving tabindex is managed by keydown handler.
  useEffect(() => {
    const tree = treeRef.current;
    if (!tree) return;
    const firstItem = tree.querySelector<HTMLElement>('[role="treeitem"]');
    if (firstItem) {
      firstItem.setAttribute("tabindex", "0");
    }
  }, [entries]);

  // Keyboard navigation handler attached to the tree container.
  // Uses roving tabindex: only the focused treeitem has tabindex=0.
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const tree = treeRef.current;
      if (!tree) return;

      const treeItems = getVisibleTreeItems(tree);
      if (treeItems.length === 0) return;

      // Find the currently focused item within the tree.
      let focusedIndex = -1;
      for (let i = 0; i < treeItems.length; i++) {
        if (treeItems[i] === document.activeElement) {
          focusedIndex = i;
          break;
        }
      }

      const focusItem = (idx: number) => {
        const clamped = Math.max(0, Math.min(idx, treeItems.length - 1));
        // Update roving tabindex
        treeItems.forEach((el) => el.setAttribute("tabindex", "-1"));
        treeItems[clamped].setAttribute("tabindex", "0");
        treeItems[clamped].focus();
      };

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          focusItem(focusedIndex + 1);
          return;
        case "ArrowUp":
          e.preventDefault();
          focusItem(focusedIndex - 1);
          return;
        case "Home":
          e.preventDefault();
          focusItem(0);
          return;
        case "End":
          e.preventDefault();
          focusItem(treeItems.length - 1);
          return;
        case "ArrowRight": {
          e.preventDefault();
          if (focusedIndex === -1) return;
          const item = treeItems[focusedIndex];
          const path = item.getAttribute("data-tree-path");
          if (!path) return;
          // If collapsed, expand; if already expanded, move to first child.
          if (item.getAttribute("aria-expanded") === "false") {
            item.click();
          } else if (item.getAttribute("aria-expanded") === "true") {
            const firstChild = treeItems[focusedIndex + 1];
            // Only move down if the next item is actually a child (deeper indent).
            if (firstChild && parseInt(firstChild.getAttribute("data-tree-depth") || "0") > parseInt(item.getAttribute("data-tree-depth") || "0")) {
              focusItem(focusedIndex + 1);
            }
          }
          return;
        }
        case "ArrowLeft": {
          e.preventDefault();
          if (focusedIndex === -1) return;
          const item = treeItems[focusedIndex];
          const path = item.getAttribute("data-tree-path");
          if (!path) return;
          if (item.getAttribute("aria-expanded") === "true") {
            // Collapse this folder.
            item.click();
          } else {
            // Move to parent: find the nearest preceding item with lower depth.
            const myDepth = parseInt(item.getAttribute("data-tree-depth") || "0");
            for (let i = focusedIndex - 1; i >= 0; i--) {
              if (parseInt(treeItems[i].getAttribute("data-tree-depth") || "0") < myDepth) {
                focusItem(i);
                return;
              }
            }
            // No parent found (we're at root level); stay put.
          }
          return;
        }
        case "Enter":
        case " ":
          e.preventDefault();
          if (focusedIndex !== -1) {
            treeItems[focusedIndex].click();
          }
          return;
        default:
          return;
      }
    },
    []
  );

  if (!entries) return null;

  return (
    <ul
      ref={treeRef}
      class="file-tree"
      role="tree"
      aria-label="File tree"
      onKeyDown={handleKeyDown}
    >
      {sortedEntries.map((entry) => (
        <FileTreeNode
          key={entry.path}
          entry={entry}
          onOpenFile={onOpenFile}
          depth={0}
        />
      ))}
    </ul>
  );
}

// Memoized version of FileTreeNode to prevent unnecessary re-renders
const FileTreeNodeComponent = function FileTreeNode({
  entry,
  onOpenFile,
  depth = 0,
}: {
  entry: FsEntry;
  onOpenFile: (path: string, name: string) => void | Promise<void>;
  depth?: number;
}) {
  const expanded = expandedDirs.value.has(entry.path);
  const children = dirChildren.value.get(entry.path);
  const selected = selectedPath.value === entry.path;
  const [openError, setOpenError] = useState(false);

  // Initialize roving tabindex: only the first treeitem in the tree gets
  // tabindex=0. We handle this by defaulting to -1 and letting the tree
  // container's keydown handler manage focus.
  const handleClick = async () => {
    selectedPath.value = entry.path;
    if (!entry.isDir) {
      selectedDir.value = dirname(entry.path);
      setOpenError(false);
      try {
        await onOpenFile(entry.path, entry.name);
      } catch {
        setOpenError(true);
      }
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
      <ul class="file-tree" role="group" aria-label={entry.name}>
        {sortedChildren.map((child) => (
          <FileTreeNode
            key={child.path}
            entry={child}
            onOpenFile={onOpenFile}
            depth={depth + 1}
          />
        ))}
      </ul>
    );
  }, [entry.isDir, entry.name, expanded, children, onOpenFile, depth]);

  return (
    <li role="none">
      <button
        class={`file-tree-item ${selected ? "selected" : ""}`}
        role="treeitem"
        aria-expanded={entry.isDir ? expanded : undefined}
        aria-selected={selected}
        data-tree-path={entry.path}
        data-tree-depth={depth}
        tabindex={-1}
        onClick={handleClick}
        onContextMenu={(e) => {
          e.preventDefault();
          openContextMenu(entry, e.clientX, e.clientY);
        }}
      >
        <span class="file-tree-marker">{entry.isDir ? (expanded ? "▾" : "▸") : ""}</span>
        {entry.name}
      </button>
      {openError && (
        <p class="file-tree-open-error" role="alert">
          Couldn't open "{entry.name}" — it may have been moved, renamed, or deleted.
        </p>
      )}
      {renderedChildren}
    </li>
  );
};

// Memoize the FileTreeNode component to prevent re-renders when props haven't changed
export const FileTreeNode = memo(FileTreeNodeComponent, (prevProps, nextProps) => {
  // Only re-render if entry, onOpenFile, or depth changes
  return (
    prevProps.entry.path === nextProps.entry.path &&
    prevProps.entry.name === nextProps.entry.name &&
    prevProps.entry.isDir === nextProps.entry.isDir &&
    prevProps.onOpenFile === nextProps.onOpenFile &&
    prevProps.depth === nextProps.depth
  );
});
