import { useEffect, useRef } from "preact/hooks";
import { confirmRequest } from "./confirmDialog";

/** Renders the pending request from confirmDialog.ts, if any. Mounted once
 * near the app root (App.tsx), alongside this app's other on-demand
 * dialogs (MarkdownHelpDialog, CommandPalette, etc.).
 *
 * UX-01 spec section 15.4/OVR-002: unlike this app's other existing
 * dialogs (none of which currently trap/restore focus or close on
 * Escape), this one does both -- a new, previously-nonexistent primitive
 * is the right place to establish that pattern properly, rather than
 * retrofitting every existing dialog in the same pass. Initial focus goes
 * to Cancel, not Confirm: for a destructive confirmation, defaulting
 * focus to the safe action means a stray Enter key press (e.g. left over
 * from typing elsewhere) can't accidentally confirm something
 * irreversible.
 */
export function ConfirmDialogHost() {
  const request = confirmRequest.value;
  const cancelRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  const settle = (confirmed: boolean) => {
    request?.resolve(confirmed);
    confirmRequest.value = null;
  };

  useEffect(() => {
    if (!request) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        settle(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocusedRef.current?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- settle reads confirmRequest.value fresh each call, not a stale closure value that needs to be a dependency.
  }, [request]);

  if (!request) return null;

  return (
    <div class="modal-overlay" onClick={() => settle(false)}>
      <div
        class="modal confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-dialog-title">{request.title}</h2>
        <p id="confirm-dialog-message">{request.message}</p>
        <div class="confirm-dialog-actions">
          <button ref={cancelRef} onClick={() => settle(false)}>
            {request.cancelLabel}
          </button>
          <button
            class={request.danger ? "confirm-dialog-danger" : ""}
            onClick={() => settle(true)}
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
