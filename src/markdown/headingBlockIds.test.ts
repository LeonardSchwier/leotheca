import { describe, expect, it } from "vitest";
import { resolveBlockLinkAtCursor } from "../editor/blockLinkActions";
import { findBlockAtOffset, scanBlockIds } from "./blocks";
import { scanHeadings } from "./headings";

describe("heading block IDs", () => {
  it("parses an ATX marker without exposing it as heading text", () => {
    const source = "## Architecture boundary ^architecture-boundary";
    const [heading] = scanHeadings(source);
    expect(heading.displayText).toBe("Architecture boundary");
    expect(heading.blockId?.id).toBe("architecture-boundary");
    expect(source.slice(heading.contentFrom, heading.contentTo)).toBe("Architecture boundary");
    expect(source.slice(heading.blockId!.idFrom, heading.blockId!.idTo)).toBe("^architecture-boundary");
  });
  it("recognizes a marker before optional ATX closing hashes", () => {
    const [heading] = scanHeadings("### Shipping ^release ##");
    expect(heading.displayText).toBe("Shipping");
    expect(heading.blockId?.id).toBe("release");
  });
  it("parses a setext heading marker while preserving its underline", () => {
    const source = "Architecture ^arch\n============\nBody";
    const [heading] = scanHeadings(source);
    expect(heading.displayText).toBe("Architecture");
    expect(heading.blockId?.id).toBe("arch");
    expect(source.slice(heading.sourceFrom, heading.sourceTo)).toBe("Architecture ^arch\n============");
  });
  it("leaves malformed heading markers visible", () => {
    const [heading] = scanHeadings("## Heading ^bad_id");
    expect(heading.blockId).toBeUndefined();
    expect(heading.displayText).toBe("Heading ^bad_id");
  });
  it("shares one case-insensitive duplicate namespace with other block kinds", () => {
    const blocks = scanBlockIds("## Heading ^Shared\n\nParagraph. ^shared");
    expect(blocks.map((block) => block.kind)).toEqual(["heading", "paragraph"]);
    expect(blocks.map((block) => block.occurrence)).toEqual([1, 2]);
  });
  it("finds a markerless heading as the block at the cursor", () => {
    const source = "# Markerless heading\n\nBody.";
    expect(findBlockAtOffset(source, source.indexOf("heading"))?.kind).toBe("heading");
  });
  it("lets Copy block link create a marker for a markerless heading", () => {
    const source = "## Heading\n\nBody.";
    const heading = scanHeadings(source)[0];
    const result = resolveBlockLinkAtCursor(source, source.indexOf("Heading") + 2)!;
    expect(result.insertion?.from).toBe(heading.contentTo);
    expect(result.insertion?.text).toMatch(/^ \^b-[a-f0-9]{8}$/);
    expect(result.linkText).toBe(`[[#^${result.insertion!.text.slice(2)}]]`);
  });
});
