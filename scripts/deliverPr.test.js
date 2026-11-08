import { afterEach, describe, expect, it } from "vitest";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

// deliver-pr.sh must say MERGED only when the pull request really merged.
// `gh` is replaced by a stub whose answers come from environment variables.
const SCRIPT = join(process.cwd(), "scripts", "deliver-pr.sh");
const cleanup = [];
afterEach(() => {
  while (cleanup.length)
    rmSync(cleanup.pop(), { recursive: true, force: true });
});

const STUB = `#!/usr/bin/env bash
case "$1 $2" in
  "pr checks") printf '%b' "$STUB_CHECKS" ;;
  "pr merge")
    if [ "$STUB_MERGE" = flaky ] && [ ! -f "$STUB_DIR/flaked" ]; then
      touch "$STUB_DIR/flaked"; echo "GraphQL: Base branch was modified. Review and try the merge again." >&2; exit 1
    fi
    [ "$STUB_MERGE" = fail ] && { echo "GraphQL: Pull Request has merge conflicts" >&2; exit 1; }
    [ "$STUB_MERGE" = lie ] && exit 0
    touch "$STUB_DIR/merged"; exit 0 ;;
  "pr view")
    if [ -f "$STUB_DIR/merged" ]; then echo "MERGED abc1234"; else echo "OPEN "; fi ;;
  "run list") echo "CI 11"; echo "Rules 12" ;;
esac
`;

function run({ checks = "frontend\tpass\n", merge = "ok" }) {
  const dir = mkdtempSync(join(tmpdir(), "deliver-pr-"));
  cleanup.push(dir);
  mkdirSync(join(dir, "bin"));
  writeFileSync(join(dir, "bin", "gh"), STUB);
  chmodSync(join(dir, "bin", "gh"), 0o755);
  writeFileSync(join(dir, "body.md"), "body\n");
  return spawnSync("bash", [SCRIPT, "7", "feat: x", join(dir, "body.md")], {
    encoding: "utf8",
    env: {
      PATH: `${join(dir, "bin")}:${process.env.PATH}`,
      STUB_DIR: dir,
      STUB_CHECKS: checks,
      STUB_MERGE: merge,
      DELIVER_POLL_SEC: "0",
      DELIVER_RUNS_WAIT_SEC: "0",
      DELIVER_TIMEOUT_MIN: "0",
    },
  });
}

describe("scripts/deliver-pr.sh", () => {
  it("merges, verifies and prints the sha and the run ids", () => {
    const r = run({});
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("MERGED abc1234");
    expect(r.stdout).toContain("RUNS CI 11,Rules 12");
  });

  it("retries once when the base branch was modified", () => {
    const r = run({ merge: "flaky" });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("MERGED abc1234");
  });

  it("never prints MERGED when the merge fails", () => {
    const r = run({ merge: "fail" });
    expect(r.status).toBe(1);
    expect(r.stdout).not.toContain("MERGED");
    expect(r.stderr).toContain("merge conflicts");
  });

  it("does not trust a merge command that succeeded without merging", () => {
    const r = run({ merge: "lie" });
    expect(r.status).toBe(1);
    expect(r.stdout).not.toContain("MERGED");
  });

  it("refuses to merge over a failed check", () => {
    const r = run({ checks: "frontend\tpass\ne2e\tfail\n" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("e2e");
    expect(r.stdout).not.toContain("MERGED");
  });

  it("ignores the stuck cargo-audit pending state but waits for others", () => {
    expect(
      run({ checks: "cargo-audit\tpending\nfrontend\tpass\n" }).status,
    ).toBe(0);
    const r = run({ checks: "frontend\tpending\n" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("still pending");
  });
});
