#!/usr/bin/env node
// Fails when an APK that is about to be published is signed with an Android
// debug certificate. Input is the text printed by `apksigner verify --print-certs`.
//
//   apksigner verify --print-certs app.apk | node scripts/verifyApkNotDebugSigned.mjs \
//     --debug-sha256 <hex> [--debug-sha256 <hex> ...]
//
// The workflow derives the debug digest from the committed android/debug.keystore
// with keytool, so a rotated debug key is still caught. Any certificate whose
// distinguished name is the stock "CN=Android Debug" is rejected as well, which
// covers the SDK's own ~/.android/debug.keystore.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Lower-case hex without separators, or "" when the text is not a SHA-256. */
export function normalizeSha256(value) {
  const hex = String(value)
    .replace(/[^0-9a-fA-F]/g, "")
    .toLowerCase();
  return hex.length === 64 ? hex : "";
}

/** The signer certificates apksigner printed: digest and distinguished name. */
export function parseCertificates(output) {
  const certs = new Map();
  for (const line of String(output).split(/\r?\n/)) {
    // Older apksigner prints "Signer #1 certificate DN: ..."; newer build-tools
    // print "V2 Signer: certificate DN: ..." (one block per signature scheme).
    const m =
      /^(?:Signer #(\d+)|(V\d+(?:\.\d+)? Signer)):? certificate (DN|SHA-256 digest):\s*(.+?)\s*$/.exec(
        line,
      );
    if (!m) continue;
    const id = m[1] ?? m[2];
    const cert = certs.get(id) ?? { signer: id, sha256: "", dn: "" };
    if (m[3] === "DN") cert.dn = m[4];
    else cert.sha256 = normalizeSha256(m[4]);
    certs.set(id, cert);
  }
  return [...certs.values()];
}

/** Problems that must stop a publish; an empty list means the APK may ship. */
export function findDebugSigningProblems(output, debugDigests) {
  const known = new Set(debugDigests.map(normalizeSha256).filter(Boolean));
  const certs = parseCertificates(output);
  if (known.size === 0)
    return ["no debug certificate digest supplied, refusing to guess"];
  if (certs.length === 0)
    return ["no signer certificate found in the apksigner output"];
  const problems = [];
  for (const cert of certs) {
    if (!cert.sha256)
      problems.push(`signer #${cert.signer} has no readable SHA-256 digest`);
    else if (known.has(cert.sha256))
      problems.push(
        `signer #${cert.signer} uses the debug certificate ${cert.sha256}`,
      );
    if (/\bCN=Android Debug\b/.test(cert.dn))
      problems.push(
        `signer #${cert.signer} has the debug distinguished name "${cert.dn}"`,
      );
  }
  return problems;
}

function main(argv) {
  const digests = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--debug-sha256") digests.push(argv[(i += 1)] ?? "");
    else {
      console.error(`unknown argument: ${argv[i]}`);
      return 2;
    }
  }
  const problems = findDebugSigningProblems(readFileSync(0, "utf8"), digests);
  for (const problem of problems)
    console.error(`APK signing check failed: ${problem}`);
  if (problems.length === 0)
    console.log("APK signing check passed: no debug certificate.");
  return problems.length === 0 ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  process.exitCode = main(process.argv.slice(2));
