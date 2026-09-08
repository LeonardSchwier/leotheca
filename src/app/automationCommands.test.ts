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
});
