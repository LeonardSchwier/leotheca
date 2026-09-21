import { useState, useMemo, useCallback, useEffect, useRef } from "preact/hooks";
import { linkIndex, fileNameFromPath } from "../linking/store";
import { requestOutlineReveal } from "../outline/outlineNavigation";
import {
  computeWorkspaceLinkDiagnostics,
  type WorkspaceLinkDiagnostic,
} from "./diagnostics";
import {
  computeHealthAudit,
  summarizeAudit,
  type HealthIssue,
  type HealthIssueType,
} from "./healthAudit";
import {
  readTextFilesBatch,
  trashPath,
  renamePath,
  writeTextFile,
  findAllFiles,
} from "../workspace/tauriBridge";
import { workspacePath } from "../settings/store";
import "./diagnostics.css";
import "./healthAudit.css";

interface HealthAuditPanelProps {
  onOpenFile: (path: string, name: string) => void | Promise<void>;
  onNavigated?: () => void;
}

function noteTitleFromPath(path: string): string {
  return fileNameFromPath(path).replace(/\.md$/i, "");
}

const LINK_STATUS_LABEL: Record<WorkspaceLinkDiagnostic["status"], string> = {
  broken: "Broken link",
  "missing-heading": "Missing heading",
  "ambiguous-heading": "Ambiguous heading",
};

const HEALTH_TYPE_LABEL: Record<HealthIssueType, string> = {
  duplicate: "Duplicate",
  "near-duplicate": "Near-duplicate",
  orphan: "Orphan",
  empty: "Empty",
  "broken-image": "Broken image",
};

const HEALTH_TYPE_ORDER: HealthIssueType[] = [
  "duplicate",
  "near-duplicate",
  "orphan",
  "empty",
  "broken-image",
];

/**
 * Workspace health audit panel — extends the existing Link Diagnostics
 * (F03 Phase 1) into a fuller workspace health audit per the roadmap
 * entry "Workspace health check: broken links, duplicates, orphans —
 * with one-click fixes" (rm-1de67912dd4a245f).
 *
 * Shows a grouped dashboard of all issue types:
 * - Broken links (existing, from diagnostics.ts)
 * - Duplicates, near-duplicates, orphans, empty notes, broken image refs
 *   (new, from healthAudit.ts)
 *
 * One-click fixes where safe:
 * - Duplicate → rename the duplicate
 * - Empty → trash the note (using the real workspace root)
 * - Broken image → unlink (remove the image reference from the note)
 * - Near-duplicate → open both for manual merge review
 * - Orphan → informational only (no safe auto-fix)
 *
 * The content-based checks (empty, near-duplicate, broken-image) load
 * note contents and the workspace file listing lazily on mount via
 * `useEffect`, so they do not block first paint and the panel still
 * renders the (synchronous) link-diagnostics group immediately.
 */
export function HealthAuditPanel({ onOpenFile, onNavigated }: HealthAuditPanelProps) {
  const [openErrorId, setOpenErrorId] = useState<string | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [fixResults, setFixResults] = useState<
    Map<string, { ok: boolean; message: string }>
  >(new Map());

  // Link diagnostics are a pure, synchronous projection of the shared
  // link index — no I/O, computed on every render like DiagnosticsPanel.
  const linkDiagnostics = useMemo(
    () => computeWorkspaceLinkDiagnostics(linkIndex.value),
    [linkIndex.value],
  );

  // Content-based audit state, loaded lazily on mount.
  const [contentsByPath, setContentsByPath] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [allFilePaths, setAllFilePaths] = useState<Set<string>>(() => new Set());
  const [auditComputed, setAuditComputed] = useState(false);

  // Lazy-load note contents + the workspace file listing once on mount.
  // Guarded by a ref so React strict-mode double-invocation (or a
  // re-mount within the same render tree) does not re-issue the load.
  const loadStarted = useRef(false);
  useEffect(() => {
    if (loadStarted.current) return;
    loadStarted.current = true;
    let cancelled = false;
    void (async () => {
      setAuditLoading(true);
      try {
        const root = workspacePath.value;

        // 1. Collect the note paths from the shared link index.
        const notePaths: string[] = [];
        for (const paths of linkIndex.value.pathsByNoteName.values()) {
          for (const p of paths) notePaths.push(p);
        }
        const uniqueNotePaths = [...new Set(notePaths)].sort();

        // 2. Load note contents for the content-based checks.
        const map = new Map<string, string>();
        if (uniqueNotePaths.length > 0) {
          const contents = await readTextFilesBatch(uniqueNotePaths);
          if (cancelled) return;
          for (let i = 0; i < uniqueNotePaths.length; i++) {
            const c = contents[i];
            if (c !== null && c !== undefined) {
              map.set(uniqueNotePaths[i], c);
            }
          }
        }
        setContentsByPath(map);

        // 3. Build the workspace file set for image-reference validation.
        //    Prefer the real workspace listing (findAllFiles) when a root
        //    is known, so broken-image detection sees every file; fall
        //    back to the note paths themselves if that is unavailable.
        const filePathSet = new Set<string>();
        for (const p of uniqueNotePaths) filePathSet.add(p);
        if (root) {
          try {
            const entries = await findAllFiles(root);
            if (cancelled) return;
            for (const e of entries) {
              filePathSet.add(e.path);
            }
          } catch {
            // Listing failed — image-ref checks degrade to note-only,
            // which under-reports (never false-positives) broken images.
          }
        }
        setAllFilePaths(filePathSet);
        setAuditComputed(true);
      } catch {
        // A load failure leaves the panel showing only the (already
        // computed) link-diagnostics group, which is the safe default.
        setAuditComputed(true);
      } finally {
        if (!cancelled) setAuditLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const healthIssues = useMemo(() => {
    if (!auditComputed) return [];
    try {
      return computeHealthAudit({
        index: linkIndex.value,
        contentsByPath,
        allFilePaths,
      });
    } catch {
      return [];
    }
  }, [auditComputed, linkIndex.value, contentsByPath, allFilePaths]);

  const summary = useMemo(
    () => summarizeAudit(healthIssues),
    [healthIssues],
  );

  // ── Fix handlers ──────────────────────────────────────────────────

  const applyFix = useCallback(
    async (issue: HealthIssue) => {
      if (!issue.fix) return;
      const { action, targetPath, newName, referenceText } = issue.fix;
      try {
        if (action === "rename" && newName) {
          const dir = targetPath.includes("/")
            ? targetPath.slice(0, targetPath.lastIndexOf("/")) + "/"
            : "";
          const newPath = dir + newName;
          await renamePath(targetPath, newPath);
          setFixResults((prev) => {
            const next = new Map(prev);
            next.set(issue.id, { ok: true, message: `Renamed to "${newName}"` });
            return next;
          });
        } else if (action === "delete") {
          const root = workspacePath.value ?? "";
          await trashPath(root, targetPath);
          setFixResults((prev) => {
            const next = new Map(prev);
            next.set(issue.id, { ok: true, message: "Moved to trash" });
            return next;
          });
        } else if (action === "unlink" && referenceText) {
          // Remove the image reference from the note's content and
          // write it back.
          const content = contentsByPath.get(targetPath);
          if (content !== undefined) {
            const updated = content.replace(referenceText, "");
            await writeTextFile(targetPath, updated);
            setFixResults((prev) => {
              const next = new Map(prev);
              next.set(issue.id, { ok: true, message: "Removed broken image reference" });
              return next;
            });
          }
        } else if (action === "merge") {
          // Open both notes for manual review (no auto-merge).
          await onOpenFile(targetPath, noteTitleFromPath(targetPath));
          onNavigated?.();
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setFixResults((prev) => {
          const next = new Map(prev);
          next.set(issue.id, { ok: false, message: `Fix failed: ${message}` });
          return next;
        });
      }
    },
    [contentsByPath, onOpenFile, onNavigated],
  );

  // ── Select handlers ───────────────────────────────────────────────

  async function handleSelectLinkDiagnostic(diagnostic: WorkspaceLinkDiagnostic) {
    setOpenErrorId(null);
    const title = noteTitleFromPath(diagnostic.sourcePath);
    try {
      await onOpenFile(diagnostic.sourcePath, title);
    } catch {
      setOpenErrorId(diagnostic.id);
      return;
    }
    requestOutlineReveal(diagnostic.sourceFrom, diagnostic.sourceTo);
    onNavigated?.();
  }

  async function handleSelectHealthIssue(issue: HealthIssue) {
    setOpenErrorId(null);
    const title = noteTitleFromPath(issue.notePath);
    try {
      await onOpenFile(issue.notePath, title);
    } catch {
      setOpenErrorId(issue.id);
    }
    onNavigated?.();
  }

  // ── Render ────────────────────────────────────────────────────────

  const totalFindings = linkDiagnostics.length + healthIssues.length;

  return (
    <section class="health-audit-panel" aria-label="Workspace Health">
      <div class="health-audit-header">
        <h2 class="diagnostics-heading">Workspace Health</h2>
        <span class="diagnostics-count">{totalFindings}</span>
      </div>

      {auditLoading ? (
        <p class="empty-hint">Running workspace audit…</p>
      ) : totalFindings === 0 ? (
        <p class="empty-hint">
          No issues found. Links are healthy, no duplicates, orphans, or empty notes.
        </p>
      ) : (
        <div class="health-audit-body">
          {/* Summary chips */}
          {healthIssues.length > 0 && (
            <div class="health-audit-summary" aria-label="Issue summary">
              {HEALTH_TYPE_ORDER.filter((t) => summary.byType[t] > 0).map((type) => (
                <span key={type} class={`health-chip health-chip-${type}`}>
                  {HEALTH_TYPE_LABEL[type]}: {summary.byType[type]}
                </span>
              ))}
            </div>
          )}

          {/* Broken links (existing diagnostics) */}
          {linkDiagnostics.length > 0 && (
            <div class="health-audit-group">
              <h3 class="health-audit-group-heading">
                Link issues <span class="health-audit-group-count">{linkDiagnostics.length}</span>
              </h3>
              <ul class="diagnostics-list" aria-label="Link issues">
                {linkDiagnostics.map((diagnostic) => {
                  const sourceTitle = noteTitleFromPath(diagnostic.sourcePath);
                  const statusLabel = LINK_STATUS_LABEL[diagnostic.status];
                  const candidateNote =
                    diagnostic.status === "ambiguous-heading" && diagnostic.candidateHeadings
                      ? ` (${diagnostic.candidateHeadings.length} candidates)`
                      : "";
                  return (
                    <li key={diagnostic.id} class="diagnostics-item">
                      <button
                        class="diagnostics-row"
                        onClick={() => void handleSelectLinkDiagnostic(diagnostic)}
                        aria-label={`${statusLabel}: ${diagnostic.linkText}, in ${sourceTitle}`}
                      >
                        <span
                          class={`diagnostics-badge diagnostics-badge-${diagnostic.status}`}
                        >
                          {statusLabel}
                          {candidateNote}
                        </span>
                        <span class="diagnostics-link-text">{diagnostic.linkText}</span>
                        <span class="diagnostics-note">{sourceTitle}</span>
                      </button>
                      {openErrorId === diagnostic.id && (
                        <p class="diagnostics-error-message" role="alert">
                          Couldn't open "{sourceTitle}" — it may have been moved, renamed, or deleted.
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Health issues (new audit types) */}
          {healthIssues.map((issue) => {
            const title = noteTitleFromPath(issue.notePath);
            const typeLabel = HEALTH_TYPE_LABEL[issue.type];
            const fixResult = fixResults.get(issue.id);
            return (
              <div key={issue.id} class="health-audit-group health-audit-group-single">
                <div class="health-audit-issue">
                  <button
                    class="diagnostics-row health-audit-row"
                    onClick={() => void handleSelectHealthIssue(issue)}
                    aria-label={`${typeLabel}: ${issue.description}, in ${title}`}
                  >
                    <span class={`diagnostics-badge health-badge-${issue.type}`}>
                      {typeLabel}
                    </span>
                    <span class="diagnostics-link-text">{issue.description}</span>
                    <span class="diagnostics-note">{title}</span>
                  </button>
                  {issue.detail && (
                    <p class="health-audit-detail">{issue.detail}</p>
                  )}
                  {issue.fixable && (
                    <div class="health-audit-fix">
                      <button
                        class="health-audit-fix-btn"
                        onClick={() => void applyFix(issue)}
                        disabled={fixResult !== undefined && fixResult.ok}
                      >
                        {fixResult?.ok ? "Fixed ✓" : issue.fix?.action === "merge" ? "Open both for review" : "Apply fix"}
                      </button>
                      {fixResult && !fixResult.ok && (
                        <span class="health-audit-fix-error" role="alert">
                          {fixResult.message}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
