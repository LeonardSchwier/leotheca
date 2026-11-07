// Helpers for tests that run git in a temporary repository.
//
// Git exports GIT_DIR, GIT_INDEX_FILE, GIT_WORK_TREE and friends into every
// hook. The pre-push gate runs the whole test suite from a hook, so a test that
// calls git with only `cwd` set acts on the REAL repository: on 2026-11-07 such
// a test committed an emptied tree to the real branch, set user.name to "Test" in
// the real config, and the result reached main. Every git call made by a test
// must go through this file (scripts/testHygiene.test.js enforces it).
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

/** The current environment without any GIT_* variable, and without user or system git config. */
export function cleanGitEnv(extra = {}) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith("GIT_")) env[key] = value;
  }
  return {
    ...env,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
    ...extra,
  };
}

/**
 * Creates an empty repository in the system temp directory and returns a git
 * runner bound to it. Fails closed: if git does not resolve to that directory,
 * nothing runs.
 */
export function makeTempRepo(prefix = "git-test-") {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: dir,
      env: cleanGitEnv(),
      encoding: "utf8",
    }).trim();
  git("init", "-q");
  const top = realpathSync(git("rev-parse", "--show-toplevel"));
  if (top !== dir) {
    throw new Error(`refusing to run: git resolves ${top} instead of ${dir}`);
  }
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  git("config", "commit.gpgsign", "false");
  return { dir, git };
}

/** Runs node with the clean git environment in `cwd`. */
export function runNode(args, cwd) {
  return spawnSync("node", args, {
    cwd,
    env: cleanGitEnv(),
    encoding: "utf8",
  });
}
