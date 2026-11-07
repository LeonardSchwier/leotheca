#!/usr/bin/env python3
"""Enforce the constitution's master specification rule on a pushed range.

Range check (--base given). When `git diff <base> <head>` changes an application
path (see APP_PATTERNS), master-spec.md must change in the same range, and its
change log must gain a dated entry. Ledger-only pushes (ROADMAP.md, handoffs)
and test-only pushes touch no application path, so they pass untouched: they do
not change the application.

Structure check (always). Requirement ids are unique, every test file named in a
requirement row exists, and the generated traceability block is current. A stale
link is a false claim about coverage, so it fails like any other wrong statement.

Run: python3 scripts/check_master_spec.py --root <checkout> [--base <ref>] [--head <ref>]
     python3 scripts/check_master_spec.py --root <checkout> --update-traceability
"""

import argparse
from pathlib import Path
import re
import subprocess
import sys

SPEC_FILE = "master-spec.md"
SPEC_PARTS_DIR = "spec/master/"

# Paths whose change can alter behavior, contracts, data formats, build or
# release. Matched as an exact file or a directory prefix ending in "/".
APP_PATTERNS = (
    "src/",
    "src-tauri/src/",
    "src-tauri/native/",
    "src-tauri/capabilities/",
    "src-tauri/resources/",
    "src-tauri/Cargo.toml",
    "src-tauri/Cargo.lock",
    "src-tauri/build.rs",
    "src-tauri/tauri.conf.json",
    "android/app/src/",
    "android/app/build.gradle",
    "android/build.gradle",
    "android/variables.gradle",
    "capacitor.config.ts",
    "index.html",
    "package.json",
    "package-lock.json",
    "vite.config.ts",
    "VERSION",
    "public/",
    "extensions/",
    "flatpak/",
    "packaging/",
    "snap/",
    ".github/workflows/",
)

# Tests document behavior but do not change it, so a test-only push is exempt.
TEST_FILE = re.compile(
    r"(^|/)(src/test/.*|android/app/src/(test|androidTest)/.*|[^/]+\.(test|spec)\.[cm]?[jt]sx?)$"
)

REQUIREMENT_ROW = re.compile(r"^\| (?:FR|NFR)-[A-Z0-9]+-\d{3} \|")
REQUIREMENT_ID = re.compile(r"^\| ((?:FR|NFR)-[A-Z0-9]+-\d{3}) \|")
BACKTICK_PATH = re.compile(r"`([^`\s]+)`")
CHANGE_LOG_ENTRY = re.compile(r"^- \d{4}-\d{2}-\d{2}: \S")
FR_AREA = re.compile(r"^FR-([A-Z0-9]+)-\d{3}$")
SECTION_HEADING = re.compile(r"^### (.+) \(FR-([A-Z0-9]+)\)$")

LOG_START = "<!-- change-log:start -->"
LOG_END = "<!-- change-log:end -->"
TRACE_START = "<!-- traceability:start -->"
TRACE_END = "<!-- traceability:end -->"
GAPS_START = "<!-- coverage-gaps:start -->"
GAPS_END = "<!-- coverage-gaps:end -->"


class SpecError(Exception):
    """The specification, or the range being checked, cannot be evaluated."""


def git(root, *args):
    result = subprocess.run(
        ["git", "-C", str(root), *args], text=True, capture_output=True
    )
    if result.returncode != 0:
        raise SpecError(f"git {' '.join(args)} failed: {result.stderr.strip()}")
    return result.stdout


def is_app_path(path):
    if TEST_FILE.search(path):
        return False
    return any(
        path.startswith(pattern) if pattern.endswith("/") else path == pattern
        for pattern in APP_PATTERNS
    )


def is_spec_path(path):
    return path == SPEC_FILE or path.startswith(SPEC_PARTS_DIR)


def changed_paths(root, base, head):
    # Two-dot tree diff: exactly what this push changes, so commits merged in
    # from main (already checked on their own push) cannot satisfy or fail it.
    out = git(root, "diff", "--name-only", "--no-renames", base, head)
    return [line for line in out.splitlines() if line]


def block_between(text, start, end):
    if start not in text or end not in text:
        raise SpecError(f"{SPEC_FILE} is missing the {start} ... {end} markers")
    return text.split(start, 1)[1].split(end, 1)[0]


def change_log_entries(text):
    return {
        line.strip()
        for line in block_between(text, LOG_START, LOG_END).splitlines()
        if CHANGE_LOG_ENTRY.match(line.strip())
    }


def read_spec_at(root, ref):
    result = subprocess.run(
        ["git", "-C", str(root), "show", f"{ref}:{SPEC_FILE}"],
        text=True,
        capture_output=True,
    )
    return result.stdout if result.returncode == 0 else None


def check_range(root, base, head):
    """Return error messages for one pushed range."""
    paths = changed_paths(root, base, head)
    app_paths = [path for path in paths if is_app_path(path)]
    if not app_paths:
        print(f"{len(paths)} changed path(s), none affect the application; exempt.")
        return []

    shown = "\n".join(f"    {path}" for path in app_paths[:20])
    more = len(app_paths) - 20
    if more > 0:
        shown += f"\n    ... and {more} more"
    if not any(is_spec_path(path) for path in paths):
        return [
            f"this push changes application paths but not {SPEC_FILE}:\n{shown}\n"
            f"  Extend {SPEC_FILE} and add a dated change log entry in the same push "
            "(CONSTITUTION.md, skills/master-spec-maintenance.md)."
        ]

    head_text = read_spec_at(root, head)
    if head_text is None:
        return [f"{SPEC_FILE} does not exist at {head}"]
    base_text = read_spec_at(root, base)
    # The push that creates the specification has no earlier log to compare.
    base_entries = change_log_entries(base_text) if base_text is not None else set()
    if not change_log_entries(head_text) - base_entries:
        return [
            f"this push changes application paths and {SPEC_FILE}, but adds no dated "
            f"change log entry ('- YYYY-MM-DD: ...' between the change-log markers):\n{shown}"
        ]
    return []


def parse_requirements(text):
    """Return [(id, row cells)] for every requirement row."""
    rows = []
    for line in text.splitlines():
        if REQUIREMENT_ROW.match(line):
            cells = [cell.strip() for cell in re.split(r"(?<!\\)\|", line)[1:-1]]
            rows.append((cells[0], cells))
    return rows


def test_cell_paths(cells):
    # The test column is always last; "NONE" means no confirmed coverage.
    return BACKTICK_PATH.findall(cells[-1])


def render_traceability(text):
    titles = {
        match.group(2): match.group(1)
        for match in (SECTION_HEADING.match(line) for line in text.splitlines())
        if match
    }
    areas = {}
    gaps = []
    for req_id, cells in parse_requirements(text):
        match = FR_AREA.match(req_id)
        if not match:
            continue
        area = areas.setdefault(match.group(1), {"count": 0, "none": 0, "files": set()})
        area["count"] += 1
        paths = test_cell_paths(cells)
        area["files"].update(paths)
        if not paths:
            area["none"] += 1
            gaps.append(req_id)

    lines = [
        "| Prefix | Area | Requirements | With a linked test | NONE | Test files |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    total = covered = 0
    for key, area in areas.items():
        files = ", ".join(f"`{path}`" for path in sorted(area["files"])) or "none"
        with_test = area["count"] - area["none"]
        lines.append(
            f"| FR-{key} | {titles.get(key, key)} | {area['count']} | {with_test} "
            f"| {area['none']} | {files} |"
        )
        total += area["count"]
        covered += with_test
    lines.append(f"| **Total** | | **{total}** | **{covered}** | **{total - covered}** | |")
    gap_lines = [f"- {req_id}" for req_id in gaps] or ["- None."]
    return "\n".join(lines), "\n".join(gap_lines)


def replace_block(text, start, end, body):
    head, rest = text.split(start, 1)
    _, tail = rest.split(end, 1)
    return f"{head}{start}\n{body}\n{end}{tail}"


def apply_traceability(text):
    table, gaps = render_traceability(text)
    block_between(text, TRACE_START, TRACE_END)
    block_between(text, GAPS_START, GAPS_END)
    return replace_block(
        replace_block(text, TRACE_START, TRACE_END, table), GAPS_START, GAPS_END, gaps
    )


def check_structure(root, text):
    errors = []
    rows = parse_requirements(text)
    if not rows:
        errors.append(f"{SPEC_FILE} has no requirement rows")
    seen = set()
    for req_id, cells in rows:
        if req_id in seen:
            errors.append(f"duplicate requirement id {req_id}")
        seen.add(req_id)
        for path in test_cell_paths(cells):
            if not (root / path).exists():
                errors.append(f"{req_id} links a test file that does not exist: {path}")
    if not change_log_entries(text):
        errors.append(f"{SPEC_FILE} has no dated change log entry")
    if apply_traceability(text) != text:
        errors.append(
            "the traceability block is stale; run "
            "python3 scripts/check_master_spec.py --root . --update-traceability"
        )
    return errors


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, help="Git checkout root")
    parser.add_argument("--base", help="Commit before the push; omit to skip the range check")
    parser.add_argument("--head", default="HEAD", help="Commit after the push")
    parser.add_argument(
        "--update-traceability", action="store_true",
        help="Regenerate the traceability and coverage-gap blocks, then exit",
    )
    args = parser.parse_args(argv)
    root = Path(args.root)
    spec_path = root / SPEC_FILE

    try:
        if args.update_traceability:
            text = spec_path.read_text(encoding="utf-8")
            spec_path.write_text(apply_traceability(text), encoding="utf-8")
            print(f"Updated {SPEC_FILE}.")
            return 0

        errors = []
        if args.base:
            errors.extend(check_range(root, args.base, args.head))
        else:
            print("No --base given; skipped the pushed-range check (structure check only).")
        if spec_path.exists():
            errors.extend(check_structure(root, spec_path.read_text(encoding="utf-8")))
        else:
            errors.append(f"{SPEC_FILE} does not exist at the repository root")
    except SpecError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    if errors:
        print("\nMaster specification violations:", file=sys.stderr)
        for message in errors:
            print(f"  - {message}", file=sys.stderr)
        return 1
    print("Master specification OK.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
