/**
 * F04 Phase 1's wikilink resolver (spec/f04-heading-block-links-embeds.md
 * sections 6 and 8). Maps a `WikiLinkRecord` (wikiSyntax.ts) to a
 * `ResolvedWikiTarget` against the shared heading scanner
 * (`markdown/headings.ts`'s `scanHeadings`/`normalizeHeadingKey`), the
 * same normalization contract that file's own header comment says F04
 * owns going forward.
 *
 * Scope: heading fragments only. A `^block-id` fragment (section 7) is
 * not resolved here (block scanning doesn't exist yet, Phase 2 scope);
 * see `resolveWikiLinkTarget`'s handling of `fragment.kind === "block"`.
 */

import { normalizeHeadingKey, type HeadingRecord } from "../markdown/headings";
import { resolveWikilink } from "./store";
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
    // Block references are Phase 2 scope (spec section 21): no block
    // scanner exists yet to resolve against. Degrade to a note-level
    // link rather than reporting a status this phase can't back up.
    return { status: "resolved", notePath };
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
