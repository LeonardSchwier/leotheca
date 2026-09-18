/**
 * Deterministic data model for the time-ordered Note Graph. This is
 * deliberately UI-free: the existing force-directed GraphView remains the
 * shipped graph until a later slice can render this model accessibly.
 */

export interface TimelineNote {
  path: string;
  /** Filesystem modification time in milliseconds, or null when unavailable. */
  modified: number | null;
  /** UTC day for dated notes; null notes form the final undated section. */
  day: string | null;
  /** Stable lane chosen from the note's parent folder. */
  lane: number;
  incomingLinkCount: number;
}

export interface TimelineEdge {
  source: string;
  target: string;
}

export interface NoteTimeline {
  notes: TimelineNote[];
  edges: TimelineEdge[];
  laneKeys: string[];
}

function validMtime(value: number | undefined): number | null {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : null;
}

function utcDay(mtime: number | null): string | null {
  return mtime === null ? null : new Date(mtime).toISOString().slice(0, 10);
}

function folderForPath(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash > 0 ? path.slice(0, slash) : "";
}

/**
 * Builds the chronological model from the existing link index maps. It never
 * reads note content or invents a timestamp: invalid/missing mtime values are
 * retained as a deterministic undated section after all dated notes.
 */
export function buildNoteTimeline(
  backlinksByPath: Map<string, string[]>,
  mtimeByPath?: Map<string, number>,
): NoteTimeline {
  const paths = [...backlinksByPath.keys()].sort();
  const nodeSet = new Set(paths);
  const laneKeys = [...new Set(paths.map(folderForPath))].sort();
  const laneByKey = new Map(laneKeys.map((key, lane) => [key, lane]));
  const incomingLinkCount = new Map(paths.map((path) => [path, 0]));
  const edges: TimelineEdge[] = [];

  for (const target of paths) {
    for (const source of backlinksByPath.get(target) ?? []) {
      if (!nodeSet.has(source)) continue;
      edges.push({ source, target });
      incomingLinkCount.set(target, (incomingLinkCount.get(target) ?? 0) + 1);
    }
  }
  edges.sort((a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target));

  const notes = paths.map((path) => {
    const modified = validMtime(mtimeByPath?.get(path));
    return {
      path,
      modified,
      day: utcDay(modified),
      lane: laneByKey.get(folderForPath(path)) ?? 0,
      incomingLinkCount: incomingLinkCount.get(path) ?? 0,
    };
  });
  notes.sort((a, b) => {
    if (a.modified === null && b.modified === null) return a.path.localeCompare(b.path);
    if (a.modified === null) return 1;
    if (b.modified === null) return -1;
    return b.modified - a.modified || a.path.localeCompare(b.path);
  });

  return { notes, edges, laneKeys };
}
