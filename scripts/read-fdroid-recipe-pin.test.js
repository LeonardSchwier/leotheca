import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { deriveAndroidVersionCode } from "./versionConsistency.js";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptsDir, "..");
const script = path.join(scriptsDir, "read-fdroid-recipe-pin.sh");
const realRecipe = path.join(
  repoRoot,
  "packaging/f-droid/com.leonardschwier.leotheca.yml",
);

function readPin(field, recipePath) {
  return execFileSync(script, [field, recipePath], {
    encoding: "utf8",
  }).trim();
}

function readPinExitCode(args) {
  try {
    execFileSync(script, args, { encoding: "utf8", stdio: "pipe" });
    return 0;
  } catch (error) {
    return error.status;
  }
}

describe("read-fdroid-recipe-pin.sh against the real repository metadata", () => {
  const version = readFileSync(path.join(repoRoot, "VERSION"), "utf8").trim();
  const expectedVersionCode = deriveAndroidVersionCode(version);

  it("reads the current commit pin", () => {
    expect(readPin("commit", realRecipe)).toBe(`v${version}`);
  });

  it("reads the current version name, matching VERSION", () => {
    expect(readPin("version-name", realRecipe)).toBe(version);
  });

  it("reads the current version code, matching VERSION", () => {
    expect(readPin("version-code", realRecipe)).toBe(
      String(expectedVersionCode),
    );
  });
});

describe("read-fdroid-recipe-pin.sh tracks the recipe file, not a fixed value", () => {
  let fixtureDir;

  afterEach(() => {
    if (fixtureDir) {
      rmSync(fixtureDir, { recursive: true, force: true });
      fixtureDir = undefined;
    }
  });

  it("extracts a deliberately different pin from a synthetic recipe", () => {
    fixtureDir = mkdtempSync(path.join(tmpdir(), "fdroid-recipe-"));
    const fixture = path.join(fixtureDir, "recipe.yml");
    writeFileSync(
      fixture,
      [
        "Builds:",
        '  - versionName: "9.9.9"',
        "    versionCode: 90909",
        "    commit: v9.9.9",
        "    subdir: android",
        "",
      ].join("\n"),
    );

    expect(readPin("commit", fixture)).toBe("v9.9.9");
    expect(readPin("version-name", fixture)).toBe("9.9.9");
    expect(readPin("version-code", fixture)).toBe("90909");
  });

  it("fails with a clear error when a field is missing from the recipe", () => {
    fixtureDir = mkdtempSync(path.join(tmpdir(), "fdroid-recipe-"));
    const fixture = path.join(fixtureDir, "recipe.yml");
    writeFileSync(fixture, "Builds:\n  - versionName: \"1.0.0\"\n");

    expect(readPinExitCode(["commit", fixture])).toBe(1);
    expect(readPinExitCode(["version-code", fixture])).toBe(1);
  });
});

describe("read-fdroid-recipe-pin.sh argument handling", () => {
  it("rejects an unknown field name", () => {
    expect(readPinExitCode(["bogus-field", realRecipe])).toBe(2);
  });

  it("rejects a nonexistent recipe path", () => {
    expect(readPinExitCode(["commit", "/nonexistent/recipe.yml"])).toBe(2);
  });

  it("rejects a missing argument", () => {
    expect(readPinExitCode(["commit"])).toBe(2);
  });
});
