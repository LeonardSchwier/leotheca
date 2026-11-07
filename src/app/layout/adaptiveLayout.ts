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

/** Section 13.2: the Activity Rail shows at "720px and above" -- Medium,
 * Wide, and Expanded alike. Compact keeps its own top-bar-and-sheets
 * pattern (12.5) instead. */
export function showsActivityRail(layoutClass: LayoutClass): boolean {
  return layoutClass !== "compact";
}

/** Section 12.1/12.4: at Medium width the Navigation Panel is a
 * floating, collision-safe overlay over the document surface rather than
 * the docked column Wide and Expanded use (12.1's own table: "Activity
 * Rail, overlay Navigation Panel" for Medium vs. "docked Navigation
 * Panel" for Wide/Expanded). The panel's own content and open/closed
 * state are unchanged between the two; only how `.sidebar` is
 * positioned and dismissed differs. */
export function navigationPanelOverlays(layoutClass: LayoutClass): boolean {
  return layoutClass === "medium";
}
