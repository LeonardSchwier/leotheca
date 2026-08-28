import { useState } from "preact/hooks";
import { fileNameFromPath, linkIndex } from "../linking/store";
import { buildTagTree, type TagTreeNode } from "./tags";
import "./tags.css";

interface TagsPanelProps {
  onOpenFile: (path: string, name: string) => void;
}

function toggle(set: Set<string>, key: string): Set<string> {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

interface TagNodeRowProps {
  node: TagTreeNode;
  depth: number;
  expandedTags: Set<string>;
  onToggleExpanded: (fullTag: string) => void;
  openNoteLists: Set<string>;
  onToggleNotes: (fullTag: string) => void;
  onOpenFile: (path: string, name: string) => void;
}

function TagNodeRow({
  node,
  depth,
  expandedTags,
  onToggleExpanded,
  openNoteLists,
  onToggleNotes,
  onOpenFile,
}: TagNodeRowProps) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedTags.has(node.fullTag);
  const notesOpen = openNoteLists.has(node.fullTag);
  // A pure grouping node (e.g. "work" when only "work/project" is ever
  // used) has nothing of its own to list, so clicking its label falls
  // back to expanding children instead of doing nothing.
  const hasOwnNotes = node.paths.length > 0;

  return (
    <li class="tags-node">
      <div class="tags-row" style={{ paddingLeft: `${depth * 16}px` }}>
        <button
          class="tags-chevron"
          aria-label={
            hasChildren ? `${isExpanded ? "Collapse" : "Expand"} ${node.fullTag}` : undefined
          }
          disabled={!hasChildren}
          onClick={() => onToggleExpanded(node.fullTag)}
        >
          {hasChildren ? (isExpanded ? "▾" : "▸") : ""}
        </button>
        <button
          class="tags-label"
          onClick={() => (hasOwnNotes ? onToggleNotes(node.fullTag) : onToggleExpanded(node.fullTag))}
        >
          <span class="tags-name">{node.segment}</span>
          <span class="tags-count">{node.allPaths.length}</span>
        </button>
      </div>
      {notesOpen && hasOwnNotes && (
        <ul class="tags-notes" style={{ paddingLeft: `${(depth + 1) * 16}px` }}>
          {node.paths.map((path) => (
            <li key={path}>
              <button class="file-tree-item" onClick={() => onOpenFile(path, fileNameFromPath(path))}>
                {fileNameFromPath(path)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {hasChildren && isExpanded && (
        <ul class="tags-children">
          {node.children.map((child) => (
            <TagNodeRow
              key={child.fullTag}
              node={child}
              depth={depth + 1}
              expandedTags={expandedTags}
              onToggleExpanded={onToggleExpanded}
              openNoteLists={openNoteLists}
              onToggleNotes={onToggleNotes}
              onOpenFile={onOpenFile}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * The "tags: a list/pane, nesting" half of the market-solution-comparison
 * backlog's Tags item (`#tag` syntax and frontmatter tags: itself live in
 * tags/tags.ts, feeding linkIndex.pathsByTag). A `/`-separated tag
 * (`work/project`) nests under a collapsible parent row rather than
 * showing as one flat string, matching the wider note-taking ecosystem's
 * own nested tag panes. Clicking a row with notes of its own toggles an
 * inline list of them (mirroring BacklinksPanel's click-to-open list);
 * clicking a pure grouping row (or its chevron) toggles its children
 * instead, since it has nothing else to show.
 */
export function TagsPanel({ onOpenFile }: TagsPanelProps) {
  const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set());
  const [openNoteLists, setOpenNoteLists] = useState<Set<string>>(new Set());

  const tree = buildTagTree(linkIndex.value.pathsByTag);

  if (tree.length === 0) return <p class="empty-hint">No tags yet.</p>;

  return (
    <ul class="tags-list" aria-label="Tags">
      {tree.map((node) => (
        <TagNodeRow
          key={node.fullTag}
          node={node}
          depth={0}
          expandedTags={expandedTags}
          onToggleExpanded={(fullTag) => setExpandedTags((current) => toggle(current, fullTag))}
          openNoteLists={openNoteLists}
          onToggleNotes={(fullTag) => setOpenNoteLists((current) => toggle(current, fullTag))}
          onOpenFile={onOpenFile}
        />
      ))}
    </ul>
  );
}
