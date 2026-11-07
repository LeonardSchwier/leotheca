import { extractFrontmatterTags, stripFrontmatterBlock } from "../linking/frontmatter";

// A fenced code block's delimiter line, indented or not. Doesn't try to
// match the fence's info string (the language name after ``` ) since
// nothing here needs it, only whether the following lines are code.
const FENCE_LINE = /^\s*(```|~~~)/;
const INLINE_CODE_SPAN = /`[^`\n]*`/g;
// `#` immediately followed (no whitespace) by a word character, then any
// run of word characters, hyphens, or `/`-separated segments for nesting
// (`#work/project`). `#` followed by whitespace is a heading marker, not a
// tag, and this pattern simply never matches it (the space isn't a word
// character). Unicode-aware (`\p{L}`/`\p{N}` under the `u` flag, matching
// the existing precedent in editor/textDirection.ts's STRONG_LTR_CHAR)
// rather than plain `\w`, which is ASCII-only in JavaScript and would
// otherwise truncate or drop tags containing accented Latin, CJK, or any
// other non-ASCII letters.
const INLINE_TAG_PATTERN =
  /#([\p{L}\p{N}_][\p{L}\p{N}_-]*(?:\/[\p{L}\p{N}_][\p{L}\p{N}_-]*)*)/gu;

function isTagBoundary(char: string | undefined): boolean {
  // Not preceded by a word character (mid-word, "foo#bar"), another `#`
  // (a heading's "##", or a doubled "##tag"), or `/` (a URL fragment like
  // "page/#section"). Anything else, including undefined (start of line),
  // is a valid boundary. Kept Unicode-aware in step with
  // INLINE_TAG_PATTERN above so boundary detection and tag-body matching
  // agree on what counts as a "word" character.
  return char === undefined || !/[\p{L}\p{N}_#/]/u.test(char);
}

/**
 * Extracts `#tag` occurrences from a note's body text (see extractTags
 * below for the frontmatter `tags:` field, this app's other tagging
 * convention). Skips fenced code blocks and inline code spans, via a
 * plain line-by-line fence/backtick scan rather than a full CommonMark
 * parser: `#` is extremely common and meaningless in real code (C's
 * `#include`, `#define`, a shebang line) in a way it essentially never is
 * for `[[wikilinks]]`, which is why linking/store.ts's extractWikilinks
 * doesn't bother with this same exclusion.
 */
export function extractInlineTags(body: string): string[] {
  const tags: string[] = [];
  let inFence = false;

  for (const rawLine of body.split(/\r?\n/)) {
    if (FENCE_LINE.test(rawLine)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const line = rawLine.replace(INLINE_CODE_SPAN, (span) => " ".repeat(span.length));
    INLINE_TAG_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = INLINE_TAG_PATTERN.exec(line))) {
      const before = match.index > 0 ? line[match.index - 1] : undefined;
      if (isTagBoundary(before)) tags.push(match[1]);
    }
  }

  return tags;
}

/**
 * Every tag a note carries, combining inline `#tag` syntax with the
 * `tags:` frontmatter field, canonicalized to lowercase and de-duplicated.
 * Lowercasing (rather than preserving whichever casing was typed) is a
 * deliberate simplification, the same trade-off this app already makes
 * for wikilink/alias resolution elsewhere: two notes spelling what's meant
 * to be the same tag differently (`#Project` inline on one, `tags:
 * [project]` in another's frontmatter) would otherwise need an arbitrary
 * rule for which casing "wins" for display; canonicalizing both to
 * lowercase sidesteps that entirely; tags are effectively case-insensitive
 * everywhere else in this app for the same reason.
 */
export function extractTags(source: string): string[] {
  const body = stripFrontmatterBlock(source);
  const raw = [...extractFrontmatterTags(source), ...extractInlineTags(body)];
  return Array.from(new Set(raw.map((tag) => tag.toLocaleLowerCase())));
}

/** One node in the tag tree built by buildTagTree below. `/`-separated
 * tag segments (`work/project`) nest as a tree so the Tags panel can show
 * a collapsible hierarchy instead of one flat list, the "nesting" half of
 * this backlog item. */
export interface TagTreeNode {
  /** This node's own segment only (e.g. "project" for the "work/project"
   * node), what the panel actually displays as this row's label. */
  segment: string;
  /** The full, `/`-joined tag this node represents (e.g. "work/project"),
   * used to look up its own notes in pathsByTag and as this node's key. */
  fullTag: string;
  /** Notes tagged with `fullTag` exactly, not children's tags. */
  paths: string[];
  /** Every path in `paths` plus every path under any descendant node,
   * de-duplicated: a note tagged with both "work" and "work/project"
   * would otherwise get double-counted in "work"'s aggregate. This is
   * what the panel shows as a parent node's count, and expands to when a
   * parent node (rather than one of its children) is clicked. */
  allPaths: string[];
  children: TagTreeNode[];
}

function collectAllPaths(node: TagTreeNode): string[] {
  const seen = new Set(node.paths);
  for (const child of node.children) {
    for (const path of collectAllPaths(child)) seen.add(path);
  }
  return Array.from(seen);
}

/**
 * Groups `pathsByTag` (lowercased tag -> the notes carrying it, see
 * linking/store.ts's LinkIndex) into a tree by `/`-separated segment, for
 * the Tags panel. A tag like "work/project" with no note ever tagged
 * bare "work" still creates an intermediate "work" node with an empty
 * `paths` (but a non-empty `allPaths`, aggregated from its children) so
 * the hierarchy has somewhere to attach, the same behavior the wider
 * note-taking ecosystem's own nested tag panes have.
 */
export function buildTagTree(pathsByTag: Map<string, string[]>): TagTreeNode[] {
  const roots: TagTreeNode[] = [];
  const nodesByFullTag = new Map<string, TagTreeNode>();

  function getOrCreate(segments: string[]): TagTreeNode {
    const fullTag = segments.join("/");
    const existing = nodesByFullTag.get(fullTag);
    if (existing) return existing;

    const node: TagTreeNode = {
      segment: segments[segments.length - 1],
      fullTag,
      paths: [],
      allPaths: [],
      children: [],
    };
    nodesByFullTag.set(fullTag, node);
    if (segments.length === 1) {
      roots.push(node);
    } else {
      getOrCreate(segments.slice(0, -1)).children.push(node);
    }
    return node;
  }

  for (const tag of Array.from(pathsByTag.keys()).sort()) {
    getOrCreate(tag.split("/")).paths = pathsByTag.get(tag) ?? [];
  }

  function finalize(nodes: TagTreeNode[]): void {
    nodes.sort((a, b) => a.segment.localeCompare(b.segment));
    for (const node of nodes) {
      finalize(node.children);
      node.allPaths = collectAllPaths(node);
    }
  }
  finalize(roots);

  return roots;
}
