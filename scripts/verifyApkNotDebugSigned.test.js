// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { URL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  findDebugSigningProblems,
  normalizeSha256,
  parseCertificates,
} from "./verifyApkNotDebugSigned.mjs";

const DEBUG =
  "E2:F9:2D:81:CB:9A:A3:91:61:41:AE:67:58:C0:79:A1:B7:F6:65:80:08:3B:4E:A0:5B:9A:EA:42:ED:23:AE:9B";
const DEBUG_PLAIN = DEBUG.replace(/:/g, "").toLowerCase();
const RELEASE = "aa".repeat(32);
const printed = (digest, dn = "CN=Leotheca Release, O=Leonard Schwier") =>
  `Signer #1 certificate DN: ${dn}\nSigner #1 certificate SHA-256 digest: ${digest}\nSigner #1 certificate SHA-1 digest: 00\n`;

describe("normalizeSha256", () => {
  it("accepts colon, upper-case and plain forms", () => {
    expect(normalizeSha256(DEBUG)).toBe(DEBUG_PLAIN);
    expect(normalizeSha256(DEBUG_PLAIN.toUpperCase())).toBe(DEBUG_PLAIN);
  });
  it("rejects anything that is not 32 bytes", () => {
    expect(normalizeSha256("abcd")).toBe("");
    expect(normalizeSha256("")).toBe("");
  });
});

describe("parseCertificates", () => {
  it("reads every signer", () => {
    const out = printed(RELEASE) + printed(DEBUG_PLAIN).replace(/#1/g, "#2");
    expect(parseCertificates(out).map((c) => c.sha256)).toEqual([
      RELEASE,
      DEBUG_PLAIN,
    ]);
  });
});

describe("findDebugSigningProblems", () => {
  it("passes a release certificate", () => {
    expect(findDebugSigningProblems(printed(RELEASE), [DEBUG])).toEqual([]);
  });
  it("fails the committed debug certificate in any digest spelling", () => {
    expect(
      findDebugSigningProblems(printed(DEBUG_PLAIN), [DEBUG]),
    ).toHaveLength(1);
    expect(
      findDebugSigningProblems(printed(DEBUG.toUpperCase()), [DEBUG_PLAIN]),
    ).toHaveLength(1);
  });
  it("fails the stock debug distinguished name even with an unknown digest", () => {
    const out = printed(RELEASE, "C=US, O=Android, CN=Android Debug");
    expect(findDebugSigningProblems(out, [DEBUG])).toHaveLength(1);
  });
  it("fails when a second signer is the debug certificate", () => {
    const out = printed(RELEASE) + printed(DEBUG_PLAIN).replace(/#1/g, "#2");
    expect(findDebugSigningProblems(out, [DEBUG])).toHaveLength(1);
  });
  it("fails closed on empty output, unreadable digest or no reference digest", () => {
    expect(findDebugSigningProblems("", [DEBUG])).toHaveLength(1);
    expect(findDebugSigningProblems(printed("zz"), [DEBUG])).toHaveLength(1);
    expect(findDebugSigningProblems(printed(RELEASE), [])).toHaveLength(1);
  });
});

describe("command line", () => {
  const script = new URL("./verifyApkNotDebugSigned.mjs", import.meta.url)
    .pathname;
  const run = (input, ...args) =>
    spawnSync("node", [script, ...args], { input, encoding: "utf8" });
  it("exits 0 for a release certificate and 1 for the debug one", () => {
    expect(run(printed(RELEASE), "--debug-sha256", DEBUG).status).toBe(0);
    const bad = run(printed(DEBUG_PLAIN), "--debug-sha256", DEBUG);
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain("debug certificate");
  });
  it("matches the digest keytool reports for the committed debug keystore", () => {
    let listing;
    try {
      listing = execFileSync(
        "keytool",
        [
          "-list",
          "-v",
          "-keystore",
          new URL("../android/debug.keystore", import.meta.url).pathname,
          "-storepass",
          "android",
        ],
        { encoding: "utf8" },
      );
    } catch {
      return; // keytool is not installed on this runner
    }
    expect(normalizeSha256(/SHA256:\s*(\S+)/.exec(listing)[1])).toBe(
      DEBUG_PLAIN,
    );
  });
});
