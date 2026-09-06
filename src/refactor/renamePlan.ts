/**
 * F03 Phase 2a's rename/move reference-rewrite planning engine
 * (spec/f03-link-integrity-refactor-center.md sections 9-10, narrowed to
 * a first slice per this claim's own roadmap entry). Given a single
 * note's old and new path, computes exactly which structured wikilinks
 * elsewhere in the workspace would need rewriting, and what their
 * rewritten text would be, without touching a single file: this module
 * only ever plans, never applies. The Define/Analyze/Review/Apply dialog
 * (spec 9.2), Markdown-link and application-metadata migration (spec
 * 6.2/6.4), and folder-level operations (spec 9.4, spec's own Phase 4)
 * are explicit follow-up scope, see the ROADMAP.md entry for the
 * "F03 Phase 2b" split this leaves behind.
 *
 * **Grounded in this codebase's real resolver, not the spec's fuller
 * model**: spec 7.1 describes a five-step resolution precedence
 * (workspace-relative path, referrer-relative path, basename, alias,
 * unresolved), but `linking/store.ts`'s actual `resolveWikilink` only
 * ever implements the last two, basename or alias, confirmed by reading
 * its real implementation rather than assumed from the spec. A
 * path-qualified or `.md`-suffixed wikilink target therefore never
 * resolves in this app today, to anything, which in turn means it can
 * never appear in this module's edit list either (a record has to
 * actually resolve to `oldPath` to be planned at all). This narrows two
 * of spec 7.3's serialization rules to non-issues rather than something
 * this module has to implement: "path-qualified wikilinks remain
 * path-qualified" and "`.md` extension presence is preserved" both only
 * matter for a link shape this resolver cannot produce a match for in
 * the first place. The same real-resolver fact also means spec 9.3's
 * "relative references inside the moved note because its base directory
 * changes" never applies here: a basename-only resolver has no concept
 * of a referrer's directory to begin with, so moving a note never
 * requires rewriting anything inside the moved note's own body, and this
 * module never reads or edits the note actually being renamed/moved.
 *
 * **Freshness (spec 9.5, "the preview is immutable... any file
 * modification after analysis invalidates the plan")**: `LinkIndex.
 * wikiLinksByPath` is used only as a fast candidate filter (which notes
 * are even worth reading), never trusted for the plan's actual source
 * ranges or resolution outcome, both of which are always recomputed
 * against a fresh read of each candidate note. A note that no longer
 * actually references `oldPath` by the time it's read (edited since the
 * index was last built, or since a previous candidate's read in the same
 * call) is silently excluded rather than planned against stale data.
 *
 * **A disclosed limit of "index as candidate filter" this doesn't
 * solve**: a note that had zero wikilinks at all when the index was last
 * built is never a candidate in the first place, so a reference added to
 * it since then is invisible to this function no matter how fresh its
 * own content read would be. Closing this needs a genuinely fresh
 * `rebuildLinkIndex` immediately before planning, deferred to whichever
 * later phase wires this into the real Analyze step (spec 9.2), not
 * attempted here.
 *
 * **Ambiguity upgrade (spec 7.3)**: spec 7.3 says a basename link that
 * would become ambiguous after the operation should be upgraded to a
 * path-qualified form instead of left alone. This module does not do
 * that upgrade, and marks the edit blocked instead, specifically because
 * the real resolver above cannot resolve a path-qualified target at all:
 * "upgrading" to one would silently turn a working link into a broken
 * one, worse than leaving it as a disclosed blocker for the user to
 * resolve by hand.
 */

import type { LinkIndex } from "../linking/store";
import { resolveWikiLinkTarget } from "../linking/wikiResolver";
import { parseWikiLinks, serializeWikiLink, type WikiLinkRecord } from "../linking/wikiSyntax";

function noteBasename(path: string): string {
  return path.split("/").pop()?.replace(/\.md$/i, "") ?? path;
}

function dirname(path: string): string {
  const parts = path.split("/");
  return parts.slice(0, -1).join("/");
}

/** A wikilink whose target resolves to `oldPath` and can be safely
 * rewritten to reference `newPath` instead. */
export interface PlannedWikiLinkEdit {
  /** The path of the note containing this reference (never `oldPath`
   * itself, see the module doc comment). */
  path: string;
  /** The reference's exact source range in `path`'s current (freshly
   * read) content. */
  from: number;
  to: number;
  oldText: string;
  newText: string;
}

/** A wikilink whose target resolves to `oldPath` but cannot be safely
 * rewritten automatically. */
export interface BlockedWikiLinkEdit {
  path: string;
  from: number;
  to: number;
  oldText: string;
  reason: string;
}

/**
 * F03 Phase 2b-ii: A Markdown-style link or image that references the note
 * being renamed and can be safely rewritten.
 */
export interface PlannedMarkdownLinkEdit {
  /** The path of the note containing this reference (never `oldPath` itself). */
  path: string;
  /** The reference's exact source range in `path`'s current content. */
  from: number;
  to: number;
  oldText: string;
  newText: string;
  /** Whether this is an image link (![alt](target)) vs regular link ([label](target)) */
  isImage: boolean;
}

/**
 * F03 Phase 2b-ii: A Markdown-style link whose target references the note
 * being renamed but cannot be safely rewritten automatically.
 */
export interface BlockedMarkdownLinkEdit {
  path: string;
  from: number;
  to: number;
  oldText: string;
  reason: string;
  isImage: boolean;
}

export interface RenamePlan {
  oldPath: string;
  newPath: string;
  edits: PlannedWikiLinkEdit[];
  blocked: BlockedWikiLinkEdit[];
  /**
   * F03 Phase 2b-ii: Markdown-style links `[label](target)` that reference
   * the note being renamed. Same structure as `edits` but for markdown links.
   */
  markdownEdits?: PlannedMarkdownLinkEdit[];
  /**
   * F03 Phase 2b-ii: Markdown-style links that cannot be safely rewritten.
   * Same structure as `blocked` but for markdown links.
   */
  markdownBlocked?: BlockedMarkdownLinkEdit[];
}

/** True when, after the rename/move, `newPath`'s own basename would
 * match more than one note in the workspace (spec 7.3's ambiguity
 * trigger). `index.pathsByNoteName` is a pre-rename snapshot, so
 * `oldPath` itself (about to stop existing at its current path) is
 * excluded from the collision count; every other path sharing the new
 * basename is real and unaffected by this operation. */
function wouldBeAmbiguousAfterRename(oldPath: string, newBasenameKey: string, index: LinkIndex): boolean {
  const existing = index.pathsByNoteName.get(newBasenameKey) ?? [];
  return existing.some((path) => path !== oldPath);
}

/**
 * Plans the structured-wikilink edits a rename or move of `oldPath` to
 * `newPath` would require. Assumes the caller has already validated the
 * operation itself is legal (a note actually exists at `oldPath`,
 * nothing already occupies `newPath`); this function only ever plans
 * reference rewrites, never the move itself or its own legality.
 *
 * `index` supplies the candidate-filtering `wikiLinksByPath`/
 * `pathsByNoteName` maps; per `linking/wikiResolver.ts`'s own documented
 * constraint (see `diagnostics.ts` for the identical note), the actual
 * resolution calls this function makes always read the live
 * `linking/store.ts` `linkIndex` signal, so `index` must already be
 * `linkIndex.value` for a correct result, the same requirement every
 * other consumer of `resolveWikiLinkTarget` already has.
 *
 * `readNote` is injected (rather than importing a platform bridge
 * directly) so this stays a plain, fully unit-testable function: no
 * Tauri/Capacitor bridge, no signals, just paths and strings in,
 * a plan out.
 */

/**
 * F03 Phase 2b-ii: Returns true if a markdown link or image target matches
 * the old note path (by basename comparison).
 */
function markdownLinkTargetsPath(target: string, oldPath: string): boolean {
  // Normalize both paths for comparison
  const oldBasenameKey = noteBasename(oldPath).toLocaleLowerCase();
  const targetBasenameKey = noteBasename(target).toLocaleLowerCase();
  return targetBasenameKey === oldBasenameKey;
}

/**
 * F03 Phase 2b-ii: Replace the target in a markdown link or image.
 * Preserves the label/alt text and any title attribute.
 */
function rewriteMarkdownLinkTarget(
  fullMatch: string,
  newTarget: string,
): string {
  // Parse: ![alt](target "title") or [label](target "title")
  // We need to preserve the label/alt and title parts
  const labelEnd = fullMatch.indexOf("](");
  const targetStart = fullMatch.indexOf("(", labelEnd) + 1;
  const targetEnd = fullMatch.indexOf(")", targetStart);
  
  if (labelEnd === -1 || targetStart === 0 || targetEnd === -1) {
    return fullMatch; // Fallback: return original if parsing fails
  }

  const labelPart = fullMatch.slice(0, labelEnd + 2); // "![alt](" or "[label]("
  const afterTarget = fullMatch.slice(targetEnd); // ""title")" or ")"
  
  return `${labelPart}${newTarget}${afterTarget}`;
}

/**
 * F03 Phase 2b-ii: Scan a note's content for markdown links and images that
 * reference the old path, and plan their rewrites.
 */
function planMarkdownLinks(
  content: string,
  path: string,
  oldPath: string,
  newPath: string,
  plan: RenamePlan
): void {
  // Match markdown links: [label](target) and images: ![alt](target)
  // Also handle titles: [label](target "title")
  const markdownLinkRegex = /(!\[[^\]]*\]|\[[^\]]*\])\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  
  let match;
  while ((match = markdownLinkRegex.exec(content)) !== null) {
    const fullMatch = match[0];
    const linkPart = match[1];
    const target = match[2];
    const isImage = linkPart.startsWith("!");
    
    // Skip if this doesn't reference our target note
    if (!markdownLinkTargetsPath(target, oldPath)) continue;
    
    // Compute the new target path

    
    // For markdown links, we need to compute the new relative path
    // This is the same logic as `resolvePathWithinWorkspace` but relative to the note's directory
    const relativeNewPath = computeRelativePath(path, newPath);
    
    if (relativeNewPath === null) {
      // Cannot compute relative path - this shouldn't happen for valid paths
      plan.markdownBlocked!.push({
        path,
        from: match.index,
        to: match.index + fullMatch.length,
        oldText: fullMatch,
        reason: "Cannot compute relative path to new location",
        isImage,
      });
      continue;
    }
    
    const newText = rewriteMarkdownLinkTarget(fullMatch, relativeNewPath);
    
    plan.markdownEdits!.push({
      path,
      from: match.index,
      to: match.index + fullMatch.length,
      oldText: fullMatch,
      newText,
      isImage,
    });
  }
}

/**
 * F03 Phase 2b-ii: Helper to compute relative path from one file to another.
 */
function computeRelativePath(fromPath: string, toPath: string): string | null {
  const fromDir = dirname(fromPath);
  const toDir = dirname(toPath);
  const toBasename = noteBasename(toPath);
  
  if (fromDir === toDir) {
    return toBasename;
  }
  
  // Check if toPath is in a subdirectory of fromDir
  if (toPath.startsWith(fromDir + "/")) {
    return toPath.slice(fromDir.length + 1);
  }
  
  // Check if fromDir is in a subdirectory of toDir  
  if (fromDir.startsWith(toDir + "/")) {
    const relativeFrom = fromDir.slice(toDir.length + 1);
    return "../".repeat(relativeFrom.split("/").length) + toBasename;
  }
  
  // Find common ancestor
  const fromParts = fromDir.split("/");
  const toParts = toDir.split("/");
  
  let commonLength = 0;
  while (commonLength < fromParts.length && commonLength < toParts.length && fromParts[commonLength] === toParts[commonLength]) {
    commonLength++;
  }
  
  const upCount = fromParts.length - commonLength;
  const downPath = toParts.slice(commonLength).join("/") + (toParts.length > commonLength ? "/" : "") + toBasename;
  
  return "../".repeat(upCount) + downPath;
}

export async function planNoteRename(
  oldPath: string,
  newPath: string,
  index: LinkIndex,
  readNote: (path: string) => Promise<string>,
): Promise<RenamePlan> {
  const plan: RenamePlan = { oldPath, newPath, edits: [], blocked: [], markdownEdits: [], markdownBlocked: [] };
  if (oldPath === newPath) return plan;

  const oldBasenameKey = noteBasename(oldPath).toLocaleLowerCase();
  const newBasename = noteBasename(newPath);
  const ambiguousAfterRename = wouldBeAmbiguousAfterRename(oldPath, newBasename.toLocaleLowerCase(), index);

  const candidates: Map<string, WikiLinkRecord[]> = index.wikiLinksByPath ?? new Map();
  for (const [path, records] of candidates) {
    if (path === oldPath) continue;
    const mightReference = records.some(
      (record) => record.noteTarget.trim().toLocaleLowerCase() === oldBasenameKey,
    );
    if (!mightReference) continue;

    let freshContent: string;
    try {
      freshContent = await readNote(path);
    } catch {
      // Unreadable note (deleted, permission change, sync mid-write):
      // nothing safe to plan against, silently excluded rather than
      // guessed at from the stale index.
      continue;
    }

    for (const record of parseWikiLinks(freshContent)) {
      if (record.noteTarget.trim().toLocaleLowerCase() !== oldBasenameKey) continue;
      const resolved = resolveWikiLinkTarget(record, { currentNotePath: path });
      if (resolved.notePath !== oldPath) continue;

      const from = record.sourceFrom;
      const to = record.sourceTo;
      const oldText = freshContent.slice(from, to);

      if (ambiguousAfterRename) {
        plan.blocked.push({
          path,
          from,
          to,
          oldText,
          reason: `Renaming to "${newBasename}" would make this reference ambiguous with another note that already has that name, and this workspace's wikilink resolver cannot yet target a specific note by its full path to disambiguate. Rename the other note first, or edit this reference by hand.`,
        });
        continue;
      }

      const newText = serializeWikiLink({
        noteTarget: newBasename,
        fragment: record.fragment,
        label: record.label,
      });
      plan.edits.push({ path, from, to, oldText, newText });
    }
  }

  // F03 Phase 2b-ii: Also scan for Markdown-style links in all candidate notes
  // We reuse the same candidate paths from the wikilink scan for efficiency
  for (const path of candidates.keys()) {
    if (path === oldPath) continue;
    
    let freshContent: string;
    try {
      freshContent = await readNote(path);
    } catch {
      continue;
    }
    
    planMarkdownLinks(freshContent, path, oldPath, newPath, plan);
  }

  return plan;
}
