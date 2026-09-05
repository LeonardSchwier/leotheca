import type { RenamePlan } from "./renamePlan";
import "./renamePreview.css";

interface RenamePreviewDialogProps {
  oldPath: string;
  newPath: string;
  plan: RenamePlan;
  onContinue: () => void;
  onCancel: () => void;
}

/**
 * F03 Phase 2b-i's read-only Review step (spec/f03-link-integrity-refactor-center.md
 * section 9.2), shown by `useRenamePreview.ts` only when the plan actually
 * has something to review. Continuing performs no mutation itself: the
 * caller's own already-existing `renameEntry` call (unchanged by this
 * phase) is what actually renames the file and, today, still leaves every
 * listed link exactly as shown here, not yet rewritten automatically. The
 * Apply step that would do that rewrite (spec's own Phase 3, "Transaction
 * executor and recovery": mutation lock, preflight, journal, rollback) is
 * explicit follow-up scope, kept out of this dialog entirely rather than
 * a button that would need to stay disabled, per this feature's own
 * "keep Apply disabled until journal and rollback tests pass" instruction.
 */
export function RenamePreviewDialog({ oldPath, newPath, plan, onContinue, onCancel }: RenamePreviewDialogProps) {
  return (
    <div class="modal-overlay" onClick={onCancel}>
      <div class="modal rename-preview-dialog" onClick={(e) => e.stopPropagation()}>
        <h2>Review rename</h2>
        <p class="rename-preview-summary">
          Renaming <code>{oldPath}</code> to <code>{newPath}</code>.
        </p>
        {plan.edits.length > 0 && (
          <div class="rename-preview-section">
            <h3>
              {plan.edits.length} link{plan.edits.length === 1 ? "" : "s"} elsewhere will still need updating
            </h3>
            <p class="rename-preview-hint">
              Renaming does not rewrite these yet; update them by hand after continuing.
            </p>
            <ul class="rename-preview-list">
              {plan.edits.map((edit, index) => (
                <li key={`${edit.path}-${index}`}>
                  <span class="rename-preview-path">{edit.path}</span>: <code>{edit.oldText}</code> →{" "}
                  <code>{edit.newText}</code>
                </li>
              ))}
            </ul>
          </div>
        )}
        {plan.blocked.length > 0 && (
          <div class="rename-preview-section">
            <h3>
              {plan.blocked.length} link{plan.blocked.length === 1 ? "" : "s"} cannot be safely updated automatically
            </h3>
            <ul class="rename-preview-list">
              {plan.blocked.map((blocked, index) => (
                <li key={`${blocked.path}-${index}`}>
                  <span class="rename-preview-path">{blocked.path}</span>: <code>{blocked.oldText}</code>
                  <p class="rename-preview-reason">{blocked.reason}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div class="rename-preview-actions">
          <button onClick={onCancel}>Cancel</button>
          <button onClick={onContinue}>Continue</button>
        </div>
      </div>
    </div>
  );
}
