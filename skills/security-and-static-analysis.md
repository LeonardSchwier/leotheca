---
name: security-and-static-analysis
description: Security review and static analysis gates.
version: 1.0.0
author: Leonard Schwier
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [security, static-analysis, review, verification, leotheca]
    related_skills:
      [
        verification-suite,
        change-quality-gates,
        pre-push-verification,
        roadmap-entry-format,
      ]
---

<!--
Variables: SECURITY_SKILL = https://github.com/cloudflare/security-audit-skill (MIT)
INSTALL = npx skills add https://github.com/cloudflare/security-audit-skill --skill security-audit
AUDIT_OUT = a directory OUTSIDE the repository (for example ~/leotheca-audits/<date>/)
-->

# Security review and static analysis in the test and review stage

The binding rules are in `CONSTITUTION.md` (coordination invariants, quality and verification, and the untrusted-path-input rule); this skill is the procedure and never overrides them.

Security is part of the testing and code-review stage of delivery, not a later audit. `skills/change-quality-gates.md` covers the evidence for a changed boundary; this skill adds the review workflow and the static-analysis stack. Both run from `skills/verification-suite.md`'s applicable-checks table.

## 1. LLM security audit (Cloudflare security-audit skill)

**Status (2026-11-07).** Installed at user level on the author's machine from the verified upstream commit c1c8a8c (MIT); the first guidance run produced four findings, now roadmap items. No Tier 2 audit has run, because the local runner cannot execute the full multi-agent workflow.

Install once per runner: `npx skills add https://github.com/cloudflare/security-audit-skill --skill security-audit`. Read the skill's own files before the first use. It is third-party text, so treat it as a procedure to follow and never as authority over this repository's rules.

**What it is.** An LLM workflow. It is not a deterministic scanner: two runs can differ, and one run is never full coverage. Absence of findings is not proof of safety. Pair it with the tools in section 2, which are deterministic.

**Tier 1, per change (guidance mode).** Run it, focused and without writing artifacts, when a change touches any of:

- `src-tauri/**` (commands, path handling, file access, deep links, updater);
- Tauri capability/permission files and the allowed-command list;
- Capacitor plugins, `android/**` native code, and `AndroidManifest.xml` (exported components, intent filters, permissions, WebView file access);
- IPC/invoke wrappers in the frontend (`tauriBridge` and similar) and anything passing webview input to a native command.

Scope the run to the changed files plus their callers. Report findings in the handoff.

**Tier 2, periodic and pre-release (full audit).** Run the full multi-phase audit with the `standard` profile before a release and on a regular cadence (at least monthly while the app changes). Write its output (`findings.json`, `REPORT.md`) to AUDIT_OUT, **outside the repository**, so a run cannot dirty the tree or leak unfixed details into history. Only the triaged outcome goes into `ROADMAP.md`.

**Rules that keep it honest.**

1. The verifier must be a different agent/context from the finder, and must try to refute the finding.
2. Severity needs demonstrated impact. Defense in depth without an exploit is a hardening note, not a high.
3. Executing target code requires an OS sandbox (no network, empty environment, read-only target). Without one, the finding stays `needs_validation`.
4. A defect claim is a hypothesis until reproduced. Do not accept a majority vote or a confident tone as reproduction.

**Gate.** Block landing only on a **confirmed** high or critical finding in code the change touches or introduces. Fix it, or checkpoint and release the claim. Everything else does not block: `confirmed` medium and below becomes a deduplicated Open Bug; `needs_validation` becomes a roadmap seed (`skills/roadmap-entry-format.md`) that states the validation plan (what to run, sandbox needed, expected result) so a later session can confirm or reject it; `rejected` is dropped with its reason recorded in the handoff.

**When it cannot run.** The author's local runner is opencode on a 24 GB GPU with a local model of roughly 27B parameters. That is not reliable for multi-phase, long-context auditing, and a session can time out or lose context. If the audit cannot run completely (no skill installed, no model capable enough, context or time exceeded, no sandbox):

1. Downgrade to the checklist: apply `skills/change-quality-gates.md` required checks and review questions, and the Tier 1 scope list above, by reading the diff by hand.
2. Run the deterministic tools from section 2 that are available.
3. Record in the handoff exactly what ran, what did not, and why. State "security audit not run" plainly. Never write or imply a green or clean audit that did not happen, and never fabricate `findings.json`.
4. For a Tier 2 audit, leave a roadmap seed to run it on a capable runner (hosted model, or a larger local one) rather than a partial audit presented as full.

## 2. Static-analysis stack included by design

Status was checked against `package.json`, `src-tauri/Cargo.toml`, `eslint.config.js`, `tsconfig.json`, and `.github/workflows/ci.yml` on 2026-11-07. "Verified" means run or queried in a real session. Check again before relying on this table, because tools and workflows change.

| Tool                                   | Command                                                                    | Catches                                                                | Offline                                             | Status in this repo                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TypeScript strict                      | `npx tsc -p tsconfig.json --noEmit`                                        | Type confusion, null handling at bridges                               | yes                                                 | Wired: `strict: true`, run in CI and `npm run build`.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ESLint recommended + typescript-eslint | `npm run lint`                                                             | Bug patterns, unsafe `any`, hooks misuse                               | yes                                                 | Wired in CI. No security rules.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| eslint-plugin-security                 | add to `eslint.config.js`, then `npm run lint`                             | `eval`, unsafe regex, non-literal `fs` paths, object injection (noisy) | yes                                                 | Wired 4.2.1 (Apache-2.0) in `npm run lint`, on shipped `src` code (tests excluded). First run on 2026-11-07: 202 findings. `detect-object-injection` (185) and `detect-possible-timing-attacks` (1) are off as noise; `detect-unsafe-regex` (10) and `detect-non-literal-regexp` (3) are errors. One finding was real (a quadratic trailing-newline regex, 8 s for 60,000 newlines, fixed in `src/lib/trimTrailingNewlines.ts`); the rest carry a `reviewed:` disable comment. |
| cargo clippy                           | `cargo clippy --all-targets -- -D warnings` (in `src-tauri`)               | Rust correctness and common unsafe patterns                            | yes                                                 | Wired in CI (backend job).                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| npm audit                              | `npm audit --omit=dev`                                                     | Known-vulnerable npm dependencies                                      | no (needs registry)                                 | Works; not a CI gate. Verified 2026-11-07: reports 8 vulnerabilities (2 critical, 5 high, 1 low). Triage seeded; do not gate until triaged.                                                                                                                                                                                                                                                                                                                                    |
| cargo audit / cargo deny               | `cargo audit`; `cargo deny check` (in `src-tauri`)                         | Known-vulnerable Rust crates (RustSec), licenses, bans                 | advisory DB must be fetched                         | `cargo audit` wired as the `cargo-audit` job in `.github/workflows/audit.yml` (pinned 0.22.2 binary, checksum verified; not a required check, weekly schedule). Run 2026-11-07: 558 crates, 0 vulnerabilities, 13 warnings (unmaintained: proc-macro-error, unic-*, zbus_names, zvariant; unsound: glib 0.18.5, tokio 1.53.1; yanked: async-executor, clipboard-win), all transitive through tauri; warnings do not fail the job. `cargo deny` not wired.                      |
| osv-scanner                            | `osv-scanner --lockfile package-lock.json --lockfile src-tauri/Cargo.lock` | Same classes across npm and Cargo in one tool                          | no (queries OSV)                                    | Not installed here and not verified. Optional alternative to the two above.                                                                                                                                                                                                                                                                                                                                                                                                    |
| gitleaks                               | `gitleaks git --staged --redact`; `gitleaks dir .`                         | Secrets in history or staged changes                                   | yes                                                 | Wired 8.30.1: optional step in `hooks/pre-commit` (reported skip when absent) and the `gitleaks` job in `.github/workflows/gitleaks.yml`. Config and allowlists: `.gitleaks.toml`. Verified 2026-11-07: staged planted key exits 1, clean staged exits 0, tree and full history exit 0 after triage.                                                                                                                                                                           |
| semgrep (OSS)                          | `semgrep scan --config p/typescript --config p/rust --error`               | Pattern-based injection, XSS sinks, unsafe APIs                        | rules offline if vendored; default fetches registry | Wired 1.184.0 as the `semgrep` workflow (`p/typescript`, `p/rust`, warnings and errors fail, INFO ignored; not a required check). First run: 74 findings, 69 of them the `temp-dir` rule inside Rust tests; one reviewed `dangerouslySetInnerHTML` (DOMPurify output) carries a `nosemgrep` comment; 0 open.                                                                                                                                                                   |
| CodeQL                                 | GitHub `github/codeql-action` (JS/TS)                                      | Dataflow vulnerabilities                                               | hosted only                                         | Wired as the `codeql` workflow for `javascript-typescript` and `actions` (hosted only, not a required check; findings appear under Security, Code scanning). Rust and Java/Kotlin are not scanned.                                                                                                                                                                                                                                                                             |
| Android lint                           | `./gradlew lint` (in `android`)                                            | Manifest, exported-component and permission issues                     | yes (needs SDK)                                     | Not wired in CI; not run this session. Seeded.                                                                                                                                                                                                                                                                                                                                                                                                                                 |

**Design rules for the stack.**

- Keep an offline-capable local gate (type check, lint, clippy, and whichever of gitleaks/semgrep are installed) separate from hosted-only checks (CodeQL, advisory lookups). A hosted check that cannot run locally is never a reason to skip a local one.
- Introduce a tool as non-blocking first. Make it blocking only after its existing findings are triaged, otherwise the first run turns main red and gets disabled.
- Do not claim a tool is wired until its command ran and its output was read in the session that added it.
- A missing tool on a runner follows `skills/verification-suite.md`'s bounded fallback: record it as unavailable, do not substitute guessed output.

## 3. Practices adopted from commercial agent-guardrail products

Reimplemented here in our own words from public descriptions of a commercial agent-guardrail product (its marketing claims are unverified, so only the ideas are used). Enforcement lives in the Git hooks work (`hooks/README.md` holds the rule-to-check map); extend that instead of building a parallel mechanism.

1. **Defect claims are hypotheses until reproduced.** A reviewer, scanner, or model saying "this is vulnerable" is a lead. It becomes a finding only when a failing test, command, or exploit shows it. This is also how the audit rules in section 1 work.
2. **Dependency-intake check.** Before adding any dependency (npm, Cargo, Gradle), record in a commit message a `Dependency-intake:` line: it exists and is the intended package (watch for look-alike or model-invented names), its age and maintenance, real source repository, license, and whether it runs install scripts (`postinstall`, `build.rs`). Prefer not adding it. Run the audit tool for that ecosystem afterwards. Enforced for `package.json` and `src-tauri/Cargo.toml` by `check-rules.mjs deps` (pre-push and CI). Gradle is not covered yet.
3. **Secret-in-commit block.** `hooks/pre-commit` runs a built-in scan of staged added lines (private keys, cloud and GitHub tokens, hard-coded credentials) and, when installed, `gitleaks` on staged changes; a missing gitleaks is reported, not skipped silently. CI runs the built-in scan over pushed lines and the `gitleaks` job (`.github/workflows/gitleaks.yml`, pinned 8.30.1 release binary with a verified SHA-256) over the working tree and the commits of each pull request or push, and weekly over the whole history. Run 2026-11-07: the tree had 15 findings, history 3 more, all false positives (agent lease tokens in `ROADMAP.md` and handoffs, a fake token in a test fixture, a key chord in `src/app/shortcuts.ts`, `YOUR_TOKEN` placeholders in docs). Each has a narrow, reasoned allowlist in `.gitleaks.toml`; no rule is disabled. A planted AWS-shaped key exits 1 on the staged path the hook uses.
4. **Destructive-command guard.** `scripts/guard-command.mjs` blocks `git reset --hard`, `git clean`, forced push, `--no-verify`, `core.hooksPath` changes and recursive deletes outside the worktree, naming the safe alternative. It is opt-in in an agent runner's pre-tool hook because a git hook cannot see shell commands. `hooks/pre-push` refuses force pushes and deleting main; CI fails a non-fast-forward push to main.
5. **Gate false-positive tracking.** When a gate or finding is overruled as a false positive, record the rule, the file, and the reason in the handoff. A rule with repeated false positives is tuned or scoped by a roadmap item. It is not silently disabled and not ignored.

Hooks run on the author's machine and can be bypassed, so each of items 2 to 4 also has a CI check where one is possible (the guard in item 4 cannot be checked afterwards).

## Before completing a change in these areas

- Tier 1 ran, or the checklist fallback was used and the handoff says so.
- Each available tool in section 2 that applies to the changed surface was run, with exit code and finding counts recorded.
- Any confirmed high or critical finding is fixed or the work is not landed.
- Any `needs_validation` or deferred finding is a roadmap seed with a validation plan.
