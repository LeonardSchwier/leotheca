/**
 * fuzzyMatch.ts — offline, dependency-free fuzzy matching.
 *
 * Design:
 *  - Case-insensitive.
 *  - A query matches a target if the query's characters appear in the target
 *    in order (subsequence match), OR the query is a substring of the target.
 *  - Scoring (higher = better):
 *    1. Word-start bonus: each query character that matches at the start of a
 *       word (i.e. preceded by a non-word character or at position 0) in the
 *       target gets +2 per matched character.
 *    2. Consecutive-run bonus: consecutive matched characters in the target
 *       get +1 per character (to prefer compact matches).
 *    3. Base score: +1 for every matched query character.
 *    4. Penalty: -1 per "gap" character between matched characters in the
 *       target (to penalise scattered matches).
 *
 *  The result is a score ≥ 1 for a match, or -1 for no match.
 */

/**
 * Score how well `query` fuzzy-matches `target`.
 * Returns -1 if no match, otherwise a positive integer score (higher = better).
 */
export function fuzzyScore(query: string, target: string): number {
  if (!query) return 1; // empty query matches everything with base score
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (q.length > t.length) return -1;

  // Subsequence walk with scoring
  let qi = 0;
  let score = 0;
  let prevMatched = -2; // position of last matched char in target

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) continue;
    // Matched q[qi] at position ti
    score += 1; // base

    // Word-start bonus: ti is at start or preceded by non-word char
    if (ti === 0 || !isWordChar(t[ti - 1])) {
      score += 2;
    }

    // Consecutive-run bonus
    if (ti === prevMatched + 1) {
      score += 1;
    } else {
      // Gap penalty for characters between prev match and this one
      if (prevMatched >= 0) {
        const gap = ti - prevMatched - 1;
        score -= gap;
      }
    }

    prevMatched = ti;
    qi += 1;
  }

  if (qi < q.length) return -1; // not all query chars matched
  return score;
}

/**
 * Filter and sort `items` by fuzzy match against `query`.
 * Returns items sorted by score descending (only items that match).
 */
export function fuzzyFilter<T>(
  query: string,
  items: T[],
  getLabel: (item: T) => string
): T[] {
  if (!query) return items;
  const scored: { item: T; score: number }[] = [];
  for (const item of items) {
    const s = fuzzyScore(query, getLabel(item));
    if (s >= 1) scored.push({ item, score: s });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map(({ item }) => item);
}

function isWordChar(c: string): boolean {
  return /[a-z0-9_]/i.test(c);
}
