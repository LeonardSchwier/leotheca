import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const CLI = join(process.cwd(), "scripts", "check-rules.mjs");

describe("check-rules trailers in a real git repository", () => {
  let repo;
  const git = (...args) =>
    execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
  const commit = (message) => {
    git("add", "-A");
    git("commit", "-q", "--no-verify", "-m", message);
    return git("rev-parse", "HEAD");
  };
  const trailers = (base, head) =>
    spawnSync("node", [CLI, "trailers", base, head], {
      cwd: repo,
      encoding: "utf8",
    });

  let base;
  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), "trailers-cli-"));
    git("init", "-q");
    git("config", "user.name", "Test");
    git("config", "user.email", "test@example.com");
    git("config", "commit.gpgsign", "false");
    mkdirSync(join(repo, "website"));
    writeFileSync(join(repo, "website", "index.html"), "<p>hello</p>\n");
    writeFileSync(join(repo, "README.md"), "# one\n");
    mkdirSync(join(repo, "documentation"));
    writeFileSync(join(repo, "documentation", "old.md"), "old\n");
    base = commit("chore: seed");
  });
  afterAll(() => rmSync(repo, { recursive: true, force: true }));

  it("needs no trailer for a pure deletion of a text file", () => {
    git("rm", "-q", "-r", "website", "documentation");
    const head = commit("chore: remove the website");
    const result = trailers(base, head);
    expect(result.status, result.stderr).toBe(0);
    base = head;
  });

  it("fails a README change without Legal-Check and names the line to paste", () => {
    writeFileSync(join(repo, "README.md"), "# two\n");
    const head = commit("docs: reword the readme");
    const result = trailers(base, head);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Legal-Check:");
    expect(result.stderr).toContain("README.md");
  });

  it("passes the same change with the trailer", () => {
    writeFileSync(join(repo, "README.md"), "# three\n");
    const head = commit(
      "docs: reword the readme again\n\nLegal-Check: 1 verified, 0 fixed, 0 open (own text)",
    );
    const result = trailers(base, head);
    expect(result.status, result.stderr).toBe(0);
  });
});
