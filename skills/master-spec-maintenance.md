---
name: master-spec-maintenance
description: Keep master-spec.md true when application behavior changes.
version: 1.0.0
author: Leonard Schwier
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [spec, documentation, ci, leotheca]
    related_skills: [pdlc-playbook, verification-suite, change-quality-gates]
---

<!--
Variables: SPEC = master-spec.md; CHECK = scripts/check_master_spec.py;
CHECK_TEST = scripts/test_check_master_spec.py; CI = job `master-spec` in .github/workflows/agent-policy.yml
-->

# Keeping the master specification current

`master-spec.md` describes what the application does now, in enough detail to rebuild it. A stale line is a false statement, so an implementation push that changes behavior updates it in the same push. The rule in the constitution is "Master specification rule"; this file is the procedure.

## When it applies

CHECK treats a push as an application change when it touches any path in its `APP_PATTERNS` (`src/`, `src-tauri/` sources and config, `android/app/src/`, build and version files, `public/`, `extensions/`, packaging, `.github/workflows/`). Tests, the roadmap ledger, handoffs, specs and docs are exempt. Run it yourself before pushing:

```sh
python3 scripts/check_master_spec.py --root . --base origin/main --head HEAD
```

## What to do

1. Find the requirement rows (`FR-*`, `NFR-*`) and the section (data format, bridge command, setting, shortcut) your change touches. Edit them to match the new behavior. Add rows for new behavior. Remove rows for removed behavior.
2. Name the covering test file in the row's last column, or write `NONE`. Never link a file you did not search for the behavior.
3. Add one dated line to the change log between the `change-log` markers: `- YYYY-MM-DD: what changed in behavior, contracts, formats, build or release`.
4. Regenerate the derived blocks: `python3 scripts/check_master_spec.py --root . --update-traceability`.
5. If the code and the spec disagree and you are not changing that code, record it under Known gaps or Document discrepancies instead of rewriting the spec to hide it.

A change with no observable effect (pure refactor, rename of a private helper) still needs a one-line change log entry saying so, because the check cannot judge intent.

## What the CI job checks

- The push touching an application path also touches `master-spec.md` (or `spec/master/`) and adds a new change log entry.
- Requirement ids are unique, every linked test file exists, and the traceability block matches the rows.
- CHECK_TEST runs against real temporary git repositories.

It cannot check that your prose is correct. The PDLC review stage owns that: the reviewer reads the spec diff against the code diff.
