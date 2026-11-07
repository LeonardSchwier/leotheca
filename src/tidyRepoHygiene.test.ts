/** @vitest-environment node */
// Regression guard for the repository tidy-up: a 100 MB AppImage and session
// logs naming a private network once landed in the tracked tree. This fails
// when a tracked file is too large or a machine-specific marker comes back.
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");
const MAX_BYTES = 5 * 1024 * 1024;

// Tracked files allowed to exceed MAX_BYTES. Empty on purpose: add a path
// here only with a written reason, never to silence a stray build artifact.
const SIZE_ALLOWLIST: readonly string[] = [];

// Handoffs record other machines' sessions verbatim and are exempt from the
// content scan (they are still scrubbed by hand when they leak a path).
const SCAN_EXEMPT_PREFIXES = [".agents/handoffs/"];

// Patterns are assembled from parts so this file does not match itself.
const octet = "(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)";
const FORBIDDEN: Array<{ name: string; re: RegExp }> = [
  {
    name: "private or CGNAT IPv4 address",
    re: new RegExp(
      "(?<![\\d.])(?:10\\." +
        octet +
        "|192\\.168|172\\.(?:1[6-9]|2\\d|3[01])|100\\.(?:6[4-9]|[7-9]\\d|1[01]\\d|12[0-7]))\\." +
        octet +
        "\\." +
        octet +
        "(?![\\d.]*\\d)",
    ),
  },
  { name: "machine path", re: new RegExp("/var/lib/" + "leohub") },
];

const SKIP_CONTENT =
  /\.(png|jpe?g|gif|mp4|wasm|otf|ttf|pfb|bcmap|icc|jar|keystore|lock)$|(^|\/)package-lock\.json$|^public\/pdfjs\/|(^|\/)[a-z-]+-sources\.json$/;

function trackedFiles(): string[] {
  const out = execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    maxBuffer: 64 * 1024 * 1024,
  }).toString();
  return out.split("\0").filter(Boolean);
}

describe("repository hygiene", () => {
  const files = trackedFiles().filter((f) => {
    try {
      return statSync(resolve(root, f)).isFile();
    } catch {
      return false; // deleted in the working tree but still indexed
    }
  });

  it("tracks no file over 5 MB outside the allowlist", () => {
    const oversized = files
      .filter((f) => !SIZE_ALLOWLIST.includes(f))
      .map((f) => ({ f, size: statSync(resolve(root, f)).size }))
      .filter(({ size }) => size > MAX_BYTES)
      .map(({ f, size }) => `${f} (${(size / 1024 / 1024).toFixed(1)} MB)`);
    expect(oversized).toEqual([]);
  });

  it("tracks no private IP address or machine-specific path outside agent handoffs", () => {
    const hits: string[] = [];
    for (const f of files) {
      if (
        SCAN_EXEMPT_PREFIXES.some((p) => f.startsWith(p)) ||
        SKIP_CONTENT.test(f)
      )
        continue;
      const text = readFileSync(resolve(root, f), "utf8");
      for (const { name, re } of FORBIDDEN) {
        const m = re.exec(text);
        if (m) hits.push(`${f}: ${name} (${m[0]})`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("detects the patterns it guards against", () => {
    expect(FORBIDDEN[0].re.test("host 100." + "98.97.38 port")).toBe(true);
    expect(FORBIDDEN[0].re.test("v1.2.3.4")).toBe(false);
    expect(FORBIDDEN[1].re.test("/var/lib/" + "leohub/chat")).toBe(true);
  });
});
