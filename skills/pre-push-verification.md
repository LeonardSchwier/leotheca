---
name: pre-push-verification
description: Verify the pre-push gate before pushing.
version: 1.0.0
author: Leonard Schwier
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [verification, pre-push, ci, gating, leotheca]
    related_skills:
      [
        verification-suite,
        ci-failure-triage,
        merge-conflict-resolution,
        change-quality-gates,
      ]
---

<!-- Variables: read CONSTITUTION.md's remote, main_branch. TOOL = scripts/agent_ledger.py -->

# Pre-push verification gate

A concrete, mechanical checklist, not a restatement of general care. Read it before every push to the configured main branch. It applies even to a change that looks obviously correct — that feeling is exactly the failure mode this gate exists to catch, evidenced below.

## Enforcement

`hooks/pre-push` runs the fast subset (rule checks, `tsc`, `eslint`, vitest, ledger validation) and `.github/workflows/rules.yml` re-checks what a hook cannot be trusted with. Bypassing either is forbidden for agents. Both are the floor: this gate still requires the full applicable checks below. Map and bypass policy: `hooks/README.md`.

## The gate

1. Identify every command `skills/verification-suite.md`'s applicable-checks table requires for your changed surface.
2. Run every one of them, in this session, against the exact working tree you are about to push. Not "the same class of check I ran earlier." Not "I'm confident this passes." Run it now, on this tree.
3. Read the actual output. A command that exits 0 with no new failures is evidence. A command you did not run is not evidence, no matter how small or obviously-correct the change looks.
4. If anything fails, fix the real cause and return to step 2. Never push while a check you could run locally is still red.
5. Only once every applicable check is genuinely green in this session, push.

## Never do these, whatever the time pressure

- Never write "already handles this correctly," "already works," or an equivalent claim in a commit message unless you executed that exact case in this session and watched it pass. If you haven't run it, don't claim it: run it first, or say plainly that it is unverified.
- Never push a second speculative fix for a CI failure without first reading the actual failing job's log and quoting the real error text. A second guess without that is a sign you are pattern-matching instead of diagnosing. Stop, fetch the log, identify the literal failure, then write the fix.
- Never treat hosted CI as your first test runner. It re-confirms what you already verified locally; it is not where you find out for the first time whether a change works. A local command finishes in seconds; a CI cycle costs everyone minutes with `main` red the whole time, and a chain of such pushes compounds that cost across every commit in the chain.
- Never hand-author `TOOL`'s ledger/`agent-state` metadata by guessing its shape. Always call the actual helper. If it errors, the error is the thing to fix — read the traceback, correct the real input — never a reason to write the JSON block by hand instead. A malformed entry breaks ledger commands for every agent, not only the task that wrote it.

## Concrete cases from this repository (do not repeat)

On 2026-09-07 a regex ported from a Java string (`"^[.\\s]+"`) into a JS regex literal kept the double backslash (`/^[.\\s]+/`), which matches a literal backslash and "s", not whitespace. A later commit re-enabled the test that would have caught it and claimed in its message that the function "already handles [this] correctly". It did not, and `main`'s CI broke. One command (`npx vitest run <the affected file>`) would have caught it in seconds: step 2 was skipped twice in a row.

The same day a direct commit hand-wrote its own `agent-state` comment with a wrong `id` and `branch` shape. Every ledger command validates every entry first, so that one entry broke `list`/`claim`/`check`/`finish` for every agent. Only the helper writes that block.
