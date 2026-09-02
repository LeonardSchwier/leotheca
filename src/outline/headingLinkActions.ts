import type { HeadingRecord } from "../markdown/headings";
import { serializeWikiLink } from "../linking/wikiSyntax";
import { requestOutlineInsert } from "./outlineNavigation";

/**
 * F06 Phase 3 (spec/f06-note-outline-heading-breadcrumbs.md section 9):
 * copy and insert actions for a single heading, reachable from both
 * OutlinePanel and HeadingBreadcrumbs (see outline/HeadingLinkActions.tsx,
 * the shared row-action UI both of them render). Both actions build their
 * link text through wikiSyntax.ts's `serializeWikiLink`, F04's one
 * allowed creator of `[[...]]` link text (spec/f04 section 2), never by
 * concatenating the note title and heading text by hand.
 *
 * Deferred to a follow-up, since they depend on work not yet landed:
 * - Section 9.2's ambiguous-note-basename handling (a path-qualified note
 *   target when two notes share a basename) needs a resolver query this
 *   phase doesn't add; `headingLinkDisabledReason` below instead disables
 *   both actions outright for a heading whose text is itself ambiguous in
 *   this note (the case F06-FR-15 actually requires this phase to get
 *   right), which is the case actually reachable today.
 * - Section 9.3's "Create stable block link" duplicate-heading choice
 *   delegates to F04's explicit block-ID insertion, a feature that does
 *   not exist yet. Until it does, a duplicate heading's link actions stay
 *   disabled rather than silently copying a link that would resolve
 *   ambiguously.
 */
export function headingLinkText(heading: HeadingRecord, noteTitle?: string): string {
  return serializeWikiLink({
    noteTarget: noteTitle ?? "",
    fragment: { kind: "heading", value: heading.displayText },
  });
}

/**
 * Copies `heading`'s F04 link text to the clipboard (section 9.2),
 * always the note-qualified `[[Note#Heading]]` form: unlike Insert, Copy
 * doesn't know where the result will be pasted, so the link must stay
 * valid outside this note too.
 */
export async function copyHeadingLink(heading: HeadingRecord, noteTitle: string): Promise<void> {
  await navigator.clipboard.writeText(headingLinkText(heading, noteTitle));
}

/**
 * Inserts `heading`'s same-note `[[#Heading]]` link text at the current
 * editor selection (section 9.4), through MarkdownEditor's
 * `insertRequest` prop (outlineNavigation.ts's `requestOutlineInsert`).
 * Same-note syntax is correct here because insertion always targets the
 * very note the heading itself belongs to; a caller decides separately
 * (via `canInsertLink`, see HeadingLinkActions.tsx) whether there is a
 * writable editor to insert into at all.
 */
export function insertHeadingLink(heading: HeadingRecord): void {
  requestOutlineInsert(headingLinkText(heading));
}

/**
 * Why copy/insert should be disabled for `heading`, or undefined when
 * neither reason applies. An empty heading has no text a link fragment
 * could name (`[[Note#]]` parses back as malformed, per wikiSyntax.ts);
 * a duplicate heading's normalized text does not uniquely identify one
 * occurrence, so a link built from it would resolve ambiguously
 * (F06-FR-15) rather than to the specific heading the user picked.
 */
export function headingLinkDisabledReason(heading: HeadingRecord, duplicate: boolean): string | undefined {
  if (!heading.displayText.trim()) {
    return "This heading has no text to link to.";
  }
  if (duplicate) {
    return "This heading's text repeats elsewhere in the note, so a link to it would be ambiguous.";
  }
  return undefined;
}
