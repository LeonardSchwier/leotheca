// Checks that flatpak/node-sources.json can serve every tarball in
// package-lock.json from the offline npm cache.
//
// `npm ci --offline` looks each tarball up by integrity hash under
// `_cacache/content-v2/sha512/<aa>/<bb>/<rest>`. A missing entry, or one written
// to any other path, surfaces only much later as ENOTCACHED inside the Flatpak
// build, which is how the Release workflow stayed red for weeks unnoticed.

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

export function sha512Hex(integrity) {
  const match = /(?:^|\s)sha512-([A-Za-z0-9+/=]+)/.exec(integrity ?? "");
  return match ? Buffer.from(match[1], "base64").toString("hex") : null;
}

export function findFlatpakSourceProblems(lockfile, sources) {
  const byUrl = new Map();
  for (const entry of sources) {
    if (entry.type === "file" && entry.url) byUrl.set(entry.url, entry);
  }

  const problems = [];
  for (const [path, pkg] of Object.entries(lockfile.packages ?? {})) {
    if (!pkg.resolved?.startsWith("https://") || pkg.inBundle) continue;
    const hex = sha512Hex(pkg.integrity);
    if (!hex) continue;

    const entry = byUrl.get(pkg.resolved);
    if (!entry) {
      problems.push(`${path}: no source entry for ${pkg.resolved}`);
      continue;
    }
    if (entry.sha512 !== hex) {
      problems.push(`${path}: sha512 differs from package-lock.json integrity`);
    }
    const expectedDest = `flatpak-node/npm-cache/_cacache/content-v2/sha512/${hex.slice(0, 2)}/${hex.slice(2, 4)}`;
    if (
      entry.dest !== expectedDest ||
      entry["dest-filename"] !== hex.slice(4)
    ) {
      problems.push(
        `${path}: cached at ${entry.dest}, npm looks in ${expectedDest}`,
      );
    }
  }
  return problems;
}

const INDEX_KEY_PREFIX = "make-fetch-happen:request-cache:";

// npm reads the cache index first: `_cacache/index-v5/<aa>/<bb>/<rest>` where
// the path is the sha256 of the entry key and each line is `<sha1 of json>\t<json>`.
// A wrong path or hash is as invisible as a missing content file until the
// offline build runs, so every index entry written by the generator is checked
// against the file entry it points at.
export function findIndexProblems(sources) {
  const files = new Map();
  for (const entry of sources) {
    if (entry.type === "file" && entry.url) files.set(entry.url, entry);
  }
  const problems = [];
  for (const entry of sources) {
    if (
      entry.type !== "inline" ||
      !String(entry.dest ?? "").includes("/_cacache/index-v5/")
    )
      continue;
    const tab = String(entry.contents ?? "").indexOf("\t");
    if (tab < 0) {
      problems.push(`${entry.dest}: index entry has no tab-separated hash`);
      continue;
    }
    const sha1 = entry.contents.slice(0, tab);
    const json = entry.contents.slice(tab + 1);
    let parsed;
    try {
      parsed = JSON.parse(json);
    } catch {
      problems.push(`${entry.dest}: index entry is not valid JSON`);
      continue;
    }
    if (createHash("sha1").update(json).digest("hex") !== sha1) {
      problems.push(`${parsed.key}: sha1 prefix does not match the entry json`);
    }
    const keyHash = createHash("sha256")
      .update(String(parsed.key))
      .digest("hex");
    const expectedDest = `flatpak-node/npm-cache/_cacache/index-v5/${keyHash.slice(0, 2)}/${keyHash.slice(2, 4)}`;
    if (
      entry.dest !== expectedDest ||
      entry["dest-filename"] !== keyHash.slice(4)
    ) {
      problems.push(
        `${parsed.key}: indexed at ${entry.dest}, npm looks in ${expectedDest}`,
      );
    }
    if (!String(parsed.key).startsWith(INDEX_KEY_PREFIX)) continue;
    const url = parsed.key.slice(INDEX_KEY_PREFIX.length);
    const file = files.get(url);
    if (!file) {
      problems.push(`${url}: index entry has no matching file entry`);
    } else if (sha512Hex(parsed.integrity) !== file.sha512) {
      problems.push(
        `${url}: index integrity differs from the file entry sha512`,
      );
    }
  }
  return problems;
}
