import { describe, expect, it } from "vitest";
import {
  nextUiZoom,
  zoomActionForKey,
  zoomActionForWheel,
} from "./zoomControls";

describe("zoomActionForKey", () => {
  it("accepts both keyboard representations of plus", () => {
    expect(zoomActionForKey("+")).toBe("in");
    expect(zoomActionForKey("=")).toBe("in");
  });

  it("maps minus and zero, and ignores unrelated keys", () => {
    expect(zoomActionForKey("-")).toBe("out");
    expect(zoomActionForKey("0")).toBe("reset");
    expect(zoomActionForKey("k")).toBeNull();
  });
});

describe("zoomActionForWheel", () => {
  it("uses the wheel direction and ignores a zero delta", () => {
    expect(zoomActionForWheel(-1)).toBe("in");
    expect(zoomActionForWheel(1)).toBe("out");
    expect(zoomActionForWheel(0)).toBeNull();
  });
});

describe("nextUiZoom", () => {
  it("changes zoom in fixed steps and resets to 100 percent", () => {
    expect(nextUiZoom(100, "in")).toBe(110);
    expect(nextUiZoom(100, "out")).toBe(90);
    expect(nextUiZoom(170, "reset")).toBe(100);
  });

  it("clamps repeated changes to the Settings limits", () => {
    expect(nextUiZoom(200, "in")).toBe(200);
    expect(nextUiZoom(50, "out")).toBe(50);
  });
});
