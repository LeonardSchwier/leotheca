#!/usr/bin/env python3
"""Behavioral tests for check_roadmap_format.py.

Run: PYTHONDONTWRITEBYTECODE=1 python3 scripts/test_check_roadmap_format.py
Set TMPDIR to a writable workspace directory when the system temp dir is denied.
"""

from contextlib import redirect_stderr, redirect_stdout
import importlib.util
import io
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


sys.dont_write_bytecode = True
HERE = Path(__file__).parent
SPEC = importlib.util.spec_from_file_location("check_roadmap_format", HERE / "check_roadmap_format.py")
checker = importlib.util.module_from_spec(SPEC)
sys.path.insert(0, str(HERE))
SPEC.loader.exec_module(checker)

CONFIG = "# Constitution\n<!-- agent-config:start -->\n```json\n{}\n```\n<!-- agent-config:end -->\n"

BASE_ROADMAP = """# Roadmap

## Open

### Bugs

- ⬜ **Existing short bug**: Already there before this change, stays short.

### Features

- ⬜ **Existing long-winded feature**: {long}

## Implemented

- ✅ **Old shipped feature**: Existing history stays exactly as it was written, however long.
""".format(long="This already-existing entry runs on for a very long time on purpose, well past any reasonable budget, because it predates the format guide and must never be flagged by a linter that only looks at genuinely new entries added after this file already existed in the repository's history, full stop." * 2)


def git(root, *args, check=True):
    return subprocess.run(["git", "-C", str(root), *args], text=True, capture_output=True, check=check)


class RoadmapFormatTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix=".roadmap-format-test-", dir=os.environ.get("TMPDIR", str(Path.cwd())))
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "checkout"
        self.root.mkdir()
        git(self.root, "init", "-q", "-b", "main")
        git(self.root, "config", "user.name", "Format Test")
        git(self.root, "config", "user.email", "format-test@example.invalid")
        (self.root / "CONSTITUTION.md").write_text(CONFIG, encoding="utf-8")
        (self.root / "ROADMAP.md").write_text(BASE_ROADMAP, encoding="utf-8")
        git(self.root, "add", "--all")
        git(self.root, "commit", "-q", "-m", "Base roadmap")
        self.base_sha = git(self.root, "rev-parse", "HEAD").stdout.strip()

    def write_and_commit(self, roadmap_text):
        (self.root / "ROADMAP.md").write_text(roadmap_text, encoding="utf-8")
        git(self.root, "add", "--all")
        git(self.root, "commit", "-q", "-m", "Change under test")

    def run_checker(self, base=None):
        argv = ["--root", str(self.root)]
        if base:
            argv += ["--base", base]
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            code = checker.main(argv)
        return code, out.getvalue(), err.getvalue()

    def test_short_new_entry_passes(self):
        text = BASE_ROADMAP.replace(
            "### Bugs\n\n",
            "### Bugs\n\n- ⬜ **Brand new short bug**: Fits comfortably inside the budget.\n\n",
        )
        self.write_and_commit(text)
        code, out, err = self.run_checker(self.base_sha)
        self.assertEqual(code, 0, err)
        self.assertIn("Checked 1 new entr", out)

    def test_long_new_entry_without_details_fails(self):
        long_summary = "This brand new entry is written as one giant paragraph on the bullet line itself, well past the summary budget, with no drill-down toggle wrapping any of the supporting detail at all, on purpose, to exercise the linter's rejection path for exactly this shape of violation. " * 2
        text = BASE_ROADMAP.replace(
            "### Bugs\n\n",
            f"### Bugs\n\n- ⬜ **Brand new long bug**: {long_summary}\n\n",
        )
        self.write_and_commit(text)
        code, out, err = self.run_checker(self.base_sha)
        self.assertEqual(code, 1)
        self.assertIn("Brand new long bug", err)
        self.assertIn("budget", err)

    def test_long_new_entry_with_details_passes(self):
        long_detail = "Root cause, repro, and verification narrative that is deliberately long and would fail the budget if it were not wrapped in a details toggle, exactly as the format guide requires for a new entry this size. " * 2
        entry = (
            "- ⬜ **Brand new detailed bug**: Short summary that fits the budget on its own.\n\n"
            "  <details>\n  <summary>Why</summary>\n\n"
            f"  {long_detail}\n\n  </details>\n\n"
        )
        text = BASE_ROADMAP.replace("### Bugs\n\n", f"### Bugs\n\n{entry}")
        self.write_and_commit(text)
        code, out, err = self.run_checker(self.base_sha)
        self.assertEqual(code, 0, err)

    def test_details_without_summary_fails(self):
        entry = (
            "- ⬜ **Missing summary tag**: Short line.\n\n"
            "  <details>\n\n  Some hidden text with no summary tag at all.\n\n  </details>\n\n"
        )
        text = BASE_ROADMAP.replace("### Bugs\n\n", f"### Bugs\n\n{entry}")
        self.write_and_commit(text)
        code, out, err = self.run_checker(self.base_sha)
        self.assertEqual(code, 1)
        self.assertIn("no <summary>", err)

    def test_unclosed_details_fails(self):
        entry = "- ⬜ **Unclosed toggle**: Short line.\n\n  <details>\n  <summary>Why</summary>\n\n  Never closed.\n\n"
        text = BASE_ROADMAP.replace("### Bugs\n\n", f"### Bugs\n\n{entry}")
        self.write_and_commit(text)
        code, out, err = self.run_checker(self.base_sha)
        self.assertEqual(code, 1)
        self.assertIn("never closed", err)

    def test_preexisting_long_entry_is_grandfathered(self):
        # No new items at all -- unchanged from base -- so the long-winded
        # pre-existing "Existing long-winded feature" entry must not be flagged.
        code, out, err = self.run_checker(self.base_sha)
        self.assertEqual(code, 0, err)
        self.assertIn("Checked 0 new entries", out)

    def test_legacy_entry_gaining_metadata_is_not_flagged(self):
        """A 🚧 legacy entry that receives observe/claim metadata keeps the same
        title; its id is new but the title is not, so the linter must skip it."""
        # Simulate what agent_ledger.py observe does: add agent-state metadata
        # to the pre-existing long-winded entry, keeping its title identical.
        agent_state = (
            '  <!-- agent-state: {"schema":1,"id":"rm-0a1b2c3d4e5f6789",'
            '"state":"legacy","touch":["ROADMAP.md#test-legacy"],'
            '"resources":["legacy-entry"],'
            '"observed_at":"2026-09-22T00:00:00Z",'
            '"lease_until":"2026-09-22T02:00:00Z",'
            '"note":"test legacy observation"} -->\n'
            "  Agent: test-agent | item: rm-0a1b2c3d4e5f6789 | lease until: 2026-09-22T02:00:00Z\n"
        )
        # Insert the metadata line right after the title line of the long entry.
        text = BASE_ROADMAP.replace(
            "- ⬜ **Existing long-winded feature**:",
            "- 🚧 **Existing long-winded feature**:",
        )
        # Insert agent-state metadata after the title line (immediately after the first newline
        # following the long title line).
        lines = text.splitlines(keepends=True)
        insert_at: int | None = None
        for i, line in enumerate(lines):
            if "Existing long-winded feature" in line:
                insert_at = i + 1
                break
        self.assertIsNotNone(insert_at)
        lines.insert(insert_at, agent_state)
        text = "".join(lines)
        self.write_and_commit(text)
        code, out, err = self.run_checker(self.base_sha)
        # The entry's title is in base_titles, so it must NOT be flagged as new.
        self.assertEqual(code, 0, err)
        self.assertIn("Checked 0 new entries", out)

    def test_new_entry_with_new_id_and_new_title_is_flagged(self):
        """Sanity check: a genuinely new entry (new id AND new title) is still
        subject to the budget, even when it has metadata."""
        long_summary = "Brand new entry with a brand new id and a brand new title, written as one long unbroken paragraph that deliberately exceeds the summary budget so the linter must reject it even though it carries agent-state metadata. " * 3
        entry = (
            "- 🚧 **Completely new titled bug**: "
            f"{long_summary}\n"
            '  <!-- agent-state: {"schema":1,"id":"rm-aabbccddeeff0011",'
            '"state":"claimed","touch":["ROADMAP.md#brand-new"],'
            '"resources":["brand-new-fix"],'
            '"branch":"agent/rm-aabbccddeeff0011/001122334455",'
            '"claimed_at":"2026-09-22T00:00:00Z",'
            '"heartbeat_at":"2026-09-22T00:00:00Z",'
            '"lease_until":"2026-09-22T01:30:00Z",'
            '"owner":"test-agent","token":"00112233445566778899aabbccddeeff"} -->\n'
            "  Agent: test-agent | item: rm-aabbccddeeff0011 | lease until: 2026-09-22T01:30:00Z\n\n"
        )
        text = BASE_ROADMAP.replace("### Bugs\n\n", f"### Bugs\n\n{entry}")
        self.write_and_commit(text)
        code, out, err = self.run_checker(self.base_sha)
        self.assertEqual(code, 1)
        self.assertIn("Completely new titled bug", err)
        self.assertIn("budget", err)

    def test_open_after_implemented_fails(self):
        text = """# Roadmap

## Implemented

- ✅ **Old shipped feature**: stays.

## Open

### Bugs

- ⬜ **Existing short bug**: stays.
"""
        self.write_and_commit(text)
        code, out, err = self.run_checker(None)
        self.assertEqual(code, 1)
        self.assertIn("must precede", err)

    def test_no_base_skips_new_entry_check_but_still_checks_structure(self):
        code, out, err = self.run_checker(None)
        self.assertEqual(code, 0, err)
        self.assertIn("No --base given", out)


if __name__ == "__main__":
    unittest.main()
