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
  lineSecretProblems,
  requiredTrailers,
  trailerProblems,
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

describe("lineSecretProblems and the ledger claim token", () => {
  const hex = "0123456789abcdef0123456789abcdef";
  const ledger = (extra = "") =>
    `  <!-- agent-state: {"schema":1,"id":"rm-x","state":"claimed","note":"${extra}","token":"${hex}","owner":"a"} -->`;

  it("does not flag the ledger token in a ROADMAP.md agent-state line", () => {
    expect(lineSecretProblems("ROADMAP.md", ledger())).toEqual([]);
  });
  it("still flags the same text in any other file", () => {
    expect(lineSecretProblems("README.md", ledger()).length).toBeGreaterThan(0);
  });
  it("still flags a real secret placed inside an agent-state line", () => {
    const real = "gh" + "p_" + "a".repeat(36);
    expect(
      lineSecretProblems("ROADMAP.md", ledger(real)).length,
    ).toBeGreaterThan(0);
  });
  it("still flags a secret on an ordinary ROADMAP.md line", () => {
    const line = `password: "${"x".repeat(30)}"`;
    expect(lineSecretProblems("ROADMAP.md", line).length).toBeGreaterThan(0);
  });
  it("does not exempt a token that is not 32 lowercase hex characters", () => {
    const odd = ledger().replace(hex, "Z".repeat(32));
    expect(lineSecretProblems("ROADMAP.md", odd).length).toBeGreaterThan(0);
  });
});

describe("evidence trailers", () => {
  const LEGAL = "Legal-Check: 3 verified, 1 fixed, 0 open";
  const REVIEW = "Review: second model, no findings left";
  const DB =
    "Database-Review: keys and unique constraints checked, migration idempotent";

  it("requires nothing for ledger-only and test-only changes", () => {
    expect(
      requiredTrailers([
        "ROADMAP.md",
        ".agents/handoffs/x.md",
        "src/a.test.ts",
      ]),
    ).toEqual({
      legal: false,
      database: false,
      review: false,
    });
  });
  it("requires the legal trailer for docs, assets, README and dependency files", () => {
    for (const p of [
      "README.md",
      "documentation/X.md",
      "assets/a.png",
      "docs/guide.md",
    ])
      expect(requiredTrailers([p]).legal, p).toBe(true);
  });
  it("does not require it for dependency manifests, which Dependency-intake and the licenses job cover", () => {
    for (const p of [
      "package.json",
      "package-lock.json",
      "src-tauri/Cargo.toml",
      "src-tauri/Cargo.lock",
    ])
      expect(requiredTrailers([p]).legal, p).toBe(false);
  });
  it("lists up to three matching paths and a ready line to paste", () => {
    const found = trailerProblems(
      ["README.md", "documentation/a.md", "documentation/b.md", "assets/c.png"],
      "feat: x\n",
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toContain(
      "README.md, documentation/a.md, documentation/b.md",
    );
    expect(found[0]).not.toContain("assets/c.png");
    expect(found[0]).toContain(
      "Legal-Check: 4 verified, 0 fixed, 0 open (what you checked)",
    );
  });
  it("does not require it for vendored pdfjs or the ledger", () => {
    expect(
      requiredTrailers(["public/pdfjs/build/pdf.js", "ROADMAP.md"]).legal,
    ).toBe(false);
  });
  it("requires the database trailer for sql and migrations", () => {
    expect(requiredTrailers(["db/schema.sql"]).database).toBe(true);
    expect(requiredTrailers(["src/db/migrations/001.ts"]).database).toBe(true);
  });
  it("requires the review trailer for trust-boundary, workflow, hook and constitution files", () => {
    for (const p of [
      "src-tauri/src/commands.rs",
      ".github/workflows/ci.yml",
      "hooks/pre-push",
      "CONSTITUTION.md",
      "android/app/src/main/AndroidManifest.xml",
      "scripts/check-rules.mjs",
    ])
      expect(requiredTrailers([p]).review, p).toBe(true);
  });
  it("reports each missing trailer", () => {
    const found = trailerProblems(
      ["README.md", "db/a.sql", "hooks/pre-push"],
      "feat: x\n",
    );
    expect(found).toHaveLength(3);
  });
  it("accepts a push whose messages hold every required trailer", () => {
    expect(
      trailerProblems(
        ["README.md", "db/a.sql", "hooks/pre-push"],
        `feat: x\n\n${LEGAL}\n${DB}\n${REVIEW}\n`,
      ),
    ).toEqual([]);
  });
  it("accepts an explicit self-review with a reason", () => {
    expect(
      trailerProblems(
        ["hooks/pre-push"],
        "x\n\nReview: self-review: no second model on the local runner\n",
      ),
    ).toEqual([]);
  });
  it("rejects a legal trailer that leaves findings open", () => {
    expect(
      trailerProblems(
        ["README.md"],
        "x\n\nLegal-Check: 4 verified, 0 fixed, 2 open\n",
      ),
    ).toHaveLength(1);
  });
  it("rejects a review or database trailer without content", () => {
    expect(
      trailerProblems(["hooks/pre-push"], "x\n\nReview: ok\n"),
    ).toHaveLength(1);
    expect(
      trailerProblems(["db/a.sql"], "x\n\nDatabase-Review: fine\n"),
    ).toHaveLength(1);
  });
  it("asks for nothing when no listed path changed", () => {
    expect(trailerProblems(["src/App.tsx", "ROADMAP.md"], "feat: x\n")).toEqual(
      [],
    );
  });
});
