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
  const isSingleQuoted = trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2;
  if (isDoubleQuoted || isSingleQuoted) return trimmed.slice(1, -1);
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
