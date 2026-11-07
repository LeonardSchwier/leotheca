import { describe, expect, it } from "vitest";
import { scanHeadings } from "../markdown/headings";
import {
  computeVirtualWindow,
  flattenVisibleRows,
  headingKeyId,
  LARGE_OUTLINE_THRESHOLD,
  VIRTUAL_OVERSCAN_ROWS,
  VIRTUAL_ROW_HEIGHT_PX,
} from "./outlineVirtualization";

function makeLargeOutline(count: number): string {
  const lines: string[] = [];
  for (let i = 0; i < count; i++) lines.push(`# Heading ${i}`);
  return lines.join("\n");
}

describe("flattenVisibleRows", () => {
  it("returns every heading, in source order, at depth 0 when there is no hierarchy", () => {
    const headings = scanHeadings("# One\n# Two\n# Three");
    const rows = flattenVisibleRows(headings, new Set(), false, null);
    expect(rows).toEqual([
      { index: 0, depth: 0 },
      { index: 1, depth: 0 },
      { index: 2, depth: 0 },
    ]);
  });

  it("assigns increasing depth to nested headings", () => {
    const headings = scanHeadings("# Product\n## Delivery\n### Android\n## Web");
    const rows = flattenVisibleRows(headings, new Set(), false, null);
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 2, 1]);
  });

  it("omits a collapsed heading's descendants but keeps the heading itself", () => {
    const headings = scanHeadings("# Product\n## Delivery\n### Android\n## Web");
    const collapsed = new Set([headingKeyId(headings[1])]); // collapse "Delivery"
    const rows = flattenVisibleRows(headings, collapsed, false, null);
    expect(rows.map((r) => headings[r.index].displayText)).toEqual(["Product", "Delivery", "Web"]);
  });

  it("ignores collapse state entirely while filtering, matching OutlineRow's own rule", () => {
    const headings = scanHeadings("# Product\n## Delivery\n### Android");
    const collapsed = new Set([headingKeyId(headings[0])]); // collapse "Product"
    // Filter matches "Android" only, but its ancestor chain must stay reachable.
    const visibleIndexes = new Set([2, 1, 0]);
    const rows = flattenVisibleRows(headings, collapsed, true, visibleIndexes);
    expect(rows.map((r) => headings[r.index].displayText)).toEqual(["Product", "Delivery", "Android"]);
  });

  it("excludes a heading the filter does not match and is not an ancestor of a match", () => {
    const headings = scanHeadings("# Product\n## Delivery\n## Marketing");
    const visibleIndexes = new Set([0, 1]); // "Delivery" and its ancestor match; "Marketing" doesn't
    const rows = flattenVisibleRows(headings, new Set(), true, visibleIndexes);
    expect(rows.map((r) => headings[r.index].displayText)).toEqual(["Product", "Delivery"]);
  });

  it("produces the same order the existing nested renderer would, for a realistic mixed-depth document", () => {
    const content = [
      "# Product",
      "## Delivery",
      "### Android",
      "### Linux",
      "## Marketing",
      "# Appendix",
    ].join("\n");
    const headings = scanHeadings(content);
    const rows = flattenVisibleRows(headings, new Set(), false, null);
    // OutlineRow's own DFS: siblings in source order, each one's children
    // immediately after it before moving to the next sibling.
    expect(rows.map((r) => headings[r.index].displayText)).toEqual([
      "Product",
      "Delivery",
      "Android",
      "Linux",
      "Marketing",
      "Appendix",
    ]);
  });
});

describe("computeVirtualWindow", () => {
  it("returns an empty window for zero rows", () => {
    expect(computeVirtualWindow(0, VIRTUAL_ROW_HEIGHT_PX, 0, 300, VIRTUAL_OVERSCAN_ROWS)).toEqual({
      startIndex: 0,
      endIndex: 0,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
    });
  });

  it("windows to the top of a long list when scrollTop is 0", () => {
    const window = computeVirtualWindow(1000, 28, 0, 280, 8);
    // visibleRowCount = ceil(280/28) = 10; overscan 8 on each side, clamped at 0.
    expect(window.startIndex).toBe(0);
    expect(window.endIndex).toBe(18);
    expect(window.topSpacerHeight).toBe(0);
    expect(window.bottomSpacerHeight).toBe((1000 - 18) * 28);
  });

  it("moves the window forward as scrollTop increases, keeping it centered on the scrolled position", () => {
    const window = computeVirtualWindow(1000, 28, 28 * 100, 280, 8);
    // firstVisible = 100; start = 100-8 = 92; visibleRowCount=10; end = 100+10+8=118.
    expect(window.startIndex).toBe(92);
    expect(window.endIndex).toBe(118);
    expect(window.topSpacerHeight).toBe(92 * 28);
    expect(window.bottomSpacerHeight).toBe((1000 - 118) * 28);
  });

  it("clamps the window to the end of the list without overscooting past the last row", () => {
    const window = computeVirtualWindow(100, 28, 28 * 95, 280, 8);
    expect(window.endIndex).toBe(100);
    expect(window.bottomSpacerHeight).toBe(0);
  });

  it("never returns a negative scrollTop's worth of window", () => {
    const window = computeVirtualWindow(100, 28, -50, 280, 8);
    expect(window.startIndex).toBe(0);
    expect(window.topSpacerHeight).toBe(0);
  });

  it("covers every row across a full simulated scroll pass, proving the windowing shortcut never skips a real row", () => {
    // This is the guard the codebase's own "performance shortcut" rule
    // (CONSTITUTION.md, the search '-exclude' bug) calls for: proving
    // what happens when scrolling actually walks the whole list, not
    // just spot-checking one scrollTop.
    const rowCount = 733;
    const rowHeight = 28;
    const viewportHeight = 300;
    const totalHeight = rowCount * rowHeight;
    const seen = new Set<number>();
    for (let scrollTop = 0; scrollTop <= totalHeight; scrollTop += 40) {
      const window = computeVirtualWindow(rowCount, rowHeight, scrollTop, viewportHeight, 8);
      for (let i = window.startIndex; i < window.endIndex; i++) seen.add(i);
    }
    for (let i = 0; i < rowCount; i++) expect(seen.has(i)).toBe(true);
  });
});

describe("LARGE_OUTLINE_THRESHOLD", () => {
  it("matches the spec's stated 500-heading virtualization threshold", () => {
    expect(LARGE_OUTLINE_THRESHOLD).toBe(500);
  });

  it("a fixture at exactly the threshold plus one produces more headings than the threshold", () => {
    const headings = scanHeadings(makeLargeOutline(LARGE_OUTLINE_THRESHOLD + 1));
    expect(headings.length).toBeGreaterThan(LARGE_OUTLINE_THRESHOLD);
  });
});
