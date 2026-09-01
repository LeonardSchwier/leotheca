import { signal } from "@preact/signals";

/**
 * A request to reveal a character range of the active note's source in
 * the editor, raised by OutlinePanel and consumed by MarkdownEditor's
 * `reveal` prop (see MarkdownEditor.tsx). `requestId` is a monotonically
 * increasing counter, not a boolean or timestamp, so that clicking the
 * same outline row twice in a row (the range unchanged) still re-triggers
 * the reveal instead of being ignored as a no-op change.
 */
export interface OutlineRevealRequest {
  from: number;
  to: number;
  requestId: number;
}

export const outlineRevealRequest = signal<OutlineRevealRequest | null>(null);

let nextRequestId = 1;

export function requestOutlineReveal(from: number, to: number): void {
  outlineRevealRequest.value = { from, to, requestId: nextRequestId++ };
}
