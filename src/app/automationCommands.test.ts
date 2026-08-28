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
});
