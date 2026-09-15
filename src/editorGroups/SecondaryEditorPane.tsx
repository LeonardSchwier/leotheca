import type { ViewMode } from "../settings/workspaceSettings";
import { TabBar } from "../workspace/TabBar";
import { MarkdownEditor } from "../editor/MarkdownEditor";
import { MarkdownPreview } from "../editor/MarkdownPreview";
import { ImageViewer } from "../editor/ImageViewer";
import { isNoteReadOnlyActive, setNoteReadOnly } from "../editor/noteReadOnly";
import type { OpenTab } from "../workspace/types";
import type { SaveCoordinator } from "../workspace/saveCoordinator";

const VIEW_MODES: ViewMode[] = ["source", "split", "preview"];

interface SecondaryEditorPaneProps {
  tabs: OpenTab[];
  pinnedPaths: string[];
  activePath: string | null;
  current: OpenTab | undefined;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  session: string | number | null;
  save: SaveCoordinator;
  workspaceRoot: string;
  attachmentsFolder: string;
  pasteImagesEnabled: boolean;
  snippetsEnabled: boolean;
  snippets: string;
  noteReadOnlyLockEnabled: boolean;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
  onCloseOthers: (path: string) => void;
  onCloseAll: () => void;
  onPin: (path: string) => void;
  onUnpin: (path: string) => void;
  onUnpinAndClose: (path: string) => void;
  onRename: (path: string, name: string) => void;
  onChange: (path: string, content: string) => void;
  onOpenFile: (path: string, name: string) => void;
  onMoveActiveTabHere: () => void;
  onClosePane: () => void;
  hasPrimaryActiveTab: boolean;
  onReorder: (path: string, beforePath: string | null) => void;
  onMoveLeft: (path: string) => void;
  onMoveRight: (path: string) => void;
}

/** F07 Phase 3's secondary editor group. A deliberately smaller sibling of
 * `App.tsx`'s primary pane, not a shared generic component: it reuses the
 * same tab bar, editor, and preview, with its own view mode (spec 5.4), but
 * -- disclosed scope for this phase -- does not yet include the primary
 * pane's HeadingBreadcrumbs/FrontmatterPropertiesPanel/SpeechRecognitionButton,
 * and shows a plain "not supported here yet" message instead of rendering a
 * canvas or ink note (CanvasView/InkView), rather than risk regressing any
 * of primary's own already-shipped, already-tested rendering path. */
export function SecondaryEditorPane({
  tabs,
  pinnedPaths,
  activePath,
  current,
  viewMode,
  onViewModeChange,
  session,
  save,
  workspaceRoot,
  attachmentsFolder,
  pasteImagesEnabled,
  snippetsEnabled,
  snippets,
  noteReadOnlyLockEnabled,
  onSelect,
  onClose,
  onCloseOthers,
  onCloseAll,
  onPin,
  onUnpin,
  onUnpinAndClose,
  onRename,
  onChange,
  onOpenFile,
  onMoveActiveTabHere,
  onClosePane,
  hasPrimaryActiveTab,
  onReorder,
  onMoveLeft,
  onMoveRight,
}: SecondaryEditorPaneProps) {
  const currentReadOnly =
    current?.kind === "text" && isNoteReadOnlyActive(current.content, noteReadOnlyLockEnabled);

  return (
    <main class="editor-area secondary-group" aria-label="Reference group">
      <TabBar
        tabs={tabs}
        pinnedPaths={pinnedPaths}
        activePath={activePath}
        onSelect={onSelect}
        onClose={onClose}
        onCloseOthers={onCloseOthers}
        onCloseAll={onCloseAll}
        onPin={onPin}
        onUnpin={onUnpin}
        onUnpinAndClose={onUnpinAndClose}
        onRename={onRename}
        onReorder={onReorder}
        onMoveLeft={onMoveLeft}
        onMoveRight={onMoveRight}
      />
      {current?.kind === "text" && noteReadOnlyLockEnabled && (
        <div class="note-lock-bar" role="status">
          <span>{currentReadOnly ? "This note is locked." : "This note is editable."}</span>
          <button
            type="button"
            onClick={() => {
              const content = setNoteReadOnly(current.content, !currentReadOnly);
              onChange(current.path, content);
            }}
          >
            {currentReadOnly ? "Unlock note" : "Lock note"}
          </button>
        </div>
      )}
      {current?.saveError && (
        <div class="save-error-bar" role="alert">
          <span>
            Couldn't save "{current.name}": {current.saveError}
          </span>
          <button type="button" onClick={() => void save.retry(session, current.path)}>
            Retry
          </button>
        </div>
      )}
      {current ? (
        current.kind === "image" ? (
          <ImageViewer path={current.path} />
        ) : current.kind === "canvas" || current.kind === "ink" ? (
          <div class="secondary-pane-unsupported">
            <p>
              {current.kind === "canvas" ? "Canvas" : "Ink"} notes aren't supported in the reference
              group yet.
            </p>
            <button type="button" onClick={() => onMoveActiveTabHere()}>
              Move to primary group
            </button>
          </div>
        ) : (
          <>
            <div class="view-mode-switch secondary-view-mode-switch">
              {VIEW_MODES.map((mode) => (
                <button
                  key={mode}
                  class={viewMode === mode ? "active" : ""}
                  title={mode[0].toUpperCase() + mode.slice(1)}
                  aria-label={mode[0].toUpperCase() + mode.slice(1)}
                  onClick={() => onViewModeChange(mode)}
                >
                  {mode[0].toUpperCase()}
                </button>
              ))}
            </div>
            <div class={`editor-panes mode-${viewMode}`}>
              {viewMode !== "preview" && (
                <MarkdownEditor
                  path={current.path}
                  value={current.content}
                  onChange={(value) => onChange(current.path, value)}
                  workspaceRoot={workspaceRoot}
                  attachmentsFolder={attachmentsFolder}
                  pasteImagesEnabled={pasteImagesEnabled}
                  readOnly={currentReadOnly}
                  snippetsEnabled={snippetsEnabled}
                  snippets={snippets}
                  searchQuery={current.searchQuery}
                />
              )}
              {viewMode !== "source" && (
                <MarkdownPreview
                  source={current.content}
                  onOpenFile={onOpenFile}
                  notePath={current.path}
                  searchQuery={current.searchQuery}
                />
              )}
            </div>
          </>
        )
      ) : (
        <div class="secondary-pane-empty">
          <p>No note open in this group.</p>
          <button type="button" onClick={onMoveActiveTabHere} disabled={!hasPrimaryActiveTab}>
            Move current tab here
          </button>
          <button type="button" onClick={onClosePane}>
            Close group
          </button>
        </div>
      )}
    </main>
  );
}
