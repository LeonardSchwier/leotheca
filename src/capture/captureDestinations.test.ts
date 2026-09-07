/**
 * Tests for F05 capture destinations functionality
 */

import { describe, expect, it } from "vitest";
import {
  validateDatePattern,
  resolveDatePattern,
  hasDateTokens,
  DATE_TOKENS,
  isValidDestinationMode
} from "./captureDestinations";

describe("validateDatePattern", () => {
  it("accepts valid date tokens", () => {
    DATE_TOKENS.forEach(token => {
      expect(validateDatePattern(`test/${token}/file.md`)).toBe(true);
    });
  });

  it("accepts multiple date tokens in one pattern", () => {
    expect(validateDatePattern("{{date:YYYY}}/{{date:YYYY-MM}}/{{date:YYYY-MM-DD}}.md")).toBe(true);
  });

  it("accepts patterns without date tokens", () => {
    expect(validateDatePattern("Daily/notes.md")).toBe(true);
    expect(validateDatePattern("Inbox.md")).toBe(true);
    expect(validateDatePattern("")).toBe(true);
  });

  it("rejects unsupported tokens", () => {
    expect(validateDatePattern("{{unknown:token}}")).toBe(false);
    expect(validateDatePattern("{{date:unsupported}}")).toBe(false);
    expect(validateDatePattern("{{time:HH-MM}}")).toBe(false);
  });

  it("rejects mixed valid and invalid tokens", () => {
    expect(validateDatePattern("{{date:YYYY-MM-DD}}/{{unknown:token}}.md")).toBe(false);
  });
});

describe("resolveDatePattern", () => {
  it("resolves YYYY-MM-DD token", () => {
    const date = new Date("2026-09-06T12:00:00Z");
    const result = resolveDatePattern("Daily/{{date:YYYY-MM-DD}}.md", date);
    expect(result.path).toBe("Daily/2026-09-06.md");
    expect(result.dateUsed).toBe(date);
  });

  it("resolves YYYY-MM token", () => {
    const date = new Date("2026-09-06T12:00:00Z");
    const result = resolveDatePattern("Monthly/{{date:YYYY-MM}}.md", date);
    expect(result.path).toBe("Monthly/2026-09.md");
  });

  it("resolves YYYY token", () => {
    const date = new Date("2026-09-06T12:00:00Z");
    const result = resolveDatePattern("Yearly/{{date:YYYY}}.md", date);
    expect(result.path).toBe("Yearly/2026.md");
  });

  it("resolves multiple tokens in one pattern", () => {
    const date = new Date("2026-09-06T12:00:00Z");
    const result = resolveDatePattern("{{date:YYYY}}/{{date:YYYY-MM}}/{{date:YYYY-MM-DD}}.md", date);
    expect(result.path).toBe("2026/2026-09/2026-09-06.md");
  });

  it("resolves patterns without tokens unchanged", () => {
    const date = new Date("2026-09-06T12:00:00Z");
    const result = resolveDatePattern("Daily/notes.md", date);
    expect(result.path).toBe("Daily/notes.md");
  });

  it("handles whitespace in tokens", () => {
    const date = new Date("2026-09-06T12:00:00Z");
    const result = resolveDatePattern("Daily/{{ date:YYYY-MM-DD }}.md", date);
    expect(result.path).toBe("Daily/2026-09-06.md");
  });

  it("uses current date when not specified", () => {
    const result = resolveDatePattern("Daily/{{date:YYYY-MM-DD}}.md");
    const today = new Date();
    const expectedYear = today.getFullYear();
    const expectedMonth = String(today.getMonth() + 1).padStart(2, '0');
    const expectedDay = String(today.getDate()).padStart(2, '0');
    expect(result.path).toBe(`Daily/${expectedYear}-${expectedMonth}-${expectedDay}.md`);
  });
});

describe("hasDateTokens", () => {
  it("returns true for patterns with date tokens", () => {
    DATE_TOKENS.forEach(token => {
      expect(hasDateTokens(`path/${token}/file.md`)).toBe(true);
    });
  });

  it("returns false for patterns without date tokens", () => {
    expect(hasDateTokens("Daily/notes.md")).toBe(false);
    expect(hasDateTokens("Inbox.md")).toBe(false);
    expect(hasDateTokens("")).toBe(false);
  });

  it("returns true for patterns with multiple tokens", () => {
    expect(hasDateTokens("{{date:YYYY}}/{{date:MM}}/{{date:DD}}.md")).toBe(true);
  });
});

describe("isValidDestinationMode", () => {
  it("returns true for valid modes", () => {
    expect(isValidDestinationMode("append")).toBe(true);
    expect(isValidDestinationMode("new")).toBe(true);
    expect(isValidDestinationMode("date")).toBe(true);
  });

  it("returns false for invalid modes", () => {
    expect(isValidDestinationMode("invalid")).toBe(false);
    expect(isValidDestinationMode("")).toBe(false);
    expect(isValidDestinationMode("Append")).toBe(false); // case sensitive
  });
});
