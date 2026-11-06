#!/usr/bin/env node
// Commit message convention (PROJECT_RULES, roadmap-workflow): a conventional
// prefix, no em dashes, no competitor names, and an attribution trailer naming
// the real agent or tool. Used by hooks/commit-msg and by CI over pushed commits.
//
// CLI: node scripts/commit-msg-check.mjs <message-file>

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const TYPES = [
  "feat",
  "fix",
  "chore",
  "docs",
  "test",
  "refactor",
  "perf",
  "build",
  "ci",
  "style",
  "revert",
  "roadmap",
];
const SUBJECT_RE = new RegExp(
  `^(${TYPES.join("|")})(\\([a-z0-9][a-z0-9._/-]*\\))?!?: \\S`,
);
const TRAILER_RE =
  /^(Co-Authored-By: .+ <[^<>\s]+@[^<>\s]+>|Authored-By: human)\s*$/im;

/** Returns a list of problems (empty when the message is acceptable). */
export function checkCommitMessage(message) {
  const problems = [];
  const lines = message
    .replace(/\r/g, "")
    .split("\n")
    .filter((l) => !l.startsWith("#"));
  const subject = lines[0] ?? "";
  if (/^(Merge |Revert ")/.test(subject) || /^(fixup|squash)! /.test(subject))
    return problems;
  if (!SUBJECT_RE.test(subject))
    problems.push(
      `subject must look like "type(scope): summary" with type in ${TYPES.join("/")}`,
    );
  if (!TRAILER_RE.test(lines.join("\n"))) {
    problems.push(
      'missing trailer "Co-Authored-By: <real agent/tool name> <noreply@...>" (humans: "Authored-By: human")',
    );
  }
  if (lines.join("\n").includes("—")) problems.push("contains an em dash");
  return problems;
}

async function cli() {
  const { findCompetitor } = await import("./check-rules.mjs");
  const msg = readFileSync(process.argv[2], "utf8");
  const problems = checkCommitMessage(msg);
  const hit = findCompetitor(
    msg
      .split("\n")
      .filter((l) => !l.startsWith("#"))
      .join("\n"),
  );
  if (hit)
    problems.push('contains a competitor name (use "Market Solution #1/#2")');
  if (problems.length === 0) return 0;
  console.error("Commit message rejected:");
  for (const p of problems) console.error(`  ${p}`);
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  cli().then((c) => process.exit(c));
