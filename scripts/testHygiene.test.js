import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// A test that changes a repository with a direct git call (instead of through
// scripts/testGit.js) acts on the real repository when a git hook runs it,
// because git exports GIT_DIR into hooks. That emptied main once. Direct calls
// with a literal read-only subcommand are fine; anything else is not.
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".claude",
  "dist",
  "target",
]);
const ALLOWED = new Set(["scripts/testGit.js", "scripts/testHygiene.test.js"]);
const READ_ONLY = new Set([
  "ls-files",
  "ls-tree",
  "rev-parse",
  "rev-list",
  "log",
  "show",
  "diff",
  "status",
  "cat-file",
  "grep",
  "blame",
  "describe",
  "merge-base",
  "show-ref",
]);

/** Direct git spawns in `source` that are not a literal read-only subcommand. */
export function riskyGitCalls(source) {
  const risky = [];
  for (const m of source.matchAll(
    /\b(?:execFileSync|spawnSync|execFile|spawn)\(\s*["'`]git["'`]\s*,\s*(\[\s*["'`]([A-Za-z-]+)["'`])?/g,
  )) {
    if (!(m[2] && READ_ONLY.has(m[2]))) risky.push(m[0]);
  }
  for (const m of source.matchAll(
    /\b(?:execSync|exec)\(\s*["'`]git\s+([A-Za-z-]+)/g,
  )) {
    if (!READ_ONLY.has(m[1])) risky.push(m[0]);
  }
  return risky;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || name.startsWith("control-")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(name)) out.push(full);
  }
  return out;
}

describe("riskyGitCalls", () => {
  it("flags a call with variable arguments, as in the test that emptied main", () => {
    expect(
      riskyGitCalls('execFileSync("git", args, { cwd: repo })'),
    ).toHaveLength(1);
  });
  it("flags a literal mutating subcommand", () => {
    expect(
      riskyGitCalls('spawnSync("git", ["commit", "-m", "x"])'),
    ).toHaveLength(1);
    expect(riskyGitCalls('execSync("git add -A")')).toHaveLength(1);
  });
  it("allows a literal read-only subcommand", () => {
    expect(
      riskyGitCalls('execFileSync("git", ["ls-files", "-z"], { cwd: root })'),
    ).toEqual([]);
    expect(riskyGitCalls('execSync("git rev-parse HEAD")')).toEqual([]);
  });
});

describe("test hygiene", () => {
  it("no test file changes a repository with a direct git call; they use scripts/testGit.js", () => {
    const offenders = walk(".")
      .map((file) => file.replace(/^\.\//, ""))
      .filter((file) => !ALLOWED.has(file))
      .filter((file) => riskyGitCalls(readFileSync(file, "utf8")).length > 0);
    expect(offenders).toEqual([]);
  });
});
