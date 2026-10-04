import { useEffect, useRef, useState } from "preact/hooks";
import { MarkdownPreview } from "../editor/MarkdownPreview";
import { OutlinePanel } from "../outline/OutlinePanel";
import { BacklinksPanel } from "../linking/BacklinksPanel";

interface ExternalFileViewProps {
  path: string;
  name: string;
  content: string;
  opening: boolean;
  /** Message from the most recent failed `onOpenAsWorkspace` attempt, or
   * `null` before any attempt or after a successful one closed this view.
   * Cleared by the caller on retry and on close. */
  error: string | null;
  onClose: () => void;
  onOpenAsWorkspace: () => void;
}

/** ROADMAP.md's "Open a Markdown file from outside the workspace via OS
 * file association": the read-only scratch view its acceptance sketch
 * calls for when an externally-opened note resolves outside every known
 * workspace (or no workspace is open at all yet). Deliberately never
 * editable and never routed through the ordinary tab/save machinery:
 * every save path in this app (workspace settings, autosave,
 * `writeWorkspaceTextFile`) assumes its target is inside the active
 * workspace root, and this note by definition is not, so presenting it as
 * an ordinary editable tab would either silently fail every save or
 * require quietly widening what "inside the workspace" means -- exactly
 * what the roadmap entry itself warns against. `onOpenAsWorkspace` is the
 * one sanctioned way out of read-only: once its parent folder becomes the
 * active workspace, the file is opened again through the ordinary path
 * and this view is no longer involved. */
export function ExternalFileView({
  path,
  name,
  content,
  opening,
  error,
  onClose,
  onOpenAsWorkspace,
}: ExternalFileViewProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [backlinksOpen, setBacklinksOpen] = useState(false);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div class="modal-overlay" onClick={onClose}>
      <div
        class="modal external-file-view"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="external-file-view-title"
        aria-modal="true"
      >
        <div class="modal-header">
          <h2 id="external-file-view-title">{name}</h2>
          <button ref={closeRef} class="modal-close" aria-label="Close" onClick={onClose}>
            x
          </button>
        </div>
        <p class="external-file-view-path">{path}</p>
        <div class="external-file-view-banner" role="status">
          <span>Opened from outside your workspace. Read-only.</span>
          <button onClick={onOpenAsWorkspace} disabled={opening}>
            {opening ? "Opening…" : "Open containing folder as a workspace"}
          </button>
        </div>
        {error && (
          <p role="alert" class="external-file-view-error">
            {error}
          </p>
        )}
        <div class="external-file-view-body">
          <div class="external-file-view-toolbar">
            <button
              class={`icon-button ${outlineOpen ? "active" : ""}`}
              aria-label={outlineOpen ? "Hide note outline" : "Show note outline"}
              title={outlineOpen ? "Hide outline" : "Show outline"}
              onClick={() => setOutlineOpen((v) => !v)}
            >
              <span aria-hidden="true">¶</span>
            </button>
            <button
              class={`icon-button ${backlinksOpen ? "active" : ""}`}
              aria-label={backlinksOpen ? "Hide backlinks" : "Show backlinks"}
              title={backlinksOpen ? "Hide backlinks" : "Show backlinks"}
              onClick={() => setBacklinksOpen((v) => !v)}
            >
              <span aria-hidden="true">↩</span>
            </button>
          </div>
          <div class="external-file-view-panels">
            <div class="external-file-view-preview">
              <MarkdownPreview source={content} headingLinksEnabled={false} />
            </div>
            {outlineOpen && (
              <OutlinePanel
                key={path}
                content={content}
                noteTitle={name.replace(/\.md$/i, "")}
                canInsertLink={false}
              />
            )}
            {backlinksOpen && (
              <BacklinksPanel
                path={path}
                onOpenFile={(_backlinkPath: string, _backlinkName: string) => {
                  /* external file: no workspace context to open from */
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
