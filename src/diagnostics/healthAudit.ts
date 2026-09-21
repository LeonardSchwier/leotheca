/**
 * Workspace health audit — extends F03's link diagnostics with broader
 * workspace health checks: duplicate notes, orphaned notes, empty notes,
 * and broken image references.
 *
 * This module is a pure computation over the `LinkIndex` plus a set of
 * file contents, following the same precedent as `diagnostics.ts`
 * (read-only, no file I/O of its own, no second workspace walk).
 *
 * Issue types:
 * - **duplicate**: Two or more notes share the same normalized name
 *   (case-insensitive basename, ignoring the `.md` extension).
 * - **near-duplicate**: Two notes whose contents are ≥90% similar
 *   (simple Jaccard similarity over word sets).
 * - **orphan**: A note that has no inbound wikilinks AND no outbound
 *   wikilinks (completely disconnected from the graph).
 * - **empty**: A note whose body (after frontmatter) is blank or
 *   contains only whitespace.
 * - **broken-image**: A Markdown image reference `![alt](path)` where
 *   the referenced file does not exist in the workspace.
 */

import type { LinkIndex } from "../linking/store";

// ── Issue types ──────────────────────────────────────────────────────

export type HealthIssueType =
  | "duplicate"
  | "near-duplicate"
  | "orphan"
  | "empty"
  | "broken-image";

export interface HealthIssue {
  type: HealthIssueType;
  /** Stable identifier within one computation (type + path + detail). */
  id: string;
  /** The primary note path involved. */
  notePath: string;
  /** A short human-readable description. */
  description: string;
  /** Additional detail (e.g. the other duplicate's path, the broken image target). */
  detail?: string;
  /** Whether a one-click fix is available. */
  fixable: boolean;
  /** The fix to apply, if fixable. */
  fix?: {
    action: "rename" | "delete" | "create" | "unlink" | "merge";
    targetPath: string;
    /** New name for rename. */
    newName?: string;
    /** New content for create. */
    newContent?: string;
    /** For "unlink": the image reference text to remove. */
    referenceText?: string;
  };
}

// ── Input for the audit ─────────────────────────────────────────────

export interface HealthAuditInput {
  /** The current link index. */
  index: LinkIndex;
  /** Map of note path → its full text content (for content-based checks).
   *  Only markdown files are expected here. */
  contentsByPath: Map<string, string>;
  /** Set of all file paths in the workspace (for image ref validation).
   *  Includes non-markdown files. */
  allFilePaths: Set<string>;
}

// ── Helpers ─────────────────────────────────────────────────────────

/** Extract the normalized note name: basename without `.md`, lowercased. */
function noteNameFromPath(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base.replace(/\.md$/i, "").toLocaleLowerCase();
}

/** Strip YAML frontmatter block from content, return the body. */
function stripFrontmatter(content: string): string {
  if (content.startsWith("---\n")) {
    const end = content.indexOf("\n---", 4);
    if (end !== -1) {
      return content.slice(end + 4);
    }
  }
  return content;
}

/** Compute Jaccard similarity over word sets (simple tokenization). */
function jaccardSimilarity(a: string, b: string): number {
  const tokenize = (text: string) =>
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2),
    );
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Extract Markdown image references from content. */
function extractImageRefs(content: string): { alt: string; target: string; raw: string }[] {
  const refs: { alt: string; target: string; raw: string }[] = [];
  const regex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    // Skip inline images with external URLs (http://, https://, data:)
    const target = match[2].trim();
    if (/^(https?:\/\/|data:)/i.test(target)) continue;
    refs.push({ alt: match[1], target, raw: match[0] });
  }
  return refs;
}

// ── Main audit ──────────────────────────────────────────────────────

export function computeHealthAudit(input: HealthAuditInput): HealthIssue[] {
  const { index, contentsByPath, allFilePaths } = input;
  const issues: HealthIssue[] = [];

  // Collect all markdown note paths from the index.
  const notePaths = new Set<string>();
  for (const name of index.pathsByNoteName.keys()) {
    for (const p of index.pathsByNoteName.get(name) ?? []) {
      notePaths.add(p);
    }
  }
  // Also include paths that appear in backlinksByPath or contentsByPath.
  for (const p of index.backlinksByPath.keys()) notePaths.add(p);
  for (const p of contentsByPath.keys()) notePaths.add(p);

  const notePathList = [...notePaths].sort();

  // ── 1. Duplicates (same normalized name) ──────────────────────────
  for (const [name, paths] of index.pathsByNoteName) {
    if (paths.length >= 2) {
      for (let i = 0; i < paths.length; i++) {
        const path = paths[i];
        const others = paths.filter((_, j) => j !== i);
        issues.push({
          type: "duplicate",
          id: `duplicate:${path}`,
          notePath: path,
          description: `Duplicate name "${name}" shared with ${others.length - 1 + (i === 0 ? 1 : 0)} other note(s)`,
          detail: others.map((p) => `${p}`).join(", "),
          fixable: i > 0, // keep first, fix the rest
          fix:
            i > 0
              ? {
                  action: "rename",
                  targetPath: path,
                  newName: `${name} (${i + 1}).md`,
                }
              : undefined,
        });
      }
    }
  }

  // ── 2. Near-duplicates (Jaccard ≥ 0.9, different names) ──────────
  const nearDupSeen = new Set<string>();
  for (let i = 0; i < notePathList.length; i++) {
    for (let j = i + 1; j < notePathList.length; j++) {
      const a = notePathList[i];
      const b = notePathList[j];
      // Skip same-name pairs (already covered by duplicates).
      if (noteNameFromPath(a) === noteNameFromPath(b)) continue;
      const contentA = stripFrontmatter(contentsByPath.get(a) ?? "");
      const contentB = stripFrontmatter(contentsByPath.get(b) ?? "");
      if (!contentA.trim() || !contentB.trim()) continue;
      const sim = jaccardSimilarity(contentA, contentB);
      if (sim >= 0.9) {
        const pairKey = [a, b].sort().join("::");
        if (nearDupSeen.has(pairKey)) continue;
        nearDupSeen.add(pairKey);
        issues.push({
          type: "near-duplicate",
          id: `near-dup:${pairKey}`,
          notePath: a,
          description: `Near-duplicate of "${b.split("/").pop()}" (${Math.round(sim * 100)}% similar)`,
          detail: `Similarity: ${Math.round(sim * 100)}%`,
          fixable: true,
          fix: {
            action: "merge",
            targetPath: b,
          },
        });
      }
    }
  }

  // ── 3. Orphans (no inbound AND no outbound wikilinks) ────────────
  const hasOutboundLinks = (path: string) => {
    const links = index.wikiLinksByPath?.get(path);
    return (links?.length ?? 0) > 0;
  };
  const hasInboundLinks = (path: string) => {
    const backlinks = index.backlinksByPath.get(path);
    return (backlinks?.length ?? 0) > 0;
  };
  for (const path of notePathList) {
    if (!hasOutboundLinks(path) && !hasInboundLinks(path)) {
      issues.push({
        type: "orphan",
        id: `orphan:${path}`,
        notePath: path,
        description: "Orphan note: no inbound or outbound links",
        fixable: false,
      });
    }
  }

  // ── 4. Empty notes (body after frontmatter is blank) ─────────────
  for (const path of notePathList) {
    const content = contentsByPath.get(path);
    if (content === undefined) continue;
    const body = stripFrontmatter(content);
    if (!body.trim()) {
      issues.push({
        type: "empty",
        id: `empty:${path}`,
        notePath: path,
        description: "Empty note: no content after frontmatter",
        fixable: true,
        fix: {
          action: "delete",
          targetPath: path,
        },
      });
    }
  }

  // ── 5. Broken image references ────────────────────────────────────
  for (const [path, content] of contentsByPath) {
    const refs = extractImageRefs(content);
    for (const ref of refs) {
      // Resolve relative to the note's directory.
      const noteDir = path.includes("/")
        ? path.slice(0, path.lastIndexOf("/"))
        : "";
      const resolved = noteDir
        ? `${noteDir}/${ref.target.replace(/^\.\//, "")}`
        : ref.target.replace(/^\.\//, "");
      if (!allFilePaths.has(resolved)) {
        issues.push({
          type: "broken-image",
          id: `broken-image:${path}:${ref.target}`,
          notePath: path,
          description: `Broken image reference: ${ref.target}`,
          detail: `Resolved to: ${resolved}`,
          fixable: true,
          fix: {
            action: "unlink",
            targetPath: path,
            referenceText: ref.raw,
          },
        });
      }
    }
  }

  // Sort by type, then path, then id for stable output.
  const typeOrder: Record<HealthIssueType, number> = {
    duplicate: 0,
    "near-duplicate": 1,
    orphan: 2,
    empty: 3,
    "broken-image": 4,
  };
  return issues.sort(
    (a, b) =>
      typeOrder[a.type] - typeOrder[b.type] ||
      a.notePath.localeCompare(b.notePath) ||
      a.id.localeCompare(b.id),
  );
}

// ── Summary helper ──────────────────────────────────────────────────

export interface HealthAuditSummary {
  totalIssues: number;
  byType: Record<HealthIssueType, number>;
}

export function summarizeAudit(issues: HealthIssue[]): HealthAuditSummary {
  const byType: Record<HealthIssueType, number> = {
    duplicate: 0,
    "near-duplicate": 0,
    orphan: 0,
    empty: 0,
    "broken-image": 0,
  };
  for (const issue of issues) {
    byType[issue.type]++;
  }
  return { totalIssues: issues.length, byType };
}
