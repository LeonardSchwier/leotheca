/**
 * Virtualized File Tree Component
 * 
 * A performance-optimized version of FileTree that uses Intersection Observer
 * to only render visible nodes, significantly improving performance for large
 * file trees.
 */

import { useEffect, useRef, useState, useMemo } from "preact/hooks";
import { memo } from "preact/compat";
import { 
  dirChildren, 
  dirname, 
  expandedDirs, 
  expandFirstLevel, 
  loadChildren,
  openContextMenu,
  selectedDir,
  selectedPath,
  memoizedSortEntries,
  toggleExpanded,
} from "./fileTreeStore";
import { workspaceSession } from "../settings/store";
import type { FsEntry } from "./types";

interface VirtualizedFileTreeProps {
  rootPath: string;
  onOpenFile: (path: string, name: string) => void;
  /** Height of the container in pixels */
  height?: number;
  /** Estimated height of each tree node in pixels */
  itemHeight?: number;
  /** Number of items to render above/below the visible area (buffer) */
  bufferItems?: number;
  /** Enable virtualization (default: true) */
  enabled?: boolean;
}

interface TreeNodeData {
  entry: FsEntry;
  depth: number;
  path: string; // Unique path for key
  children?: TreeNodeData[];
  isExpanded?: boolean;
  isVisible?: boolean;
}

/**
 * Flattens the hierarchical file tree into a flat array for virtualization.
 * Only includes entries that should be visible (expanded directories).
 */
function useFlattenedTree(rootPath: string, entries: FsEntry[] | undefined): TreeNodeData[] {
  const expanded = expandedDirs.value;
  const childrenMap = dirChildren.value;
  
  return useMemo(() => {
    if (!entries) return [];
    
    const sortedEntries = memoizedSortEntries(entries);
    const result: TreeNodeData[] = [];
    
    function flatten(entry: FsEntry, depth: number = 0, parentPath: string = rootPath): void {
      const nodePath = parentPath === rootPath ? entry.path : `${parentPath}/${entry.path}`;
      const node: TreeNodeData = {
        entry,
        depth,
        path: nodePath,
        isExpanded: entry.isDir ? expanded.has(entry.path) : undefined,
      };
      
      result.push(node);
      
      // If it's a directory and it's expanded, flatten its children
      if (entry.isDir && expanded.has(entry.path)) {
        const children = childrenMap.get(entry.path);
        if (children) {
          const sortedChildren = memoizedSortEntries(children);
          node.children = [];
          for (const child of sortedChildren) {
            flatten(child, depth + 1, entry.path);
          }
        }
      }
    }
    
    for (const entry of sortedEntries) {
      flatten(entry, 0, rootPath);
    }
    
    return result;
  }, [entries, expanded, childrenMap, rootPath]);
}

/**
 * Virtualized Tree Node Component - memoized to prevent unnecessary re-renders
 */
const VirtualTreeNode = memo(({
  node,
  onOpenFile,
  style,
}: {
  node: TreeNodeData;
  onOpenFile: (path: string, name: string) => void;
  style?: { [key: string]: string | number };
}) => {
  const selected = selectedPath.value === node.entry.path;
  
  const handleClick = async (e: MouseEvent) => {
    e.stopPropagation();
    selectedPath.value = node.entry.path;
    
    if (!node.entry.isDir) {
      selectedDir.value = dirname(node.entry.path);
      onOpenFile(node.entry.path, node.entry.name);
      return;
    }
    
    selectedDir.value = node.entry.path;
    
    // Load children if directory is not expanded and has no children loaded
    const children = dirChildren.value.get(node.entry.path);
    if (!node.isExpanded && !children) {
      await loadChildren(node.entry.path);
    }
    
    toggleExpanded(node.entry.path);
  };
  
  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    openContextMenu(node.entry, e.clientX, e.clientY);
  };
  
  return (
    <div 
      style={{
        ...style,
        paddingLeft: `${node.depth * 16}px`,
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
      }}
    >
      <button
        class={`file-tree-item ${selected ? "selected" : ""}`}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        style={{ width: '100%' }}
      >
        <span class="file-tree-marker">
          {node.entry.isDir ? (node.isExpanded ? "▾" : "▸") : ""}
        </span>
        {node.entry.name}
      </button>
    </div>
  );
}, (prevProps: { node: TreeNodeData; onOpenFile: (path: string, name: string) => void; style?: { [key: string]: string | number } }, nextProps: { node: TreeNodeData; onOpenFile: (path: string, name: string) => void; style?: { [key: string]: string | number } }) => {
  // Custom comparison function for memo
  return (
    prevProps.node.entry.path === nextProps.node.entry.path &&
    prevProps.node.entry.name === nextProps.node.entry.name &&
    prevProps.node.entry.isDir === nextProps.node.entry.isDir &&
    prevProps.node.depth === nextProps.node.depth &&
    prevProps.node.isExpanded === nextProps.node.isExpanded &&
    prevProps.onOpenFile === nextProps.onOpenFile
  );
});

/**
 * Virtualized File Tree Component
 * 
 * Uses a simple virtualization technique where only visible nodes are rendered.
 * This is particularly effective for large file trees where most nodes are not
 * visible in the viewport.
 */
export function VirtualizedFileTree({
  rootPath,
  onOpenFile,
  height = 400,
  itemHeight = 24,
  bufferItems = 5,
  enabled = true,
}: VirtualizedFileTreeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [visibleRange, setVisibleRange] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  
  const entries = dirChildren.value.get(rootPath);
  const flattenedNodes = useFlattenedTree(rootPath, entries);
  
  // Re-expand first level when rootPath changes
  useEffect(() => {
    void (workspaceSession.value);
    void expandFirstLevel(rootPath);
  }, [rootPath]);
  
  // Calculate visible range based on scroll position
  useEffect(() => {
    if (!containerRef.current) return;
    
    const containerHeight = containerRef.current.clientHeight || height;
    const totalNodes = flattenedNodes.length;
    const itemsInView = Math.ceil(containerHeight / itemHeight);
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - bufferItems);
    const endIndex = Math.min(totalNodes, startIndex + itemsInView + bufferItems * 2);
    
    setVisibleRange({ start: startIndex, end: endIndex });
  }, [scrollTop, flattenedNodes.length, height, itemHeight, bufferItems]);
  
  // Handle scroll events
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };
  
  // If virtualization is disabled or there are no nodes, fall back to regular rendering
  if (!enabled || flattenedNodes.length === 0) {
    return (
      <ul class="file-tree">
        {entries && memoizedSortEntries(entries).map((entry) => (
          <VirtualTreeNode 
            key={entry.path} 
            node={{ entry, depth: 0, path: entry.path }} 
            onOpenFile={onOpenFile}
          />
        ))}
      </ul>
    );
  }
  
  // Calculate the total height for scroll container
  const totalHeight = flattenedNodes.length * itemHeight;
  
  // Render only visible nodes
  const visibleNodes = flattenedNodes.slice(visibleRange.start, visibleRange.end);
  
  return (
    <div
      ref={containerRef}
      class="file-tree-virtualized"
      style={{
        height: `${height}px`,
        overflowY: 'auto',
        position: 'relative',
        contain: 'strict',
      }}
      onScroll={handleScroll}
    >
      <div 
        style={{
          height: `${totalHeight}px`,
          position: 'relative',
          width: '100%',
        }}
      >
        {visibleNodes.map((node, index) => {
          const actualIndex = visibleRange.start + index;
          return (
            <VirtualTreeNode
              key={node.path}
              node={node}
              onOpenFile={onOpenFile}
              style={{
                transform: `translateY(${actualIndex * itemHeight}px)`,
                height: `${itemHeight}px`,
                width: '100%',
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

/**
 * Adaptive Virtualized File Tree
 * 
 * Automatically decides whether to use virtualization based on the number of entries.
 * For small trees (< 100 entries), uses regular rendering for simplicity.
 * For larger trees, switches to virtualized rendering for performance.
 */
export function AdaptiveVirtualizedFileTree({
  rootPath,
  onOpenFile,
  ...props
}: VirtualizedFileTreeProps) {
  const entries = dirChildren.value.get(rootPath);
  const entriesCount = entries?.length || 0;
  
  // Use virtualization only for larger trees
  const shouldVirtualize = entriesCount > 100;
  
  if (shouldVirtualize) {
    return (
      <VirtualizedFileTree 
        rootPath={rootPath} 
        onOpenFile={onOpenFile} 
        enabled={true} 
        {...props}
      />
    );
  }
  
  // For smaller trees, use the regular FileTree
  return (
    <div class="file-tree">
      {entries && memoizedSortEntries(entries).map((entry) => (
        <VirtualTreeNode 
          key={entry.path} 
          node={{ entry, depth: 0, path: entry.path }} 
          onOpenFile={onOpenFile}
        />
      ))}
    </div>
  );
}