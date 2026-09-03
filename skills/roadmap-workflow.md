# Skill: claiming and landing a ROADMAP.md item

Tool-agnostic runbook for taking one item from `ROADMAP.md` to shipped on
`main`. Read `CONSTITUTION.md`'s "Parallel agent coordination and
integration" section first for the policy this codifies; this file is the
mechanical checklist, not a separate source of rules. Works the same
whether you are Claude Code, Codex, opencode, or any other agent, run
interactively or on a schedule.

## 1. Pick eligible work

1. `git fetch origin main` and read the current `ROADMAP.md` on `origin/main`, top to bottom: Open Bugs first, then Open Features, each already ordered most-to-least critical.
2. Skip any `🚧` item unless it has sat with zero branch or `main` activity for at least 24 hours (see "Reclaiming an abandoned claim" below).
3. Skip any item whose expected file/subsystem touch set materially overlaps another currently-`🚧` item, even if the roadmap text doesn't say so explicitly. When in doubt, grep the other claim's branch diff (if pushed) before assuming no overlap.
4. Skip anything in `CONSTITUTION.md`'s "High-risk feature categories" (sync, telemetry/new network calls, encryption, accounts, third-party code execution) unless the maintainer's sign-off for that specific feature is already recorded in the Decisions Log.
5. If a large spec (a `spec/*.md` "SDD") is too big to land honestly in one session, narrow it to its own first rollout phase (see `skills/phase-splitting-large-specs.md`) rather than either attempting the whole thing or skipping it.

## 2. Claim it

1. Write a claim entry in place of (or replacing) the unclaimed bullet: `claim: <tool>-<mode>-<UTC timestamp>, branch: agent/<work-item-slug>`, e.g. `claim: Claude-Code-cloud-20260902T1045Z, branch: agent/f04-phase1-heading-links`. The identifier must distinguish this session from any other simultaneous one.
2. Change the item's status icon from `⬜` to `🚧`. Commit only this change (no implementation yet) directly to `main`, with a short commit message naming the item.
3. Push. If the push is rejected because `main` moved, `git fetch` and re-read the ledger: retry only if the item is still unclaimed and unblocked; never build on a claim that lost the race.
4. If you're narrowing a large item into a phase, split the roadmap bullet into two in this same commit: the phase you're claiming (now `🚧`), and a new, still-`⬜` bullet describing the remaining phase(s) so the scope is never lost.

## 3. Implement

1. Create `agent/<work-item-slug>` from the claim commit (or from current `main` if it has moved since).
2. Read whatever the item actually depends on before writing code: the relevant `spec/*.md`, `documentation/ARCHITECTURE.md` for the module boundaries you're about to touch, and any sibling module whose conventions you should be matching (see `skills/writing-scanner-modules.md` for one recurring pattern in this codebase).
3. One branch owns one roadmap item. Do not bundle a second, unrelated fix into it (a small in-passing fix is the one exception, see step 5 below).
4. Write real tests for non-trivial logic as you go, not after (see `skills/verification-suite.md`).
5. If you notice a bug outside this item's scope: fix it in the same commit only if it's small and doesn't expand the touch set or overlap another claim; otherwise leave it alone and add a new unclaimed bullet for it under the appropriate Open list, in priority order, and say in your own item's commit message that you found and logged it rather than fixed it.

## 4. Verify

Run the full suite described in `skills/verification-suite.md` before every push. Before committing, check every changed file for stray null bytes: `for f in $(git diff --name-only); do grep -cP '\x00' "$f"; done` should print all zeros (a real incident this repo has hit before). A change is not finished because it looks right; it's finished when the actual commands you ran say so.

## 5. Update the roadmap and changelog in the same commit

1. Move the bullet from wherever it was (Open Bugs/Open Features, or nested inside another item's status writeup) into `## Implemented`, changing `🚧` to `✅`. An item never sits checked-off under Open, even briefly.
2. Write the Implemented entry to match the house style already in the file: what was actually built, the exact classes/functions/files touched, what was explicitly deferred (name the follow-up bullet if you split one off), exact test counts before/after, and an honest list of what verification did *not* cover (no on-device test in a cloud sandbox, no physical Android device, etc.). Read two or three neighboring entries before writing yours; the level of technical detail expected is real, not a one-line summary.
3. If the change is user-facing, add a `CHANGELOG.md` entry under `## Unreleased` in the plain, non-technical voice the existing entries use.
4. Fix any stale cross-reference in a neighboring entry that pointed at your item as "still open" or "see below" and now needs to say "see above, landed."

## 6. Land it

1. Push the branch, confirm its own CI run (`ci.yml` triggers on any push, not only pull requests) is fully green: frontend typecheck/lint/tests/build, and Rust/Android checks if you touched that surface.
2. Push directly to `main` (a fast-forward, or an explicit `git merge`/`git push`, never GitHub's PR merge button; no pull request needs to exist at all for ordinary work). If `main` moved while you were implementing, merge it into your branch first (see `skills/merge-conflict-resolution.md`), re-verify, then push.
3. Confirm CI is green on `main` itself for the commit you just pushed, not only on the feature branch, since a merge can introduce a real conflict-resolution mistake the branch's own CI never saw.
4. Delete the merged remote branch once you've confirmed both the implementation and the `✅` roadmap state are actually present on `main`.

## 7. Keep going

Landing one item ends one iteration, not the session. Fetch `main` again, re-read the ledger, and claim the next eligible item. Stop only when genuinely out of session budget or out of eligible work, never because one item "felt like enough."

## Reclaiming an abandoned claim

A `🚧` item may be reclaimed only after at least 24 hours with no commit on its branch and no related push to `main`. Before reclaiming, verify that's actually true (check the branch's own commit timestamps, not just the roadmap entry's claim time) and record in your own claim why you judged it abandoned. Never silently steal active work.

**Check the author, not just the timestamp, before ever reassigning a claim — including one the maintainer explicitly told you to reassign.** A claim's branch commits can be authored by another automated session (safe to reassign per the rule above once genuinely stale) or by the actual maintainer working live (`git log <branch> --format='%an %ae %ad'`; a real name/email matching the repository owner, with a commit timestamp minutes old, is a strong signal). An explicit instruction like "reset that others already work on it" is reasonably read as authorizing reassignment of stale *automated* claims, not overriding the maintainer's own concurrent, real-time editing — those are different situations even though both currently show as `🚧`. If the most recent commit on a named-for-reassignment branch is minutes old and human-authored, do not touch that branch or its roadmap entry; leave it alone, record why in your own session's notes, and let a future check (or the maintainer directly) resolve it. Getting this distinction wrong in the unsafe direction — treating live human work as a stale bot claim — risks a real, hard-to-undo collision; getting it wrong in the safe direction just means one more roadmap item sits unclaimed for one more session.
