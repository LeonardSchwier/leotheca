import { useState } from "preact/hooks";
import { fileNameFromPath, linkIndex } from "./store";
import "./linking.css";

interface BacklinksPanelProps {
  path: string;
  onOpenFile: (path: string, name: string) => void | Promise<void>;
}

export function BacklinksPanel({ path, onOpenFile }: BacklinksPanelProps) {
  const backlinks = linkIndex.value.backlinksByPath.get(path) ?? [];
  // linkIndex.value is a point-in-time snapshot, rebuilt only on
  // workspace-load/save, not on every external filesystem change, so a
  // backlink's source note can be deleted, renamed, or moved outside the
  // app while this panel is still showing it. Tracks which single
  // backlink's open attempt most recently failed, so its own row can show
  // an inline error instead of leaving a rejected onOpenFile unhandled and
  // the click silently doing nothing (matching bookmarks/BookmarksPanel.tsx
  // and diagnostics/DiagnosticsPanel.tsx's own fix for the identical
  // unawaited-onOpenFile shape).
  const [openErrorPath, setOpenErrorPath] = useState<string | null>(null);

  async function handleOpen(backlinkPath: string) {
    setOpenErrorPath(null);
    try {
      await onOpenFile(backlinkPath, fileNameFromPath(backlinkPath));
    } catch {
      setOpenErrorPath(backlinkPath);
    }
  }

  return (
    <section class="backlinks-panel" aria-label="Backlinks">
      <h2 class="backlinks-heading">Backlinks</h2>
      {backlinks.length === 0 ? (
        <p class="empty-hint">No notes link here.</p>
      ) : (
        <ul class="backlinks-list">
          {backlinks.map((backlinkPath) => (
            <li key={backlinkPath}>
              <button
                class="file-tree-item"
                onClick={() => void handleOpen(backlinkPath)}
              >
                {fileNameFromPath(backlinkPath)}
              </button>
              {openErrorPath === backlinkPath && (
                <p class="backlinks-error-message" role="alert">
                  Couldn't open "{fileNameFromPath(backlinkPath)}" — it may have been moved, renamed, or deleted.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
