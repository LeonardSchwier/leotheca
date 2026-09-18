import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { confirmRequest } from "./confirmDialog";

/** Renders the pending request from confirmDialog.ts, if any. Mounted once
 * near the app root (App.tsx), alongside this app's other on-demand
 * dialogs (MarkdownHelpDialog, CommandPalette, etc.).
 *
 * UX-01 spec section 15.4/OVR-002: the shared Dialog now owns focus trap,
 * restoration, Escape/backdrop semantics, scroll lock, and viewport
 * fitting. Initial focus deliberately goes to Cancel, not Confirm: for a
 * destructive confirmation, a stray Enter key cannot confirm something
 * irreversible.
 */
export function ConfirmDialogHost() {
  const request = confirmRequest.value;

  const settle = (confirmed: boolean) => {
    request?.resolve(confirmed);
    confirmRequest.value = null;
  };

  if (!request) return null;

  return (
    <Dialog
      role="alertdialog"
      size="sm"
      title={request.title}
      description={request.message}
      onDismiss={() => settle(false)}
      actions={
        <>
          <Button variant="secondary" onClick={() => settle(false)}>
            {request.cancelLabel}
          </Button>
          <Button
            variant={request.danger ? "danger" : "primary"}
            onClick={() => settle(true)}
          >
            {request.confirmLabel}
          </Button>
        </>
      }
    />
  );
}
