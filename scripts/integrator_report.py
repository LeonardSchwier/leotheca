#!/usr/bin/env python3
"""Classify open pull requests for the integrator (skills/integrator.md).

Read-only: it calls `gh pr list` and the ledger helper, prints one line per
pull request with the action the integrator should take, and changes nothing.

usage: integrator_report.py --root <control checkout on the ledger branch> [--json]
"""
import argparse
import json
import re
import subprocess
import sys

WORK_BRANCH = re.compile(r"^agent/(rm-[0-9a-f]+)/")
BAD = {"FAILURE", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED", "STARTUP_FAILURE"}
OK = {"SUCCESS", "SKIPPED", "NEUTRAL"}


def checks_state(rollup):
    """'red' if any check failed, 'pending' if any is unfinished, else 'green'."""
    state = "green"
    for check in rollup or []:
        conclusion = (check.get("conclusion") or "").upper()
        status = (check.get("status") or check.get("state") or "").upper()
        if conclusion in BAD or status in {"FAILURE", "ERROR"}:
            return "red"
        if conclusion not in OK or status in {"QUEUED", "IN_PROGRESS", "PENDING", "WAITING"}:
            state = "pending"
    return state


def classify(pr, live_items):
    """Return (action, reason) for one pull request.

    live_items: ids of roadmap items whose lease is running.
    Actions: ignore, wait, owner, repair, merge.
    """
    match = WORK_BRANCH.match(pr.get("headRefName", ""))
    if not match:
        return "ignore", "not an agent work branch"
    item = match.group(1)
    owner_alive = item in live_items
    conflict = pr.get("mergeable") == "CONFLICTING"
    state = checks_state(pr.get("statusCheckRollup"))
    if pr.get("isDraft"):
        return ("owner" if owner_alive else "repair"), "draft"
    if conflict or state == "red":
        why = "conflict" if conflict else "red check"
        if owner_alive:
            return "owner", f"{why}; the owner's lease is live, leave it to them"
        return "repair", f"{why}; no live lease, claim {item} and repair"
    if state == "pending":
        return "wait", "checks still running"
    if owner_alive:
        return "owner", "green; the owner merges it"
    return "merge", f"green and no live lease; claim {item}, merge, finish it"


def live_items_from(root):
    out = subprocess.run(
        [sys.executable, "scripts/agent_ledger.py", "--root", root, "list"],
        check=True, capture_output=True, text=True,
    ).stdout
    items = json.loads(out)["items"]
    return {
        (i.get("metadata") or {}).get("id")
        for i in items
        if i["availability"] == "claimed"
    }


def open_prs():
    out = subprocess.run(
        ["gh", "pr", "list", "--state", "open", "--limit", "100", "--json",
         "number,title,headRefName,mergeable,isDraft,statusCheckRollup"],
        check=True, capture_output=True, text=True,
    ).stdout
    return json.loads(out)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--root", required=True)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    live = live_items_from(args.root)
    rows = []
    for pr in open_prs():
        action, reason = classify(pr, live)
        rows.append({"number": pr["number"], "branch": pr["headRefName"],
                     "action": action, "reason": reason})
    if args.json:
        print(json.dumps(rows, indent=2))
    else:
        for r in rows:
            print(f"#{r['number']:<4} {r['action']:<7} {r['branch']}  ({r['reason']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
