<!--
Variables: ROADMAP_FILE = ../ROADMAP.md; HELPER = scripts/agent_ledger.py;
LINTER = scripts/check_roadmap_format.py; SUMMARY_BUDGET = 500 characters
-->

# Write a roadmap entry

This is the prose format for every `ROADMAP.md` bullet: what goes on the always-visible summary line, what goes behind a `<details>` toggle, and how multi-session status is laid out. It does not replace `roadmap-workflow.md`'s claim/publish/finish procedure or the helper's ledger metadata contract in `CONSTITUTION.md` -- it covers the human-authored prose those procedures wrap around.

## Why this exists

`ROADMAP.md` grew hundreds of entries with two different shapes side by side: some pack every detail -- root cause, repro, alternatives considered, full verification log -- into one unbroken paragraph a reader must scroll past to reach the next item; a few wrap that same depth of detail in a collapsed `<details>` toggle instead, so the list stays scannable and a reader opens only the entries they actually need. The second shape is the standard. This file makes it exact and mechanical enough to check.

`scripts/check_roadmap_format.py` enforces it in CI (via the `Agent policy` workflow) for **new entries only** -- an item whose ledger `id`, or whose exact title when it has no metadata yet, does not already exist on the branch's merge-base. Existing entries are not retroactively reformatted by this rule; fixing one up while you're already touching it is welcome but never required by the linter.

## The shape

```
- <icon> **Title**: One or two sentences that fully make sense on their own -- what
  the problem or feature is, and (for a bug) the concrete, reproducible failure.

  <details>
  <summary>Why / evidence / verification</summary>

  Everything else: root cause, the exact repro, alternatives considered and why they
  lost, what was touched, and the verification actually run.

  </details>
```

1. **Summary (required, always visible).** The bullet's own line: the icon, `**Title**: `, then a short summary in plain sentences a reader can act on without expanding anything -- what it is, and for a bug, the actual observed failure. Budget: **`SUMMARY_BUDGET`**, counted on everything in the item outside a `<details>` block (title included). Two to three sentences, not one giant clause chain. Keep it as the bullet's own source line, the same convention every existing entry already uses, rather than a separate paragraph -- `scripts/agent_ledger.py claim`/`finish` relocate an item's body below the metadata it writes, and a summary living on the title line itself is what keeps it attached and immediately visible regardless of that.
2. **`<details>` drill-down (required once the summary budget is not enough).** Everything past that budget -- root cause analysis, exact reproduction steps, alternatives considered, scope notes, disclosed gaps, the verification narrative -- goes inside one `<details>` block within the item, below the title line. Give `<summary>` a real label (`Why`, `Root cause and fix`, `Verification`, not a bare "Details") when more than one drill-down exists on the same item; a single drill-down can just say `Details`. A short entry that already fits the budget needs no `<details>` at all -- don't wrap two sentences in a toggle for its own sake.
3. **Status layers (multi-session items only).** An item that spans multiple sessions (a large feature, a flaky bug worked in layers) uses one nested bullet per layer/phase, each starting with a short **bold label** and a one-line status, e.g. `- **Layer 2, batched reads: done, verified on-device.** ...`. Keep each layer bullet's own visible line within the same budget; push a layer's own long evidence into a nested `<details>` under that bullet rather than lengthening the bullet itself. This is the one place a reader scans multiple lines by design -- that is the point of a status ledger for work still in flight -- so don't collapse the whole set into one outer toggle.
4. **Ledger metadata (tool-owned, never hand-authored).** The `<!-- agent-state: {...} -->` line and the `Agent: ... | item: ...` label that `scripts/agent_ledger.py` writes are not part of this format and must never be hand-edited or reformatted -- see `CONSTITUTION.md`'s Coordination invariants. The helper places and repositions them itself (immediately under the title line, moving the rest of the item's body -- including any `<details>` block -- below them once it writes metadata); do not fight its layout, and do not count these two lines against the summary budget.

## Section order

`## Open` always precedes `## Implemented`. Open work -- what still needs doing -- is what a reader and a new agent session need first; a growing history of shipped work belongs after it, not before it. `scripts/agent_ledger.py finish` only requires that exactly one `## Implemented` heading exist somewhere in the file; it does not depend on section order, so this is a pure readability rule, also enforced by the linter.

## Good vs. not

Not this (the whole thing is one paragraph a reader must fully read to know whether it's relevant):

> `- ✅ **Fix search crash**: The search indexer read every file into memory at once before filtering, so a workspace with more than a few hundred notes would run the process out of memory and crash with no error shown to the user; reproduced on a 500-note test vault with `X: OutOfMemory` in the log; root cause is `buildIndex` in `search/indexer.ts` calling `readAllFiles` instead of the existing streaming `readFilesBatched` helper already used by the file tree; fixed by switching `buildIndex` to `readFilesBatched` with the same 8MB batch cap `fileTreeStore.ts` already uses; considered raising the heap limit instead but rejected because it only delays the crash on a larger vault, not a real fix; added a regression test with a synthetic 500-file fixture, revert-confirmed to fail before the fix; full verification green: tsc, eslint, 2100/2100 vitest, vite build, cargo fmt/clippy/test/check.`

This (a reader sees the failure and fix in one glance; everything else is one click away):

> `- ✅ **Fix search crash on large workspaces**: The search indexer read every file into memory at once before filtering, so a workspace of more than a few hundred notes ran the process out of memory and crashed with no error shown to the user.`
>
> `  <details>`
> `  <summary>Root cause, fix, and verification</summary>`
>
> `  Reproduced on a 500-note test vault (`OutOfMemory` in the log). Root cause: `buildIndex` in `search/indexer.ts` called `readAllFiles` instead of the existing streaming `readFilesBatched` helper the file tree already uses. Fixed by switching to `readFilesBatched` with the same 8MB batch cap. Considered raising the heap limit instead; rejected -- it only delays the crash on a larger vault, not a real fix. Regression test added with a synthetic 500-file fixture, revert-confirmed to fail before the fix. Full verification green: tsc, eslint, 2100/2100 vitest, vite build, cargo fmt/clippy/test/check.`
>
> `  </details>`

## Checking it yourself before you push

```sh
python3 scripts/check_roadmap_format.py --root "$REPO_ROOT" --base "$REMOTE/$MAIN_BRANCH"
```

Run it from your control worktree against the fresh main you just fetched, same as the ledger `list`/`check` calls in `roadmap-workflow.md`. It only evaluates items that are new relative to `--base` (by ledger `id`, or by exact title for an unclaimed item that has none yet); every pre-existing entry is left alone regardless of its own length or shape.
