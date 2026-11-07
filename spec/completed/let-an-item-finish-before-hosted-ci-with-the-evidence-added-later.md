# Let an item finish before hosted CI, with the evidence added later

## Item

rm-64461514194ebb85. A finish note may say `hosted CI pending`; the run ids follow in the item's handoff file.

## Acceptance

- `scripts/check_ledger_evidence.py` accepts a finish note containing `hosted CI pending` (also `is pending`, `was pending`).
- The weekly audit (`--since`) fails a pending-only item older than 24 hours when no handoff file of that item names a run id; younger items and items with a run id in the handoff pass.
- A handoff of another item does not count.
- Constitution, `skills/verification-suite.md`, `skills/autonomous-roadmap-delivery.md` and DECISIONS.md agree.

## Context

Finishing needed hosted run ids, so a claim was held for 20 to 40 minutes only to wait for a queue (this session waited about two hours for one push), and an item blocked for CI could not be reclaimed until its retry time. The local gate is the real evidence; hosted CI re-confirms it. The audit runs with `--root`, so it can read `.agents/handoffs/`.

## Plan

1. `scripts/check_ledger_evidence.py`: `PENDING` pattern, `problems_for(items, root, now)`, 24 hour grace from `completed_at`. Tests in `scripts/test_check_ledger_evidence.py` (class `PendingEvidence`).
2. Constitution truthful-states paragraph and the post-push paragraph, the two verification-suite spots, the autonomous delivery finish step and CI wait paragraph, DECISIONS.md.

## Out of scope

Changing workflows. Treating pending as green. Changing items finished earlier.

## Rulings

- Pending is never green -> the note says pending and a red pending run is a main regression with priority over new work | honest state | Cost if wrong: none.
- 24 hours -> long enough for any queue, short enough to catch forgotten items | Cost: a false audit failure is fixed by appending ids.
- The landed SHA and missing checks go into the handoff file, so the successor knows what to read | Cost: one more line per item.
- This item's own finish uses run ids or pending-free evidence, because the rule is not on main until it lands.

## Design system

No UI surface.

## Evidence

| Claim                                                                                                                                                    | Evidence                                                                                                                                                                      | Result            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Pending note accepted; old pending without run ids fails the audit; young, handoff with run id, run id in note pass; other item's handoff does not count | `PendingEvidence` tests in `scripts/test_check_ledger_evidence.py`; 6 fail against the original script (1 failure, 5 errors), 118 OK with the change, tested SHA 7461d98      | observed          |
| Docs agree                                                                                                                                               | constitution truthful-states and post-push paragraphs, verification-suite table row and finish-note paragraph, autonomous delivery step 6 and CI wait paragraph, DECISIONS.md | in 7461d98        |
| Gate                                                                                                                                                     | lint, tsc, unittest, `check-rules.mjs trailers` and `deps` green, pre-push gate green                                                                                         | landed as 7461d98 |
| Hosted runs of 7461d98                                                                                                                                   | hosted CI pending; run ids in `.agents/handoffs/rm-64461514194ebb85.md`                                                                                                       | pending           |
| Review                                                                                                                                                   | self-review, no second model                                                                                                                                                  | closed            |
| Legal/text check                                                                                                                                         | Legal/text check: 6 verified, 0 fixed, 0 open                                                                                                                                 | recorded          |
