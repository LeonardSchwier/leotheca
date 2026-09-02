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

/**
 * A request to insert literal text at the current selection in
 * MarkdownEditor, raised by F06 Phase 3's insert-heading-link action
 * (OutlinePanel and HeadingBreadcrumbs, via
 * outline/headingLinkActions.ts) and consumed by MarkdownEditor's
 * `insertRequest` prop. Mirrors OutlineRevealRequest's `requestId`
 * pattern above: a monotonically increasing counter, not content
 * equality, so inserting the exact same link text twice in a row still
 * re-triggers the insertion.
 */
export interface OutlineInsertRequest {
  text: string;
  requestId: number;
}

export const outlineInsertRequest = signal<OutlineInsertRequest | null>(null);

let nextInsertRequestId = 1;

export function requestOutlineInsert(text: string): void {
  outlineInsertRequest.value = { text, requestId: nextInsertRequestId++ };
}
