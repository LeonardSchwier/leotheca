// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { URL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

// Runs keytool. Returns null when the executable does not exist, so the caller
// can skip the case, and { stdout } otherwise (execFileSync itself returns
// null when stdio is "ignore", which must not read as "not installed"). Every
// other failure, a non-zero exit, a kill, a keystore it cannot read, bad
// arguments, a JDK that does not start, propagates and fails the case.
function keytool(args, options) {
  try {
    return { stdout: execFileSync("keytool", args, options) };
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

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
  it("reads the output format of newer build-tools (V2 Signer: ...)", () => {
    const out = (digest, dn) =>
      `V2 Signer: certificate DN: ${dn}\nV2 Signer: certificate SHA-256 digest: ${digest}\nV2 Signer: certificate SHA-1 digest: 00\n`;
    expect(
      findDebugSigningProblems(out("bb".repeat(32), "CN=Leotheca TEST"), [
        DEBUG,
      ]),
    ).toEqual([]);
    expect(
      findDebugSigningProblems(out(DEBUG_PLAIN, "CN=Android Debug"), [DEBUG])
        .length,
    ).toBeGreaterThan(0);
  });
  it("passes a release certificate", () => {
    expect(findDebugSigningProblems(printed(RELEASE), [DEBUG])).toEqual([]);
  });
  it("passes the throw-away certificate of the Android test build", () => {
    const dn = "CN=Leotheca TEST ephemeral key, O=not a release key";
    expect(
      findDebugSigningProblems(printed("bb".repeat(32), dn), [DEBUG]),
    ).toEqual([]);
  });
  // keytool starts twice here. A cold JVM on a loaded runner needed more than
  // the suite's 10 s limit once (the frontend job ran 185 files in parallel).
  // Both calls are synchronous, so vitest reports the timeout only after they
  // return; a ceiling well above any plausible cold start removes the false
  // failure, and only this case gets it so a hang elsewhere still fails fast.
  // The literal 60_000 keeps prettier from re-indenting the whole case body.
  it("passes a key freshly generated the way the workflow does it", (context) => {
    let dir;
    let listing;
    try {
      dir = mkdtempSync(join(tmpdir(), "ephemeral-key-"));
      const store = join(dir, "t.keystore");
      const generated = keytool(
        [
          "-genkeypair",
          "-keystore",
          store,
          "-storetype",
          "PKCS12",
          "-storepass",
          "ephemeral-test-pass",
          "-alias",
          "leotheca-test",
          "-keyalg",
          "RSA",
          "-keysize",
          "2048",
          "-validity",
          "1",
          "-dname",
          "CN=Leotheca TEST ephemeral key, O=not a release key",
        ],
        { stdio: "ignore" },
      );
      // No keytool on this runner: report a skip, not a pass. Any other
      // failure of the two calls has already thrown out of the case.
      if (!generated) return context.skip();
      listing = keytool(
        [
          "-list",
          "-v",
          "-keystore",
          store,
          "-storepass",
          "ephemeral-test-pass",
        ],
        { encoding: "utf8" },
      ).stdout;
    } finally {
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
    const digest = /SHA256:\s*(\S+)/.exec(listing)[1];
    expect(normalizeSha256(digest)).not.toBe(DEBUG_PLAIN);
    expect(
      findDebugSigningProblems(
        printed(digest, "CN=Leotheca TEST ephemeral key, O=not a release key"),
        [DEBUG],
      ),
    ).toEqual([]);
  }, 60_000);
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

describe("keytool helper", () => {
  // The stand-ins sit in a temporary directory that is the only entry of the
  // PATH given to the helper, so the result does not depend on a JDK being
  // installed on the machine that runs the suite.
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "keytool-standin-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  const options = (extra = {}) => ({
    env: { PATH: dir },
    stdio: "pipe",
    encoding: "utf8",
    ...extra,
  });
  const standIn = (script, mode = 0o755) => {
    const file = join(dir, "keytool");
    writeFileSync(file, script);
    chmodSync(file, mode);
  };
  const thrown = (run) => {
    try {
      run();
    } catch (error) {
      return error;
    }
    throw new Error("expected the helper to throw");
  };

  it("reports a missing executable as null so the case can be skipped", () => {
    expect(keytool(["-list"], options())).toBeNull();
  });

  describe.skipIf(process.platform === "win32")(
    "with a stand-in keytool",
    () => {
      it("returns the output and passes the arguments through", () => {
        standIn('#!/bin/sh\necho "args: $*"\n');
        expect(keytool(["-list", "-v"], options())).toEqual({
          stdout: "args: -list -v\n",
        });
      });
      it("does not mistake a success without captured output for a missing executable", () => {
        standIn("#!/bin/sh\nexit 0\n");
        expect(keytool(["-list"], options({ stdio: "ignore" }))).not.toBeNull();
      });
      it("throws when keytool exits with an error", () => {
        standIn('#!/bin/sh\necho "broken JDK" >&2\nexit 3\n');
        const error = thrown(() => keytool(["-list"], options()));
        expect(error.status).toBe(3);
        expect(String(error.stderr)).toContain("broken JDK");
      });
      it("throws when keytool is killed", () => {
        standIn("#!/bin/sh\nkill -9 $$\n");
        const error = thrown(() => keytool(["-list"], options()));
        expect(error.signal).toBe("SIGKILL");
      });
      it("throws when keytool exists but cannot be executed", () => {
        standIn("#!/bin/sh\nexit 0\n", 0o644);
        const error = thrown(() => keytool(["-list"], options()));
        expect(error.code).toBe("EACCES");
      });
    },
  );
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
  it("matches the digest keytool reports for the committed debug keystore", (context) => {
    const result = keytool(
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
    // No keytool on this runner: report a skip, not a pass.
    if (!result) return context.skip();
    const listing = result.stdout;
    expect(normalizeSha256(/SHA256:\s*(\S+)/.exec(listing)[1])).toBe(
      DEBUG_PLAIN,
    );
  });
});
