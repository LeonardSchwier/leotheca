# Narrow when the Legal-Check and Review trailers are required

## Item

rm-acf217768abf87cb. `node scripts/check-rules.mjs trailers` stops demanding evidence lines for deleted files and dependency manifests, and its message prints the line to paste.

## Acceptance

- A push that only deletes files never needs `Legal-Check:`, `Review:` or `Database-Review:` (diff filter ACMR).
- `package.json`, `package-lock.json`, `src-tauri/Cargo.toml` and `Cargo.lock` no longer require `Legal-Check:`; the `Dependency-intake:` line and the licenses job cover them.
- Each message lists up to three matching paths and a ready line, for example `Legal-Check: 2 verified, 0 fixed, 0 open (what you checked)`.
- A CLI test in a temporary git repository: pure deletion of a text file exits 0, a README change without trailer exits 1 with `Legal-Check:` on stderr, with the trailer exits 0.

## Context

`checkTrailers` used `git diff --name-only`, so removing `website/` demanded a legal check on text that no longer exists, and every lockfile bump demanded one although dependency intake already records the license decision. The ritual line lost meaning.

## Plan

1. `scripts/check-rules.test.js` (changed manifests test, new "manifests do not require it", message content) and `scripts/trailersCli.test.js`; watch them fail.
2. `scripts/check-rules.mjs`: ACMR filter, remove two LEGAL_PATHS lines with a comment, path list and ready line in messages.
3. `hooks/README.md`, `skills/text-rights-and-legal-check.md`, `skills/pdlc-playbook.md` stage 6 step 5, DECISIONS.md.

## Out of scope

Changing the other path classes, the trailer formats or the CI job wiring.

## Rulings

- Deleted files -> no trailer | nothing remains to check | Cost if wrong: a deletion that removes a legally required notice (LICENSE) is caught in review of the diff; LICENSE edits still need the line.
- Manifests -> covered by `Dependency-intake:` plus the licenses job in `rules.yml` | those record and verify the license decision per new dependency, a version bump needs neither | Cost: a license change in an existing dependency is caught by the licenses job.
- Ready line count -> number of matching paths, capped list of three in the message | keeps the message short | Cost: none.

## Design system

No UI surface.

## Evidence

| Claim                  | Evidence                                                                                                                       | Result                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| Acceptance criteria    | vitest check-rules.test.js plus trailersCli.test.js 38 passed (4 red against the original check-rules.mjs); tested SHA d7e6002 | observed, new tests red against the original, green after |
| Gate                   | lint, tsc, unittest, vitest via pre-push, `check-rules.mjs trailers` and `deps`                                                | green, landed as d7e6002                                  |
| Hosted runs of d7e6002 | hosted CI pending; run ids in `.agents/handoffs/rm-acf217768abf87cb.md`                                                        | pending                                                   |
| Review                 | self-review, no second model                                                                                                   | closed                                                    |
| Legal/text check       | Legal/text check: 5 verified, 0 fixed, 0 open                                                                                  | recorded                                                  |
