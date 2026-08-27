import { fileNameFromPath, linkIndex } from "./store";
import "./linking.css";

interface BacklinksPanelProps {
  path: string;
  onOpenFile: (path: string, name: string) => void;
}

export function BacklinksPanel({ path, onOpenFile }: BacklinksPanelProps) {
  const backlinks = linkIndex.value.backlinksByPath.get(path) ?? [];

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
                onClick={() =>
                  onOpenFile(backlinkPath, fileNameFromPath(backlinkPath))
                }
              >
                {fileNameFromPath(backlinkPath)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
