import { describe, expect, it } from "vitest";
import { parseAutomationUrl } from "./automationCommands";

describe("parseAutomationUrl", () => {
  it("recognizes read-current-note", () => {
    expect(parseAutomationUrl("leotheca://read-current-note")).toEqual({
      kind: "read-current-note",
    });
  });

  it("recognizes new-note with a URL-decoded content param", () => {
    expect(parseAutomationUrl("leotheca://new-note?content=Hello%20World%0ALine%202")).toEqual({
      kind: "new-note",
      content: "Hello World\nLine 2",
    });
  });

  it("defaults new-note's content to an empty string when the param is missing", () => {
    expect(parseAutomationUrl("leotheca://new-note")).toEqual({ kind: "new-note", content: "" });
  });

  it("recognizes the command that opens favorites", () => {
    expect(parseAutomationUrl("leotheca://open-favorites")).toEqual({ kind: "open-favorites" });
  });

  it("recognizes open-note with a URL-decoded path param", () => {
    expect(parseAutomationUrl("leotheca://open-note?path=%2Fworkspace%2Fnotes%2FTodo.md")).toEqual({
      kind: "open-note",
      path: "/workspace/notes/Todo.md",
    });
  });

  it("returns null for open-note with no path param", () => {
    expect(parseAutomationUrl("leotheca://open-note")).toBeNull();
  });

  it("returns null for open-note with an empty path param", () => {
    expect(parseAutomationUrl("leotheca://open-note?path=")).toBeNull();
  });

  it("recognizes capture with text", () => {
    expect(parseAutomationUrl("leotheca://capture?text=Quick%20note")).toEqual({
      kind: "capture",
      text: "Quick note",
    });
  });

  it("recognizes capture with content (backward compatibility)", () => {
    expect(parseAutomationUrl("leotheca://capture?content=Quick%20note")).toEqual({
      kind: "capture",
      text: "Quick note",
    });
  });

  it("recognizes capture without text", () => {
    expect(parseAutomationUrl("leotheca://capture")).toEqual({ kind: "capture", text: "" });
  });

  it("recognizes capture with all F05 parameters", () => {
    expect(parseAutomationUrl("leotheca://capture?text=Hello&title=Note&url=https://example.com&mode=append&profile=123&open=true")).toEqual({
      kind: "capture",
      text: "Hello",
      title: "Note",
      url: "https://example.com",
      mode: "append",
      profile: "123",
      open: true,
    });
  });

  it("ignores query params other than content", () => {
    expect(parseAutomationUrl("leotheca://new-note?content=Hi&extra=ignored")).toEqual({
      kind: "new-note",
      content: "Hi",
    });
  });

  it("returns null for a different scheme, even with a matching command name", () => {
    expect(parseAutomationUrl("https://read-current-note")).toBeNull();
  });

  it("returns null for an unrecognized command", () => {
    expect(parseAutomationUrl("leotheca://delete-everything")).toBeNull();
  });

  it("returns null for a malformed URL instead of throwing", () => {
    expect(parseAutomationUrl("not a url")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(parseAutomationUrl("")).toBeNull();
  });

  it("rejects capture payload exceeding 32 KiB limit", () => {
    // Create a payload that exceeds 32 KiB
    const largeText = "x".repeat(32 * 1024 + 1); // 32 KiB + 1 byte
    const result = parseAutomationUrl(`leotheca://capture?text=${largeText}`);
    expect(result).toBeNull();
  });

  it("accepts capture payload within 32 KiB limit", () => {
    // Create a payload that is within 32 KiB
    const text = "x".repeat(32 * 1024 - 100); // Just under 32 KiB
    const result = parseAutomationUrl(`leotheca://capture?text=${text}`);
    expect(result).not.toBeNull();
    expect(result?.kind).toBe("capture");
    const captureResult = result as { kind: "capture"; text: string; title?: string; url?: string; mode?: string; profile?: string; open?: boolean };
    expect(captureResult.text).toBe(text);
  });

  // Spec section 5.2 documents `text` as a UTF-8 body and the 32 KiB limit
  // in bytes. U+4E2D ("中") is one UTF-16 code unit (JS string .length
  // counts 1) but encodes to 3 bytes in UTF-8, so a naive `.length`-based
  // check badly under-counts real-world multi-byte captures (CJK, emoji,
  // accented Latin, Cyrillic, ...), letting genuinely oversized payloads
  // through.
  it("rejects a capture payload whose real UTF-8 byte size exceeds 32 KiB even though its UTF-16 length does not", () => {
    const text = "中".repeat(11000); // .length === 11000, UTF-8 byte size === 33000
    expect(text.length).toBeLessThan(32 * 1024);
    const result = parseAutomationUrl(`leotheca://capture?text=${encodeURIComponent(text)}`);
    expect(result).toBeNull();
  });

  it("accepts a capture payload whose real UTF-8 byte size is within 32 KiB even with multi-byte text", () => {
    const text = "中".repeat(10000); // .length === 10000, UTF-8 byte size === 30000
    const result = parseAutomationUrl(`leotheca://capture?text=${encodeURIComponent(text)}`);
    expect(result).not.toBeNull();
    expect(result?.kind).toBe("capture");
  });
});
