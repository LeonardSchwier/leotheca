import { describe, expect, it } from "vitest";
import { nextSplitAuthority } from "./splitAuthority";

describe("nextSplitAuthority", () => {
  it("resolves a source-cursor event to source authority", () => {
    expect(nextSplitAuthority("source-cursor")).toBe("source");
  });

  it("resolves a preview-interaction event to preview authority", () => {
    expect(nextSplitAuthority("preview-interaction")).toBe("preview");
  });

  it("resolves a note-changed event to the source default", () => {
    expect(nextSplitAuthority("note-changed")).toBe("source");
  });

  it("is stateless: the same event always resolves the same way regardless of prior calls", () => {
    expect(nextSplitAuthority("preview-interaction")).toBe("preview");
    expect(nextSplitAuthority("source-cursor")).toBe("source");
    expect(nextSplitAuthority("preview-interaction")).toBe("preview");
  });
});
