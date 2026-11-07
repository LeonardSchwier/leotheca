/**
 * F04 Phase 1's wikilink resolver (spec/f04-heading-block-links-embeds.md
 * sections 6 and 8). Maps a `WikiLinkRecord` (wikiSyntax.ts) to a
 * `ResolvedWikiTarget` against the shared heading scanner
 * (`markdown/headings.ts`'s `scanHeadings`/`normalizeHeadingKey`), the
 * same normalization contract that file's own header comment says F04
 * owns going forward, and (F04 Phase 3a) the shared block-reference
 * scanner (`markdown/blocks.ts`'s `scanBlockIds`) for a `^block-id`
 * fragment.
 *
 * Block resolution scope, disclosed rather than silently narrowed: only
 * a paragraph-block ID (the only kind `scanBlockIds` detects in this
 * phase, see that module's own doc comment) can ever resolve; a link to
 * a block kind that scanner doesn't yet detect (a heading, list item,
 * blockquote, or fenced code block's own ID) reports "missing-fragment"
 * exactly as it would for a genuinely nonexistent ID, since this
 * resolver has no way to distinguish "not implemented yet" from "not
 * there" without reading the note a second time through a different
 * scanner just to tell them apart.
 *
 * F04 Phase 5a adds `crossNoteHeadingsFor`, a small bridge into
 * `LinkIndex.headingsByPath` (`./store`) so a cross-note heading
 * fragment can be verified the same way a same-note one already is,
 * without a second file read (see that field's own doc comment: it
 * exists specifically for this). F04 Phase 5c adds `crossNoteBlocksFor`,
 * the exact analog for a cross-note `^block-id` fragment against the new
 * `LinkIndex.blocksByPath`.
 */

import { normalizeHeadingKey, type HeadingRecord } from "../markdown/headings";
import type { BlockRecord } from "../markdown/blocks";
import { linkIndex, resolveWikilink } from "./store";
import type { WikiLinkRecord } from "./wikiSyntax";

export interface ResolvedWikiTarget {
  status:
    | "resolved"
    | "missing-note"
    | "ambiguous-note"
    | "missing-fragment"
    | "ambiguous-fragment"
    | "malformed";
  notePath?: string;
  heading?: HeadingRecord;
  /** Present only for an "ambiguous-fragment" result: every heading in
   * the target note sharing the fragment's normalized key, per spec
   * 6.3's "completion shows each occurrence" (Phase 1 exposes the data;
   * completion UI itself is a later phase). */
  candidateHeadings?: HeadingRecord[];
  /** The resolved block, present only when `fragment.kind === "block"`
   * resolved successfully (F04 Phase 3a). */
  block?: BlockRecord;
  /** Present only for an "ambiguous-fragment" result against a block
   * fragment: every paragraph block in the target note sharing the
   * fragment's case-insensitive id (spec 7.1's own duplicate-detection
   * rule), mirroring `candidateHeadings` above. */
  candidateBlocks?: BlockRecord[];
  /**
   * True when this result came from spec section 5.3's legacy
   * compatibility fallback: the structured note target didn't resolve,
   * but the complete raw `[[...]]` inner text, hash and all, happens to
   * be an existing note's literal name. Not part of the spec's own
   * `ResolvedWikiTarget` shape; added so a caller (MarkdownPreview) can
   * render and navigate the link exactly like a plain whole-note link
   * (section 5.3: "never reinterpret a uniquely resolvable legacy
   * filename as a fragment link without review"), dropping the
   * fragment/label split entirely rather than acting on it.
   */
  legacyFallback?: boolean;
}

/**
 * Resolves a single fragment value against a note's already-scanned
 * headings. `headings` must come from `scanHeadings` (or contain
 * `HeadingRecord`s with a `key` already normalized the same way) so this
 * function never runs a second, divergent matching pass; it simply
 * groups by the shared `key`.
 */
export function resolveHeadingFragment(
  headings: HeadingRecord[],
  fragmentValue: string,
):
  | { status: "resolved"; heading: HeadingRecord }
  | { status: "missing-fragment" }
  | { status: "ambiguous-fragment"; candidates: HeadingRecord[] } {
  const key = normalizeHeadingKey(fragmentValue);
  const matches = headings.filter((heading) => heading.key === key);
  if (matches.length === 0) return { status: "missing-fragment" };
  if (matches.length > 1) return { status: "ambiguous-fragment", candidates: matches };
  return { status: "resolved", heading: matches[0] };
}

/**
 * Resolves a single `^block-id` fragment value against a note's
 * already-scanned blocks (F04 Phase 3a). `blocks` must come from
 * `scanBlockIds` (or contain `BlockRecord`s with a `key` already
 * lowercased the same way) so this function never runs a second,
 * divergent matching pass. Matching is case-insensitive, per spec 7.1.
 */
export function resolveBlockFragment(
  blocks: BlockRecord[],
  fragmentValue: string,
):
  | { status: "resolved"; block: BlockRecord }
  | { status: "missing-fragment" }
  | { status: "ambiguous-fragment"; candidates: BlockRecord[] } {
  const key = fragmentValue.toLowerCase();
  const matches = blocks.filter((block) => block.key === key);
  if (matches.length === 0) return { status: "missing-fragment" };
  if (matches.length > 1) return { status: "ambiguous-fragment", candidates: matches };
  return { status: "resolved", block: matches[0] };
}

/**
 * F04 Phase 5a: the `targetHeadings` a cross-note heading fragment needs
 * for `resolveWikiLinkTarget` to actually verify it, read from the
 * already-in-memory `LinkIndex.headingsByPath` rather than a fresh file
 * read (see that field's own doc comment in `store.ts`: it was added
 * specifically for this). Returns `undefined` — meaning "don't verify,
 * resolve at the note level only" in `resolveWikiLinkTarget`'s own
 * contract — for anything this bridge doesn't cover: a same-note record
 * (the caller already has its own scanned headings for that case), a
 * non-heading fragment (block fragments aren't covered by this phase),
 * or a note target that doesn't itself resolve (`resolveWikiLinkTarget`'s
 * own note-resolution, including its section 5.3 legacy-filename
 * fallback, already handles that case correctly without a fragment
 * check). Returns an array — including an empty one, deliberately, since
 * `LinkIndex.headingsByPath` is a sparse map where an absent path means
 * "this note has zero headings", not "not looked up yet" — once the note
 * itself resolves, so a genuinely nonexistent heading in an existing
 * cross-note target correctly reports "missing-fragment" instead of
 * silently passing as note-level "resolved".
 *
 * Shares `LinkIndex`'s own startup-timing characteristics: like a
 * cross-note link's note-level "does this note exist" check (already
 * driven by the same index), a heading check can transiently read as
 * unverified during the very first index build right after a workspace
 * opens. This phase does not change that pre-existing behavior, only
 * extends the same authority one level deeper.
 */
export function crossNoteHeadingsFor(record: WikiLinkRecord): HeadingRecord[] | undefined {
  if (record.noteTarget === "" || !record.fragment || record.fragment.kind !== "heading") return undefined;
  const notePath = resolveWikilink(record.noteTarget);
  if (!notePath) return undefined;
  return linkIndex.value.headingsByPath?.get(notePath) ?? [];
}

/**
 * F04 Phase 5c: the `targetBlocks` a cross-note `^block-id` fragment needs
 * for `resolveWikiLinkTarget` to actually verify it, read from the
 * already-in-memory `LinkIndex.blocksByPath` rather than a fresh file
 * read. Exact analog of `crossNoteHeadingsFor` above, including its
 * "undefined means don't verify" / "empty array means verified zero
 * blocks" contract and its LinkIndex startup-timing characteristics; see
 * that function's own doc comment for the full rationale, which applies
 * here unchanged with "heading" replaced by "block".
 */
export function crossNoteBlocksFor(record: WikiLinkRecord): BlockRecord[] | undefined {
  if (record.noteTarget === "" || !record.fragment || record.fragment.kind !== "block") return undefined;
  const notePath = resolveWikilink(record.noteTarget);
  if (!notePath) return undefined;
  return linkIndex.value.blocksByPath?.get(notePath) ?? [];
}

export interface WikiResolutionContext {
  /** The path of the note whose source contains this link, used to make
   * a same-note (`noteTarget === ""`) target concrete. Leave undefined
   * only when there is genuinely no associated note (e.g. rendering
   * isolated source with no note context); a same-note fragment then
   * resolves to "missing-note" rather than guessing a path. */
  currentNotePath?: string;
  /**
   * Scanned headings of the note actually being resolved against: the
   * CURRENT note's own headings for a same-note fragment, or the
   * cross-note TARGET note's headings once its content has been read.
   * Omit for a cross-note fragment whose target content hasn't been
   * read yet; the fragment then resolves at the note level only (status
   * "resolved" with no `heading`), matching spec section 8's "fragment
   * resolution happens only after exactly one note is resolved" without
   * inventing an "unverified" status the spec's own type doesn't have.
   */
  targetHeadings?: HeadingRecord[];
  /**
   * F04 Phase 3a's analog of `targetHeadings` for a `^block-id` fragment:
   * the CURRENT note's own scanned blocks for a same-note fragment, or
   * the cross-note TARGET note's blocks once its content has been read.
   * Omit for a cross-note fragment whose target content hasn't been read
   * yet; the fragment then resolves at the note level only, same as an
   * omitted `targetHeadings`.
   */
  targetBlocks?: BlockRecord[];
}

/**
 * Resolves a parsed wikilink record to its target, following spec
 * section 8's resolution order (note first, fragment only once exactly
 * one note is known) and section 5.3's legacy compatibility fallback.
 */
export function resolveWikiLinkTarget(
  record: WikiLinkRecord,
  context: WikiResolutionContext,
): ResolvedWikiTarget {
  if (record.parseStatus === "malformed") return { status: "malformed" };

  const sameNote = record.noteTarget === "";
  const notePath = sameNote ? context.currentNotePath : (resolveWikilink(record.noteTarget) ?? undefined);

  if (!notePath) {
    // Section 5.3: the structured note portion didn't resolve. If the
    // complete raw text (hash/pipe and all) is itself an existing note's
    // name, this is very likely a pre-F04 link to a note whose filename
    // contains a raw separator, not a genuinely broken link. Same-note
    // targets are excluded: an empty note target is a deliberate,
    // unambiguous "this note" marker, never a filename to fall back to.
    if (!sameNote && (record.fragment || record.label)) {
      const legacyPath = resolveWikilink(record.legacyRaw);
      if (legacyPath) return { status: "resolved", notePath: legacyPath, legacyFallback: true };
    }
    return { status: "missing-note" };
  }

  if (!record.fragment) return { status: "resolved", notePath };

  if (record.fragment.kind === "block") {
    if (!context.targetBlocks) {
      // Cross-note fragment, target content not read yet: note-level
      // resolution stands, same as the equivalent heading branch below.
      return { status: "resolved", notePath };
    }
    const blockResult = resolveBlockFragment(context.targetBlocks, record.fragment.value);
    if (blockResult.status === "resolved") {
      return { status: "resolved", notePath, block: blockResult.block };
    }
    if (blockResult.status === "ambiguous-fragment") {
      return { status: "ambiguous-fragment", notePath, candidateBlocks: blockResult.candidates };
    }
    return { status: "missing-fragment", notePath };
  }

  if (!context.targetHeadings) {
    // Cross-note fragment, target content not read yet: note-level
    // resolution stands, heading verification happens once a caller
    // supplies targetHeadings (see MarkdownPreview.tsx / App.tsx).
    return { status: "resolved", notePath };
  }

  const fragmentResult = resolveHeadingFragment(context.targetHeadings, record.fragment.value);
  if (fragmentResult.status === "resolved") {
    return { status: "resolved", notePath, heading: fragmentResult.heading };
  }
  if (fragmentResult.status === "ambiguous-fragment") {
    return { status: "ambiguous-fragment", notePath, candidateHeadings: fragmentResult.candidates };
  }
  return { status: "missing-fragment", notePath };
}
