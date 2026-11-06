import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  COMPETITOR_HASHES_ANYCASE,
  findCompetitor,
  isContentExempt,
  licenseProblem,
  lineProblems,
  parseAddedLines,
  workflowRefProblems,
  secretProblems,
  parsePackageDeps,
  parseCargoDeps,
  changedDeps,
  hasIntakeLine,
} from "./check-rules.mjs";
import { checkCommitMessage } from "./commit-msg-check.mjs";

const DASH = String.fromCharCode(0x2014);
const trailer = "Co-Authored-By: Some Agent <noreply@example.com>";

describe("added-line rules", () => {
  it("flags an em dash and honours the allow marker", () => {
    expect(lineProblems(`a ${DASH} b`)).toHaveLength(1);
    expect(
      lineProblems(`a ${DASH} b // rules-allow: quoted user text`),
    ).toEqual([]);
    expect(lineProblems("a - b")).toEqual([]);
  });

  it("flags a hashed competitor name case-insensitively, but not ordinary words", () => {
    // Build the probe from a hash-known token so this test file never spells one.
    const known = ["obsidian", "logseq", "typora", "joplin", "evernote"].find(
      (w) =>
        COMPETITOR_HASHES_ANYCASE.has(
          createHash("sha256").update(w).digest("hex").slice(0, 16),
        ),
    );
    expect(known).toBeTruthy();
    expect(findCompetitor(`imports from ${known.toUpperCase()} vaults`)).toBe(
      known.toUpperCase(),
    );
    expect(
      findCompetitor("a notion of sorting, a bear in the foam"),
    ).toBeNull();
  });

  it("parses added lines with their new line numbers", () => {
    const diff = [
      "+++ b/a.ts",
      "@@ -1,0 +5,2 @@",
      "+one",
      "+two",
      "+++ b/ignored",
      "@@ -9 +20 @@",
      "+three",
    ].join("\n");
    const lines = parseAddedLines(diff);
    expect(lines.find((l) => l.text === "two")).toMatchObject({
      path: "a.ts",
      line: 6,
    });
    expect(lines.find((l) => l.text === "three")).toMatchObject({ line: 20 });
  });

  it("exempts ledger and vendored paths only", () => {
    expect(isContentExempt("ROADMAP.md")).toBe(true);
    expect(isContentExempt("public/pdfjs/x.js")).toBe(true);
    expect(isContentExempt("src/app/App.tsx")).toBe(false);
    expect(isContentExempt("CONSTITUTION.md")).toBe(false);
  });
});

describe("commit message rules", () => {
  it("accepts a conventional subject with the trailer", () => {
    expect(
      checkCommitMessage(
        `fix(editor): keep cursor on undo\n\nwhy\n\n${trailer}\n`,
      ),
    ).toEqual([]);
    expect(
      checkCommitMessage(
        "chore(agents): claim rm-1 by x\n\nAuthored-By: human\n",
      ),
    ).toEqual([]);
    expect(
      checkCommitMessage("Merge remote-tracking branch 'origin/main' into x"),
    ).toEqual([]);
  });

  it("rejects a bad prefix, a missing trailer and an em dash", () => {
    expect(checkCommitMessage(`Update stuff\n\n${trailer}`)).toHaveLength(1);
    expect(checkCommitMessage("fix: ok\n\nno trailer")).toHaveLength(1);
    expect(checkCommitMessage(`fix: a ${DASH} b\n\n${trailer}`)).toHaveLength(
      1,
    );
  });
});

describe("dependency licenses", () => {
  it("accepts allowed ids and OR/AND expressions, rejects the rest", () => {
    expect(licenseProblem("MIT")).toBeNull();
    expect(licenseProblem("(MPL-2.0 OR Apache-2.0)")).toBeNull();
    expect(licenseProblem("(MIT AND Zlib)")).toBeNull();
    expect(licenseProblem("GPL-3.0-only")).toMatch(/allow list/);
    expect(licenseProblem("(MIT AND GPL-3.0-only)")).toMatch(/allow list/);
    expect(licenseProblem(undefined)).toMatch(/no license/);
  });
});

describe("workflow action pinning", () => {
  it("accepts tags and SHAs, rejects floating refs and missing refs", () => {
    expect(workflowRefProblems("  - uses: actions/checkout@v4")).toEqual([]);
    expect(
      workflowRefProblems(
        "      uses: a/b@0123456789abcdef0123456789abcdef01234567 # v1",
      ),
    ).toEqual([]);
    expect(workflowRefProblems("  - uses: a/b@main")).toHaveLength(1);
    expect(workflowRefProblems("  - uses: a/b")).toHaveLength(1);
    expect(workflowRefProblems("  - uses: ./.github/actions/x")).toEqual([]);
  });
});

describe("secret scan", () => {
  // Fixtures are assembled so this file never contains a real-looking token.
  const aws = "AK" + "IA" + "ABCDEFGHIJKLMNOP";
  const gh = "gh" + "p_" + "a".repeat(36);
  const pem = "-----BEGIN " + "RSA PRIVATE KEY-----";
  it.each([
    ["aws key", `id = ${aws}`],
    ["github token", `x ${gh}`],
    ["private key", pem],
    ["assignment", `const password = "${"Ab1".repeat(10)}";`],
  ])("flags %s", (_n, line) => {
    expect(secretProblems(line).length).toBeGreaterThan(0);
  });
  it("accepts ordinary code and prose", () => {
    expect(secretProblems("const token = getToken();")).toEqual([]);
    expect(secretProblems("password field label")).toEqual([]);
    expect(secretProblems('const secret = "short"')).toEqual([]);
  });
  it("is not silenced by rules-allow", () => {
    expect(secretProblems(`${aws} // rules-allow: nope`).length).toBe(1);
  });
});

describe("dependency intake", () => {
  it("detects added and changed npm deps, ignores unchanged", () => {
    const a = parsePackageDeps(
      '{"dependencies":{"a":"^1"},"devDependencies":{"b":"^1"}}',
    );
    const b = parsePackageDeps(
      '{"dependencies":{"a":"^1","c":"^2"},"devDependencies":{"b":"^2"}}',
    );
    expect(changedDeps(a, b)).toEqual(["npm:b", "npm:c"]);
    expect(changedDeps(a, a)).toEqual([]);
  });
  it("parses Cargo dependency tables and inline sections", () => {
    const toml = [
      "[package]",
      'name = "x"',
      "[dependencies]",
      'serde = "1"',
      'tauri = { version = "2" }',
      "[dependencies.zip]",
      'version = "2"',
      "[target.'cfg(unix)'.dependencies]",
      'libc = "0.2"',
      "[features]",
      "default = []",
    ].join("\n");
    expect(Object.keys(parseCargoDeps(toml)).sort()).toEqual([
      "cargo:libc",
      "cargo:serde",
      "cargo:tauri",
      "cargo:zip",
    ]);
  });
  it("requires a substantive Dependency-intake line", () => {
    expect(hasIntakeLine("feat: x\n")).toBe(false);
    expect(hasIntakeLine("Dependency-intake: x")).toBe(false);
    expect(
      hasIntakeLine(
        "Dependency-intake: left-pad: real package, maintained, MIT, github.com/x/y, no install scripts",
      ),
    ).toBe(true);
  });
});
