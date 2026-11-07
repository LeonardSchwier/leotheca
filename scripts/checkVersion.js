#!/usr/bin/env node
// CLI entry point for the release-version consistency check (F-015). Reads
// the real repository files and delegates all comparison logic to
// versionConsistency.js's pure functions, which is what actually gets unit
// tested; this file is intentionally too thin to need its own tests.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { checkAllVersionMetadata } from "./versionConsistency.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const version = read("VERSION").trim();

const errors = checkAllVersionMetadata({
  version,
  packageJsonText: read("package.json"),
  cargoTomlText: read("src-tauri/Cargo.toml"),
  tauriConfText: read("src-tauri/tauri.conf.json"),
  extensionManifestText: read("extensions/web-clipper/manifest.json"),
  androidBuildGradleText: read("android/app/build.gradle"),
  flatpakMetainfoText: read("flatpak/com.leonardschwier.leotheca.metainfo.xml"),
  fdroidYamlText: read("packaging/f-droid/com.leonardschwier.leotheca.yml"),
});

if (errors.length > 0) {
  console.error(
    `Version consistency check failed against VERSION ("${version}"):\n`,
  );
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  console.error(
    "\nEvery release-relevant file must track the VERSION file exactly. Update the " +
      "mismatched file(s), or VERSION itself if the canonical value is genuinely changing, " +
      "then rerun this check.",
  );
  process.exit(1);
}

console.log(
  `Version consistency check passed: every checked file matches VERSION ("${version}").`,
);
