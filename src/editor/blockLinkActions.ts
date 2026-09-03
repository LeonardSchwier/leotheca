import { findBlockAtOffset, scanBlockIds, type ScannedBlock } from "../markdown/blocks";
import { serializeWikiLink } from "../linking/wikiSyntax";

/**
 * F04 Phase 5d (spec/f04-heading-block-links-embeds.md section 7.4): the
 * "Copy block link" editor action. Implements spec 7.4's flow end to
 * end as one pure function over the active note's own document text and
 * cursor offset (steps 1-4: locate the block, reuse an existing unique
 * id or generate and confirm a new one), leaving only the actual
 * CodeMirror insertion (step 5) and clipboard write (step 7) to the
 * caller (`editor/MarkdownEditor.tsx`), which alone has a live
 * `EditorView` to dispatch a transaction through. Step 6, "wait for
 * canonical content acceptance," is a no-op here: this action already
 * only ever reads/writes the open tab's own live CodeMirror document,
 * the same canonical source every other in-editor mutation in this
 * codebase (typing itself included) goes through, so there is nothing
 * further to wait on.
 *
 * Deliberately narrower than spec 7.4's full text in two disclosed ways,
 * tracked as still-open in ROADMAP.md rather than silently assumed:
 * - Only "Copy block link" exists; a separate "Create block link" action
 *   is not implemented. Copy already performs the create-if-needed flow
 *   itself (spec steps 3-6), the only way a "Create" action's own result
 *   would differ, so a second, separately-labeled entry point would
 *   invoke the identical underlying operation for no distinguishable
 *   outcome; Copy alone matches the established precedent this
 *   ecosystem already converges on for "the block has no id yet, get me
 *   a link to it anyway."
 * - A block whose *existing* marker is itself a duplicate (ambiguous
 *   with another block's marker elsewhere in the note) is left alone
 *   rather than silently minted a second, different id: this action
 *   never rewrites an existing marker, only ever adds one where none
 *   exists yet, the same "never touch what's already there" restraint
 *   `outline/headingLinkOperations.ts` already applies to a duplicate
 *   heading (see that module's own `headingLinkDisabledReason`).
 */

/**
 * A short, readable, cryptographically random candidate id (spec 7.4:
 * "a local cryptographically strong random source... no user or device
 * identifier"), shaped after the spec's own `b-7k3m2p9d` example:
 * `crypto.randomUUID()` (this codebase's own established CSPRNG source,
 * see collections/canvas/bookmarks' own id generation) truncated to its
 * first 8 hex characters, well clear of the `[A-Za-z0-9][A-Za-z0-9-]{0,63}`
 * grammar's length limit and already composed only of grammar-legal
 * characters, so no further sanitization is needed.
 */
export function generateBlockId(): string {
  return `b-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

// Generous but bounded: a collision against an 8-hex-character (32-bit)
// random suffix is already vanishingly unlikely for any note-sized set
// of existing ids; this only guards against ever looping forever.
const MAX_ID_GENERATION_ATTEMPTS = 25;

/** Generates a block id guaranteed not to collide (case-insensitively)
 * with any key in `existingKeys`, retrying on the vanishingly rare
 * collision (spec 7.4 step 4: "confirm uniqueness against the active
 * note") rather than trusting one random draw. */
export function uniqueBlockId(existingKeys: ReadonlySet<string>): string {
  for (let attempt = 0; attempt < MAX_ID_GENERATION_ATTEMPTS; attempt++) {
    const id = generateBlockId();
    if (!existingKeys.has(id.toLowerCase())) return id;
  }
  // Exhausted the bounded retry budget (should not happen in practice,
  // see the 32-bit-collision comment above): fall back to a longer,
  // still grammar-legal id that cannot plausibly collide either.
  return `b-${crypto.randomUUID().replace(/-/g, "")}`;
}

/** Builds the same-note `[[#^id]]` link text for `id`, through
 * wikiSyntax.ts's `serializeWikiLink`, F04's one allowed creator of
 * `[[...]]` link text (spec section 2), never by string concatenation. */
export function blockLinkText(id: string): string {
  return serializeWikiLink({ noteTarget: "", fragment: { kind: "block", value: id } });
}

/** What to insert into the document, and where, to give `block` (which
 * has no existing marker yet) a fresh id. A fenced code block's marker
 * is always its own separate line right after the closing fence (spec
 * 7.2); every other eligible kind's marker is whitespace-delimited text
 * at the end of the block's own last content line (spec 7.1). Both
 * insert at `block.contentTo`, the one offset `ScannedBlock` already
 * guarantees sits right after the block's real content and before
 * anything that follows it. */
function markerInsertionText(block: ScannedBlock, id: string): string {
  return block.kind === "fenced-code" ? `\n^${id}` : ` ^${id}`;
}

export interface BlockLinkResolution {
  /** The `[[#^id]]` text to copy to the clipboard. */
  linkText: string;
  /** Present only when `block` had no usable existing id: where and
   * what to insert (through one CodeMirror transaction, spec step 5)
   * before copying `linkText`. */
  insertion?: { from: number; text: string };
}

/**
 * Spec 7.4's full flow (steps 1-4) over `content`/`cursorOffset` alone:
 * locates the block at the cursor (step 1), reuses its existing id if it
 * already has one that resolves unambiguously (step 2), otherwise mints
 * a fresh, confirmed-unique one and describes where to insert it (steps
 * 3-4). Returns `undefined` when there is nothing this action can do:
 * no eligible block at the cursor at all, or one whose existing marker
 * is itself ambiguous (see the module doc comment's second disclosed
 * narrowing above).
 */
export function resolveBlockLinkAtCursor(content: string, cursorOffset: number): BlockLinkResolution | undefined {
  const block = findBlockAtOffset(content, cursorOffset);
  if (!block) return undefined;

  const keyOccurrences = new Map<string, number>();
  for (const existing of scanBlockIds(content)) {
    keyOccurrences.set(existing.key, (keyOccurrences.get(existing.key) ?? 0) + 1);
  }

  if (block.marker) {
    const key = block.marker.id.toLowerCase();
    if ((keyOccurrences.get(key) ?? 0) !== 1) return undefined;
    return { linkText: blockLinkText(block.marker.id) };
  }

  const id = uniqueBlockId(new Set(keyOccurrences.keys()));
  return {
    linkText: blockLinkText(id),
    insertion: { from: block.contentTo, text: markerInsertionText(block, id) },
  };
}
