#!/usr/bin/env node
// Mechanical checks for rules that used to exist only as prose
// (CONSTITUTION.md, documentation/PROJECT_RULES.md, skills/). One script so the
// pre-commit hook, the pre-push hook and CI run the identical logic.
//
// Usage (run from the repository root):
//   node scripts/check-rules.mjs lines   --staged | <base> <head>
//   node scripts/check-rules.mjs files   --staged            (conflict markers, big files)
//   node scripts/check-rules.mjs format  --staged | <base> <head>
//   node scripts/check-rules.mjs commits <base> <head>
//   node scripts/check-rules.mjs deps <base> <head>      (dependency-intake line)
//   node scripts/check-rules.mjs licenses
//   node scripts/check-rules.mjs workflows
//
// Every subcommand exits 0 when clean and 1 with a readable list otherwise.

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { checkCommitMessage } from "./commit-msg-check.mjs";

const EM_DASH = "—";

// Competitor product names are matched by hash so this file does not itself
// break the rule it enforces (PROJECT_RULES: use "Market Solution #N" labels).
// Lowercase tokens are matched case-insensitively; the exact-case list holds
// names that are also ordinary English words.
const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);
export const COMPETITOR_HASHES_ANYCASE = new Set([
  "4e2295dd929e424a",
  "9c00698ac74e7a92",
  "2690aa4ee8591c31",
  "079f912e7f330a1b",
  "155e607825187242",
  "1875762df9aa7737",
  "8c91513634f3b02e",
  "e0bb10f49d3253b5",
  "e723a45099586f76",
  "84381eb69a68ef1b",
  "8b2f87fbdd00da93",
  "56ec1e34c0dc7b52",
  "6928026775a6f2d5",
  "077fa8899195adf0",
  "afcae9b39c2ab4cd",
  "622261b8ffb31ae8",
  "c4db5102c4052e3a",
  "40be74b760a5fc8b",
  "752ae8b3c213e675",
  "bde70282b4409b87",
  "3a69d1f4524e8310",
]);
export const COMPETITOR_HASHES_EXACT = new Set(["73bcfe98830b53a1"]);

// A line may opt out with this marker plus a reason, e.g. a literal on-disk
// folder name an importer must recognise. The marker keeps exceptions visible.
export const ALLOW_MARKER = "rules-allow:";

// Ledger-managed or vendored paths: the roadmap quotes feature names, the lock
// file and vendored runtime data are not authored prose.
const CONTENT_EXEMPT = [
  /^ROADMAP\.md$/,
  /^\.agents\//,
  /^package-lock\.json$/,
  /^src-tauri\/Cargo\.lock$/,
  /^public\/pdfjs\//,
  /^assets\//,
  /^control-[^/]+\//,
  /^scripts\/check-rules\.mjs$/,
  /^scripts\/check-rules\.test\.js$/,
  /^scripts\/commit-msg-check\.mjs$/,
  /^scripts\/guard-command\.mjs$/,
  /^scripts\/guard-command\.test\.js$/,
  /\.(png|jpe?g|gif|webp|ico|icns|svg|woff2?|ttf|otf|pdf|zip|jar|apk|AppImage|wasm|bin)$/i,
];
export const isContentExempt = (path) =>
  CONTENT_EXEMPT.some((re) => re.test(path));

// Lock files and vendored/binary data hold long hashes that look like secrets.
const SECRET_EXEMPT = [
  /^package-lock\.json$/,
  /^src-tauri\/Cargo\.lock$/,
  /^public\/pdfjs\//,
  /^scripts\/check-rules\.(mjs|test\.js)$/,
  /^control-[^/]+\//,
];
export const isSecretExempt = (path) =>
  SECRET_EXEMPT.some((re) => re.test(path));

// The ledger helper writes a random 32-hex claim token into ROADMAP.md
// `agent-state` comments. That value is not a credential, but its field name
// looks like one. Only that exact field shape is removed before scanning, so a
// real secret on the same line, or anywhere else in ROADMAP.md, is still found.
const LEDGER_LINE = /^\s*<!-- agent-state: \{.*\} -->\s*$/;
const LEDGER_TOKEN = /"token":"[0-9a-f]{32}"/;
export function lineSecretProblems(path, text) {
  if (isSecretExempt(path)) return [];
  if (path === "ROADMAP.md" && LEDGER_LINE.test(text))
    return secretProblems(text.replace(LEDGER_TOKEN, '"token":"-"'));
  return secretProblems(text);
}

export const MAX_FILE_BYTES = 1024 * 1024;
const BIG_FILE_ALLOWED = [
  /^public\//,
  /^assets\//,
  /^package-lock\.json$/,
  /^src-tauri\/(icons|Cargo\.lock)/,
  /^android\/.*\.(png|webp|jar)$/,
  /^packaging\//,
  /^resources\//,
];

// Secret-shaped tokens in added lines. Deterministic, offline, and run by the
// hook and by CI, so it works where gitleaks is not installed. gitleaks adds
// broader coverage when present (hooks/pre-commit). Patterns are assembled from
// fragments so this file never contains a match for itself.
const PEM = "-----BEGIN ";
export const SECRET_PATTERNS = [
  [new RegExp(`${PEM}(?:[A-Z]+ )?PRIVATE KEY-----`), "private key block"],
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/, "AWS access key id"],
  [/\bgh[pousr]_[A-Za-z0-9]{36,}\b/, "GitHub token"],
  [/\bgithub_pat_[A-Za-z0-9_]{50,}\b/, "GitHub fine-grained token"],
  [/\bxox[abprs]-[A-Za-z0-9-]{20,}\b/, "Slack token"],
  [/\bsk-[A-Za-z0-9_-]{32,}\b/, "API secret key (sk- prefix)"],
  [
    /\b(?:api[_-]?key|secret|passw(?:or)?d|token)\b["']?\s*[:=]\s*["'][A-Za-z0-9+/_-]{24,}["']/i,
    "hard-coded credential assignment",
  ],
];

/** Secret problems for one added line; `rules-allow:` is deliberately NOT honoured. */
export function secretProblems(text) {
  return SECRET_PATTERNS.filter(([re]) => re.test(text)).map(
    ([, label]) => `possible secret: ${label}`,
  );
}

export function findCompetitor(text) {
  for (const word of text.match(/[A-Za-z][A-Za-z0-9]{3,}/g) ?? []) {
    if (COMPETITOR_HASHES_ANYCASE.has(sha(word.toLowerCase()))) return word;
    if (COMPETITOR_HASHES_EXACT.has(sha(word))) return word;
  }
  return null;
}

/** Problems for one added line of text. */
export function lineProblems(text) {
  if (text.includes(ALLOW_MARKER)) return [];
  const out = [];
  if (text.includes(EM_DASH))
    out.push("em dash (use a comma, colon or hyphen)");
  if (findCompetitor(text))
    out.push('competitor name (use "Market Solution #1/#2")');
  return out;
}

/** Parse `git diff -U0` output into {path, line, text} for added lines. */
export function parseAddedLines(diff) {
  const added = [];
  let path = null;
  let line = 0;
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("+++ ")) {
      path = raw.startsWith("+++ b/") ? raw.slice(6) : null;
    } else if (raw.startsWith("@@")) {
      const m = /\+(\d+)/.exec(raw);
      line = m ? Number(m[1]) : 0;
    } else if (path && raw.startsWith("+") && !raw.startsWith("+++")) {
      added.push({ path, line, text: raw.slice(1) });
      line += 1;
    }
  }
  return added;
}

const git = (args) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

function diffArgs(target) {
  return target[0] === "--staged"
    ? ["--cached"]
    : [`${target[0]}..${target[1]}`];
}

function changedFiles(target) {
  const out = git([
    "diff",
    "--name-only",
    "--diff-filter=ACMR",
    ...diffArgs(target),
  ]);
  return out.split("\n").filter(Boolean);
}

function report(title, problems) {
  if (problems.length === 0) return 0;
  console.error(`${title}:`);
  for (const p of problems) console.error(`  ${p}`);
  return 1;
}

function checkLines(target) {
  const diff = git([
    "diff",
    "-U0",
    "--no-color",
    "--diff-filter=ACMR",
    ...diffArgs(target),
  ]);
  const problems = [];
  const secrets = [];
  for (const { path, line, text } of parseAddedLines(diff)) {
    for (const p of lineSecretProblems(path, text))
      secrets.push(`${path}:${line}: ${p}`);
    if (isContentExempt(path)) continue;
    for (const p of lineProblems(text)) problems.push(`${path}:${line}: ${p}`);
  }
  if (secrets.length)
    console.error(
      "Added lines look like secrets (values are not printed; rotate anything real, never commit it):",
    );
  for (const p of secrets) console.error(`  ${p}`);
  const secretFail = secrets.length ? 1 : 0;
  return (
    secretFail |
    report(
      "Added lines break a written rule (add `rules-allow: <reason>` on the line only for a literal identifier)",
      problems,
    )
  );
}

function checkFiles(target) {
  const problems = [];
  const diff = git([
    "diff",
    "-U0",
    "--no-color",
    "--diff-filter=ACMR",
    ...diffArgs(target),
  ]);
  for (const { path, line, text } of parseAddedLines(diff)) {
    if (/^(<{7}|>{7})( |$)/.test(text) || /^={7}$/.test(text)) {
      if (/\.md$/.test(path) && /^={7}$/.test(text)) continue; // setext underline
      problems.push(`${path}:${line}: merge conflict marker`);
    }
  }
  for (const path of changedFiles(target)) {
    if (BIG_FILE_ALLOWED.some((re) => re.test(path))) continue;
    let size;
    try {
      size = Number(
        git([
          "cat-file",
          "-s",
          target[0] === "--staged" ? `:${path}` : `${target[1]}:${path}`,
        ]).trim(),
      );
    } catch {
      continue;
    }
    if (size > MAX_FILE_BYTES)
      problems.push(
        `${path}: ${(size / 1048576).toFixed(1)} MiB exceeds 1 MiB (store large assets under public/ or assets/, or do not commit)`,
      );
  }
  return report("File problems", problems);
}

function checkFormat(target) {
  const files = changedFiles(target).filter((f) => existsSync(f));
  if (files.length === 0) return 0;
  const bin = "node_modules/.bin/prettier";
  if (!existsSync(bin)) {
    console.error(
      "prettier is not installed; run `npm ci` to enable the format check",
    );
    return 0;
  }
  const r = spawnSync(
    bin,
    [
      "--check",
      "--ignore-unknown",
      "--no-error-on-unmatched-pattern",
      ...files,
    ],
    { encoding: "utf8" },
  );
  if (r.status === 0) return 0;
  console.error(r.stdout + r.stderr);
  console.error(
    "Run `npx prettier --write <file>` on the files above (only files you changed are checked).",
  );
  return 1;
}

function isValidRev(rev) {
  try {
    git(["rev-parse", "--verify", "--quiet", `${rev}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

function checkCommits([base, head]) {
  // A new branch (all-zero base) or a force push leaves no usable base: fall
  // back to the tip commit rather than failing open or scanning all history.
  const range =
    /^0+$/.test(base) || !isValidRev(base)
      ? `${head}~1..${head}`
      : `${base}..${head}`;
  const shas = git(["rev-list", "--no-merges", "--reverse", range])
    .split("\n")
    .filter(Boolean);
  const problems = [];
  for (const sha1 of shas) {
    const msg = git(["log", "-1", "--format=%B", sha1]);
    const found = checkCommitMessage(msg);
    if (findCompetitor(msg))
      found.push('contains a competitor name (use "Market Solution #1/#2")');
    for (const p of found)
      problems.push(
        `${sha1.slice(0, 9)} ${msg.split("\n")[0].slice(0, 60)}: ${p}`,
      );
  }
  return report("Commit messages", problems);
}

// Dependency intake (skills/security-and-static-analysis.md section 3): a new or
// changed dependency needs a "Dependency-intake:" line in a commit message of
// the range, stating existence, maintenance, source, license, install scripts.
export function parsePackageDeps(json) {
  const out = {};
  let pkg;
  try {
    pkg = JSON.parse(json);
  } catch {
    return out;
  }
  for (const k of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ])
    for (const [n, v] of Object.entries(pkg[k] ?? {}))
      out[`npm:${n}`] = String(v);
  return out;
}

export function parseCargoDeps(toml) {
  const out = {};
  let section = null;
  for (const raw of toml.split("\n")) {
    const line = raw.replace(/#.*$/, "").trim();
    const head = /^\[(.+)\]$/.exec(line);
    if (head) {
      const name = head[1];
      const sub = /(?:^|\.)(?:dev-|build-)?dependencies\.([^.\s]+)$/.exec(name);
      if (sub) {
        out[`cargo:${sub[1]}`] = name;
        section = null;
      } else {
        section = /(?:^|\.)(?:dev-|build-)?dependencies$/.test(name)
          ? name
          : null;
      }
      continue;
    }
    if (!section) continue;
    const kv = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/.exec(line);
    if (kv) out[`cargo:${kv[1]}`] = kv[2].trim();
  }
  return out;
}

/** Names added or whose spec changed between two dependency maps. */
export function changedDeps(before, after) {
  return Object.keys(after)
    .filter((k) => before[k] !== after[k])
    .sort();
}

const DEP_FILES = [
  ["package.json", parsePackageDeps],
  ["src-tauri/Cargo.toml", parseCargoDeps],
];

function showAt(rev, path) {
  try {
    return execFileSync("git", ["show", `${rev}:${path}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return "";
  }
}

export function hasIntakeLine(messages) {
  return /^Dependency-intake: \S.{20,}/m.test(messages);
}

function checkDeps([base, head]) {
  const baseRev = /^0+$/.test(base) || !isValidRev(base) ? `${head}~1` : base;
  const changed = [];
  for (const [file, parse] of DEP_FILES)
    changed.push(
      ...changedDeps(parse(showAt(baseRev, file)), parse(showAt(head, file))),
    );
  if (changed.length === 0) return 0;
  const messages = git(["log", "--format=%B", `${baseRev}..${head}`]);
  if (hasIntakeLine(messages)) return 0;
  return report(
    'Dependencies added or changed without a "Dependency-intake: <name>: exists/intended package, maintenance, source repo, license, install scripts" line in a commit message',
    changed,
  );
}

// Evidence trailers: the legal/text-rights check, the database skill and the
// second-model review are procedures (skills/text-rights-and-legal-check.md,
// skills/database-best-practices.md, skills/pdlc-playbook.md stage 6). This
// makes the evidence mechanical: a push that touches the matching paths needs
// the matching trailer in a commit message of the pushed range, like
// "Dependency-intake:". It proves the author recorded the result, not that the
// result is right; "Review: self-review: <reason>" stays allowed and visible.
// Only added, copied, modified and renamed paths count (a deleted file has no
// text left to check). Dependency manifests (package.json, lockfiles, Cargo
// files) are deliberately not legal paths: the "Dependency-intake:" line and
// the licenses job in rules.yml already record and verify the license decision.
const LEGAL_PATHS = [
  /^README\.md$/,
  /^CHANGELOG\.md$/,
  /^LICENSE$/,
  /^assets\//,
  /^documentation\//,
  /^docs\//,
  /^public\/(?!pdfjs\/)/,
  /^packaging\//,
  /^extensions\/.*\.(md|json|html)$/,
  /^flatpak\/.*\.xml$/,
];
const DB_PATHS = [/\.sql$/i, /(^|\/)migrations\//];
const REVIEW_PATHS = [
  /^src-tauri\/src\//,
  /^android\/.*AndroidManifest\.xml$/,
  /^\.github\/workflows\//,
  /^hooks\//,
  /^CONSTITUTION\.md$/,
  /^scripts\/(check-rules|guard-command|commit-msg-check)\.mjs$/,
];

export function requiredTrailers(paths) {
  const any = (res) => paths.some((p) => res.some((re) => re.test(p)));
  return {
    legal: any(LEGAL_PATHS),
    database: any(DB_PATHS),
    review: any(REVIEW_PATHS),
  };
}

const matching = (paths, res) =>
  paths.filter((p) => res.some((re) => re.test(p)));
const listed = (found) =>
  found.slice(0, 3).join(", ") + (found.length > 3 ? ", ..." : "");

export function trailerProblems(paths, messages) {
  const legal = matching(paths, LEGAL_PATHS);
  const database = matching(paths, DB_PATHS);
  const review = matching(paths, REVIEW_PATHS);
  const problems = [];
  if (
    legal.length &&
    !/^Legal-Check: \d+ verified, \d+ fixed, 0 open\b/m.test(messages)
  )
    problems.push(
      `text, asset or doc files changed (${listed(legal)}) without a Legal-Check line (skills/text-rights-and-legal-check.md; 0 open is the only landable result). Add to a commit message: Legal-Check: ${legal.length} verified, 0 fixed, 0 open (what you checked)`,
    );
  if (database.length && !/^Database-Review: \S.{20,}/m.test(messages))
    problems.push(
      `schema or migration files changed (${listed(database)}) without a Database-Review line (skills/database-best-practices.md). Add: Database-Review: <keys, normal form, migration safety>`,
    );
  if (review.length && !/^Review: \S.{9,}/m.test(messages))
    problems.push(
      `trust-boundary, workflow, hook or constitution files changed (${listed(review)}) without a Review line (skills/pdlc-playbook.md stage 6). Add: Review: self-review: <why no second model> or Review: <reviewer model or tool>: <result>`,
    );
  return problems;
}

function checkTrailers([base, head]) {
  const baseRev = /^0+$/.test(base) || !isValidRev(base) ? `${head}~1` : base;
  const paths = git([
    "diff",
    "--name-only",
    "--diff-filter=ACMR",
    `${baseRev}..${head}`,
  ])
    .split("\n")
    .filter(Boolean);
  const messages = git(["log", "--format=%B", `${baseRev}..${head}`]);
  return report(
    "Evidence trailers missing from the commit messages of this push",
    trailerProblems(paths, messages),
  );
}

// A spec newly archived under spec/completed/ must end with a reflection: what
// the item taught about the process, and what was done about it
// (skills/pdlc-playbook.md, stage 8).
export const REFLECTION_RE = /^Reflection: \S.{20,}/m;
export function reflectionProblems(files) {
  return files
    .filter(
      ({ path }) => path.startsWith("spec/completed/") && path.endsWith(".md"),
    )
    .filter(({ content }) => !REFLECTION_RE.test(content))
    .map(
      ({ path }) =>
        `${path}: no "Reflection: <finding> -> <applied|seeded|none: reason>" line`,
    );
}

function checkReflection([base, head]) {
  const baseRev = /^0+$/.test(base) || !isValidRev(base) ? `${head}~1` : base;
  const paths = git([
    "diff",
    "--name-only",
    "--diff-filter=AR",
    `${baseRev}..${head}`,
  ])
    .split("\n")
    .filter((p) => p.startsWith("spec/completed/") && p.endsWith(".md"));
  const files = paths.map((path) => ({
    path,
    content: showAt(head, path) ?? "",
  }));
  return report(
    "Specs archived without a Reflection line",
    reflectionProblems(files),
  );
}

// A spec newly archived under spec/completed/ must say which glossary terms it
// added or sharpened, or "none" (skills/pdlc-playbook.md, stage 3; GLOSSARY.md).
export const GLOSSARY_RE = /^Glossary: \S/m;
export function glossaryProblems(files) {
  return files
    .filter(
      ({ path }) => path.startsWith("spec/completed/") && path.endsWith(".md"),
    )
    .filter(({ content }) => !GLOSSARY_RE.test(content))
    .map(
      ({ path }) =>
        `${path}: no "Glossary: <added terms | none>" line (see GLOSSARY.md)`,
    );
}

function checkGlossary([base, head]) {
  const baseRev = /^0+$/.test(base) || !isValidRev(base) ? `${head}~1` : base;
  const paths = git([
    "diff",
    "--name-only",
    "--diff-filter=AR",
    `${baseRev}..${head}`,
  ])
    .split("\n")
    .filter((p) => p.startsWith("spec/completed/") && p.endsWith(".md"));
  const files = paths.map((path) => ({
    path,
    content: showAt(head, path) ?? "",
  }));
  return report(
    "Specs archived without a Glossary line",
    glossaryProblems(files),
  );
}

// SPDX identifiers acceptable for a free-software, source-built MIT project.
// Anything else (including a missing license field) needs a human decision.
const LICENSE_ALLOWED = new Set([
  "MIT",
  "MIT-0",
  "ISC",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "0BSD",
  "Apache-2.0",
  "BlueOak-1.0.0",
  "Unlicense",
  "CC0-1.0",
  "CC-BY-4.0",
  "Zlib",
  "MPL-2.0",
  "EPL-2.0",
  "Python-2.0",
]);
// Reviewed individually. khroma 2.1.0 declares no license field in the registry
// metadata; its repository ships an MIT LICENSE file.
const LICENSE_REVIEWED = {
  khroma:
    "MIT (LICENSE file in upstream repository; registry metadata is empty)",
};

export function licenseProblem(expr) {
  if (typeof expr !== "string" || !expr.trim()) return "no license declared";
  const ids = expr
    .replace(/[()]/g, " ")
    .split(/\s+(?:AND|OR)\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
  // For OR, one acceptable alternative suffices; for AND every term must be acceptable.
  const isOr = /\sOR\s/i.test(expr);
  const ok = ids.map((i) => LICENSE_ALLOWED.has(i));
  const pass = isOr ? ok.some(Boolean) : ok.every(Boolean);
  return pass
    ? null
    : `license "${expr}" is not on the allow list in scripts/check-rules.mjs`;
}

function checkLicenses() {
  const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
  const problems = [];
  for (const [key, meta] of Object.entries(lock.packages ?? {})) {
    if (!key) continue;
    const name = key.replace(/^.*node_modules\//, "");
    if (LICENSE_REVIEWED[name]) continue;
    const p = licenseProblem(
      typeof meta.license === "string" ? meta.license : undefined,
    );
    if (p) problems.push(`${name}@${meta.version}: ${p}`);
  }
  return report("Dependency licenses", problems);
}

// Action references must name a version (a tag or SHA). Floating branch refs
// let an upstream push change CI without a commit here.
export function workflowRefProblems(text) {
  const problems = [];
  text.split("\n").forEach((l, i) => {
    const m = /^\s*(?:-\s*)?uses:\s*([^\s#]+)/.exec(l);
    if (!m || m[1].startsWith("./") || m[1].startsWith("docker://")) return;
    const [, ref] = m[1].split("@");
    if (!ref || /^(main|master|latest|develop|dev|HEAD)$/i.test(ref))
      problems.push(`line ${i + 1}: ${m[1]} is not pinned to a version`);
  });
  return problems;
}

function checkWorkflows() {
  const dir = ".github/workflows";
  const problems = [];
  for (const f of readdirSync(dir).filter((n) => /\.ya?ml$/.test(n))) {
    for (const p of workflowRefProblems(readFileSync(`${dir}/${f}`, "utf8")))
      problems.push(`${f} ${p}`);
  }
  return report("Workflow action pinning", problems);
}

// A pull request body must carry the three headings of
// .github/pull_request_template.md, so the squash commit (built from the body)
// records what changed, the evidence, and how dangerous the merge is.
export const PR_BODY_HEADINGS = ["Summary", "Evidence", "Merge danger"];

// Scans instead of using a regex, so an unterminated "<!--" drops the rest of
// the text and no half-removed marker survives.
function stripHtmlComments(text) {
  let out = "";
  let at = 0;
  for (;;) {
    const open = text.indexOf("<!--", at);
    if (open < 0) return out + text.slice(at);
    out += text.slice(at, open);
    const close = text.indexOf("-->", open + 4);
    if (close < 0) return out;
    at = close + 3;
  }
}

export function prBodyProblems(body) {
  // Comments in the template are instructions, not content.
  const text = stripHtmlComments(String(body ?? "").replace(/\r/g, ""));
  const problems = [];
  for (const name of PR_BODY_HEADINGS) {
    const re = new RegExp(`^#{1,6}[ \\t]+${name}[ \\t]*$`, "im");
    const at = text.search(re);
    if (at < 0) {
      problems.push(`missing heading "## ${name}"`);
      continue;
    }
    const rest = text.slice(at).split("\n").slice(1);
    const next = rest.findIndex((l) => /^#{1,6}[ \t]/.test(l));
    const section = (next < 0 ? rest : rest.slice(0, next)).join("\n").trim();
    if (!section) problems.push(`heading "## ${name}" has no content`);
  }
  return problems;
}

function checkPrBody() {
  const problems = prBodyProblems(process.env.PR_BODY).map(
    (p) => `${p} (see .github/pull_request_template.md)`,
  );
  return report("Pull request body", problems);
}

function main(argv) {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case "lines":
      return checkLines(rest);
    case "files":
      return checkFiles(rest);
    case "format":
      return checkFormat(rest);
    case "commits":
      return checkCommits(rest);
    case "deps":
      return checkDeps(rest);
    case "trailers":
      return checkTrailers(rest);
    case "reflection":
      return checkReflection(rest);
    case "glossary":
      return checkGlossary(rest);
    case "secrets":
      return checkLines(rest);
    case "licenses":
      return checkLicenses();
    case "workflows":
      return checkWorkflows();
    case "prbody":
      return checkPrBody();
    default:
      console.error(
        "usage: check-rules.mjs lines|files|format (--staged | <base> <head>) | commits <base> <head> | deps <base> <head> | trailers <base> <head> | reflection <base> <head> | glossary <base> <head> | licenses | workflows | prbody (body in env PR_BODY)",
      );
      return 2;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  process.exit(main(process.argv.slice(2)));
