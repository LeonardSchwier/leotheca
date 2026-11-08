import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const retry = path.join(scriptsDir, "retry.sh");

let dir;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "retry-test-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// A stub that fails with `failCode` for its first `failures` runs, then
// succeeds, and counts its runs in a file.
function stub(failures, failCode = 7) {
  const counter = path.join(dir, "count");
  const file = path.join(dir, "stub.sh");
  writeFileSync(
    file,
    `#!/usr/bin/env bash
n=$(cat "${counter}" 2>/dev/null || echo 0)
n=$((n + 1))
echo "$n" > "${counter}"
if [ "$n" -le ${failures} ]; then exit ${failCode}; fi
exit 0
`,
  );
  chmodSync(file, 0o755);
  return { file, runs: () => Number(readFileSync(counter, "utf8")) };
}

function run(args) {
  return spawnSync("bash", [retry, ...args], {
    encoding: "utf8",
    env: { ...process.env, RETRY_SLEEPS: "0 0" },
  });
}

describe("retry.sh", () => {
  it("runs a succeeding command once", () => {
    const s = stub(0);
    const result = run([s.file]);
    expect(result.status).toBe(0);
    expect(s.runs()).toBe(1);
    expect(result.stderr).toContain("attempt 1 of 3");
    expect(result.stderr).not.toContain("attempt 2 of 3");
  });

  it("retries a command that fails twice and then succeeds", () => {
    const s = stub(2);
    const result = run([s.file]);
    expect(result.status).toBe(0);
    expect(s.runs()).toBe(3);
    expect(result.stderr).toContain("attempt 3 of 3");
  });

  it("returns the last exit code of a command that always fails", () => {
    const s = stub(99, 42);
    const result = run([s.file]);
    expect(result.status).toBe(42);
    expect(s.runs()).toBe(3);
  });

  it("passes arguments through unchanged", () => {
    const result = run(["bash", "-c", 'test "$1" = "a b"', "x", "a b"]);
    expect(result.status).toBe(0);
  });

  it("rejects a call without a command", () => {
    expect(run([]).status).toBe(2);
  });

  it("uses the 20 s and 60 s sleeps by default", () => {
    const text = readFileSync(retry, "utf8");
    expect(text).toContain("20 60");
  });
});
