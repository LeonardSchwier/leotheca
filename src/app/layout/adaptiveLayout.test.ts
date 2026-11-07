import { describe, expect, it } from "vitest";
import {
  classifyLayout,
  LAYOUT_BREAKPOINTS,
  navigationPanelOverlays,
  showsActivityRail,
} from "./adaptiveLayout";

describe("classifyLayout", () => {
  it("classifies the minimum supported viewport (320px, spec 12.6) as compact", () => {
    expect(classifyLayout(320)).toBe("compact");
  });

  it("classifies every boundary exactly per spec section 12.1's reference table", () => {
    expect(classifyLayout(0)).toBe("compact");
    expect(classifyLayout(LAYOUT_BREAKPOINTS.mediumMin - 1)).toBe("compact");
    expect(classifyLayout(LAYOUT_BREAKPOINTS.mediumMin)).toBe("medium");
    expect(classifyLayout(LAYOUT_BREAKPOINTS.wideMin - 1)).toBe("medium");
    expect(classifyLayout(LAYOUT_BREAKPOINTS.wideMin)).toBe("wide");
    expect(classifyLayout(LAYOUT_BREAKPOINTS.expandedMin - 1)).toBe("wide");
    expect(classifyLayout(LAYOUT_BREAKPOINTS.expandedMin)).toBe("expanded");
    expect(classifyLayout(LAYOUT_BREAKPOINTS.expandedMin + 1000)).toBe("expanded");
  });
});

describe("showsActivityRail", () => {
  it("is false for compact only", () => {
    expect(showsActivityRail("compact")).toBe(false);
  });

  it("is true for medium, wide, and expanded (spec 13.2's '720px and above')", () => {
    expect(showsActivityRail("medium")).toBe(true);
    expect(showsActivityRail("wide")).toBe(true);
    expect(showsActivityRail("expanded")).toBe(true);
  });
});

describe("navigationPanelOverlays", () => {
  it("is true for medium only", () => {
    expect(navigationPanelOverlays("medium")).toBe(true);
  });

  it("is false for compact, wide, and expanded", () => {
    expect(navigationPanelOverlays("compact")).toBe(false);
    expect(navigationPanelOverlays("wide")).toBe(false);
    expect(navigationPanelOverlays("expanded")).toBe(false);
  });
});
