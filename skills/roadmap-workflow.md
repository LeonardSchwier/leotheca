<!--
Variables: use CONSTITUTION.md's remote, main_branch, roadmap_file, handoff_dir,
lease_minutes, heartbeat_minutes, clock_skew_minutes, contention_retries.
HELPER = scripts/agent_ledger.py
TOOL_NAME = set to the actual running agent tool
-->

# Claim, deliver, and recover one item

This is the exact coordination procedure. It applies to features, bugs, CI repairs, reviews, and instruction changes. Read the constitution first. The helper edits local roadmap state only: **you must commit, push, and confirm it**. A successful helper command alone is not ownership.

## 1. Prepare isolated checkouts

Each worker uses its own clone. Never share a working directory or index with another worker. A control worktree inside that worker's clone handles only ledger/handoff commits. Keep it outside the application tree so lint/test discovery cannot include another checkout.

Set `REMOTE`, `MAIN_BRANCH`, `ROADMAP_FILE`, and `TOOL_NAME` from the variables above. Use the same values throughout this session. Create the remaining variables:

```sh
REPO_ROOT=$(git rev-parse --show-toplevel)
AGENT_ID="$TOOL_NAME-$(date -u +%Y%m%dT%H%M%SZ)-$(python3 -c 'import secrets; print(secrets.token_hex(4))')"
CONTROL_DIR="$REPO_ROOT-control-$AGENT_ID"
git fetch "$REMOTE" "$MAIN_BRANCH"
git worktree add --detach "$CONTROL_DIR" "$REMOTE/$MAIN_BRANCH"
```

Leave existing edits intact. Do not run a hard reset or `git clean`. If this is someone else's checkout, create your own clone before starting.

## 2. Select work and define its scope

Read the Open section on current remote main and relevant handoffs. The list command is a summary, not a replacement for reading the item:

```sh
python3 "$REPO_ROOT/scripts/agent_ledger.py" --root "$CONTROL_DIR" list
```

1. Resolve a known main regression or deferred verification you can perform first; otherwise select Open Bugs, then Open Features, in order.
2. Read the item's full description and dependencies. Verify it is not already implemented, duplicate, out of scope, blocked until a future retry, or owned by another live token.
3. Identify exact source/test/config files or narrow directory prefixes you expect to write. Also identify shared behavior contracts. Claim a semantic resource even when two features touch different files implementing the same contract.
4. Read legacy unstructured `🚧` entries and relevant branch diffs. The helper cannot infer their overlap. Observe/normalize those that could overlap before claiming, as described below.
5. Shared per-item additions to the roadmap, handoff directory, and changelog do not require locking those entire files. A structural rewrite of a shared document does require its path as a touch scope.

Use existing resource names for existing contracts. For example, two claims changing the editor's selected note must both claim `editor-state`, even if one edits a hook and the other a component. Never invent a synonym to evade a live claim. If the helper reports an overlapping path/resource, choose another item.

## 3. Make a claim transaction

Start **every** claim/renew/release/block/finish transaction from a clean control tree and fresh main:

```sh
test -z "$(git -C "$CONTROL_DIR" status --porcelain)" || exit 1
git fetch "$REMOTE" "$MAIN_BRANCH"
BASE=$(git rev-parse "$REMOTE/$MAIN_BRANCH")
git -C "$CONTROL_DIR" switch --detach "$BASE"
```

Run the helper with the exact bold item title. Replace the example arguments with the selected scope. Repeat `--touch` and `--resource` as needed.

```sh
python3 "$REPO_ROOT/scripts/agent_ledger.py" --root "$CONTROL_DIR" claim \
  --title "Exact roadmap title" --agent "$AGENT_ID" \
  --touch "path/to/implementation" --touch "path/to/tests" \
  --resource "shared-contract"
```

Record `metadata.id`, `metadata.token`, and `metadata.branch` from the returned JSON as `TASK_ID`, `TOKEN`, and `WORK_BRANCH`. Copy them exactly. Do not derive a token from the agent name.

```sh
git -C "$CONTROL_DIR" diff --check
git -C "$CONTROL_DIR" add -- "$ROADMAP_FILE"
git -C "$CONTROL_DIR" diff --cached --stat
git -C "$CONTROL_DIR" commit -m "chore(agents): claim $TASK_ID by $AGENT_ID"
git -C "$CONTROL_DIR" push "$REMOTE" "HEAD:refs/heads/$MAIN_BRANCH"
```

Check the command's exit status. If it succeeded, fetch again, switch the clean control tree to fresh remote main, and confirm:

```sh
git fetch "$REMOTE" "$MAIN_BRANCH"
git -C "$CONTROL_DIR" switch --detach "$REMOTE/$MAIN_BRANCH"
python3 "$REPO_ROOT/scripts/agent_ledger.py" --root "$CONTROL_DIR" check \
  --id "$TASK_ID" --token "$TOKEN" --margin-minutes 10
```

Only now start a work branch from that confirmed main commit in the implementation checkout:

```sh
git switch -c "$WORK_BRANCH" "$REMOTE/$MAIN_BRANCH"
```

**If push loses a race:** do not merge or cherry-pick the losing claim commit onto new main. Its eligibility decision is stale. Keep the local failed commit if needed for diagnosis, switch the clean control tree to newly fetched main, and rerun the helper. If another agent owns this item or overlapping scope, choose another. After `contention_retries` immediate races, do read-only preparation before retrying rather than flooding main.

**If push result is ambiguous:** fetch and inspect the token on remote main first. A timeout may occur after the server accepted the commit. If the exact token is present and valid, you own it; if not, resolve from fresh main. An authentication/protection rejection is an external capability blocker, not a reason to force.

## 4. Implement and keep the lease alive

Write acceptance criteria in the per-task handoff, implement one coherent slice, add regression tests, and update required docs. Keep the roadmap item `🚧` until post-push verification completes.

Every `heartbeat_minutes`, perform a fresh control transaction with:

```sh
python3 "$REPO_ROOT/scripts/agent_ledger.py" --root "$CONTROL_DIR" renew \
  --id "$TASK_ID" --token "$TOKEN"
```

Commit only the renewal and any intentional handoff update; push normally; fetch and confirm as above. Renew while tests/CI run, using short tool waits. Do not use an independent background heartbeat. If no progress is possible, block/release instead of renewing forever.

The owner must renew before the helper's clock-skew safety cutoff. Once `check` or `renew` rejects expiry, even an otherwise unchanged claim must be reacquired with a new token. A replacement token always ends the former owner's authority.

If you need files/resources beyond the claim, pause before editing them. Publish a checkpoint, release the old claim in a control transaction, then reclaim with the enlarged scope and a new token. If another claim now conflicts, keep the checkpoint and choose other work. After successful reclaim, update TASK_ID/TOKEN/WORK_BRANCH from the new metadata, create that new branch from freshly confirmed main, and cherry-pick only reviewed implementation commits from the old checkpoint. Exclude old claim/lease metadata; reconcile task docs with the new scope and retest. Do not continue publishing on the former token's branch. Never silently expand a live claim.

Checkpoint commits may be incomplete, but push them only to `HEAD:refs/heads/$WORK_BRANCH`. Do not publish another agent's commits or branch. `git stash` cannot be pushed.

## 5. Verify, integrate, and push the implementation

Use the verification skill and resolve findings. Before final publication:

```sh
git fetch "$REMOTE" "$MAIN_BRANCH"
git merge --no-edit "$REMOTE/$MAIN_BRANCH"
```

Resolve conflicts using the conflict skill. Read current remote ownership, not a token resurrected by a merge. Renew through the control transaction if necessary; merge that renewal too. Check with `--margin-minutes 10` in the fresh control tree. Review and retest the integrated candidate. Tests of an older tree do not prove a changed integration works.

Stage explicit paths, inspect the staged diff, and commit the complete implementation, tests, and docs. Include the task ID, token, review summary, and actual test evidence in the commit body. Do not stage all files blindly. Do not mark the task done yet.

```sh
git diff --cached --check
git diff --cached
git commit
CANDIDATE_SHA=$(git rev-parse HEAD)
git push "$REMOTE" "HEAD:refs/heads/$MAIN_BRANCH"
```

This refspec pushes the current candidate. `git push origin main` from a feature branch can push an unrelated stale local main.

If main moved and the push is rejected, fetch, recheck the remote token/scope, merge, resolve, and retest. Recheck even if the merge is textually clean. Never repeatedly push a stale candidate. If only ownership metadata changed, verify that fact with a diff and rerun ledger validation; it does not require rebuilding unchanged application code. Code/test/build changes require affected checks again.

Confirm actual delivery:

```sh
git fetch "$REMOTE" "$MAIN_BRANCH"
git merge-base --is-ancestor "$CANDIDATE_SHA" "$REMOTE/$MAIN_BRANCH"
```

A newer main can legitimately contain your commit as an ancestor. Inspect your changes on that main; do not require that your commit remain its tip. Record the landed SHA immediately in the next control handoff. Inspect CI for that SHA and repair failures under the same claim.

## 6. Finish or defer

When the verification skill permits completion, start a clean control transaction:

```sh
python3 "$REPO_ROOT/scripts/agent_ledger.py" --root "$CONTROL_DIR" finish \
  --id "$TASK_ID" --token "$TOKEN" \
  --note "Implemented scope; landed SHA; tests/review; CI conclusion or local-only evidence"
```

The helper moves the whole item under `## Implemented` with `✅`. Update its handoff with final evidence after running the helper, commit both explicit paths, and push. Fetch current main and use `list` to confirm the task ID, done state, completion owner, and evidence. Do not run `check` with the former token: finish intentionally removes active ownership. The helper cannot prove tests passed: this is your responsibility. A metadata-only finish commit does not invalidate evidence for unchanged application code or require an infinite finish/CI/finish cycle. Still inspect a policy/helper check if that metadata changes its behavior.

For external blockers or deferred checks, use `block --id ... --token ... --note "..."` instead. It releases ownership and sets a retry time. Include the concrete retry condition in the note/handoff. Use `release` for resumable unfinished work with no external blocker. Both require fresh remote ownership; never release someone else's token. After pushing, confirm the resulting blocked/open state by task ID with `list`, not by checking the now-released token.

Retain useful remote checkpoints. Delete only your own branch after confirming its commits are already on main and no pending handoff needs it. Leaving a harmless checkpoint branch is preferable to deleting unfinished work. Fetch main and select the next item.

## 7. Recover legacy claims and dead sessions

For a legacy `🚧` without structured metadata, inspect the full entry, relevant branch, current main, and any available CI. Identify remaining scope. Publish a fresh control transaction such as:

```sh
python3 "$REPO_ROOT/scripts/agent_ledger.py" --root "$CONTROL_DIR" observe \
  --title "Exact legacy title" --touch "affected/path" --resource "shared-contract" \
  --note "Observed branch SHA and landed scope; remaining work; UTC inspection time"
```

This gives one finite legacy grace window, not ownership for you. Do not repeat observation to extend it. If new evidence reveals wider touch paths/resources, run `observe` again in a fresh transaction with that evidence: it adds scope and updates the note while preserving the original deadline. It never narrows prior scope. If this exposes overlap with your active claim, `check` rejects publication; checkpoint, release/replan, and continue elsewhere until scope is free. After expiry plus skew, claim normally. Recent branch commits do not renew a structured lease; a live upgraded owner must claim/renew through the new protocol.

For an expired structured claim, inspect its handoff and main first, then `claim` normally with a new agent/token. No remote branch is required. A missing checkpoint permits starting from current main. A checkpoint is optional input, not trusted finished work: review it and cherry-pick only useful changes onto your new branch after acquiring ownership. Never delete the predecessor's branch or merge their old claim metadata.

If your old session resumes after a takeover, preserve its local changes, stop publication, and choose other work. Do not restore the old token or unconditionally finish the old item.

## Connector-only equivalent

When only a repository connector is available, perform the same transition against fully fetched files:
read main commit **B** and its tree; validate the complete ledger; create a tree based on B with only intended changes; create commit **C with B as its sole parent**; update main with `force=false`; reread main and confirm the token/commit. On rejection, discard the stale proposal and recompute from new B. Never use a blind whole-file overwrite or merge a losing claim proposal.

The helper is the schema reference. If the connector cannot retrieve the complete ledger or provide an atomic non-forced ref update, do read-only review and record the limitation in the session; it cannot safely reserve work.

Git's [push rules](https://git-scm.com/docs/git-push) and the host's [non-forced reference update](https://docs.github.com/en/rest/git/refs#update-a-reference) explain the fast-forward guarantee used here.
