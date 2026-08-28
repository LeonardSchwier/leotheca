/**
 * The "operators" half of the market-solution-comparison backlog's
 * Advanced Full-Text Search item: `tag:` and `path:` filters, a leading
 * `-` to negate any term (including a quoted phrase), `"quoted phrases"`
 * kept together as one term, and ` OR ` between groups of space-separated
 * (implicitly AND'ed) terms. A bare term (no operator) keeps this app's
 * existing plain filename-first-then-content-fallback substring behavior,
 * unchanged for anyone who never uses an operator.
 *
 * Rewritten (session 61) after a real correctness bug was found in the
 * first version of this file: it decided whether a note's content was
 * even worth reading by first evaluating every term against `content:
 * null`, and a *negated* text term against `null` content resolves to
 * "true" (absence can't be disproven by nothing), so any query built
 * entirely from negated text terms (or a mix where every other term was
 * already satisfied by the name) matched every note whose *name* didn't
 * contain the excluded word, without ever actually reading a single file
 * to check whether its content did. `-badword` was effectively a no-op
 * filter. Confirmed with a reproduction (fileTreeStore.test.ts's "a
 * negated text term is checked against real content, not assumed absent"
 * test) before this rewrite, and again after, now passing. The lazy,
 * per-clause evaluation below (content is only ever read via
 * `getContentLower()`, and only when a clause actually needs it, never
 * assumed one way or the other) doesn't have anywhere for that class of
 * bug to hide, unlike the previous two-phase "check with null, decide if
 * a real read is worth it" heuristic.
 */

export type SearchClauseKind = "text" | "path" | "tag";

export interface SearchClause {
  kind: SearchClauseKind;
  /** Already lowercased, matching this app's existing case-insensitive
   * search/tag conventions. */
  value: string;
  negate: boolean;
}

/** OR of AND-groups: a note matches if it satisfies every clause in at
 * least one group. An empty array (no groups at all) matches nothing;
 * callers treat a blank query as "clear the search" before ever reaching
 * this, see fileTreeStore.ts's runSearch. */
export type SearchQuery = SearchClause[][];

const PREFIX_PATTERN = /^(tag|path):/i;

/** Splits one OR-group's text into tokens, keeping a `"quoted phrase"`
 * (including any `-`/`tag:`/`path:` prefix immediately before its opening
 * quote) together as a single token instead of splitting on the spaces
 * inside it. */
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < text.length) {
    while (i < text.length && /\s/.test(text[i])) i++;
    if (i >= text.length) break;
    let token = "";
    while (i < text.length && !/\s/.test(text[i])) {
      if (text[i] === '"') {
        const end = text.indexOf('"', i + 1);
        const stop = end === -1 ? text.length : end + 1;
        token += text.slice(i, stop);
        i = stop;
      } else {
        token += text[i];
        i++;
      }
    }
    tokens.push(token);
  }
  return tokens;
}

/** A prefix with nothing after it (`tag:`, `path:` alone) or a lone `-`
 * is treated as literal text instead of an empty, meaningless filter. */
function parseToken(token: string): SearchClause | null {
  let rest = token;
  let negate = false;
  if (rest.startsWith("-") && rest.length > 1) {
    negate = true;
    rest = rest.slice(1);
  }

  let kind: SearchClauseKind = "text";
  const prefixMatch = PREFIX_PATTERN.exec(rest);
  if (prefixMatch && rest.length > prefixMatch[0].length) {
    kind = prefixMatch[1].toLowerCase() as SearchClauseKind;
    rest = rest.slice(prefixMatch[0].length);
  }

  if (rest.startsWith('"')) {
    const end = rest.indexOf('"', 1);
    rest = end !== -1 ? rest.slice(1, end) : rest.slice(1);
  }

  const value = rest.toLowerCase();
  if (!value) return null;
  return { kind, value, negate };
}

/** Splits on a literal, whitespace-delimited `OR` (case-sensitive, the
 * same convention the wider note-taking ecosystem's own search syntax
 * uses) so an `OR` inside a quoted phrase isn't mistaken for the
 * operator. */
export function parseSearchQuery(raw: string): SearchQuery {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  const query: SearchQuery = [];
  for (const group of trimmed.split(/\s+OR\s+/)) {
    const clauses = tokenize(group)
      .map(parseToken)
      .filter((clause): clause is SearchClause => clause !== null);
    if (clauses.length > 0) query.push(clauses);
  }
  return query;
}

export interface SearchContext {
  /** The note's file name, lowercased. */
  nameLower: string;
  /** The note's path, lowercased (fileTreeStore.ts passes the path
   * relative to the workspace root, so a `path:` filter doesn't need the
   * user to know the absolute filesystem path). */
  pathLower: string;
  /** The note's own tags (see linking/store.ts's LinkIndex.tagsByPath),
   * already lowercased. */
  tagsLower: string[];
  /** Reads and lowercases the note's content, only when a clause actually
   * needs it to decide a match; the caller (fileTreeStore.ts's runSearch)
   * memoizes this so a note's content is read at most once even when
   * several clauses reference it. Resolves to null for a file that can't
   * or shouldn't be read as text (an image, a read error) - a plain
   * (non-negated) text clause can never match through null content, and
   * a negated one is only satisfied by a genuine, resolved absence, null
   * included, never assumed before it's actually known. */
  getContentLower: () => Promise<string | null>;
}

async function clauseMatches(clause: SearchClause, ctx: SearchContext): Promise<boolean> {
  let matched: boolean;
  switch (clause.kind) {
    case "tag":
      // A parent tag query (tag:work) also matches a nested tag
      // (work/project), the same aggregation the Tags panel already does
      // (see tags/tags.ts's buildTagTree), so this filter agrees with
      // what the panel shows under that tag.
      matched = ctx.tagsLower.some((tag) => tag === clause.value || tag.startsWith(`${clause.value}/`));
      break;
    case "path":
      matched = ctx.pathLower.includes(clause.value);
      break;
    case "text":
    default:
      matched = ctx.nameLower.includes(clause.value) || ((await ctx.getContentLower())?.includes(clause.value) ?? false);
      break;
  }
  return clause.negate ? !matched : matched;
}

/** `tag`/`path` clauses first, `text` last, stable within each: AND is
 * commutative so this never changes which notes match, only the order
 * clauses are checked in, so a group with any failing `tag:`/`path:`
 * clause bails before ever considering a content read, regardless of
 * which order the user actually typed the terms in. */
function cheapestFirst(group: SearchClause[]): SearchClause[] {
  return [...group].sort((a, b) => Number(a.kind === "text") - Number(b.kind === "text"));
}

/** A note matches if it satisfies every clause in at least one OR-group.
 * Clauses within a group are evaluated cheapest-first and short-circuit
 * (an unsatisfied clause skips the rest of the group), and content is
 * only ever read via ctx.getContentLower() when a `text` clause is
 * actually reached needing it, never assumed either way before that. */
export async function matchesSearchQuery(query: SearchQuery, ctx: SearchContext): Promise<boolean> {
  for (const group of query) {
    let groupMatches = true;
    for (const clause of cheapestFirst(group)) {
      if (!(await clauseMatches(clause, ctx))) {
        groupMatches = false;
        break;
      }
    }
    if (groupMatches) return true;
  }
  return false;
}
