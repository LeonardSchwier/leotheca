import { describe, expect, it } from "vitest";
import { announceOutline, headingNavigationAnnouncement, lineNumberAt, outlineAnnouncement } from "./outlineAnnouncements";

describe("lineNumberAt", () => {
  it("returns 1 for an offset on the first line", () => {
    expect(lineNumberAt("first\nsecond\nthird", 2)).toBe(1);
  });

  it("counts a newline immediately before the offset", () => {
    const content = "first\nsecond\nthird";
    const secondLineStart = content.indexOf("second");
    expect(lineNumberAt(content, secondLineStart)).toBe(2);
  });

  it("counts every newline before a later offset", () => {
    const content = "first\nsecond\nthird";
    const thirdLineStart = content.indexOf("third");
    expect(lineNumberAt(content, thirdLineStart)).toBe(3);
  });

  it("returns 1 for content with no newlines at all", () => {
    expect(lineNumberAt("only one line", 5)).toBe(1);
  });

  it("returns 1 for offset 0 regardless of later newlines", () => {
    expect(lineNumberAt("first\nsecond\nthird", 0)).toBe(1);
  });
});

describe("headingNavigationAnnouncement", () => {
  it("names the heading and its 1-based line number", () => {
    const content = "Intro\n\n## Section one\nBody.";
    const offset = content.indexOf("## Section one") + 3;
    expect(headingNavigationAnnouncement("Section one", content, offset)).toBe(
      "Navigated to Section one, line 3.",
    );
  });
});

describe("announceOutline", () => {
  it("bumps requestId on every call, even with the identical message", () => {
    announceOutline("Copied link to Section one.");
    const first = outlineAnnouncement.value;
    announceOutline("Copied link to Section one.");
    const second = outlineAnnouncement.value;
    expect(first?.message).toBe("Copied link to Section one.");
    expect(second?.message).toBe("Copied link to Section one.");
    expect(second?.requestId).not.toBe(first?.requestId);
  });
});
