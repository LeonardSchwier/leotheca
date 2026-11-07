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

/**
 * F04 Phase 5e3's "Create block link" action (spec section 21 Phase 5):
 * runs the identical steps 1-6 as "Copy block link" above (find the
 * block at the cursor, reuse its existing id or mint and insert a fresh
 * one), but never touches the clipboard. See
 * `editor/blockLinkActions.ts`'s module doc comment for why this is a
 * genuinely distinct, useful action rather than a duplicate of Copy: it
 * lets a user stamp a stable id onto a block without overwriting
 * whatever is currently on their clipboard, for a block whose id they
 * want to reference later (elsewhere, or by hand) rather than paste
 * right now. Same `requestId`-counter shape and rationale as
 * `BlockLinkCopyRequest`, a separate signal rather than a `mode` field
 * on the same one so a consumer's dependency array stays precise about
 * which action it is actually reacting to.
 */
export interface BlockLinkCreateRequest {
  requestId: number;
}

export const blockLinkCreateRequest = signal<BlockLinkCreateRequest | null>(null);

let nextCreateRequestId = 1;

export function requestCreateBlockLinkAtCursor(): void {
  blockLinkCreateRequest.value = { requestId: nextCreateRequestId++ };
}
