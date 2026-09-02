import { linkIndex, fileNameFromPath } from "../linking/store";
import { requestOutlineReveal } from "../outline/outlineNavigation";
import { computeWorkspaceLinkDiagnostics, type WorkspaceLinkDiagnostic } from "./diagnostics";
import "./diagnostics.css";

interface DiagnosticsPanelProps {
  onOpenFile: (path: string, name: string) => void | Promise<void>;
  /** Called right after a finding is selected and a reveal has been
   * requested, mirroring OutlinePanel's/TaskHubPanel's own prop of the
   * same name: a host that needs to make the editor visible (e.g.
   * switching out of a preview-only view mode) can do so here. */
  onNavigated?: () => void;
}

function noteTitleFromPath(path: string): string {
  return fileNameFromPath(path).replace(/\.md$/i, "");
}

const STATUS_LABEL: Record<WorkspaceLinkDiagnostic["status"], string> = {
  broken: "Broken link",
  "missing-heading": "Missing heading",
  "ambiguous-heading": "Ambiguous heading",
};

/**
 * F03 Phase 1 (spec/f03-link-integrity-refactor-center.md section 8,
 * narrowed to a first slice per the roadmap entry's own scope note): a
 * read-only sidebar panel listing every broken, missing-heading, or
 * ambiguous-heading wikilink found across the workspace, a projection of
 * `diagnostics/diagnostics.ts`'s `computeWorkspaceLinkDiagnostics` over
 * the shared workspace metadata index (`linkIndex.value`), not a second
 * link-scanning implementation. Selecting a row opens the finding's
 * source note and reveals the exact `[[...]]` occurrence, reusing the
 * same MarkdownEditor `reveal` prop mechanism OutlinePanel and
 * TaskHubPanel already use (outline/outlineNavigation.ts), per this
 * claim's own instruction not to invent a second navigation mechanism.
 *
 * Deliberately flat, not grouped, matching TaskHubPanel Phase 1's own
 * structural precedent: entries are already sorted by source path (see
 * computeWorkspaceLinkDiagnostics), so findings from the same note read
 * as a visual group without a separate grouping UI. Filtering, grouping
 * controls, "Open target"/"Choose target"/"Preview fix"/"Dismiss for
 * session" actions (spec section 8.3), and every diagnostic type beyond
 * broken/missing-heading/ambiguous-heading (ambiguous-note, block-id,
 * attachment, canvas, orphan, case-mismatch) are explicitly out of scope
 * for this claim; see the roadmap entry and diagnostics.ts's own header
 * comment for why.
 */
export function DiagnosticsPanel({ onOpenFile, onNavigated }: DiagnosticsPanelProps) {
  const diagnostics = computeWorkspaceLinkDiagnostics(linkIndex.value);

  async function handleSelect(diagnostic: WorkspaceLinkDiagnostic) {
    const title = noteTitleFromPath(diagnostic.sourcePath);
    await onOpenFile(diagnostic.sourcePath, title);
    requestOutlineReveal(diagnostic.sourceFrom, diagnostic.sourceTo);
    onNavigated?.();
  }

  return (
    <section class="diagnostics-panel" aria-label="Link Diagnostics">
      <div class="diagnostics-header">
        <h2 class="diagnostics-heading">Link Diagnostics</h2>
        <span class="diagnostics-count">{diagnostics.length}</span>
      </div>
      {diagnostics.length === 0 ? (
        <p class="empty-hint">No broken or ambiguous links found in this workspace.</p>
      ) : (
        <ul class="diagnostics-list" aria-label="Link diagnostics">
          {diagnostics.map((diagnostic) => {
            const sourceTitle = noteTitleFromPath(diagnostic.sourcePath);
            const statusLabel = STATUS_LABEL[diagnostic.status];
            const candidateNote =
              diagnostic.status === "ambiguous-heading" && diagnostic.candidateHeadings
                ? ` (${diagnostic.candidateHeadings.length} candidates)`
                : "";
            return (
              <li key={diagnostic.id} class="diagnostics-item">
                <button
                  class="diagnostics-row"
                  onClick={() => void handleSelect(diagnostic)}
                  aria-label={`${statusLabel}: ${diagnostic.linkText}, in ${sourceTitle}`}
                >
                  <span class={`diagnostics-badge diagnostics-badge-${diagnostic.status}`}>
                    {statusLabel}
                    {candidateNote}
                  </span>
                  <span class="diagnostics-link-text">{diagnostic.linkText}</span>
                  <span class="diagnostics-note">{sourceTitle}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
