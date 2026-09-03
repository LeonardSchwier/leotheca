import { signal } from "@preact/signals";

/**
 * A request to run F04 Phase 5d's "Copy block link" action (spec section
 * 7.4) against the active note's current cursor position, raised by the
 * command palette entry (`app/App.tsx`) and consumed by
 * `editor/MarkdownEditor.tsx`, the only place with live access to the
 * CodeMirror `EditorView` this action needs (both to read the current
 * cursor offset and, when the block at it has no id yet, to dispatch the
 * insertion transaction). Mirrors `outline/outlineNavigation.ts`'s
 * `requestId`-counter pattern: a monotonically increasing id, not a
 * boolean, so invoking the command again with the cursor unmoved still
 * re-triggers the action.
 */
export interface BlockLinkCopyRequest {
  requestId: number;
}

export const blockLinkCopyRequest = signal<BlockLinkCopyRequest | null>(null);

let nextRequestId = 1;

export function requestCopyBlockLinkAtCursor(): void {
  blockLinkCopyRequest.value = { requestId: nextRequestId++ };
}
