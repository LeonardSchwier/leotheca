#!/usr/bin/env python3
"""Enforce skills/roadmap-entry-format.md on ROADMAP.md entries that are new.

An entry is "new" relative to --base when its ledger `id` (or, if it has no
metadata yet, its exact title) does not already exist in --base's copy of the
roadmap file. Pre-existing entries are never flagged, however long or however
shaped, so this never demands a retroactive rewrite of roadmap history.

Two rules are checked:
  1. Every new entry's visible content (everything outside a <details> block,
     and outside the tool-authored agent-state/Agent lines) fits SUMMARY_BUDGET
     characters; past that, the rest belongs inside a <details> block.
  2. Every <details> opened inside an item is closed, and carries a <summary>.

A third, whole-file rule always runs regardless of --base: '## Open' precedes
'## Implemented', so open work is what a reader sees first.

Run: python3 scripts/check_roadmap_format.py --root <checkout> [--base <git-ref>]
"""

import argparse
from pathlib import Path
import re
import subprocess
import sys

import agent_ledger

SUMMARY_BUDGET = 500
DETAILS_OPEN = re.compile(r"<details\b", re.IGNORECASE)
DETAILS_CLOSE = re.compile(r"</details\s*>", re.IGNORECASE)
SUMMARY_TAG = re.compile(r"<summary\b", re.IGNORECASE)
AGENT_LABEL = re.compile(r"^ {2}Agent: .*$")


class FormatError(Exception):
    """A roadmap entry, or the file structure, violates the format guide."""


def load_current(root):
    return agent_ledger.Ledger(root)


def load_base_items(root, base, roadmap_relpath):
    result = subprocess.run(
        ["git", "-C", str(root), "show", f"{base}:{roadmap_relpath}"],
        text=True, capture_output=True,
    )
    if result.returncode != 0:
        raise FormatError(
            f"Could not read {roadmap_relpath} at {base!r}: {result.stderr.strip()}"
        )
    lines = result.stdout.splitlines(keepends=True)
    return agent_ledger.scan_items(lines)


def new_items(current_items, base_items):
    base_ids = {item["metadata"]["id"] for item in base_items if item["metadata"]}
    base_titles = {item["title"] for item in base_items}
    result = []
    for item in current_items:
        if item["metadata"]:
            if item["metadata"]["id"] not in base_ids:
                result.append(item)
        elif item["title"] not in base_titles:
            result.append(item)
    return result


def check_entry_format(item, lines):
    """Return a list of FormatError messages for one item's body lines."""
    errors = []
    visible_chars = 0
    depth = 0
    summary_seen_at_current_depth = False
    for raw_line in lines[item["start"]:item["end"]]:
        line = raw_line.rstrip("\n").rstrip("\r")
        if agent_ledger.META.fullmatch(raw_line) or AGENT_LABEL.match(line):
            continue
        opens = len(DETAILS_OPEN.findall(line))
        closes = len(DETAILS_CLOSE.findall(line))
        if depth == 0 and opens == 0:
            visible_chars += len(line)
        if SUMMARY_TAG.search(line) and depth > 0:
            summary_seen_at_current_depth = True
        depth += opens
        if closes:
            if depth == 0:
                errors.append(f"**{item['title']}**: found </details> with no matching <details>")
            elif not summary_seen_at_current_depth:
                errors.append(f"**{item['title']}**: a <details> block has no <summary>")
            depth = max(0, depth - closes)
            summary_seen_at_current_depth = depth > 0
    if depth != 0:
        errors.append(f"**{item['title']}**: <details> is never closed with </details>")
    if visible_chars > SUMMARY_BUDGET:
        errors.append(
            f"**{item['title']}**: {visible_chars} characters visible outside <details> "
            f"(budget {SUMMARY_BUDGET}); move supporting detail into a "
            f"<details><summary>...</summary>...</details> block per "
            f"skills/roadmap-entry-format.md"
        )
    return errors


def check_open_before_implemented(lines):
    open_at = implemented_at = None
    for index, line in enumerate(lines):
        stripped = line.rstrip("\n").rstrip("\r")
        if stripped == "## Open" and open_at is None:
            open_at = index
        if stripped == "## Implemented" and implemented_at is None:
            implemented_at = index
    if open_at is not None and implemented_at is not None and open_at > implemented_at:
        return ["'## Open' must precede '## Implemented' (skills/roadmap-entry-format.md: "
                "open work belongs at the top of the roadmap)"]
    return []


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, help="Git checkout root")
    parser.add_argument("--base", help="Git ref to diff against; omit to skip the new-entry check")
    args = parser.parse_args(argv)
    root = Path(args.root)

    try:
        current = load_current(root)
    except agent_ledger.LedgerError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    errors = check_open_before_implemented(current.lines)

    roadmap_relpath = current.path.resolve().relative_to(current.root).as_posix()
    if args.base:
        try:
            base_items = load_base_items(root, args.base, roadmap_relpath)
        except (FormatError, agent_ledger.LedgerError) as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 2
        candidates = new_items(current.items, base_items)
        for item in candidates:
            errors.extend(check_entry_format(item, current.lines))
        print(f"Checked {len(candidates)} new entr{'y' if len(candidates) == 1 else 'ies'} "
              f"against {args.base}.")
    else:
        print("No --base given; skipped the new-entry format check (structural check only).")

    if errors:
        print("\nRoadmap format violations:", file=sys.stderr)
        for message in errors:
            print(f"  - {message}", file=sys.stderr)
        return 1
    print("Roadmap format OK.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
