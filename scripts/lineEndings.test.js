// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { URL, fileURLToPath } from "node:url";
import { phantomLineEndingFiles } from "./lineEndings.js";
import { makeTempRepo } from "./testGit.js";

// A tracked text file whose stored copy has CRLF line endings never matches
// what git computes from the working file, so a fresh clone reports it as
// modified and scripts/agent_ledger.py refuses to claim, renew or finish in it.
// `git ls-files --eol` shows the stored ending in its `i/` column.

const entry = (index, attr, path) =>
  `i/${index}  w/crlf  attr/${attr.padEnd(17)}\t${path}`;

describe("phantomLineEndingFiles", () => {
  it("names a CRLF index copy that the attributes ask to store as LF", () => {
    const out = [
      entry("crlf", "text eol=crlf", "android/gradlew.bat"),
      entry("mixed", "text=auto eol=lf", "docs/notes.md"),
    ].join("\n");
    expect(phantomLineEndingFiles(out)).toEqual([
      "android/gradlew.bat",
      "docs/notes.md",
    ]);
  });

  it("accepts the repaired state: LF in the index, CRLF in the working tree", () => {
    const out = entry("lf", "text eol=crlf", "android/gradlew.bat");
    expect(phantomLineEndingFiles(out)).toEqual([]);
  });

  it("leaves binary files and files without a text attribute alone", () => {
    const out = [
      entry("-text", "-text", "icons/AppIcon.png"),
      entry("crlf", "-text", "vendor/legacy.txt"),
      entry("crlf", "", "vendor/untouched.txt"),
      entry("none", "text=auto eol=lf", "empty.md"),
      entry("lf", "text=auto eol=lf", "src/main.ts"),
    ].join("\n");
    expect(phantomLineEndingFiles(out)).toEqual([]);
  });

  it("treats an eol attribute alone as a text file", () => {
    expect(
      phantomLineEndingFiles(entry("crlf", "eol=lf", "tools/run.sh")),
    ).toEqual(["tools/run.sh"]);
  });

  it("returns a path with spaces whole", () => {
    expect(
      phantomLineEndingFiles(
        entry("crlf", "text eol=crlf", "win dir/my file.bat"),
      ),
    ).toEqual(["win dir/my file.bat"]);
  });

  it("reads NUL separated output and ignores blank input", () => {
    const out = `${entry("crlf", "text eol=crlf", "a.bat")}\0${entry("lf", "text=auto eol=lf", "b.ts")}\0`;
    expect(phantomLineEndingFiles(out)).toEqual(["a.bat"]);
    expect(phantomLineEndingFiles("")).toEqual([]);
    expect(phantomLineEndingFiles("\n")).toEqual([]);
  });
});

const root = fileURLToPath(new URL("..", import.meta.url));

function insideGitWorkTree() {
  try {
    return (
      execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() === "true"
    );
  } catch {
    return false;
  }
}

describe("this repository", () => {
  // Skipped only outside a git work tree (a source archive); a clone, a CI
  // checkout and a git hook all run it.
  it.skipIf(!insideGitWorkTree())(
    "stores no text file with CRLF line endings",
    () => {
      const listing = execFileSync("git", ["ls-files", "--eol", "-z"], {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      });
      // Repair with `git add --renormalize <path>` and commit it. The file
      // keeps its working-tree ending (`eol=crlf` for a Windows batch file).
      expect(phantomLineEndingFiles(listing)).toEqual([]);
    },
  );
});

describe("the symptom the check stands for", () => {
  const cleanup = [];
  afterAll(() => {
    for (const dir of cleanup) rmSync(dir, { recursive: true, force: true });
  });

  it("a CRLF index copy makes a fresh clone dirty, and renormalizing cleans it", () => {
    const { dir, git } = makeTempRepo("line-endings-");
    cleanup.push(dir);
    const batch = "@echo off\r\necho hi\r\n";
    writeFileSync(join(dir, ".gitattributes"), "*.bat text eol=crlf\n");
    writeFileSync(join(dir, "run.bat"), batch);
    git("add", ".gitattributes");
    // Store the CRLF bytes untouched, as the blob was stored before the rule.
    const blob = git("hash-object", "-w", "--no-filters", "run.bat");
    git("update-index", "--add", "--cacheinfo", `100644,${blob},run.bat`);
    git("commit", "-q", "-m", "store a CRLF batch file");

    const listing = (repo) => git("-C", repo, "ls-files", "--eol", "-z");
    const dirtyClone = `${dir}-dirty`;
    cleanup.push(dirtyClone);
    git("clone", "-q", dir, dirtyClone);
    expect(git("-C", dirtyClone, "status", "--porcelain")).toBe("M run.bat");
    expect(phantomLineEndingFiles(listing(dirtyClone))).toEqual(["run.bat"]);

    git("add", "--renormalize", "run.bat");
    git("commit", "-q", "-m", "renormalize the batch file");

    const cleanClone = `${dir}-clean`;
    cleanup.push(cleanClone);
    git("clone", "-q", dir, cleanClone);
    expect(git("-C", cleanClone, "status", "--porcelain")).toBe("");
    expect(phantomLineEndingFiles(listing(cleanClone))).toEqual([]);
    expect(readFileSync(join(cleanClone, "run.bat"), "utf8")).toBe(batch);
  });
});
