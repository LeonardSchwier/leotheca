import { describe, expect, it } from "vitest";
import { scanHeadings } from "../markdown/headings";
import { activeHeadingIndex, breadcrumbChain } from "./outlineActiveSection";

describe("activeHeadingIndex", () => {
  it("returns undefined before the first heading", () => {
    const source = "Intro text.\n\n# First heading\nBody.";
    const headings = scanHeadings(source);
    expect(activeHeadingIndex(headings, 0)).toBeUndefined();
    expect(activeHeadingIndex(headings, headings[0].sourceFrom - 1)).toBeUndefined();
  });

  it("returns the heading whose own line contains the cursor", () => {
    const source = "# First\nBody.\n## Second\nMore body.";
    const headings = scanHeadings(source);
    const cursorInsideSecondHeadingLine = headings[1].contentFrom + 1;
    expect(activeHeadingIndex(headings, cursorInsideSecondHeadingLine)).toBe(1);
  });

  it("returns the nearest preceding heading for a cursor in its body", () => {
    const source = "# First\nBody one.\n## Second\nBody two, more text here.";
    const headings = scanHeadings(source);
    const cursorInSecondBody = source.indexOf("more text here");
    expect(activeHeadingIndex(headings, cursorInSecondBody)).toBe(1);
  });

  it("returns the last heading for a cursor after every heading", () => {
    const source = "# First\nBody.\n## Second\nMore.";
    const headings = scanHeadings(source);
    expect(activeHeadingIndex(headings, source.length)).toBe(1);
  });

  it("returns undefined for a note with no headings", () => {
    expect(activeHeadingIndex([], 5)).toBeUndefined();
  });
});

describe("breadcrumbChain", () => {
  it("returns an empty chain when there is no active heading", () => {
    const headings = scanHeadings("# One\n");
    expect(breadcrumbChain(headings, undefined)).toEqual([]);
  });

  it("returns root-first ancestors ending with the active heading", () => {
    const source = "# Product\n### Constraints\n## Delivery\n#### Android\n";
    const headings = scanHeadings(source);
    const androidIndex = headings.findIndex((h) => h.displayText === "Android");
    const chain = breadcrumbChain(headings, androidIndex);
    expect(chain.map((h) => h.displayText)).toEqual(["Product", "Delivery", "Android"]);
  });

  it("returns just the active heading when it has no heading ancestor", () => {
    const headings = scanHeadings("# Top level\n");
    expect(breadcrumbChain(headings, 0).map((h) => h.displayText)).toEqual(["Top level"]);
  });
});
