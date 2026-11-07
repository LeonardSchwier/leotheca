#!/usr/bin/env python3
"""Behavioral tests for check_ledger_evidence.py.

Run: PYTHONDONTWRITEBYTECODE=1 python3 scripts/test_check_ledger_evidence.py
"""

from contextlib import redirect_stderr, redirect_stdout
import importlib.util
import io
from pathlib import Path
import sys
import unittest

sys.dont_write_bytecode = True
HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
SPEC = importlib.util.spec_from_file_location("check_ledger_evidence", HERE / "check_ledger_evidence.py")
checker = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(checker)


def item(item_id, state, note="", completed_at="2026-11-08T10:00:00Z"):
    return {"title": f"Title {item_id}", "metadata": {"id": item_id, "state": state, "note": note, "completed_at": completed_at}}


class EvidenceProblems(unittest.TestCase):
    def test_accepts_a_workflow_name_followed_by_a_run_id(self):
        self.assertEqual(checker.evidence_problems("Hosted: CI run 42340859598 and Rules 42340859572 success."), [])

    def test_accepts_the_explicit_unavailable_statement(self):
        self.assertEqual(checker.evidence_problems("Local checks pass; hosted CI unavailable (queue stuck)."), [])

    def test_rejects_a_note_without_any_run_id(self):
        self.assertEqual(len(checker.evidence_problems("Done, all tests pass, CI is green.")), 1)

    def test_rejects_an_empty_or_missing_note(self):
        self.assertEqual(len(checker.evidence_problems("")), 1)
        self.assertEqual(len(checker.evidence_problems(None)), 1)

    def test_a_short_number_is_not_a_run_id(self):
        self.assertEqual(len(checker.evidence_problems("CI run 12345 passed")), 1)

    def test_a_long_number_far_from_a_workflow_name_is_not_a_run_id(self):
        far = "Some commit message " + "x" * 80 + " 42340859598"
        self.assertEqual(len(checker.evidence_problems(far)), 1)


class Selection(unittest.TestCase):
    def test_newly_done_ignores_items_that_were_already_done(self):
        base = [item("a", "done"), item("b", "claimed")]
        current = [item("a", "done"), item("b", "done"), item("c", "done")]
        self.assertEqual([i["metadata"]["id"] for i in checker.newly_done(current, base)], ["b", "c"])

    def test_done_since_uses_the_completion_date(self):
        items = [item("old", "done", completed_at="2026-09-01T00:00:00Z"), item("new", "done", completed_at="2026-11-08T00:00:00Z"), item("open", "claimed")]
        self.assertEqual([i["metadata"]["id"] for i in checker.done_since(items, "2026-11-01")], ["new"])

    def test_problems_for_names_each_offender(self):
        found = checker.problems_for([item("x", "done", "no evidence"), item("y", "done", "CI 42340859598")])
        self.assertEqual(len(found), 1)
        self.assertIn("x", found[0])


class RealRoadmap(unittest.TestCase):
    def run_main(self, *args):
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            code = checker.main(["--root", str(HERE.parent), *args])
        return code, out.getvalue(), err.getvalue()

    def test_parses_the_real_roadmap_and_a_future_cutoff_passes(self):
        code, out, _ = self.run_main("--since", "2099-01-01")
        self.assertEqual(code, 0)
        self.assertIn("0 item(s)", out)

    def test_the_real_roadmap_has_finished_items_to_audit(self):
        items = checker.load_items(HERE.parent / "ROADMAP.md")
        done = checker.done_items(items)
        self.assertGreater(len(done), 10)

    def test_head_against_itself_has_nothing_newly_done(self):
        code, out, _ = self.run_main("--base", "HEAD")
        self.assertEqual(code, 0)
        self.assertIn("0 item(s)", out)


if __name__ == "__main__":
    unittest.main()
