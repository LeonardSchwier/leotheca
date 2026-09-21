/**
 * Workspace-level health audit (roadmap rm-1de67912dd4a245f, Phase 1).
 *
 * Computes findings that are properties of the *workspace as a whole*,
 * not of individual wikilinks (those live in `diagnostics.ts`):
 *   - **orphaned notes** — notes that have no incoming wikilink and no
 *     outgoing wikilink, and are not the workspace's entry point (no
 *     incoming backlinks from any other note). A note is orphaned when
 *     `backlinksByPath.get(path)` is empty AND the note has no outgoing
 *     wikilinks of its own. Notes that appear as targets of wikilinks
 *     from other notes are not orphans.
 *   - **empty notes** — notes whose Markdown body (frontmatter stripped)
 *     contains no non-whitespace characters. Detected from
 *     `index.noteCount` vs. the set of notes that have any content
 *     signal (headings, wikilinks, or non-empty task lists); a note with
 *     none of those is treated as empty. This is an approximation that
 *     works without re-reading every file: a note that has any heading,
 *     wikilink, or task item is definitely non-empty; a note with none
 *     of those is flagged as a candidate for the user to inspect.
 *
 * Pure computation over `LinkIndex`, same pattern as `diagnostics.ts`:
 * no file I/O, no store mutation. Results are deterministic and sorted
 * by note path for stable list keys.
 */

import type { LinkIndex } from "../linking/store";

/** A single workspace-level finding from the health audit. */
export interface WorkspaceHealthFinding {
  /** Stable within one computation; suitable as a React list key. */
  id: string;
  kind: "orphaned" | "empty";
  /** The note's full path. */
  notePath: string;
}

/**
 * Computes all workspace-level health findings (orphaned + empty notes)
 * from the current `LinkIndex`.
 *
 * Orphaned-note logic:
 *   A note is orphaned when it has zero backlinks (no other note links
 *   to it) AND it emits zero wikilinks itself. Notes that link out to
 *   other notes are part of the link graph and are not orphaned; notes
 *   that are link targets are also not orphaned. A note that both links
 *   out and is linked to is clearly integrated. A note with neither is
 *   truly isolated.
 *
 *   In a single-note workspace, that one note is trivially "orphaned"
 *   by this definition, which is the correct signal for a user who has
 *   just started and hasn't connected any notes yet.
 *
 * Empty-note logic:
 *   A note is a candidate-empty when it has no headings, no wikilinks,
 *   and no tasks. This is an approximation: a note containing only
 *   plain prose text with no structural elements would also be flagged.
 *   The finding label says "appears empty" so the user can open it and
 *   confirm. Notes with only frontmatter and no body text are the
 *   primary target: `noteCount` counts them, but none of the
 *   content-signal maps have an entry for them.
 */
export function computeWorkspaceHealthAudit(index: LinkIndex): WorkspaceHealthFinding[] {
  const findings: WorkspaceHealthFinding[] = [];
  const noteCount = index.noteCount ?? 0;

  // Collect the set of all known note paths from every map that keys by
  // path. `pathsByNoteName` is the canonical "all notes in the workspace"
  // source, so we enumerate its values.
  const allNotePaths: Set<string> = new Set();
  for (const paths of index.pathsByNoteName.values()) {
    for (const p of paths) allNotePaths.add(p);
  }

  if (noteCount === 0 || allNotePaths.size === 0) return findings;

  const wikiLinksByPath = index.wikiLinksByPath ?? new Map();
  const headingsByPath = index.headingsByPath ?? new Map();
  const tasksByPath = index.tasksByPath ?? new Map();
  const backlinksByPath = index.backlinksByPath ?? new Map();

  for (const notePath of allNotePaths) {
    const hasIncoming = (backlinksByPath.get(notePath) ?? []).length > 0;
    const hasOutgoing = (wikiLinksByPath.get(notePath) ?? []).length > 0;

    // Orphaned: no links in AND no links out.
    if (!hasIncoming && !hasOutgoing) {
      findings.push({ id: `orphan:${notePath}`, kind: "orphaned", notePath });
    }

    // Empty (approximate): no headings, no wikilinks, no tasks.
    const hasHeadings = (headingsByPath.get(notePath) ?? []).length > 0;
    const hasTasks = (tasksByPath.get(notePath) ?? []).length > 0;
    if (!hasHeadings && !hasOutgoing && !hasTasks) {
      findings.push({ id: `empty:${notePath}`, kind: "empty", notePath });
    }
  }

  return findings.sort((a, b) => a.notePath.localeCompare(b.notePath));
}

/**
 * Grouped view for the dashboard: one entry per finding kind with its
 * count and the list of note paths, in path-sorted order.
 */
export interface HealthAuditGroup {
  kind: "orphaned" | "empty";
  label: string;
  count: number;
  notePaths: string[];
}

export function groupHealthAuditFindings(
  findings: WorkspaceHealthFinding[],
): HealthAuditGroup[] {
  const byKind = new Map<string, WorkspaceHealthFinding[]>();
  for (const f of findings) {
    const list = byKind.get(f.kind) ?? [];
    list.push(f);
    byKind.set(f.kind, list);
  }

  const groups: HealthAuditGroup[] = [];
  const kindOrder: Array<{ kind: "orphaned" | "empty"; label: string }> = [
    { kind: "orphaned", label: "Orphaned notes" },
    { kind: "empty", label: "Appears empty" },
  ];

  for (const { kind, label } of kindOrder) {
    const list = byKind.get(kind);
    if (!list || list.length === 0) continue;
    const notePaths = list.map((f) => f.notePath).sort((a, b) => a.localeCompare(b));
    groups.push({
      kind,
      label,
      count: list.length,
      notePaths,
    });
  }

  return groups;
}
