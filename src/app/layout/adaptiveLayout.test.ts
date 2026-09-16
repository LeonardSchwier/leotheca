import { describe, expect, it } from "vitest";
import { classifyLayout, LAYOUT_BREAKPOINTS, showsActivityRail } from "./adaptiveLayout";

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
  it("is false for compact and medium (Medium's Navigation Panel overlay isn't built yet)", () => {
    expect(showsActivityRail("compact")).toBe(false);
    expect(showsActivityRail("medium")).toBe(false);
  });

  it("is true for wide and expanded", () => {
    expect(showsActivityRail("wide")).toBe(true);
    expect(showsActivityRail("expanded")).toBe(true);
  });
});
