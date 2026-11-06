// Runs from the npm `prepare` script after `npm ci` / `npm install`.
// Points git at the tracked hooks/ directory so contributors get the gates with
// no extra dependency. It must never fail an install: CI, Flatpak and offline
// source builds have no git work tree (or no git), and exit 0 silently there.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

function git(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

const verbose = process.argv.includes("--verbose");
const say = (m) => {
  if (verbose) console.log(m);
};

try {
  if (
    process.env.CI ||
    process.env.FLATPAK_ID ||
    process.env.LEOTHECA_SKIP_HOOKS
  )
    process.exit(0);
  if (git(["rev-parse", "--is-inside-work-tree"]) !== "true") process.exit(0);
  // Only when this package is the repository root, not a dependency checked
  // out inside someone else's work tree.
  if (resolve(git(["rev-parse", "--show-toplevel"])) !== resolve(process.cwd()))
    process.exit(0);
  if (!existsSync("hooks/pre-commit")) process.exit(0);

  let current = "";
  try {
    current = git(["config", "--local", "--get", "core.hooksPath"]);
  } catch {
    // unset
  }
  // Respect a hook manager the contributor chose themselves.
  if (current && current !== "hooks") {
    say(`core.hooksPath is already '${current}'; left unchanged.`);
    process.exit(0);
  }
  if (current === "hooks")
    say("git hooks already enabled (core.hooksPath=hooks).");
  if (!current) {
    git(["config", "--local", "core.hooksPath", "hooks"]);
    console.log(
      "leotheca: git hooks enabled (core.hooksPath=hooks). Details: hooks/README.md",
    );
  }
} catch {
  // Never block an install over developer convenience.
  say("could not configure git hooks (not a git checkout?)");
}
process.exit(0);
