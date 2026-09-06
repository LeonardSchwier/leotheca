<!-- Variables: read CONSTITUTION.md; REMOTE = remote; MAIN_BRANCH = main_branch; ROADMAP_FILE = roadmap_file. -->

# Integrate a moving main

Use after a candidate push is rejected or main changes while you work. This is normal concurrent work. Never force-push or discard another worker's changes.

1. Fetch current main and check ownership on that remote state. If the token changed or expired, stop publishing; preserve your work and follow recovery.
2. A failed **claim-only** proposal is discarded and regenerated against fresh main. Do not merge/rebase/cherry-pick its stale ownership decision.
3. For an owned implementation, merge current main into your branch. Read both diffs and affected callers before resolving conflicts.
4. For distinct roadmap/changelog/handoff entries, preserve each entry. For the same item's ownership metadata, remote main's live token is authoritative. Never concatenate two tokens or resurrect a previous owner.
5. For source conflicts, preserve both intended behaviors with an actual integration, not a whole-file `ours`/`theirs` choice. Confirm that newly overlapping scope is coordinated. For generated files, resolve source inputs then regenerate with the correct pinned tools.
6. Search changed text for conflict markers, inspect the full staged diff, and run affected tests/type/build checks. A clean textual merge can still break an API or lifecycle.
7. Commit the integration without rewriting published history. Recheck live ownership and push the current `HEAD` explicitly to the configured main ref. On another race, repeat from fresh main.

If the source/API changes substantially each time, narrow the item or release/reclaim an updated non-overlapping scope. After contention_retries immediate races, do useful read-only review before trying again. Do not reserve a global landing lock that makes every other worker idle.

A metadata-only merge can reuse application tests after verifying that source/test/build trees are unchanged. An implementation or build change needs affected tests again. Never assert a stale ancestor's green CI proves a changed candidate.
