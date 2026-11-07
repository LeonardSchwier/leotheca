#!/usr/bin/env python3
"""Check that finished roadmap items carry hosted CI evidence.

CONSTITUTION.md says completion needs evidence, not confidence. This makes the
cheapest part of that rule mechanical: the note recorded when an item is
finished must name a hosted workflow run id (for example "CI 42340859598") or
say "hosted CI unavailable". It does not prove the run was green, only that the
author had to point at one, so a reviewer or a later audit can look.

A finish note may say `hosted CI pending` when the local gate is green and the
push landed. The run ids then belong in the item's handoff file
(.agents/handoffs/*<id>*.md). Such an item passes while it is younger than 24
hours; the weekly audit fails when it is older and no handoff names a run id.

Modes (exactly one):
  --base REF    items that are `done` now but were not `done` in REF
                (used on every push and pull request)
  --since DATE  every `done` item completed on or after DATE (YYYY-MM-DD)
                (used by the weekly audit; older items predate the rule)

Run: python3 scripts/check_ledger_evidence.py --root <checkout> --base <ref>
"""

import argparse
from datetime import datetime, timedelta, timezone
from pathlib import Path
import re
import subprocess
import sys

import agent_ledger

# A workflow name (or the word run) followed within 40 non-digit characters by
# an 8+ digit number: GitHub Actions run ids are 10 or 11 digits.
RUN_ID = re.compile(r"(?i)\b(?:run|runs|ci|release|rules|agent policy|pages|workflow)\b[^0-9]{0,40}\d{8,}")
UNAVAILABLE = re.compile(r"(?i)hosted ci (?:is |was )?(?:unavailable|not available|absent)")
PENDING = re.compile(r"(?i)hosted ci (?:is |was )?pending")
DATE = re.compile(r"\d{4}-\d{2}-\d{2}")
PENDING_GRACE = timedelta(hours=24)


def evidence_problems(note):
    """Return a list of problems with a finish note (empty when it is acceptable)."""
    if not isinstance(note, str) or not note.strip():
        return ["the finish note is empty"]
    if RUN_ID.search(note) or UNAVAILABLE.search(note) or PENDING.search(note):
        return []
    return ["the finish note names no hosted run id (for example 'CI 42340859598'), and says neither 'hosted CI pending' nor 'hosted CI unavailable'"]


def is_pending_only(note):
    """True when the note promises evidence later and names no run id itself."""
    note = note if isinstance(note, str) else ""
    return bool(PENDING.search(note)) and not RUN_ID.search(note) and not UNAVAILABLE.search(note)


def handoff_has_run_id(root, item_id):
    """True when a handoff file of this item names a hosted run id."""
    handoffs = Path(root) / ".agents" / "handoffs"
    if not handoffs.is_dir():
        return False
    return any(RUN_ID.search(path.read_text(encoding="utf-8", errors="replace")) for path in handoffs.glob(f"*{item_id}*.md"))


def done_items(items):
    return [item for item in items if item["metadata"] and item["metadata"].get("state") == "done"]


def newly_done(current, base):
    """Items done in `current` that were not done in `base` (new ids count as new)."""
    already = {item["metadata"]["id"] for item in done_items(base)}
    return [item for item in done_items(current) if item["metadata"]["id"] not in already]


def done_since(items, since):
    """Done items whose completed_at date is on or after `since` (YYYY-MM-DD)."""
    return [item for item in done_items(items) if str(item["metadata"].get("completed_at", ""))[:10] >= since]


def parse_stamp(value):
    try:
        return datetime.strptime(str(value), "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def problems_for(items, root=None, now=None):
    now = now or datetime.now(timezone.utc)
    found = []
    for item in items:
        meta = item["metadata"]
        label = f"{meta['id']} ({item['title']})"
        for problem in evidence_problems(meta.get("note")):
            found.append(f"{label}: {problem}")
            break
        else:
            if root is not None and is_pending_only(meta.get("note")) and not handoff_has_run_id(root, meta["id"]):
                done_at = parse_stamp(meta.get("completed_at"))
                if done_at is not None and now - done_at > PENDING_GRACE:
                    found.append(f"{label}: hosted CI was pending for more than 24 hours and no handoff file names a run id; append the run ids to .agents/handoffs/{meta['id']}.md")
    return found


def load_items(path):
    return agent_ledger.scan_items(Path(path).read_text(encoding="utf-8").splitlines(keepends=True))


def load_base_items(root, base):
    result = subprocess.run(["git", "-C", str(root), "show", f"{base}:ROADMAP.md"], text=True, capture_output=True)
    if result.returncode != 0:
        raise SystemExit(f"Could not read ROADMAP.md at {base!r}: {result.stderr.strip()}")
    return agent_ledger.scan_items(result.stdout.splitlines(keepends=True))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--root", required=True, help="Git checkout root")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--base", help="Git ref to compare against")
    mode.add_argument("--since", help="Audit every item completed on or after this date (YYYY-MM-DD)")
    args = parser.parse_args(argv)
    root = Path(args.root)
    current = load_items(root / "ROADMAP.md")
    if args.base:
        selected = newly_done(current, load_base_items(root, args.base))
        label = f"newly finished since {args.base}"
    else:
        if not DATE.fullmatch(args.since):
            raise SystemExit("--since must look like YYYY-MM-DD")
        selected = done_since(current, args.since)
        label = f"finished on or after {args.since}"
    problems = problems_for(selected, root)
    if problems:
        print(f"Finished items without hosted CI evidence ({label}):", file=sys.stderr)
        for problem in problems:
            print(f"  - {problem}", file=sys.stderr)
        print("Put the hosted run ids in the finish note, or write 'hosted CI pending' (then add the run ids to the handoff file) or 'hosted CI unavailable' with the reason.", file=sys.stderr)
        return 1
    print(f"Ledger evidence OK: {len(selected)} item(s) {label}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
