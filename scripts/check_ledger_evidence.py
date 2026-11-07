#!/usr/bin/env python3
"""Check that finished roadmap items carry hosted CI evidence.

CONSTITUTION.md says completion needs evidence, not confidence. This makes the
cheapest part of that rule mechanical: the note recorded when an item is
finished must name a hosted workflow run id (for example "CI 42340859598") or
say "hosted CI unavailable". It does not prove the run was green, only that the
author had to point at one, so a reviewer or a later audit can look.

Modes (exactly one):
  --base REF    items that are `done` now but were not `done` in REF
                (used on every push and pull request)
  --since DATE  every `done` item completed on or after DATE (YYYY-MM-DD)
                (used by the weekly audit; older items predate the rule)

Run: python3 scripts/check_ledger_evidence.py --root <checkout> --base <ref>
"""

import argparse
from pathlib import Path
import re
import subprocess
import sys

import agent_ledger

# A workflow name (or the word run) followed within 40 non-digit characters by
# an 8+ digit number: GitHub Actions run ids are 10 or 11 digits.
RUN_ID = re.compile(r"(?i)\b(?:run|runs|ci|release|rules|agent policy|pages|workflow)\b[^0-9]{0,40}\d{8,}")
UNAVAILABLE = re.compile(r"(?i)hosted ci (?:is |was )?(?:unavailable|not available|absent)")
DATE = re.compile(r"\d{4}-\d{2}-\d{2}")


def evidence_problems(note):
    """Return a list of problems with a finish note (empty when it is acceptable)."""
    if not isinstance(note, str) or not note.strip():
        return ["the finish note is empty"]
    if RUN_ID.search(note) or UNAVAILABLE.search(note):
        return []
    return ["the finish note names no hosted run id (for example 'CI 42340859598') and does not say 'hosted CI unavailable'"]


def done_items(items):
    return [item for item in items if item["metadata"] and item["metadata"].get("state") == "done"]


def newly_done(current, base):
    """Items done in `current` that were not done in `base` (new ids count as new)."""
    already = {item["metadata"]["id"] for item in done_items(base)}
    return [item for item in done_items(current) if item["metadata"]["id"] not in already]


def done_since(items, since):
    """Done items whose completed_at date is on or after `since` (YYYY-MM-DD)."""
    return [item for item in done_items(items) if str(item["metadata"].get("completed_at", ""))[:10] >= since]


def problems_for(items):
    found = []
    for item in items:
        for problem in evidence_problems(item["metadata"].get("note")):
            found.append(f"{item['metadata']['id']} ({item['title']}): {problem}")
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
    problems = problems_for(selected)
    if problems:
        print(f"Finished items without hosted CI evidence ({label}):", file=sys.stderr)
        for problem in problems:
            print(f"  - {problem}", file=sys.stderr)
        print("Put the hosted run ids in the finish note, or write 'hosted CI unavailable' with the reason.", file=sys.stderr)
        return 1
    print(f"Ledger evidence OK: {len(selected)} item(s) {label}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
