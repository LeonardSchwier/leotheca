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
 * A `^block-id` fragment (section 7) parses structurally, since the
 * grammar naturally distinguishes it from a heading fragment, but this
 * phase does not resolve or render it specially (see wikiResolver.ts):
 * block references are Phase 2 scope. Likewise a leading `!` (embeds,
 * section 11) is not specially recognized here yet; `kind` always comes
 * back "link" in this phase, kept on the type for forward compatibility
 * with the embed work Phase 4 adds.
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
 */
export function parseWikiLinks(source: string): WikiLinkRecord[] {
  const records: WikiLinkRecord[] = [];
  let i = 0;
  while (i < source.length - 1) {
    if (source[i] !== "[" || source[i + 1] !== "[") {
      i += 1;
      continue;
    }
    const sourceFrom = i;
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
      kind: "link",
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
