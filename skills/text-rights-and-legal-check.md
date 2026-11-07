---
name: text-rights-and-legal-check
description: Check that every text and asset shipped is original or licensed, safe, and truthful.
version: 1.0.0
author: Leonard Schwier
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [legal, licensing, copyright, trademarks, content, leotheca]
    related_skills:
      [pdlc-playbook, security-and-static-analysis, verification-suite]
---

<!--
FIX_LOOP_CAP = the value in skills/pdlc-playbook.md
Variables: LICENSE_FILE = LICENSE; HYGIENE_TEST = src/tidyRepoHygiene.test.ts
THIRD_PARTY_NOTICES = the repository's third-party notice file, if it exists
-->

# Text rights and legal check

This is an engineering check, not legal advice, and it is a **fixing** gate: the agent that finds a risk changes the text or asset itself and re-runs the check. It never hands a finding to a person and never waits for one. It never declares anything "compliant" or "legal"; it records what was verified and what it changed.

## When it runs

**On every change, from stage 6 of `skills/pdlc-playbook.md`.** Run `git diff --name-only <main>...HEAD` and classify. A change is in scope if it touches any of: UI strings in `src/`, docs, README, website, CHANGELOG, store or package metadata (metainfo, desktop files, listings), sample or template notes, `assets/`, `public/`, fonts, icons, images, or a dependency manifest/lockfile. If nothing is in scope, record `N/A` with the diff file list as evidence. Never skip the check without that record. A push that touches these files must carry the trailer `Legal-Check: N verified, M fixed, 0 open` in a commit message; `scripts/check-rules.mjs trailers` enforces it on pre-push and in CI.

## Checks

| #   | Check                   | Pass when                                                                                                                                                                                                                                                                |
| --- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Provenance              | Every new text or asset is original, generated for this project, or licensed. Name the source for anything else.                                                                                                                                                         |
| 2   | No copied wording       | No verbatim or near-verbatim text from another product's UI, docs, marketing, changelog or store listing. Describe behavior in your own words. Competitor and product names stay out of tracked files (`HYGIENE_TEST` enforces part of this).                            |
| 3   | Trademarks              | Third-party names appear only to say what we interoperate with (nominative use), with no logos and no implied endorsement.                                                                                                                                               |
| 4   | Asset and font licenses | Each bundled font, icon, image and sample has a license file in the tree, compatible with `LICENSE_FILE`, and required attribution is in `THIRD_PARTY_NOTICES`. A license that forbids redistribution or app embedding fails.                                            |
| 5   | Dependency licenses     | A new dependency's license is read from its package metadata and is compatible. Copyleft, unknown or missing license: pick a compatible alternative or drop the dependency.                                                                                              |
| 6   | Generated text          | Model-generated copy is not a reproduction of a known source. Spot-check distinctive phrases by search where a network is allowed.                                                                                                                                       |
| 7   | People and data         | No real names, emails, addresses, tokens or private paths in samples, tests or docs.                                                                                                                                                                                     |
| 8   | Truthful claims         | Privacy, offline, no-telemetry, security and performance claims match the code. Cite the file or test that proves each, or remove the claim.                                                                                                                             |
| 9   | Safe content            | Nothing offensive, deceptive or harmful in shipped text, and every error string is safe to show (no secrets, no raw paths).                                                                                                                                              |
| 10  | Legal documents         | A license text, privacy statement or terms page cites a primary source: norm or license name, version, URL, retrieval date. With no reachable source, use the unmodified upstream license text already in the tree or remove the statement; never write one from memory. |

## Fix it yourself

A finding is never a ticket for a person. Apply the first fix that works, in this order, then re-run the failed check on the new text:

1. **Rewrite** copied or look-alike wording in your own words; neutralize a name that implies affiliation; make a claim exactly as strong as the code that proves it.
2. **Replace** an asset or dependency with an original or compatibly licensed one, and add its license file and notice entry.
3. **Remove** the text, claim, asset or dependency when it cannot be rewritten or replaced. A smaller, safe product beats a risky one.
4. **Narrow** an unprovable claim to what a test or file proves ("stores notes as plain files" instead of "never sends data anywhere"), and cite the proof.

Uncertainty is treated as a risk: when provenance, a license or a claim cannot be verified, apply fix 1 to 3, not "pass". Record each fix as a ruling in the spec (`risk -> fix | why | cost if wrong`, the playbook's format). Repeat until the check passes. After `FIX_LOOP_CAP` rounds with a finding still failing, remove the offending text or asset and record that ruling. A legal or safety risk is never shipped to buy time, and never parked for review.

## Output

Record in the spec's Evidence table:

`Legal/text check: N verified, M fixed (<one line each>), 0 open.`

`0 open` is the only landable result. A check that could not run (no network, tool missing) is not a pass: use the conservative fix (rewrite, remove, narrow) for the affected item instead, and say so.

## Limits

- Network may be absent on the local runner (a ~27B local model on a 24 GB GPU cannot do broad searches): then checks 2, 6 and 10 cannot be proven, so apply the conservative fix (own-words rewrite, remove or narrow) rather than marking them passed.
- Similarity cannot be proven by reading alone. Say what you compared and how, and rewrite when in doubt.
- Mechanical help (a license scanner, a script that lists changed user-visible strings) is welcome once it has been installed and run locally with its output read. Until then this checklist is the gate.
