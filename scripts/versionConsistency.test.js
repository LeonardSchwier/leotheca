import { describe, expect, it } from "vitest";
import {
  checkAllVersionMetadata,
  checkAndroidBuildGradle,
  checkCargoToml,
  checkExtensionManifest,
  checkFdroidMetadata,
  checkFlatpakMetainfo,
  checkPackageJson,
  checkTauriConf,
  deriveAndroidVersionCode,
  isImmutableBuildRef,
  parseSemver,
} from "./versionConsistency.js";

const VERSION = "0.1.0";

describe("parseSemver", () => {
  it("parses a plain major.minor.patch string", () => {
    expect(parseSemver("1.2.3")).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  it("rejects a leading 'v'", () => {
    expect(() => parseSemver("v1.2.3")).toThrow();
  });

  it("rejects a pre-release suffix", () => {
    expect(() => parseSemver("1.2.3-beta.1")).toThrow();
  });

  it("rejects a two-component version", () => {
    expect(() => parseSemver("1.2")).toThrow();
  });
});

describe("deriveAndroidVersionCode", () => {
  it("derives a monotonic code from major/minor/patch", () => {
    expect(deriveAndroidVersionCode("0.1.0")).toBe(100);
    expect(deriveAndroidVersionCode("1.0.0")).toBe(10000);
    expect(deriveAndroidVersionCode("2.34.56")).toBe(23456);
  });

  it("keeps ordering monotonic across a realistic release sequence", () => {
    const codes = ["0.1.0", "0.2.0", "0.10.0", "1.0.0"].map(
      deriveAndroidVersionCode,
    );
    for (let i = 1; i < codes.length; i += 1) {
      expect(codes[i]).toBeGreaterThan(codes[i - 1]);
    }
  });

  it("refuses a minor component that would break the scheme", () => {
    expect(() => deriveAndroidVersionCode("0.100.0")).toThrow(/minor or patch/);
  });

  it("refuses a patch component that would break the scheme", () => {
    expect(() => deriveAndroidVersionCode("0.1.100")).toThrow(/minor or patch/);
  });
});

describe("checkPackageJson", () => {
  it("passes when the version matches", () => {
    expect(
      checkPackageJson(JSON.stringify({ version: VERSION }), VERSION),
    ).toEqual([]);
  });

  it("fails with a specific message when the version differs", () => {
    const errors = checkPackageJson(
      JSON.stringify({ version: "9.9.9" }),
      VERSION,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(
      /package\.json version is "9\.9\.9", expected "0\.1\.0"/,
    );
  });
});

describe("checkCargoToml", () => {
  const goodCargoToml = `[package]
name = "leotheca"
version = "${VERSION}"
edition = "2021"

[dependencies]
tauri = { version = "2", features = [] }
`;

  it("passes when [package] version matches, ignoring dependency versions", () => {
    expect(checkCargoToml(goodCargoToml, VERSION)).toEqual([]);
  });

  it("fails when [package] version differs, even if a dependency's version coincidentally matches", () => {
    const badCargoToml = goodCargoToml.replace(
      `version = "${VERSION}"`,
      'version = "9.9.9"',
    );
    const errors = checkCargoToml(badCargoToml, VERSION);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/\[package\] version is "9\.9\.9"/);
  });

  it("fails cleanly when there is no [package] section", () => {
    expect(checkCargoToml('[dependencies]\nfoo = "1"\n', VERSION)).toEqual([
      "src-tauri/Cargo.toml has no [package] section",
    ]);
  });
});

describe("checkTauriConf", () => {
  it("passes when the version matches", () => {
    expect(
      checkTauriConf(JSON.stringify({ version: VERSION }), VERSION),
    ).toEqual([]);
  });

  it("fails when the version differs", () => {
    expect(
      checkTauriConf(JSON.stringify({ version: "9.9.9" }), VERSION),
    ).toHaveLength(1);
  });
});

describe("checkExtensionManifest", () => {
  it("passes when the version matches", () => {
    expect(
      checkExtensionManifest(JSON.stringify({ version: VERSION }), VERSION),
    ).toEqual([]);
  });

  it("fails when the version differs", () => {
    expect(
      checkExtensionManifest(JSON.stringify({ version: "9.9.9" }), VERSION),
    ).toHaveLength(1);
  });
});

describe("checkAndroidBuildGradle", () => {
  const goodGradle = `
    defaultConfig {
        versionCode 100
        versionName "${VERSION}"
    }
  `;

  it("passes when versionName and derived versionCode both match", () => {
    expect(checkAndroidBuildGradle(goodGradle, VERSION)).toEqual([]);
  });

  it("fails when versionName is wrong even though versionCode is right", () => {
    const bad = goodGradle.replace(
      `versionName "${VERSION}"`,
      'versionName "1.0"',
    );
    const errors = checkAndroidBuildGradle(bad, VERSION);
    expect(errors).toEqual([
      'android/app/build.gradle versionName is "1.0", expected "0.1.0"',
    ]);
  });

  it("fails when versionCode is wrong even though versionName is right (this is the original F-015 bug shape)", () => {
    const bad = goodGradle.replace("versionCode 100", "versionCode 1");
    const errors = checkAndroidBuildGradle(bad, VERSION);
    expect(errors).toEqual([
      'android/app/build.gradle versionCode is 1, expected 100 (derived from version "0.1.0")',
    ]);
  });

  it("reports both fields independently when both are wrong", () => {
    const bad = goodGradle
      .replace("versionCode 100", "versionCode 1")
      .replace(`versionName "${VERSION}"`, 'versionName "1.0"');
    expect(checkAndroidBuildGradle(bad, VERSION)).toHaveLength(2);
  });
});

describe("checkFlatpakMetainfo", () => {
  const goodMetainfo = `<releases>\n  <release version="${VERSION}" date="2026-08-27" />\n</releases>`;

  it("passes when the most recent release version matches", () => {
    expect(checkFlatpakMetainfo(goodMetainfo, VERSION)).toEqual([]);
  });

  it("fails when the release version differs", () => {
    const bad = goodMetainfo.replace(`version="${VERSION}"`, 'version="1.0.0"');
    expect(checkFlatpakMetainfo(bad, VERSION)).toHaveLength(1);
  });
});

describe("isImmutableBuildRef", () => {
  it("rejects known moving branch names", () => {
    expect(isImmutableBuildRef("main")).toBe(false);
    expect(isImmutableBuildRef("master")).toBe(false);
    expect(isImmutableBuildRef("HEAD")).toBe(false);
  });

  it("accepts a version tag", () => {
    expect(isImmutableBuildRef("v0.1.0")).toBe(true);
  });

  it("accepts a full commit SHA", () => {
    expect(isImmutableBuildRef("a".repeat(40))).toBe(true);
  });

  it("rejects an abbreviated commit SHA", () => {
    expect(isImmutableBuildRef("a1b2c3d")).toBe(false);
  });
});

describe("checkFdroidMetadata", () => {
  const goodFdroid = `
Builds:
  - versionName: "${VERSION}"
    versionCode: 100
    commit: v${VERSION}
    subdir: android

CurrentVersion: "${VERSION}"
CurrentVersionCode: 100
`;

  it("passes when versions, versionCode, and the commit ref are all consistent and immutable", () => {
    expect(checkFdroidMetadata(goodFdroid, VERSION)).toEqual([]);
  });

  it("fails when CurrentVersion differs from VERSION", () => {
    const bad = goodFdroid.replace(
      `CurrentVersion: "${VERSION}"`,
      'CurrentVersion: "9.9.9"',
    );
    expect(
      checkFdroidMetadata(bad, VERSION).some((e) =>
        e.includes("CurrentVersion"),
      ),
    ).toBe(true);
  });

  it("fails when CurrentVersionCode doesn't match the derived code", () => {
    const bad = goodFdroid.replace(
      "CurrentVersionCode: 100",
      "CurrentVersionCode: 1",
    );
    expect(
      checkFdroidMetadata(bad, VERSION).some((e) =>
        e.includes("CurrentVersionCode"),
      ),
    ).toBe(true);
  });

  it("fails specifically on a moving-branch commit ref, even when every version field matches (the exact F-015 bug)", () => {
    const bad = goodFdroid.replace(`commit: v${VERSION}`, "commit: main");
    const errors = checkFdroidMetadata(bad, VERSION);
    expect(errors).toEqual([
      'packaging/f-droid/com.leonardschwier.leotheca.yml Builds[].commit is "main", a moving ' +
        'branch reference; it must be an immutable "vX.Y.Z" tag or a full commit SHA',
    ]);
  });

  it("accepts a full commit SHA as an alternative to a version tag", () => {
    const withSha = goodFdroid.replace(
      `commit: v${VERSION}`,
      `commit: ${"a".repeat(40)}`,
    );
    expect(checkFdroidMetadata(withSha, VERSION)).toEqual([]);
  });
});

describe("checkAllVersionMetadata", () => {
  const goodFixtures = {
    version: VERSION,
    packageJsonText: JSON.stringify({ version: VERSION }),
    cargoTomlText: `[package]\nname = "leotheca"\nversion = "${VERSION}"\n`,
    tauriConfText: JSON.stringify({ version: VERSION }),
    extensionManifestText: JSON.stringify({ version: VERSION }),
    androidBuildGradleText: `versionCode 100\nversionName "${VERSION}"\n`,
    flatpakMetainfoText: `<release version="${VERSION}" date="2026-08-27" />`,
    fdroidYamlText: `Builds:\n  - versionName: "${VERSION}"\n    versionCode: 100\n    commit: v${VERSION}\nCurrentVersion: "${VERSION}"\nCurrentVersionCode: 100\n`,
  };

  it("returns no errors when every file is consistent with VERSION", () => {
    expect(checkAllVersionMetadata(goodFixtures)).toEqual([]);
  });

  it("surfaces exactly the one broken field when only one file disagrees", () => {
    const errors = checkAllVersionMetadata({
      ...goodFixtures,
      packageJsonText: JSON.stringify({ version: "9.9.9" }),
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/package\.json/);
  });

  it("surfaces every broken field when several files disagree at once", () => {
    const errors = checkAllVersionMetadata({
      ...goodFixtures,
      packageJsonText: JSON.stringify({ version: "9.9.9" }),
      androidBuildGradleText: `versionCode 1\nversionName "1.0"\n`,
    });
    expect(errors).toHaveLength(3);
  });
});
