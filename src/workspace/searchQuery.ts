/**
 * The "operators" half of the market-solution-comparison backlog's
 * Advanced Full-Text Search item: `tag:` and `path:` filters, a leading
 * `-` to negate any term, and multiple space-separated terms combined
 * with AND. A bare term (no prefix) keeps this app's existing plain
 * filename-first-then-content-fallback substring behavior, unchanged for
 * anyone who never uses an operator.
 */

export type SearchTermKind = "text" | "tag" | "path";

export interface SearchTerm {
  kind: SearchTermKind;
  /** Already lowercased, matching this app's existing case-insensitive
   * search convention. */
  value: string;
  negate: boolean;
}

const TAG_PREFIX = "tag:";
const PATH_PREFIX = "path:";

/** Splits a query on whitespace into terms, each read for a leading `-`
 * (negation) and a `tag:`/`path:` prefix. A prefix with nothing after it
 * (`tag:`, `path:` alone) or a lone `-` is treated as literal text instead
 * of an empty, meaningless filter. */
export function parseSearchQuery(query: string): SearchTerm[] {
  return query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      let negate = false;
      let rest = token;
      if (rest.startsWith("-") && rest.length > 1) {
        negate = true;
        rest = rest.slice(1);
      }

      const lower = rest.toLowerCase();
      if (lower.startsWith(TAG_PREFIX) && rest.length > TAG_PREFIX.length) {
        return { kind: "tag", value: lower.slice(TAG_PREFIX.length), negate };
      }
      if (lower.startsWith(PATH_PREFIX) && rest.length > PATH_PREFIX.length) {
        return { kind: "path", value: lower.slice(PATH_PREFIX.length), negate };
      }
      return { kind: "text", value: lower, negate };
    });
}

/** Whether `term` can only be resolved by reading a note's content
 * (a plain text term whose name doesn't already match); `tag:` and
 * `path:` never need it. Used by workspace/fileTreeStore.ts's runSearch
 * to decide whether a file read can be skipped entirely. */
export function needsContent(term: SearchTerm): boolean {
  return term.kind === "text";
}

export interface MatchableNote {
  name: string;
  path: string;
  /** Lowercased already. `null` means unavailable (an image, or a read
   * that failed): a text term not already satisfied by the name can never
   * match through content in that case. */
  content: string | null;
  /** This note's own tags, lowercased (see tags/tags.ts's extractTags),
   * empty when tagging is off or the note has none. */
  tags: string[];
}

function termMatches(term: SearchTerm, note: MatchableNote): boolean {
  let raw: boolean;
  switch (term.kind) {
    case "tag":
      // A tag: filter also matches a more specific nested tag ("work"
      // matches a note tagged only "work/project"), the same convention
      // the wider note-taking ecosystem's own tag search uses.
      raw = note.tags.some((tag) => tag === term.value || tag.startsWith(`${term.value}/`));
      break;
    case "path":
      raw = note.path.toLowerCase().includes(term.value);
      break;
    case "text":
    default:
      raw = note.name.toLowerCase().includes(term.value) || (note.content?.includes(term.value) ?? false);
      break;
  }
  return term.negate ? !raw : raw;
}

/** Every term must match (AND), the same semantics a blank-separated
 * multi-word search already implies. An empty `terms` array (a blank
 * query) matches nothing here; callers treat a blank query as "clear the
 * search" before ever reaching this function, see runSearch. */
export function matchesSearchQuery(terms: SearchTerm[], note: MatchableNote): boolean {
  return terms.length > 0 && terms.every((term) => termMatches(term, note));
}
