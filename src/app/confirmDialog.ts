import { signal } from "@preact/signals";

/** UX-01 spec section 15.4: "Native window.confirm should be replaced on
 * polished product paths with the shared confirmation dialog... while
 * retaining the same safety semantics." A plain module-level signal
 * holding at most one pending request, rather than a stack: every current
 * call site is a single, modal, blocking confirmation the same way
 * window.confirm was, and this app has no scenario today where a second
 * confirmation could be requested while one is already open. */
export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Uses --color-danger styling on the confirm action; still never the
   * only signal (the label itself, e.g. "Delete", already says so), per
   * section 15.3's "not color-only" rule. */
  danger: boolean;
  resolve: (confirmed: boolean) => void;
}

export const confirmRequest = signal<ConfirmRequest | null>(null);

/**
 * Same call shape and semantics as `window.confirm`: resolves `true` when
 * the user confirms, `false` for Cancel, backdrop click, or Escape. Unlike
 * `window.confirm`, this never blocks the JS event loop, so callers must
 * `await` (or otherwise handle) the returned promise instead of reading a
 * synchronous return value.
 */
export function confirmAction(options: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    confirmRequest.value = {
      title: options.title,
      message: options.message,
      confirmLabel: options.confirmLabel ?? "Confirm",
      cancelLabel: options.cancelLabel ?? "Cancel",
      danger: options.danger ?? false,
      resolve,
    };
  });
}
