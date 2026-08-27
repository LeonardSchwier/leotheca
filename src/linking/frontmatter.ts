/**
 * Minimal frontmatter parsing, extracting only the `aliases` field, the
 * one frontmatter property anything in this app currently reads (see
 * fileTreeStore.ts's initialNoteContent for the one property it writes,
 * `created`, which nothing reads back yet). Deliberately not a general
 * YAML parser: pulling in a full YAML library for one optional field would
 * be exactly the "dependency for convenience" CONSTITUTION.md's
 * "Reproducibility and supply chain hygiene" rule warns against. The
 * shapes handled here cover both the common hand-written forms and what
 * this app's own frontmatter looks like.
 */

const FRONTMATTER_BLOCK = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  const isDoubleQuoted = trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2;
  if (isDoubleQuoted) {
    // Undo the escaping applyFrontmatterFields below always applies when
    // writing a double-quoted scalar, so a value round-trips through an
    // edit correctly even if it contains a literal quote or backslash.
    return trimmed.slice(1, -1).replace(/\\(["\\])/g, "$1");
  }
  const isSingleQuoted = trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2;
  if (isSingleQuoted) return trimmed.slice(1, -1);
  return trimmed;
}

function parseInlineAliases(inline: string): string[] {
  if (inline.startsWith("[") && inline.endsWith("]")) {
    return inline
      .slice(1, -1)
      .split(",")
      .map(stripQuotes)
      .filter(Boolean);
  }
  const single = stripQuotes(inline);
  return single ? [single] : [];
}

function parseBlockAliases(lines: string[], startIndex: number): string[] {
  const aliases: string[] = [];
  for (let i = startIndex; i < lines.length; i++) {
    const match = /^\s*-\s*(.*)$/.exec(lines[i]);
    if (!match) break;
    const alias = stripQuotes(match[1]);
    if (alias) aliases.push(alias);
  }
  return aliases;
}

/** Reads the `aliases:` frontmatter field, as either a single scalar
 * (`aliases: Foo`), an inline list (`aliases: [Foo, Bar]`), or a YAML
 * block list (`aliases:` followed by `  - Foo` lines). Returns an empty
 * array when there's no frontmatter block, or no `aliases` key in it. */
export function extractAliases(source: string): string[] {
  const block = FRONTMATTER_BLOCK.exec(source);
  if (!block) return [];

  const lines = block[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const match = /^aliases:\s*(.*)$/.exec(lines[i]);
    if (!match) continue;
    const inline = match[1].trim();
    return inline ? parseInlineAliases(inline) : parseBlockAliases(lines, i + 1);
  }
  return [];
}

export interface ScalarFrontmatterField {
  kind: "scalar";
  key: string;
  value: string;
}

/** A list value's items are split on every comma in the source (see
 * parseInlineAliases below, reused here), without regard for quoting, so
 * an item containing a literal comma does not round-trip correctly. Known,
 * pre-existing limitation of the same simplification extractAliases above
 * already has, not something specific to this generalized parser. */
export interface ListFrontmatterField {
  kind: "list";
  key: string;
  value: string[];
}

export type FrontmatterField = ScalarFrontmatterField | ListFrontmatterField;

export interface ParsedFrontmatter {
  /** Every top-level `key: scalar` or `key: [list]` / block-list field,
   * in source order. */
  fields: FrontmatterField[];
  /** Lines this parser doesn't understand well enough to edit safely: a
   * nested map, a multi-line block scalar, a comment, a blank line, or
   * anything else that isn't one of the two shapes above. Kept verbatim,
   * in original order, and re-emitted as-is by applyFrontmatterFields, so
   * editing one field a user *can* see in the Properties panel never
   * silently destroys frontmatter content the panel doesn't display. */
  rawLines: string[];
}

// A plain top-level YAML key: letters, digits, underscore, dot, hyphen.
// Deliberately conservative rather than YAML's actual (much looser) key
// grammar, so this never misreads an indented continuation line (a list
// item, a nested map's own key) as a new top-level field: every such line
// starts with whitespace, which this pattern's `^` anchor already
// excludes, and a new top-level key resuming at column 0 correctly ends
// whatever raw block came before it.
const TOP_LEVEL_KEY = /^([A-Za-z0-9_.-]+):\s*(.*)$/;
const INDENTED_NONBLANK = /^\s+\S/;

/**
 * Parses every top-level frontmatter field this app's Properties panel
 * (src/editor/FrontmatterPropertiesPanel.tsx) can safely display and
 * edit: a scalar, an inline list (`[a, b]`), or a YAML block list (`key:`
 * followed by `  - item` lines). Anything else, most notably a nested
 * map, is never partially parsed or dropped, it goes into `rawLines`
 * whole (the key line plus every indented line that follows it), so a
 * field the panel can't understand still round-trips byte-for-byte
 * through an edit to some other field.
 */
export function parseFrontmatterFields(source: string): ParsedFrontmatter {
  const block = FRONTMATTER_BLOCK.exec(source);
  if (!block) return { fields: [], rawLines: [] };

  const lines = block[1].split(/\r?\n/);
  const fields: FrontmatterField[] = [];
  const rawLines: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const match = TOP_LEVEL_KEY.exec(line);
    if (!match) {
      rawLines.push(line);
      i++;
      continue;
    }

    const key = match[1];
    const inline = match[2].trim();
    if (inline.startsWith("[") && inline.endsWith("]")) {
      fields.push({ kind: "list", key, value: parseInlineAliases(inline) });
      i++;
      continue;
    }
    if (inline) {
      fields.push({ kind: "scalar", key, value: stripQuotes(inline) });
      i++;
      continue;
    }

    // `key:` with nothing inline: either a block list, a nested map this
    // parser doesn't understand, or a genuinely empty scalar.
    const listItems = parseBlockAliases(lines, i + 1);
    const consumedAsList = i + 1 + listItems.length;
    if (listItems.length > 0) {
      fields.push({ kind: "list", key, value: listItems });
      i = consumedAsList;
      continue;
    }
    if (i + 1 < lines.length && INDENTED_NONBLANK.test(lines[i + 1])) {
      // A nested structure, not a list: keep the key line and every
      // indented line under it together as one opaque, unsplit block.
      rawLines.push(line);
      i++;
      while (i < lines.length && INDENTED_NONBLANK.test(lines[i])) {
        rawLines.push(lines[i]);
        i++;
      }
      continue;
    }
    fields.push({ kind: "scalar", key, value: "" });
    i++;
  }

  return { fields, rawLines };
}

// Always double-quoted, with `\` and `"` escaped: simpler and safer than
// replicating YAML's full "when is a scalar safe to leave bare" rules by
// hand, at the honest cost of reformatting a value's quoting on any edit
// made through the Properties panel. stripQuotes above undoes this
// escaping when reading the value back.
function quoteScalar(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function serializeField(field: FrontmatterField): string {
  if (field.kind === "scalar") return `${field.key}: ${quoteScalar(field.value)}`;
  return `${field.key}: [${field.value.map(quoteScalar).join(", ")}]`;
}

/**
 * Replaces (or inserts, or removes) a note's frontmatter block with one
 * rebuilt from `fields`, keeping `rawLines` (see ParsedFrontmatter)
 * exactly as they were. The rest of the note (everything after the
 * frontmatter block, or the whole source if there was none) is untouched.
 * Returns `source` unchanged if there is nothing to write (no fields, no
 * raw content, and no existing block to remove).
 */
export function applyFrontmatterFields(
  source: string,
  fields: FrontmatterField[],
  rawLines: string[],
): string {
  const existing = FRONTMATTER_BLOCK.exec(source);
  const body = existing ? source.slice(existing[0].length) : source;

  if (fields.length === 0 && rawLines.length === 0) return body;

  const lines = [...fields.map(serializeField), ...rawLines];
  return `---\n${lines.join("\n")}\n---\n${body}`;
}
