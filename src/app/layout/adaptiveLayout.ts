/** UX-01 spec section 12.1/24.3, UX-001: one shared classification of the
 * available-width layout classes, so no feature gets its own copy of these
 * breakpoint numbers. This module is a pure function only -- the one
 * reactive viewport subscription per application (24.3's "not one per
 * control") already lives in App.tsx's own `viewportWidth` signal (added
 * for F07's split-pane compact switching); callers pass that signal's
 * current value in rather than this module subscribing to `resize` itself,
 * so there is still exactly one listener, not two.
 *
 * Boundaries match the spec's own reference table exactly:
 *   Compact  0px   - 719px
 *   Medium   720px - 1099px
 *   Wide     1100px - 1279px
 *   Expanded 1280px and above
 */
export type LayoutClass = "compact" | "medium" | "wide" | "expanded";

export const LAYOUT_BREAKPOINTS = {
  mediumMin: 720,
  wideMin: 1100,
  expandedMin: 1280,
} as const;

export function classifyLayout(viewportWidth: number): LayoutClass {
  if (viewportWidth >= LAYOUT_BREAKPOINTS.expandedMin) return "expanded";
  if (viewportWidth >= LAYOUT_BREAKPOINTS.wideMin) return "wide";
  if (viewportWidth >= LAYOUT_BREAKPOINTS.mediumMin) return "medium";
  return "compact";
}

/** Section 13.2 itself specifies the Activity Rail at "720px and above"
 * (Medium, Wide, and Expanded alike), but section 30's own Phase 2
 * guidance is to "start at Wide and Expanded layouts while preserving the
 * current narrow path temporarily": at Medium width the Navigation Panel
 * is supposed to become a floating overlay rather than a docked column
 * (12.1/12.4), which is real, separate work this pass doesn't attempt --
 * the existing `.sidebar` is a plain docked column today, correct for
 * Wide/Expanded's row in the layout-class table but not for Medium's.
 * Scoped to Wide+ only for now, disclosed here rather than silently
 * matching the spec's own wider "720px and above" wording; widening this
 * to Medium is real follow-up work once the overlay behavior exists. */
export function showsActivityRail(layoutClass: LayoutClass): boolean {
  return layoutClass === "wide" || layoutClass === "expanded";
}
