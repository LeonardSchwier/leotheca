import type { HeadingRecord } from "../markdown/headings";

/**
 * The Source-mode active heading for a cursor at `cursorOffset`, per
 * spec/f06-note-outline-heading-breadcrumbs.md section 7.3: before the
 * first heading, there is no active heading (the note root); inside a
 * heading's own line or its section body, the nearest preceding heading
 * is active. `headings` must be in source order (as scanHeadings
 * returns them), since this relies on sourceFrom being non-decreasing to
 * stop at the first heading that starts after the cursor.
 */
export function activeHeadingIndex(
  headings: HeadingRecord[],
  cursorOffset: number,
): number | undefined {
  let result: number | undefined;
  for (let i = 0; i < headings.length; i++) {
    if (headings[i].sourceFrom > cursorOffset) break;
    result = i;
  }
  return result;
}

/**
 * The active heading's ancestor chain, root first, active heading last,
 * for rendering as breadcrumbs (section 7.2). Returns an empty array
 * before the first heading (note root only, per that section's rule
 * "before the first heading, only the note root appears").
 */
export function breadcrumbChain(
  headings: HeadingRecord[],
  activeIndex: number | undefined,
): HeadingRecord[] {
  if (activeIndex === undefined) return [];
  const chain: HeadingRecord[] = [];
  let current: number | undefined = activeIndex;
  while (current !== undefined) {
    chain.unshift(headings[current]);
    current = headings[current].parentIndex;
  }
  return chain;
}
