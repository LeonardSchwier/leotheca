import { describe, expect, it } from "vitest";
import { guardCommand } from "./guard-command.mjs";

const cwd = "/work/tree";
const blocked = (c) => guardCommand(c, cwd) !== null;

describe("guardCommand", () => {
  it.each([
    "git reset --hard origin/main",
    "git clean -fd",
    "git push --force origin HEAD:main",
    "git push -f origin main",
    "git push origin +HEAD:main",
    "git push --force-with-lease",
    "git push origin --delete agent/x",
    "git push origin :agent/x",
    "git commit --no-verify -m x",
    "git push --no-verify",
    "git config core.hooksPath /dev/null",
    "git -c core.hooksPath=/dev/null commit -m x",
    "git checkout -- .",
    "git branch -D agent/other",
    "git stash drop",
    "rm -rf /home/user",
    "rm -rf ../other-worktree",
    "rm -rf $HOME/x",
    "rm -fr ~/x",
    "cd x && git reset --hard",
  ])("blocks %s", (c) => expect(blocked(c)).toBe(true));

  it.each([
    "git status --porcelain",
    "git push origin HEAD:refs/heads/main",
    "git commit -m 'fix: x'",
    "git reset --soft HEAD~1",
    "git switch --detach origin/main",
    "git checkout -- src/file.ts",
    "git merge --no-edit origin/main",
    "rm -rf node_modules",
    "rm -rf dist/ build",
    "rm file.txt",
    "npm run format",
    "git log --oneline -n 5",
  ])("allows %s", (c) => expect(blocked(c)).toBe(false));

  it("names the safe alternative", () => {
    expect(guardCommand("git push -f", cwd)).toMatch(/Never force-push/);
  });
});
