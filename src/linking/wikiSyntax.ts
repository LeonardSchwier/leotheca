/**
 * F04 Phase 1's structured wikilink syntax parser
 * (spec/f04-heading-block-links-embeds.md sections 5 and 13). Parses
 * `[[Note]]`, `[[Note|Label]]`, `[[Note#Heading]]`, `[[#Heading]]`,
 * `[[Note#Heading|Label]]`, and `[[#Heading|Label]]` into a
 * `WikiLinkRecord` with exact source ranges, following section 5.2's
 * grammar (first unescaped `|` splits the label, first unescaped `#`
 * inside the target expression splits the fragment, backslash escapes
 * `\`, `#`, `|`, `[`, and `]`).
 *
 * This is the one syntax parser F04's own spec says every consumer must
 * share ("Parallel link parsers are prohibited", section 2): F03
 * diagnostics, F06 copy-link actions, editor completion, and this
 * module's own resolver/preview consumers must all parse through here.
 *
 * A `^block-id` fragment (section 7) parses structurally; resolving it
 * against a note's actual scanned blocks is `wikiResolver.ts`'s
 * `resolveBlockFragment` (F04 Phase 3a), reused unchanged by an embed
 * record's own fragment the same way a link record's is. A leading `!`
 * immediately before `[[` (section 11) marks `kind: "embed"` (F04 Phase
 * 4a); note/fragment parsing and resolution are otherwise identical
 * between a link and an embed record, only how a caller renders the
 * resolved target differs (`editor/MarkdownPreview.tsx`'s embed
 * rendering, see that file for the current scope of what an embed
 * actually resolves and displays).
 */

export type WikiLinkFragment =
  | { kind: "heading"; value: string }
  | { kind: "block"; value: string };

export interface WikiLinkRecord {
  kind: "link" | "embed";
  /** The complete matched text, brackets included (e.g. `[[Note#Heading]]`). */
  raw: string;
  /** The note target, unescaped and trimmed; empty string means "the
   * current note" (spec 5.2: "an empty note target means the current
   * note"). */
  noteTarget: string;
  fragment?: WikiLinkFragment;
  /** The explicit `|Label` text, unescaped, when present. */
  label?: string;
  sourceFrom: number;
  sourceTo: number;
  targetFrom: number;
  targetTo: number;
  fragmentFrom?: number;
  fragmentTo?: number;
  labelFrom?: number;
  labelTo?: number;
  /**
   * "legacy-fallback" is never produced by this parser: classifying a
   * record that way requires knowing whether an existing note's literal
   * name contains the raw `#`/`|` the structured grammar just split on
   * (spec 5.3), which only the resolver (wikiResolver.ts, which has
   * access to the workspace note index) can determine. This field stays
   * "valid"/"malformed" here; see wikiResolver.ts for where the fallback
   * classification actually happens, using this record's `legacyRaw`.
   */
  parseStatus: "valid" | "malformed" | "legacy-fallback";
  /**
   * The complete raw inner text exactly as written (trimmed, not
   * unescaped), i.e. what the pre-F04 parser would have used whole as
   * the note name. Not part of the spec's own recommended type; kept
   * here so the resolver's legacy-fallback compatibility check (spec
   * 5.3) never needs to reconstruct it from the split fields, which
   * would risk drifting from the original text under escaping.
   */
  legacyRaw: string;
}

const ESCAPABLE = new Set(["\\", "#", "|", "[", "]"]);

/** Reverses spec 5.2's backslash escaping of `\`, `#`, `|`, `[`, and `]`
 * inside a structured wikilink expression. A backslash before any other
 * character is left as a literal backslash, matching CommonMark's own
 * "only backslash-escape these characters" convention rather than
 * silently eating every backslash. */
export function unescapeWikiLinkText(text: string): string {
  let result = "";
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\\" && i + 1 < text.length && ESCAPABLE.has(text[i + 1])) {
      result += text[i + 1];
      i += 1;
    } else {
      result += text[i];
    }
  }
  return result;
}

/**
 * The exact inverse of unescapeWikiLinkText above: escapes `\`, `#`, `|`,
 * `[`, and `]` so arbitrary text (e.g. a heading's own display text, which
 * may itself contain one of these characters, like a heading literally
 * titled "Q&A: Issue #12" or "Before | After") can be inserted into a
 * structured wikilink's target, fragment, or label expression without
 * being reinterpreted as a delimiter by parseWikiLinks. Used by F04 Phase
 * 2's heading-link completion (MarkdownEditor.tsx) when inserting a
 * selected heading's text, and by F06 Phase 3's `serializeWikiLink` below
 * (outline/headingLinkOperations.ts's copy/insert-link actions); kept here
 * rather than duplicated at either call site since this module owns the
 * escaping grammar (spec section 5.2).
 */
export function escapeWikiLinkText(text: string): string {
  return text.replace(/[\\#|[\]]/g, "\\$&");
}

/**
 * A wikilink target to serialize into `[[...]]` text: the fields
 * parseWikiLinks splits a record into, minus the source-range bookkeeping
 * a caller building fresh link text (rather than parsing existing text)
 * has no use for. `noteTarget: ""` means the same-note target (spec
 * 5.2), producing `[[#Heading]]` rather than `[[Note#Heading]]`.
 */
export interface WikiLinkTarget {
  noteTarget: string;
  fragment?: WikiLinkFragment;
  label?: string;
}

/**
 * Serializes `target` back into `[[...]]` grammar text, escaping every
 * part through escapeWikiLinkText so the result always round-trips
 * through parseWikiLinks unchanged. This is the one allowed way to
 * produce heading/block link text in this codebase (F04's "one shared
 * serializer" rule, spec/f04-heading-block-links-embeds.md section 2):
 * F06's copy-heading-link and insert-heading-link actions
 * (outline/headingLinkOperations.ts) build their `[[Note#Heading]]` /
 * `[[#Heading]]` text through here, never by concatenating the pieces
 * themselves.
 */
export function serializeWikiLink(target: WikiLinkTarget): string {
  let inner = escapeWikiLinkText(target.noteTarget);
  if (target.fragment) {
    const fragmentRaw =
      target.fragment.kind === "block" ? `^${target.fragment.value}` : target.fragment.value;
    inner += `#${escapeWikiLinkText(fragmentRaw)}`;
  }
  if (target.label !== undefined) inner += `|${escapeWikiLinkText(target.label)}`;
  return `[[${inner}]]`;
}

/**
 * Scans `source` for `[[...]]` wikilink occurrences and returns a
 * `WikiLinkRecord` for each. Non-overlapping, left to right, mirroring
 * how the pre-F04 `matchAll` extraction walked the document.
 *
 * An unterminated `[[` (no `]]` anywhere after it) is left as plain text
 * exactly as the pre-F04 regex-based extraction always did (it simply
 * never matched), not emitted as a "malformed" record: nothing in this
 * phase consumes that signal, and manufacturing it here would cost a
 * second full-document scan for a case F03 (a later phase) actually
 * needs. "malformed" is reserved for a case section 5.2 explicitly names:
 * a recognized `#`/`^` fragment marker with nothing after it.
 *
 * A `[[` immediately preceded by `!` (no space between them, section
 * 11.1) is an embed rather than a link: `kind` comes back "embed" and
 * `sourceFrom`/`raw` include that leading `!`, so a caller replacing the
 * record's exact span never leaves a stray `!` behind. Spec 5.2's escape
 * grammar has no way to escape a literal `!` before `[[` (only `\`, `#`,
 * `|`, `[`, and `]` are escapable), matching this codebase's other
 * wikilink-adjacent implementations' convention of not inventing an
 * escape the spec doesn't define.
 */
export function parseWikiLinks(source: string): WikiLinkRecord[] {
  const records: WikiLinkRecord[] = [];
  let i = 0;
  while (i < source.length - 1) {
    if (source[i] !== "[" || source[i + 1] !== "[") {
      i += 1;
      continue;
    }
    const isEmbed = i > 0 && source[i - 1] === "!";
    const sourceFrom = isEmbed ? i - 1 : i;
    const contentStart = i + 2;
    let j = contentStart;
    let barIndex = -1;
    let hashIndex = -1;
    let closeIndex = -1;
    while (j < source.length) {
      const ch = source[j];
      if (ch === "\\" && j + 1 < source.length) {
        j += 2;
        continue;
      }
      if (ch === "]" && source[j + 1] === "]") {
        closeIndex = j;
        break;
      }
      if (ch === "|" && barIndex === -1) barIndex = j;
      if (ch === "#" && hashIndex === -1 && barIndex === -1) hashIndex = j;
      j += 1;
    }

    if (closeIndex === -1) {
      // No closing "]]" anywhere after this "[[": not a link occurrence
      // at all (see the doc comment above), same as the pre-F04 regex
      // simply not matching here.
      i += 1;
      continue;
    }

    if (closeIndex === contentStart) {
      // "[[]]": empty content, never a link (matches the pre-F04 regex's
      // `[^\]]+` requiring at least one character).
      i = closeIndex + 2;
      continue;
    }

    const sourceTo = closeIndex + 2;
    const targetExprEnd = barIndex !== -1 ? barIndex : closeIndex;
    const targetTo = hashIndex !== -1 ? hashIndex : targetExprEnd;
    const targetRaw = source.slice(contentStart, targetTo);
    const noteTarget = unescapeWikiLinkText(targetRaw).trim();
    const legacyRaw = source.slice(contentStart, closeIndex).trim();

    let fragment: WikiLinkFragment | undefined;
    let fragmentFrom: number | undefined;
    let fragmentTo: number | undefined;
    let malformed = false;

    if (hashIndex !== -1) {
      fragmentFrom = hashIndex + 1;
      fragmentTo = targetExprEnd;
      const fragmentRaw = unescapeWikiLinkText(source.slice(fragmentFrom, fragmentTo)).trim();
      if (fragmentRaw.startsWith("^")) {
        const blockValue = fragmentRaw.slice(1).trim();
        if (blockValue === "") malformed = true;
        else fragment = { kind: "block", value: blockValue };
      } else if (fragmentRaw === "") {
        malformed = true;
      } else {
        fragment = { kind: "heading", value: fragmentRaw };
      }
    }

    let label: string | undefined;
    let labelFrom: number | undefined;
    let labelTo: number | undefined;
    if (barIndex !== -1) {
      labelFrom = barIndex + 1;
      labelTo = closeIndex;
      label = unescapeWikiLinkText(source.slice(labelFrom, labelTo));
    }

    records.push({
      kind: isEmbed ? "embed" : "link",
      raw: source.slice(sourceFrom, sourceTo),
      noteTarget,
      fragment,
      label,
      sourceFrom,
      sourceTo,
      targetFrom: contentStart,
      targetTo,
      fragmentFrom,
      fragmentTo,
      labelFrom,
      labelTo,
      parseStatus: malformed ? "malformed" : "valid",
      legacyRaw,
    });

    i = sourceTo;
  }
  return records;
}
