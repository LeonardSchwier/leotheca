import { afterEach, describe, expect, it } from "vitest";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { cleanGitEnv, makeTempRepo } from "./testGit.js";

// Defence in depth for the 2026-11-07 incident: if anything run by the
// pre-push gate (a test, a script) changes HEAD or the local git identity, the
// push must be refused instead of sending the changed history.
const HOOK = join(process.cwd(), "hooks", "pre-push");
const ZERO = "0".repeat(40);
const cleanup = [];
afterEach(() => {
  while (cleanup.length)
    rmSync(cleanup.pop(), { recursive: true, force: true });
});

function repoWithVerify(verifyScript) {
  const { dir, git } = makeTempRepo("pre-push-guard-");
  cleanup.push(dir);
  mkdirSync(join(dir, "hooks"));
  mkdirSync(join(dir, "scripts"));
  copyFileSync(HOOK, join(dir, "hooks", "pre-push"));
  writeFileSync(join(dir, "scripts", "check-rules.mjs"), "process.exit(0);\n");
  writeFileSync(join(dir, "scripts", "verify-fast.sh"), verifyScript);
  chmodSync(join(dir, "scripts", "verify-fast.sh"), 0o755);
  writeFileSync(join(dir, "app.ts"), "export const a = 1;\n");
  git("add", "-A");
  git("commit", "-q", "-m", "chore: base");
  writeFileSync(join(dir, "app.ts"), "export const a = 2;\n");
  git("add", "-A");
  git("commit", "-q", "-m", "feat: change the app");
  return { dir, git, head: git("rev-parse", "HEAD") };
}

function push({ dir, head }, ref = "refs/heads/agent/rm-x/abc") {
  return spawnSync("bash", ["hooks/pre-push"], {
    cwd: dir,
    env: cleanGitEnv(),
    encoding: "utf8",
    input: `${ref} ${head} ${ref} ${ZERO}\n`,
  });
}

describe("hooks/pre-push guard", () => {
  it("treats everything under .agents as metadata and skips the app gate", () => {
    const repo = repoWithVerify("#!/usr/bin/env bash\nexit 1\n");
    mkdirSync(join(repo.dir, ".agents", "reviews"), { recursive: true });
    writeFileSync(join(repo.dir, ".agents", "reviews", "r.md"), "# review\n");
    repo.git("add", "-A");
    repo.git("commit", "-q", "-m", "docs: add a review");
    const head = repo.git("rev-parse", "HEAD");
    const parent = repo.git("rev-parse", "HEAD~1");
    const result = spawnSync("bash", ["hooks/pre-push"], {
      cwd: repo.dir,
      env: cleanGitEnv(),
      encoding: "utf8",
      input: `refs/heads/agent/x ${head} refs/heads/agent/x ${parent}\n`,
    });
    expect(result.stdout).toContain("metadata-only push");
    expect(result.status, result.stderr).toBe(0);
  });

  it("refuses a direct push to main", () => {
    const repo = repoWithVerify("#!/usr/bin/env bash\nexit 0\n");
    const result = push(repo, "refs/heads/main");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("direct push to refs/heads/main");
  });

  it("lets a clean verification through", () => {
    const repo = repoWithVerify("#!/usr/bin/env bash\nexit 0\n");
    const result = push(repo);
    expect(result.status, result.stderr).toBe(0);
  });

  it("refuses the push when the checks moved HEAD", () => {
    const repo = repoWithVerify(
      '#!/usr/bin/env bash\ngit -c user.name=Test -c user.email=t@example.com commit -q --allow-empty -m "wip: made by a test"\nexit 0\n',
    );
    const result = push(repo);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("changed the repository");
  });

  it("refuses the push when the checks changed the local identity", () => {
    const repo = repoWithVerify(
      "#!/usr/bin/env bash\ngit config user.name Intruder\nexit 0\n",
    );
    const result = push(repo);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("changed the repository");
  });
});
