// Pure, dependency-free parsers and comparisons for the release-version
// consistency check (CONSTITUTION.md ROADMAP.md audit follow-up F-015).
// Every function here takes already-read file text and returns a plain
// array of mismatch-description strings (empty when everything matches),
// never touching the filesystem itself. That split is what lets
// versionConsistency.test.js exercise every failure path directly with
// synthetic fixtures, rather than only ever observing the real
// repository's already-consistent state, which would never actually
// prove the check catches a real mismatch.

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

/** Parses a plain "major.minor.patch" semantic version string. */
export function parseSemver(version) {
  const trimmed = version.trim();
  const match = SEMVER_RE.exec(trimmed);
  if (!match) {
    throw new Error(
      `"${trimmed}" is not a plain "major.minor.patch" semantic version`,
    );
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

// Android's versionCode must be a positive integer that strictly increases
// with every release the Play Store or F-Droid ever sees, forever, and can
// never be reused. Deriving it from the semantic version deterministically
// means it can't accidentally regress, collide, or drift from a
// hand-maintained counter kept in a second place. Reserving two decimal
// digits each for minor and patch keeps this ordering-compatible with
// semantic-version ordering for as long as minor and patch each stay below
// 100, which this function enforces rather than silently producing a wrong
// code past that point.
export function deriveAndroidVersionCode(version) {
  const { major, minor, patch } = parseSemver(version);
  if (minor >= 100 || patch >= 100) {
    throw new Error(
      `version "${version}" has a minor or patch component >= 100, which the ` +
        `major*10000 + minor*100 + patch versionCode scheme cannot represent ` +
        `monotonically; pick a different versionCode scheme before releasing it`,
    );
  }
  return major * 10000 + minor * 100 + patch;
}

function extractTomlSection(tomlText, sectionHeader) {
  const startMatch = new RegExp(`^\\[${sectionHeader}\\]\\s*$`, "m").exec(
    tomlText,
  );
  if (!startMatch) return null;
  const rest = tomlText.slice(startMatch.index + startMatch[0].length);
  const nextSection = /^\[/m.exec(rest);
  return nextSection ? rest.slice(0, nextSection.index) : rest;
}

/** Checks package.json's top-level "version" field. */
export function checkPackageJson(packageJsonText, expectedVersion) {
  const pkg = JSON.parse(packageJsonText);
  if (pkg.version !== expectedVersion) {
    return [
      `package.json version is "${pkg.version}", expected "${expectedVersion}"`,
    ];
  }
  return [];
}

/**
 * Checks src-tauri/Cargo.toml's [package] version, not any dependency's own
 * "version = ..." line (Cargo.toml has several of those further down).
 */
export function checkCargoToml(cargoTomlText, expectedVersion) {
  const section = extractTomlSection(cargoTomlText, "package");
  if (section === null) {
    return ["src-tauri/Cargo.toml has no [package] section"];
  }
  const match = /^version\s*=\s*"([^"]+)"/m.exec(section);
  if (!match) {
    return ['src-tauri/Cargo.toml [package] section has no "version" field'];
  }
  if (match[1] !== expectedVersion) {
    return [
      `src-tauri/Cargo.toml [package] version is "${match[1]}", expected "${expectedVersion}"`,
    ];
  }
  return [];
}

/** Checks src-tauri/tauri.conf.json's top-level "version" field. */
export function checkTauriConf(tauriConfText, expectedVersion) {
  const conf = JSON.parse(tauriConfText);
  if (conf.version !== expectedVersion) {
    return [
      `src-tauri/tauri.conf.json version is "${conf.version}", expected "${expectedVersion}"`,
    ];
  }
  return [];
}

/** Checks the web-clipper extension manifest's "version" field. */
export function checkExtensionManifest(manifestText, expectedVersion) {
  const manifest = JSON.parse(manifestText);
  if (manifest.version !== expectedVersion) {
    return [
      `extensions/web-clipper/manifest.json version is "${manifest.version}", expected "${expectedVersion}"`,
    ];
  }
  return [];
}

/** Checks android/app/build.gradle's versionName and derived versionCode. */
export function checkAndroidBuildGradle(buildGradleText, expectedVersion) {
  const errors = [];
  const nameMatch = /versionName\s+"([^"]+)"/.exec(buildGradleText);
  const codeMatch = /versionCode\s+(\d+)/.exec(buildGradleText);

  if (!nameMatch) {
    errors.push("android/app/build.gradle has no versionName field");
  } else if (nameMatch[1] !== expectedVersion) {
    errors.push(
      `android/app/build.gradle versionName is "${nameMatch[1]}", expected "${expectedVersion}"`,
    );
  }

  if (!codeMatch) {
    errors.push("android/app/build.gradle has no versionCode field");
  } else {
    const expectedCode = deriveAndroidVersionCode(expectedVersion);
    const actualCode = Number(codeMatch[1]);
    if (actualCode !== expectedCode) {
      errors.push(
        `android/app/build.gradle versionCode is ${actualCode}, expected ${expectedCode} ` +
          `(derived from version "${expectedVersion}")`,
      );
    }
  }

  return errors;
}

/** Checks the Flatpak AppStream metainfo's most recent <release version="..."> entry. */
export function checkFlatpakMetainfo(metainfoXmlText, expectedVersion) {
  const match = /<release\s+version="([^"]+)"/.exec(metainfoXmlText);
  if (!match) {
    return [
      'flatpak/com.leonardschwier.leotheca.metainfo.xml has no <release version="..."> entry',
    ];
  }
  if (match[1] !== expectedVersion) {
    return [
      `flatpak/com.leonardschwier.leotheca.metainfo.xml's most recent <release> version is ` +
        `"${match[1]}", expected "${expectedVersion}"`,
    ];
  }
  return [];
}

const MOVING_BRANCH_NAMES = new Set([
  "main",
  "master",
  "HEAD",
  "develop",
  "trunk",
]);
const IMMUTABLE_TAG_RE = /^v\d+\.\d+\.\d+$/;
const FULL_SHA_RE = /^[0-9a-f]{40}$/;

/**
 * A distributable build recipe's source ref is only reproducible if it names
 * something that can never move out from under it. A branch name (even one
 * that happens to be stable today) fails this by definition; only a version
 * tag or a full, unambiguous commit SHA qualifies. An abbreviated SHA is
 * deliberately rejected too: it is still technically resolvable today, but
 * not guaranteed unambiguous forever as a repository grows.
 */
export function isImmutableBuildRef(ref) {
  const trimmed = ref.trim();
  if (MOVING_BRANCH_NAMES.has(trimmed)) return false;
  return IMMUTABLE_TAG_RE.test(trimmed) || FULL_SHA_RE.test(trimmed);
}

/**
 * Checks the F-Droid draft metadata's CurrentVersion/CurrentVersionCode, its
 * first Builds[] entry's versionName/versionCode, and that entry's commit
 * ref for the moving-branch problem the audit finding specifically named.
 */
export function checkFdroidMetadata(fdroidYamlText, expectedVersion) {
  const errors = [];
  const expectedCode = deriveAndroidVersionCode(expectedVersion);
  const label = "packaging/f-droid/com.leonardschwier.leotheca.yml";

  const currentVersionMatch = /^CurrentVersion:\s*"([^"]+)"/m.exec(
    fdroidYamlText,
  );
  if (!currentVersionMatch) {
    errors.push(`${label} has no CurrentVersion field`);
  } else if (currentVersionMatch[1] !== expectedVersion) {
    errors.push(
      `${label} CurrentVersion is "${currentVersionMatch[1]}", expected "${expectedVersion}"`,
    );
  }

  const currentVersionCodeMatch = /^CurrentVersionCode:\s*(\d+)/m.exec(
    fdroidYamlText,
  );
  if (!currentVersionCodeMatch) {
    errors.push(`${label} has no CurrentVersionCode field`);
  } else if (Number(currentVersionCodeMatch[1]) !== expectedCode) {
    errors.push(
      `${label} CurrentVersionCode is ${currentVersionCodeMatch[1]}, expected ${expectedCode}`,
    );
  }

  const buildVersionNameMatch = /versionName:\s*"([^"]+)"/.exec(fdroidYamlText);
  if (!buildVersionNameMatch) {
    errors.push(`${label} has no Builds[].versionName field`);
  } else if (buildVersionNameMatch[1] !== expectedVersion) {
    errors.push(
      `${label} Builds[].versionName is "${buildVersionNameMatch[1]}", expected "${expectedVersion}"`,
    );
  }

  const buildVersionCodeMatch = /versionCode:\s*(\d+)/.exec(fdroidYamlText);
  if (!buildVersionCodeMatch) {
    errors.push(`${label} has no Builds[].versionCode field`);
  } else if (Number(buildVersionCodeMatch[1]) !== expectedCode) {
    errors.push(
      `${label} Builds[].versionCode is ${buildVersionCodeMatch[1]}, expected ${expectedCode}`,
    );
  }

  const commitMatch = /^\s*commit:\s*(\S+)/m.exec(fdroidYamlText);
  if (!commitMatch) {
    errors.push(`${label} has no Builds[].commit field`);
  } else if (!isImmutableBuildRef(commitMatch[1])) {
    errors.push(
      `${label} Builds[].commit is "${commitMatch[1]}", a moving branch reference; it must be ` +
        `an immutable "vX.Y.Z" tag or a full commit SHA`,
    );
  }

  return errors;
}

/** Runs every check above and returns the combined list of mismatches. */
export function checkAllVersionMetadata({
  version,
  packageJsonText,
  cargoTomlText,
  tauriConfText,
  extensionManifestText,
  androidBuildGradleText,
  flatpakMetainfoText,
  fdroidYamlText,
}) {
  return [
    ...checkPackageJson(packageJsonText, version),
    ...checkCargoToml(cargoTomlText, version),
    ...checkTauriConf(tauriConfText, version),
    ...checkExtensionManifest(extensionManifestText, version),
    ...checkAndroidBuildGradle(androidBuildGradleText, version),
    ...checkFlatpakMetainfo(flatpakMetainfoText, version),
    ...checkFdroidMetadata(fdroidYamlText, version),
  ];
}
