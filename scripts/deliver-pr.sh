#!/usr/bin/env bash
# Merge a pull request safely and say so only when it really merged.
#
#   scripts/deliver-pr.sh <pr-number> "<squash subject>" <body-file>
#
# Waits for the checks, squash-merges with the given subject and body file,
# retries once when GitHub answers "Base branch was modified", then verifies
# that the pull request is MERGED and has a merge commit. On success it prints
#   MERGED <sha>
#   RUNS <name id>, <name id>, ...      (post-merge workflow runs, may be empty)
# and exits 0. On any other outcome it exits non-zero WITHOUT printing MERGED,
# so a chain joined with && stops before it records a false finish.
#
# Environment: DELIVER_TIMEOUT_MIN (default 30), DELIVER_POLL_SEC (default 30),
# DELIVER_IGNORE_PENDING (space-separated check names whose pending state is
# ignored, default "cargo-audit": GitHub sometimes leaves that job pending
# after its run succeeded). A failed check is never ignored.
set -u

pr="${1:?usage: deliver-pr.sh <pr-number> <subject> <body-file>}"
subject="${2:?missing squash subject}"
body="${3:?missing body file}"
timeout_min="${DELIVER_TIMEOUT_MIN:-30}"
poll="${DELIVER_POLL_SEC:-30}"
ignore_pending="${DELIVER_IGNORE_PENDING:-cargo-audit}"
[ -f "$body" ] || { echo "deliver-pr: body file not found: $body" >&2; exit 2; }

deadline=$(($(date +%s) + timeout_min * 60))
while :; do
  out="$(gh pr checks "$pr" 2>&1 || true)"
  if printf '%s\n' "$out" | awk -F'\t' '$2=="fail"{f=1} END{exit !f}'; then
    echo "deliver-pr: a check failed on PR $pr:" >&2
    printf '%s\n' "$out" | awk -F'\t' '$2=="fail"{print "  " $1}' >&2
    exit 1
  fi
  pending="$(printf '%s\n' "$out" | awk -F'\t' '$2=="pending"{print $1}')"
  for name in $ignore_pending; do
    pending="$(printf '%s\n' "$pending" | grep -vx "$name" || true)"
  done
  [ -z "$(printf '%s' "$pending" | tr -d '[:space:]')" ] && break
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "deliver-pr: checks still pending after ${timeout_min} minutes on PR $pr" >&2
    exit 1
  fi
  sleep "$poll"
done

merge() { gh pr merge "$pr" --squash --subject "$subject" --body-file "$body" 2>&1; }
if ! result="$(merge)"; then
  if printf '%s' "$result" | grep -q "Base branch was modified"; then
    sleep "$poll"
    result="$(merge)" || true
  fi
fi

info="$(gh pr view "$pr" --json state,mergeCommit -q '.state + " " + (.mergeCommit.oid // "")' 2>/dev/null || true)"
state="${info%% *}"
sha="${info#* }"
if [ "$state" != "MERGED" ] || [ -z "$sha" ] || [ "$sha" = "$state" ]; then
  echo "deliver-pr: PR $pr is not merged (state: ${state:-unknown}). Last merge output:" >&2
  printf '%s\n' "${result:-}" >&2
  exit 1
fi

echo "MERGED $sha"
sleep "${DELIVER_RUNS_WAIT_SEC:-20}"
runs="$(gh run list --commit "$sha" --json databaseId,name -q '.[] | (.name + " " + (.databaseId|tostring))' 2>/dev/null | paste -sd, - || true)"
echo "RUNS ${runs}"
exit 0
