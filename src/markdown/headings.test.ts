import { describe, expect, it } from "vitest";
import { normalizeHeadingKey, scanHeadings, stripInlineMarkdownFormatting } from "./headings";

describe("scanHeadings", () => {
  it("returns an empty array for a note with no headings", () => {
    expect(scanHeadings("Just a paragraph.\n\nAnother one.")).toEqual([]);
  });

  it("recognizes ATX headings of every level in source order", () => {
    const source = "# One\n## Two\n### Three\n#### Four\n##### Five\n###### Six\n";
    const headings = scanHeadings(source);
    expect(headings.map((h) => [h.level, h.displayText])).toEqual([
      [1, "One"],
      [2, "Two"],
      [3, "Three"],
      [4, "Four"],
      [5, "Five"],
      [6, "Six"],
    ]);
    expect(headings.map((h) => h.line)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("reports the exact source line for each ATX heading", () => {
    const source = "Intro\n\n## Section\n\nBody.";
    const [heading] = scanHeadings(source);
    expect(source.slice(heading.sourceFrom, heading.sourceTo)).toBe("## Section");
    expect(source.slice(heading.contentFrom, heading.contentTo)).toBe("Section");
  });

  it("does not treat a hash run with no following space as a heading", () => {
    expect(scanHeadings("#NoSpace heading")).toEqual([]);
  });

  it("does not treat more than six leading hashes as a heading", () => {
    expect(scanHeadings("####### Seven hashes")).toEqual([]);
  });

  it("treats a bare hash run with no text as an empty heading", () => {
    const [heading] = scanHeadings("#\nBody");
    expect(heading.level).toBe(1);
    expect(heading.displayText).toBe("");
    expect(heading.contentFrom).toBe(heading.contentTo);
  });

  it("strips an optional closing hash sequence but keeps hashes that are part of the text", () => {
    expect(scanHeadings("# Hello ##")[0].displayText).toBe("Hello");
    expect(scanHeadings("# Hello    ##  ")[0].displayText).toBe("Hello");
    expect(scanHeadings("# ###")[0].displayText).toBe("###");
  });

  it("recognizes setext level 1 and level 2 headings", () => {
    const source = "Title\n=====\n\nSubtitle\n---\n";
    const headings = scanHeadings(source);
    expect(headings.map((h) => [h.level, h.displayText])).toEqual([
      [1, "Title"],
      [2, "Subtitle"],
    ]);
    expect(source.slice(headings[0].sourceFrom, headings[0].sourceTo)).toBe("Title\n=====");
    expect(source.slice(headings[0].contentFrom, headings[0].contentTo)).toBe("Title");
  });

  it("does not reinterpret an ATX heading's own line as setext text for a following underline-like line", () => {
    const source = "# Heading\n---\nBody";
    const headings = scanHeadings(source);
    expect(headings).toHaveLength(1);
    expect(headings[0].displayText).toBe("Heading");
    expect(headings[0].level).toBe(1);
  });

  it("does not treat a setext-like underline after a blank line as a heading", () => {
    const source = "\n---\nBody";
    expect(scanHeadings(source)).toEqual([]);
  });

  it("builds heading hierarchy from the nearest preceding lower-level heading, skipping missing levels", () => {
    const source = "# Product\n### Constraints\n## Delivery\n#### Android\n";
    const headings = scanHeadings(source);
    const byText = new Map(headings.map((h) => [h.displayText, h]));
    const product = byText.get("Product")!;
    const constraints = byText.get("Constraints")!;
    const delivery = byText.get("Delivery")!;
    const android = byText.get("Android")!;

    expect(product.parentIndex).toBeUndefined();
    expect(constraints.parentIndex).toBe(headings.indexOf(product));
    expect(delivery.parentIndex).toBe(headings.indexOf(product));
    expect(android.parentIndex).toBe(headings.indexOf(delivery));
    expect(product.childIndexes).toEqual([headings.indexOf(constraints), headings.indexOf(delivery)]);
    expect(delivery.childIndexes).toEqual([headings.indexOf(android)]);
    expect(constraints.childIndexes).toEqual([]);
  });

  it("computes section ranges that extend through nested descendants until the next same-or-higher-level heading", () => {
    const source = "# A\ntext a\n## B\ntext b\n### C\ntext c\n# D\ntext d";
    const headings = scanHeadings(source);
    const [a, b, c, d] = headings;
    expect(source.slice(a.sectionFrom, a.sectionTo)).toBe(source.slice(a.sourceFrom, source.indexOf("# D")));
    expect(source.slice(b.sectionFrom, b.sectionTo)).toBe(source.slice(b.sourceFrom, source.indexOf("# D")));
    expect(source.slice(c.sectionFrom, c.sectionTo)).toBe(source.slice(c.sourceFrom, source.indexOf("# D")));
    expect(d.sectionTo).toBe(source.length);
  });

  it("assigns increasing occurrence numbers to headings sharing a normalized key", () => {
    const source = "# Overview\n## overview\n### OVERVIEW\n#### Different\n";
    const headings = scanHeadings(source);
    expect(headings.map((h) => h.occurrence)).toEqual([1, 2, 3, 1]);
    expect(headings[0].key).toBe(headings[1].key);
    expect(headings[0].key).toBe(headings[2].key);
  });

  it("strips inline formatting for display text but keeps rawText close to source", () => {
    const [heading] = scanHeadings("## **Bold** and *italic* text");
    expect(heading.displayText).toBe("Bold and italic text");
    expect(heading.rawText).toBe("**Bold** and *italic* text");
  });

  it("unescapes backslash-escaped Markdown punctuation", () => {
    expect(scanHeadings("# Escaped \\# hash")[0].displayText).toBe("Escaped # hash");
  });

  it("decodes common HTML entities", () => {
    expect(scanHeadings("# A &amp; B")[0].displayText).toBe("A & B");
    expect(scanHeadings("# Caf&#233;")[0].displayText).toBe("Café");
  });

  it("resolves wikilinks in heading text to their label or target", () => {
    expect(scanHeadings("# See [[Other Note|Alias]]")[0].displayText).toBe("See Alias");
    expect(scanHeadings("# See [[Other Note]]")[0].displayText).toBe("See Other Note");
  });

  it("resolves a Markdown link in heading text to its link text", () => {
    expect(scanHeadings("# See [the docs](https://example.com)")[0].displayText).toBe("See the docs");
  });

  it("preserves unicode text, including surrogate-pair emoji, in heading text", () => {
    expect(scanHeadings("# Emoji \u{1F600} heading")[0].displayText).toBe("Emoji \u{1F600} heading");
  });

  it("collapses internal whitespace runs in display text", () => {
    expect(scanHeadings("#    Extra   spaces   here")[0].displayText).toBe("Extra spaces here");
  });

  it("ignores heading-like lines inside a fenced code block", () => {
    const source = "# Real heading\n```\n# Not a heading\n```\n## Also real\n";
    const headings = scanHeadings(source);
    expect(headings.map((h) => h.displayText)).toEqual(["Real heading", "Also real"]);
  });

  it("ignores heading-like lines inside a tilde-fenced code block", () => {
    const source = "~~~\n# Not a heading\n~~~\n# Real\n";
    expect(scanHeadings(source).map((h) => h.displayText)).toEqual(["Real"]);
  });

  it("treats an unclosed fence as consuming the rest of the document", () => {
    const source = "# Real\n```\n# Not a heading\n## Also not\n";
    expect(scanHeadings(source).map((h) => h.displayText)).toEqual(["Real"]);
  });

  it("ignores heading-like lines inside a single-line HTML comment", () => {
    const source = "# Real\n<!-- # Not a heading -->\n## Also real\n";
    expect(scanHeadings(source).map((h) => h.displayText)).toEqual(["Real", "Also real"]);
  });

  it("ignores heading-like lines inside a multi-line HTML comment", () => {
    const source = "# Real\n<!--\n# Not a heading\n## Also not\n-->\n### Still real\n";
    expect(scanHeadings(source).map((h) => h.displayText)).toEqual(["Real", "Still real"]);
  });

  it("produces the same headings for LF and CRLF variants of the same document", () => {
    const lf = "# One\nBody one\n## Two\nBody two\n";
    const crlf = lf.replace(/\n/g, "\r\n");
    const lfHeadings = scanHeadings(lf);
    const crlfHeadings = scanHeadings(crlf);
    expect(crlfHeadings.map((h) => h.displayText)).toEqual(lfHeadings.map((h) => h.displayText));
    for (const heading of crlfHeadings) {
      expect(crlf.slice(heading.sourceFrom, heading.sourceTo).replace(/\r\n/g, "\n")).toBe(
        lf.slice(
          lfHeadings[crlfHeadings.indexOf(heading)].sourceFrom,
          lfHeadings[crlfHeadings.indexOf(heading)].sourceTo,
        ),
      );
    }
  });

  it("scans a large number of headings without losing correctness", () => {
    const lines: string[] = [];
    for (let i = 0; i < 2000; i++) lines.push(`## Heading ${i}`);
    const source = lines.join("\n");
    const headings = scanHeadings(source);
    expect(headings).toHaveLength(2000);
    expect(headings[0].displayText).toBe("Heading 0");
    expect(headings[1999].displayText).toBe("Heading 1999");
    expect(headings.every((h) => h.level === 2)).toBe(true);
  });
});

describe("normalizeHeadingKey", () => {
  it("case-folds and collapses whitespace", () => {
    expect(normalizeHeadingKey("  Design   System  ")).toBe("design system");
    expect(normalizeHeadingKey("DESIGN SYSTEM")).toBe(normalizeHeadingKey("design system"));
  });

  it("retains punctuation and diacritics", () => {
    expect(normalizeHeadingKey("Café: Notes!")).toBe("café: notes!");
  });
});

describe("stripInlineMarkdownFormatting", () => {
  it("removes inline code span backticks but keeps their content", () => {
    expect(stripInlineMarkdownFormatting("Use `npm install` here")).toBe("Use npm install here");
  });

  it("removes image markup, keeping only the alt text", () => {
    expect(stripInlineMarkdownFormatting("![alt text](image.png)")).toBe("alt text");
  });

  it("removes strikethrough markup", () => {
    expect(stripInlineMarkdownFormatting("~~old~~ new")).toBe("old new");
  });
});
