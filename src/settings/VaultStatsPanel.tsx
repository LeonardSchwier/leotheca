import { useEffect, useState } from "preact/hooks";

export interface WorkspaceStats {
  folderCount: number;
  noteCount: number;
  imageCount: number;
  averageLinesPerNote: number;
  oldestNoteDate: number | null;
  newestNoteDate: number | null;
}

export type WorkspaceStatsLoader = (path: string) => Promise<WorkspaceStats>;

interface VaultStatsPanelProps {
  rootPath: string;
  loadStats?: WorkspaceStatsLoader;
}

// A null timestamp means two different things depending on whether there are
// any notes at all: genuinely no notes (accurate on every platform), or notes
// exist but this platform's stats implementation doesn't report per-file
// dates (Android's SAF-backed getWorkspaceStats always returns null here,
// even with hundreds of real notes present, see ROADMAP.md).
function formatDate(timestamp: number | null, noteCount: number): string {
  if (timestamp === null)
    return noteCount === 0 ? "No notes yet" : "Not available on this platform";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(timestamp * 1000),
  );
}

export function VaultStatsPanel({ rootPath, loadStats }: VaultStatsPanelProps) {
  const [stats, setStats] = useState<WorkspaceStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStats(null);
    setError(null);

    if (!loadStats)
      return () => {
        cancelled = true;
      };

    void loadStats(rootPath).then(
      (nextStats) => {
        if (!cancelled) setStats(nextStats);
      },
      (reason: unknown) => {
        if (!cancelled)
          setError(reason instanceof Error ? reason.message : String(reason));
      },
    );

    return () => {
      cancelled = true;
    };
  }, [loadStats, rootPath]);

  if (!loadStats) return null;
  if (error)
    return (
      <p class="empty-hint">Could not load workspace statistics: {error}</p>
    );
  if (!stats) return <p class="empty-hint">Loading workspace statistics...</p>;

  return (
    <section class="settings-section" aria-label="Workspace statistics">
      <h3>Workspace statistics</h3>
      <div class="settings-row">
        <div class="settings-label">Folders</div>
        <div class="settings-value">{stats.folderCount}</div>
      </div>
      <div class="settings-row">
        <div class="settings-label">Notes</div>
        <div class="settings-value">{stats.noteCount}</div>
      </div>
      <div class="settings-row">
        <div class="settings-label">Images</div>
        <div class="settings-value">{stats.imageCount}</div>
      </div>
      <div class="settings-row">
        <div class="settings-label">Average lines per note</div>
        <div class="settings-value">{stats.averageLinesPerNote.toFixed(1)}</div>
      </div>
      <div class="settings-row">
        <div class="settings-label">Oldest note</div>
        <div class="settings-value">
          {formatDate(stats.oldestNoteDate, stats.noteCount)}
        </div>
      </div>
      <div class="settings-row">
        <div class="settings-label">Newest note</div>
        <div class="settings-value">
          {formatDate(stats.newestNoteDate, stats.noteCount)}
        </div>
      </div>
    </section>
  );
}
