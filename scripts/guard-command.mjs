#!/usr/bin/env node
// Destructive-command guard. A git hook never sees a shell command, so this is
// a separate, opt-in check an agent runner can call before executing a command
// (for Claude Code: a PreToolUse hook on Bash, see hooks/README.md). It blocks
// what AGENTS.md and the constitution already forbid, and names the safe
// alternative. It is a seatbelt against mistakes, not a sandbox: a determined
// caller can obfuscate a command, which is why CI re-checks the results.
//
// CLI: node scripts/guard-command.mjs "<command>"
//      echo '{"tool_input":{"command":"..."}}' | node scripts/guard-command.mjs
// Exit 0 allow, exit 2 block (message on stderr).

import { fileURLToPath } from "node:url";
import { resolve, sep } from "node:path";

const RULES = [
  [
    /\bgit\b[^;&|]*\breset\b[^;&|]*--hard\b/,
    "git reset --hard discards work. Use `git switch --detach <rev>` on a clean tree, or commit a checkpoint first.",
  ],
  [
    /\bgit\b[^;&|]*\bclean\b/,
    "git clean deletes untracked files. List with `git status --porcelain` and remove specific files you created.",
  ],
  [
    /\bgit\b[^;&|]*\bpush\b[^;&|]*(?:--force\b|--force-with-lease\b|--mirror\b|\s-[a-zA-Z]*f[a-zA-Z]*\b|\s\+\S)/,
    "Never force-push. Fetch, merge main, retest, and push normally.",
  ],
  [
    /\bgit\b[^;&|]*\bpush\b[^;&|]*(?:--delete\b|\s:\S+)/,
    "Do not delete remote refs. Leaving a harmless branch is preferable.",
  ],
  [
    /\bgit\b[^;&|]*\b(?:commit|push|merge|am|cherry-pick|rebase)\b[^;&|]*(?:--no-verify\b|--no-gpg-sign\b|\s-n\b)/,
    "Hooks must not be bypassed (constitution rule 8). Fix what the hook reports.",
  ],
  [
    /\bgit\b[^;&|]*\bconfig\b[^;&|]*core\.hooksPath\b/,
    "Do not change core.hooksPath by hand. Use `npm run hooks:install`.",
  ],
  [
    /\bgit\b[^;&|]*-c\s+core\.hooksPath=/,
    "Do not override core.hooksPath on a command line to skip hooks.",
  ],
  [
    /\bgit\b[^;&|]*\b(?:checkout|restore)\b[^;&|]*(?:\s--\s+\.|\s\.\s*$)/,
    "This discards all working-tree edits. Restore named files you changed yourself.",
  ],
  [
    /\bgit\b[^;&|]*\b(?:branch\s+-D|stash\s+(?:drop|clear))\b/,
    "Do not delete branches or stashes that may hold another session's work.",
  ],
];

const RM_RE =
  /\brm\b(?=[^;&|]*\s-[a-zA-Z]*[rR])((?:\s+(?:--?[a-zA-Z-]+|[^\s;&|]+))*)/;

/** Paths an `rm -r` removes, or [] when the command has none. */
function rmTargets(command) {
  const m = RM_RE.exec(command);
  if (!m) return [];
  return m[1]
    .split(/\s+/)
    .filter((t) => t && !t.startsWith("-"))
    .map((t) => t.replace(/^["']|["']$/g, ""));
}

function insideCwd(target, cwd) {
  if (
    /[$`*]/.test(target) &&
    !/^\.?\.?\//.test(target) &&
    !target.startsWith(cwd)
  )
    return false;
  if (/\$|`/.test(target)) return false; // cannot be resolved statically
  const abs = resolve(cwd, target.replace(/^~(?=\/|$)/, "/__home__"));
  return (
    (abs === cwd ? false : abs.startsWith(cwd + sep)) && !target.includes("..")
  );
}

/** Returns a reason string when the command must be blocked, else null. */
export function guardCommand(command, cwd = process.cwd()) {
  for (const [re, why] of RULES) if (re.test(command)) return why;
  for (const t of rmTargets(command))
    if (!insideCwd(t, cwd))
      return `Recursive delete of "${t}" is outside this worktree. Delete only paths you created under the current directory.`;
  return null;
}

async function readStdin() {
  let text = "";
  process.stdin.setEncoding("utf8");
  for await (const c of process.stdin) text += c;
  return text;
}

async function cli() {
  let command = process.argv[2];
  let cwd = process.cwd();
  if (command === undefined) {
    try {
      const data = JSON.parse(await readStdin());
      command = data?.tool_input?.command ?? "";
      if (typeof data?.cwd === "string") cwd = data.cwd;
    } catch {
      console.error(
        "guard-command: could not read a command; blocking is not applied",
      );
      return 0;
    }
  }
  const why = guardCommand(String(command), cwd);
  if (!why) return 0;
  console.error(`Blocked by scripts/guard-command.mjs: ${why}`);
  return 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  cli().then((c) => process.exit(c));
