# Adopt a shared glossary that the PDLC maintains by itself

## Item

rm-cd6c1e964400b173, "Adopt a shared glossary that the PDLC maintains by itself". Outcome: `GLOSSARY.md` holds the verified domain and process terms, agents read it at startup, the grill stage extends it, and a mechanical check fails an archived spec without a `Glossary:` line.

## Acceptance

- `GLOSSARY.md` exists with one verifiable line per term, each naming its source.
- `AGENTS.md` startup reads it; `skills/pdlc-playbook.md` stage 3 extends it and the spec template carries the `Glossary:` line.
- `node scripts/check-rules.mjs glossary <base> <head>` reports a spec newly archived under `spec/completed/` that has no non-empty `Glossary:` line; it is wired into `hooks/pre-push` and `.github/workflows/rules.yml`.
- `documentation/AGENTIC_PDLC.md` credits the public source (idea only).

## Context

Read `scripts/check-rules.mjs` (reflection mode, the pattern copied), `master-spec.md` section 3, section 6 and FR-WS/FR-CAP, `CONSTITUTION.md`, the roadmap and workflow skills. The check reads only the archived file at the pushed head, so it needs no new input.

## Plan

1. `GLOSSARY.md` from the code and master specification.
2. `glossaryProblems` and `checkGlossary` in `scripts/check-rules.mjs`, tests in `scripts/check-rules.test.js`.
3. Wire hook and workflow; playbook, AGENTS.md, hooks README, PDLC document.

## Out of scope

Terms the architecture survey item will add (deep module, seam); no code in the repository uses them yet, so they are not listed.

## Rulings

Seam is not in the glossary yet -> leave it to the survey item | the glossary lists only verifiable facts and the word has no use in the repository today | a one-line add later.

Glossary: workspace, grant, capture, ledger, lease, claim and the other first entries of GLOSSARY.md (the file is new)

## Evidence

| Claim                                                                 | Evidence                                                                        | Result    |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------- |
| check rejects a missing, empty or absent line and ignores other paths | `npx vitest run scripts/check-rules.test.js`, "glossary line on archived specs" | 44 passed |
| formatting                                                            | `npx prettier --check` on every changed file                                    | clean     |

Reflection: parallel items all touch the same shared files, so a claim waited about 50 minutes for three live claims to end -> none: the claim rules are right, and splitting the claim by file made no difference because each file was needed.
