import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { prBodyProblems } from "./check-rules.mjs";

const good = [
  "## Summary",
  "Adds a thing.",
  "",
  "## Evidence",
  "npm run verify: pass",
  "",
  "## Merge danger",
  "Two-way door, one feature, revert restores it.",
  "",
  "Co-Authored-By: A <a@example.com>",
].join("\n");

describe("pull request body rule", () => {
  it("accepts a body with the three filled headings", () => {
    expect(prBodyProblems(good)).toEqual([]);
  });

  it("accepts CRLF bodies and any case or heading level", () => {
    expect(
      prBodyProblems(
        good
          .replace("## Merge danger", "### merge DANGER")
          .replace(/\n/g, "\r\n"),
      ),
    ).toEqual([]);
  });

  it("names every missing heading", () => {
    expect(prBodyProblems("just text")).toHaveLength(3);
    expect(prBodyProblems(null)).toHaveLength(3);
    expect(prBodyProblems(good.replace("## Evidence", "## Proof"))).toEqual([
      'missing heading "## Evidence"',
    ]);
  });

  it("rejects an empty section", () => {
    const body = good.replace("npm run verify: pass\n", "");
    expect(prBodyProblems(body)).toEqual([
      'heading "## Evidence" has no content',
    ]);
  });

  it("ignores headings inside HTML comments", () => {
    const body = `<!--\n## Summary\n## Evidence\n## Merge danger\n-->\ntext`;
    expect(prBodyProblems(body)).toHaveLength(3);
  });

  it("reads the body from the PR_BODY env var and exits non-zero without headings", () => {
    const script = resolve(process.cwd(), "scripts/check-rules.mjs");
    const run = (body) =>
      spawnSync("node", [script, "prbody"], {
        env: { ...process.env, PR_BODY: body },
        encoding: "utf8",
      });
    expect(run(good).status).toBe(0);
    const bad = run("$(touch /tmp/x) `id`");
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain("Summary");
  });
});
