import { describe, expect, it } from "vitest";
import { NARROW_VIEWPORT_MAX_WIDTH, isNarrowViewport } from "./responsiveLayout";

describe("isNarrowViewport", () => {
  it("uses the same inclusive boundary as the narrow-screen media query", () => {
    expect(isNarrowViewport(NARROW_VIEWPORT_MAX_WIDTH - 1)).toBe(true);
    expect(isNarrowViewport(NARROW_VIEWPORT_MAX_WIDTH)).toBe(true);
    expect(isNarrowViewport(NARROW_VIEWPORT_MAX_WIDTH + 1)).toBe(false);
  });
});
