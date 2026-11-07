import { describe, expect, it } from "vitest";
import { trimTrailingNewlines } from "./trimTrailingNewlines";

describe("trimTrailingNewlines", () => {
  it("matches the regex it replaces on ordinary input", () => {
    const legacy = (s: string) => s.replace(/(\r?\n)+$/, "");
    for (const s of [
      "",
      "a",
      "a\n",
      "a\r\n",
      "a\n\n\n",
      "a\r\n\r\n",
      "a\n\r\n\n",
      "\n",
      "\r\n",
      "\n\n",
      "a\nb\n",
      "a\rb\r",
      "a\r",
      "a \n",
    ]) {
      expect(trimTrailingNewlines(s), JSON.stringify(s)).toBe(legacy(s));
    }
  });

  it("stays fast on a long run of newlines followed by text", () => {
    // The replaced regex needs seconds for this input.
    const input = "\n".repeat(200_000) + "x";
    const started = performance.now();
    expect(trimTrailingNewlines(input)).toBe(input);
    expect(performance.now() - started).toBeLessThan(200);
  });
});
