// Checks that flatpak/node-sources.json can serve every tarball in
// package-lock.json from the offline npm cache.
//
// `npm ci --offline` looks each tarball up by integrity hash under
// `_cacache/content-v2/sha512/<aa>/<bb>/<rest>`. A missing entry, or one written
// to any other path, surfaces only much later as ENOTCACHED inside the Flatpak
// build, which is how the Release workflow stayed red for weeks unnoticed.

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
    if (entry.dest !== expectedDest || entry["dest-filename"] !== hex.slice(4)) {
      problems.push(`${path}: cached at ${entry.dest}, npm looks in ${expectedDest}`);
    }
  }
  return problems;
}
