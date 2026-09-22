# CI Fix — Agent Policy Transient Failure

**Date:** 2026-09-22
**Agent:** hermes-local-20260922T024857Z-ec8cd6a8
**Landed SHA:** (this commit — see git log)

## Problem

Main was red: the "Agent policy" CI job failed at `83ca0cd` with:
```
error: Unknown agent-state fields: ['owner', 'token']
```

## Root Cause

`check_roadmap_format.py` validates **both** the current file and the base file via
`scan_items`. The base commit `080805a` had a hand-written done entry for
`rm-41609b27a734907d` with invalid `owner`/`token` fields (not in `DONE_FIELDS`).
The helper (`agent_ledger.py`) does not produce these fields — they were written
by hand in the previous session.

`83ca0cd` (by the same session) cleaned up the metadata to the correct state,
but CI still failed because `before=080805a` (invalid base).

## Fix

This is a **one-time transient failure** — the first commit that fixes an invalid
base always carries the invalid base itself. A no-op content commit cannot trigger
CI (empty commits don't fire push events), so this file was added to produce a
real push event.

After this push:
- CI runs with `before=83ca0cd` (valid, no owner/token in done entries)
- `scan_items` on both current and base → exit 0
- "Agent policy" job → green

## Verification (this exact tree)

- `python3 scripts/agent_ledger.py --root . list` → exit 0
- `python3 scripts/check_roadmap_format.py --root . --base 83ca0cd` → exit 0
- `python3 -m unittest discover -s scripts -p 'test_*.py'` → 29 tests OK
- `git diff origin/main --name-only` → only this handoff file

## No product code changed.
