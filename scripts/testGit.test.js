import { afterEach, describe, expect, it } from "vitest";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { cleanGitEnv, makeTempRepo } from "./testGit.js";

const saved = {};
afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

// The pre-push hook exports GIT_DIR and GIT_INDEX_FILE. Simulate it with a
// decoy repository that stands for the real one: it must stay untouched.
describe("a temporary test repository under hook-like git variables", () => {
  it("never touches the repository named by GIT_DIR", () => {
    const decoy = makeTempRepo("decoy-");
    writeFileSync(join(decoy.dir, "keep.txt"), "keep\n");
    decoy.git("add", "-A");
    decoy.git("commit", "-q", "-m", "docs: the decoy");
    const headBefore = decoy.git("rev-parse", "HEAD");
    decoy.git("config", "user.name", "Decoy Owner");

    for (const key of ["GIT_DIR", "GIT_INDEX_FILE", "GIT_WORK_TREE"])
      saved[key] = process.env[key];
    process.env.GIT_DIR = join(decoy.dir, ".git");
    process.env.GIT_INDEX_FILE = join(decoy.dir, ".git", "index");
    process.env.GIT_WORK_TREE = decoy.dir;

    const probe = makeTempRepo("probe-");
    writeFileSync(join(probe.dir, "other.txt"), "other\n");
    probe.git("add", "-A");
    probe.git("commit", "-q", "-m", "chore: inside the probe");

    delete process.env.GIT_DIR;
    delete process.env.GIT_INDEX_FILE;
    delete process.env.GIT_WORK_TREE;
    expect(decoy.git("rev-parse", "HEAD")).toBe(headBefore);
    expect(decoy.git("config", "user.name")).toBe("Decoy Owner");
    expect(decoy.git("ls-files")).toBe("keep.txt");
    expect(probe.git("log", "--format=%s")).toBe("chore: inside the probe");
    rmSync(decoy.dir, { recursive: true, force: true });
    rmSync(probe.dir, { recursive: true, force: true });
  });

  it("drops every GIT_ variable from the environment it hands to git", () => {
    saved.GIT_DIR = process.env.GIT_DIR;
    saved.GIT_PREFIX = process.env.GIT_PREFIX;
    process.env.GIT_DIR = "/somewhere";
    process.env.GIT_PREFIX = "sub/";
    const env = cleanGitEnv();
    expect(env.GIT_DIR).toBeUndefined();
    expect(env.GIT_PREFIX).toBeUndefined();
    expect(env.GIT_CONFIG_NOSYSTEM).toBe("1");
  });
});
