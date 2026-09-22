import { useState } from "preact/hooks";
import { fileNameFromPath, linkIndex } from "../linking/store";
import { buildTagTree, type TagTreeNode } from "./tags";
import { EmptyState } from "../ui/EmptyState";
import "./tags.css";

interface TagsPanelProps {
  onOpenFile: (path: string, name: string) => void | Promise<void>;
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
  openErrorPath: string | null;
  onOpenFile: (path: string, name: string) => void | Promise<void>;
  onSetOpenError: (path: string | null) => void;
}

function TagNodeRow({
  node,
  depth,
  expandedTags,
  onToggleExpanded,
  openNoteLists,
  onToggleNotes,
  openErrorPath,
  onOpenFile,
  onSetOpenError,
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
              <button
                class="file-tree-item"
                onClick={async () => {
                  onSetOpenError(null);
                  try {
                    await onOpenFile(path, fileNameFromPath(path));
                  } catch {
                    onSetOpenError(path);
                  }
                }}
              >
                {fileNameFromPath(path)}
              </button>
              {openErrorPath === path && (
                <p class="tags-error-message" role="alert">
                  Couldn't open "{fileNameFromPath(path)}" — it may have been moved, renamed, or deleted.
                </p>
              )}
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
              openErrorPath={openErrorPath}
              onOpenFile={onOpenFile}
              onSetOpenError={onSetOpenError}
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
  const [openErrorPath, setOpenErrorPath] = useState<string | null>(null);

  const tree = buildTagTree(linkIndex.value.pathsByTag);

  if (tree.length === 0)
    return (
      <EmptyState
        size="sm"
        icon="tag"
        title="No tags yet."
        description="Add a #tag or frontmatter tag to a note to organize it here."
      />
    );

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
          openErrorPath={openErrorPath}
          onOpenFile={onOpenFile}
          onSetOpenError={setOpenErrorPath}
        />
      ))}
    </ul>
  );
}
