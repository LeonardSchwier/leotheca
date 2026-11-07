import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Claude Code keeps worktrees under .claude/, each a full copy of the sources.
// Without these entries a local run executes every copy's tests (about ten
// times the suite) and the linter reports thousands of errors from them.
describe("local agent worktrees stay out of tests and lint", () => {
  it("excludes .claude from the vitest run", () => {
    expect(readFileSync("vitest.config.ts", "utf8")).toMatch(
      /["']\.claude\/\*\*["']/,
    );
  });
  it("ignores .claude in eslint", () => {
    expect(readFileSync("eslint.config.js", "utf8")).toMatch(
      /["']\.claude\/["']/,
    );
  });
});

describe("the removed website stays removed", () => {
  it("has no website directory and no Pages workflow", () => {
    expect(existsSync("website")).toBe(false);
    expect(existsSync(".github/workflows/gh-pages.yml")).toBe(false);
  });
  it("is not listed in the rule scripts", () => {
    expect(readFileSync("scripts/check-rules.mjs", "utf8")).not.toMatch(
      /\^website/,
    );
  });
});
