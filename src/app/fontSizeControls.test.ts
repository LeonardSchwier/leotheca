import { describe, expect, it } from "vitest";
import { nextFontSize, FONT_SIZE_STEP, type FontSizeAction } from "./fontSizeControls";
import { MIN_FONT_SIZE, MAX_FONT_SIZE, DEFAULT_WORKSPACE_SETTINGS } from "../settings/workspaceSettings";

describe("FONT_SIZE_STEP", () => {
  it("is 1 px", () => {
    expect(FONT_SIZE_STEP).toBe(1);
  });
});

describe("nextFontSize", () => {
  it("increases font size by one step", () => {
    expect(nextFontSize(15, "in")).toBe(16);
  });

  it("decreases font size by one step", () => {
    expect(nextFontSize(15, "out")).toBe(14);
  });

  it("resets to the default font size", () => {
    expect(nextFontSize(18, "reset")).toBe(DEFAULT_WORKSPACE_SETTINGS.fontSize);
    expect(nextFontSize(12, "reset")).toBe(DEFAULT_WORKSPACE_SETTINGS.fontSize);
  });

  it("clamps at the minimum font size", () => {
    expect(nextFontSize(MIN_FONT_SIZE, "out")).toBe(MIN_FONT_SIZE);
    expect(nextFontSize(MIN_FONT_SIZE + 1, "out")).toBe(MIN_FONT_SIZE);
  });

  it("clamps at the maximum font size", () => {
    expect(nextFontSize(MAX_FONT_SIZE, "in")).toBe(MAX_FONT_SIZE);
    expect(nextFontSize(MAX_FONT_SIZE - 1, "in")).toBe(MAX_FONT_SIZE);
  });

  it("handles the full range of actions", () => {
    const actions: FontSizeAction[] = ["in", "out", "reset"];
    for (const action of actions) {
      expect(() => nextFontSize(15, action)).not.toThrow();
    }
  });
});
