---
name: pdlc-playbook
description: Spec-first delivery flow for every roadmap item.
version: 1.0.0
author: Leonard Schwier
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [pdlc, spec, review, testing, leotheca]
    related_skills:
      [
        roadmap-workflow,
        verification-suite,
        pre-push-verification,
        phase-splitting-large-specs,
      ]
---

<!--
Variables: read CONSTITUTION.md. SPEC_DIR = spec; DONE_DIR = spec/completed;
SPEC_FILE = spec/<slug>.md (slug = kebab-case roadmap title);
DESIGN_SYSTEM = Leoforma, github.com/LeonardSchwier/leoforma (package @leonardschwier/leoforma, pinned in package.json; a missing token or component is added there and the pin bumped; src/ui keeps only Sheet, EmptyState, StatusIndicator and icons);
E2E_GATE = roadmap item "Playwright end-to-end suite in the CI pipeline" (owns the suite; do not duplicate it here);
SECURITY_GATE = skills/security-and-static-analysis.md (owned elsewhere; link only);
MASTER_SPEC = skills/master-spec-maintenance.md (stage 5 and 6: an implementation push updates master-spec.md);
FIX_LOOP_CAP = 3 review/fix rounds; DEBUG_STRIKES = 3
-->

# Spec-first delivery for one roadmap item

Every implementation item runs these eight stages after its claim. The claim, lease and push mechanics stay in `roadmap-workflow.md`; check commands stay in `verification-suite.md`. This file only adds the stages and their gates. No stage waits for a human: where a person would approve, an LLM judge records a ruling and moves on.

Exempt: claim/renew/finish/handoff transactions, roadmap seed edits, and pure-typo docs fixes. A small item gets a small spec (see "Sizing"), never none.

## Small-model rule

The author runs a ~27B local model (see the constitution's author environment), so every stage must work without huge context or frontier-only features. Keep each task to about 5 files and one test file; split larger work per `phase-splitting-large-specs.md`. Treat the spec file and handoff file as memory: write to disk, re-read one stage at a time, never rely on the chat. Load only the files a stage names. Subagents and parallelism are optional speedups; the same stage done as a separate, fresh pass by the same agent is equivalent.

## The eight stages

| #   | Stage               | Output                          | Gate to leave                                                    |
| --- | ------------------- | ------------------------------- | ---------------------------------------------------------------- |
| 1   | Roadmap item        | claimed `⬜`->`🚧` item         | claim confirmed per `roadmap-workflow.md`                        |
| 2   | Spec                | `SPEC_FILE`                     | sections below filled, no `TBD`                                  |
| 3   | Grill               | rulings in the spec             | every question answered or marked n/a with a reason              |
| 4   | Design-system check | spec section                    | reuse/add/change recorded, or "no UI surface"                    |
| 5   | Implement           | code + tests on the work branch | test seen failing first, then passing                            |
| 6   | Verify              | evidence in the spec            | unit, review, e2e smoke, security all green or honestly deferred |
| 7   | Archive             | `DONE_DIR/<slug>.md`            | evidence table complete, finish transaction pushed               |
| 8   | Reflect             | `Reflection:` line in the spec  | finding and action recorded, or `none` with a reason             |

HARD GATE: do not edit implementation files before stages 2-4 are written into `SPEC_FILE` on your work branch. Do not run `finish` before stage 6 evidence exists.

### 2. Spec

Create `SPEC_FILE` with these headings, one to five lines each:

1. **Item**: roadmap id, exact title, one-sentence outcome.
2. **Acceptance**: observable pass/fail criteria (becomes the tests).
3. **Context**: files read, callers, data flow, platform boundaries, crash-freedom answers that apply.
4. **Plan**: tiny tasks, each with exact paths and the test that proves it.
5. **Out of scope**: what you deliberately do not do.
6. **Rulings**, **Glossary**, **Design system**, **Evidence**: filled by stages 3, 4, 6.
7. A closing line `Glossary: <terms added or sharpened in GLOSSARY.md | none>`, filled by stage 3.

### 3. Grill (the LLM judge decides)

Interrogate the spec before building. Ask only questions whose answer would change the build; answer each yourself from the code, tests, product rules and constitution. A fresh pass or subagent does the asking when available; otherwise run it as a separate step with this checklist:

- What input, state or order of events makes this break (empty, huge, malformed, concurrent, offline, platform no-op)?
- What does the spec not say that two implementers would do differently?
- Is this already implemented, duplicated, or against `PHILOSOPHY.md` / product rules?
- Which existing helper, store or bridge must be reused instead of a parallel one?
- What is the smallest slice that is still a real feature?
- What would we regret in a month, and how expensive is undoing it?

Record each ruling in the spec as `Q -> Decision | Why | Cost if wrong`. Read `GLOSSARY.md` first and use its words. If the spec introduces or sharpens a domain or process term, add one verifiable line for it to `GLOSSARY.md` in the same branch and name the term in the spec's `Glossary:` line; otherwise write `Glossary: none`. `scripts/check-rules.mjs glossary` rejects an archived spec without that line. The judge has the final call, including "do not implement" or "implement a smaller slice": then update the roadmap through the helper (split, block or release with the ruling). Rulings, not stalls: never wait for a person. Stop and block only for something irreversible, security-sensitive beyond granted permissions, outside your worktree, or a plan that cannot work.

### 4. Design-system check

For any user-visible change, add a **Design system** section: for each element say **Reuse** (existing token/component, name it), **Add** (new token/component, why none fits) or **Change** (existing one, list the callers affected). Check `DESIGN_SYSTEM` first; add or change shared pieces there rather than as one-off CSS. No UI: write "no UI surface".

### 5. Implement

Smallest task first, per the Plan. Write the test, watch it fail for the right reason, then write the code. For a bug, the failing test is the regression test. Self-review the diff after each task.

### 6. Verify, in this order

1. **Unit and checks**: the applicable rows of `verification-suite.md`, run now on this tree.
2. **Independent review, two axes**: run the Standards pass and the Spec pass of `verification-suite.md` ("Baseline, behavior tests, and review") as two separate fresh agents or fresh contexts, each with a crafted brief and no session history. Standards gets the diff and the repo rules; Spec gets the acceptance criteria and the diff. Add a "Review Focus" list of the inputs most likely to break. Each returns findings as Critical, Important, Minor. Fix Critical and Important and re-review the failing pass. After `FIX_LOOP_CAP` rounds with findings still open, record a ruling and either shrink the scope or block with the evidence. Without a separate agent, do both passes yourself in turn from the two briefs alone.
3. **End-to-end smoke**: the Playwright suite owned by `E2E_GATE` (`tests/e2e`, required CI job `e2e`). If it cannot run in your environment, record the gap as missing evidence per `verification-suite.md`.
4. **Security**: `SECURITY_GATE`. If the file does not exist yet, record that and apply `change-quality-gates.md`.
5. **Legal and text rights**: `skills/text-rights-and-legal-check.md`, on **every** change (record `N/A` with the file list when nothing user-visible, asset or dependency changed). The agent fixes any risk itself (rewrite, replace, remove, narrow) and re-runs; the only landable result is `0 open`. Schema work also follows `skills/database-best-practices.md`. The result goes into a commit trailer that `scripts/check-rules.mjs trailers` requires on pre-push and in the Rules workflow: `Legal-Check: N verified, M fixed, 0 open (what you checked)` when text, assets or docs were added or changed (deleted files and dependency manifests need none; the `Dependency-intake:` line covers dependencies), `Database-Review: <keys, normal form, migration safety>` for schema files, and `Review: standards <reviewer model or tool>: <result>; spec <reviewer model or tool>: <result>` (or `Review: self-review: <why no second model>; standards <result>, spec <result>`) for trust-boundary, workflow, hook or constitution files.
6. **Master specification**: if the change alters behavior, a format, a bridge command, a setting or the build, update `master-spec.md` in the same push per `MASTER_SPEC`; CI job `master-spec` (`scripts/check_master_spec.py`) fails the push otherwise.

A failing check is a code failure until its log says otherwise. Debugging: no fix without a stated root cause. After `DEBUG_STRIKES` failed fixes for one failure, stop patching: re-read the code path, question the design and record a ruling.

### 7. Archive

In the finish transaction, fill **Evidence** (table below), then `git mv SPEC_FILE DONE_DIR/<slug>.md` in the same commit as the helper's `finish` and the handoff update. A spec that is not completed stays in `SPEC_DIR`.

| Claim                     | Evidence (command or trace)            | Result                        |
| ------------------------- | -------------------------------------- | ----------------------------- |
| each acceptance criterion | exact test name or command, tested SHA | observed output               |
| review: standards         | reviewer, rounds, findings fixed       | closed                        |
| review: spec              | per criterion: diff location, test     | met, partly or missing        |
| e2e smoke / security      | job or command                         | pass, or deferred with reason |

### 8. Reflect

Before the spec is archived, add one line at its end:

`Reflection: <what this item showed about a rule, skill, hook, check or tool> -> <applied | seeded | none: reason>`

`applied` means you changed the process in this item; `seeded` means you added a roadmap item for it; `none` needs a reason. The line must be at least a sentence: `scripts/check-rules.mjs reflection` rejects an empty or one-word line when the spec is archived. You may change the constitution, `AGENTS.md`, skills, hooks and checks to fix what you found (constitution, "Self-improvement").
| legal/text check | `Legal/text check: N verified, M fixed, 0 open` | recorded in the spec |

Banned before evidence exists: "should work", "probably fine", "done". Distrust a success report you did not see: check the diff and rerun the command.

## Sizing

| Item                   | Spec                                   | Grill                                    |
| ---------------------- | -------------------------------------- | ---------------------------------------- |
| One-file bug fix       | Item, Acceptance, regression test name | three checklist questions                |
| Feature slice          | all headings                           | full checklist                           |
| Large or cross-cutting | spec per phase                         | full checklist, plus ruling on the split |

## Rationalizations

| Thought                             | Reality                                                                     |
| ----------------------------------- | --------------------------------------------------------------------------- |
| "Too small for a spec"              | Write the three-line spec. Small items are where untested assumptions hide. |
| "I'll write the test after"         | Then you never saw it fail; it proves nothing.                              |
| "I know the answer, skip the grill" | The grill exists for what you assumed. Answer in writing.                   |
| "The reviewer can read my session"  | Session history carries your blind spots. Give the brief only.              |
| "One more quick fix" (third time)   | Stop. Root cause, or question the design.                                   |
| "e2e is someone else's job"         | You own whether your change passes the gate that exists.                    |

## Considered and not adopted

The flow borrows hard gates, the rationalization table, claim-to-evidence verification, rulings-not-stalls, the fix-loop cap, the three-strike debugging rule and the crafted-context reviewer from the public `obra/superpowers` skill set (MIT). Rejected parts, with reasons:

| Not adopted                                                  | Why                                                                                                                     |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Human approval of design and plan                            | Conflicts with the standing authorization to push without review. An LLM judge records a ruling instead.                |
| One question at a time to the user                           | No user is present; questions go through the grill and are answered from the repo.                                      |
| Mandatory subagent-per-task and model tiers                  | Needs frontier orchestration. Fresh passes by one small model are enough.                                               |
| Separate plan document, 2-5 minute tasks                     | The spec's Plan section is enough, and tasks about the size of one test file suit a small model.                        |
| Auto-triggered skill loading and per-session branch workflow | The claim protocol and `AGENTS.md` already fix the entry sequence and branches.                                         |
| Deleting code written before its test                        | Too destructive for an unattended agent. Write the missing test and prove it fails against the reverted change instead. |
| Progress ledger file                                         | The per-task handoff in `autonomous-roadmap-delivery.md` already serves it.                                             |

Security tooling, hooks and CI wiring belong to their own items; this skill only links them as gates.
