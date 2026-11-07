#!/usr/bin/env python3
"""Behavior tests for check_master_spec.py against real temporary git repositories."""

from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_master_spec as checker  # noqa: E402

SPEC = """# Spec

### Search (FR-SEARCH)

| ID | Requirement | Acceptance | Test |
| --- | --- | --- | --- |
| FR-SEARCH-001 | It MUST search. | Given a, When b, Then c. | `src/a.test.ts` |
| FR-SEARCH-002 | It MUST sort. | Given a, When b, Then c. | NONE |

<!-- traceability:start -->
<!-- traceability:end -->

<!-- coverage-gaps:start -->
<!-- coverage-gaps:end -->

<!-- change-log:start -->
- 2026-11-06: First version.
<!-- change-log:end -->
"""


class Repo:
    def __init__(self, path):
        self.path = Path(path)
        self.git("init", "-q", "-b", "main")
        self.git("config", "user.email", "test@example.invalid")
        self.git("config", "user.name", "Test")

    def git(self, *args):
        return subprocess.run(
            ["git", "-C", str(self.path), *args],
            check=True, text=True, capture_output=True,
        ).stdout.strip()

    def write(self, relative, content):
        target = self.path / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")

    def commit(self, message="change"):
        self.git("add", "-A")
        self.git("commit", "-q", "--allow-empty", "-m", message)
        return self.git("rev-parse", "HEAD")

    def seed(self):
        self.write("master-spec.md", checker.apply_traceability(SPEC))
        self.write("src/a.test.ts", "test\n")
        self.write("src/a.ts", "one\n")
        self.write("ROADMAP.md", "ledger\n")
        return self.commit("seed")


class RepoCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.repo = Repo(self.tmp.name)
        self.base = self.repo.seed()

    def add_log_entry(self, text="- 2026-11-07: Search changed."):
        spec = (self.repo.path / "master-spec.md").read_text(encoding="utf-8")
        self.repo.write(
            "master-spec.md",
            spec.replace(checker.LOG_START, f"{checker.LOG_START}\n{text}"),
        )

    def range_errors(self):
        return checker.check_range(self.repo.path, self.base, "HEAD")


class RangeTests(RepoCase):
    def test_app_change_without_spec_fails_and_names_the_path(self):
        self.repo.write("src/a.ts", "two\n")
        self.repo.commit()
        errors = self.range_errors()
        self.assertEqual(len(errors), 1)
        self.assertIn("src/a.ts", errors[0])
        self.assertIn("not master-spec.md", errors[0])

    def test_app_change_with_spec_and_dated_entry_passes(self):
        self.repo.write("src/a.ts", "two\n")
        self.add_log_entry()
        self.repo.commit()
        self.assertEqual(self.range_errors(), [])

    def test_spec_edit_without_a_new_dated_entry_fails(self):
        self.repo.write("src/a.ts", "two\n")
        spec = (self.repo.path / "master-spec.md").read_text(encoding="utf-8")
        self.repo.write("master-spec.md", spec.replace("# Spec", "# Spec edited"))
        self.repo.commit()
        errors = self.range_errors()
        self.assertEqual(len(errors), 1)
        self.assertIn("no dated", errors[0])

    def test_undated_change_log_line_does_not_count(self):
        self.repo.write("src/a.ts", "two\n")
        self.add_log_entry("- Search changed.")
        self.repo.commit()
        self.assertIn("no dated", self.range_errors()[0])

    def test_entry_outside_the_change_log_markers_does_not_count(self):
        self.repo.write("src/a.ts", "two\n")
        spec = (self.repo.path / "master-spec.md").read_text(encoding="utf-8")
        self.repo.write("master-spec.md", "- 2026-11-07: Misplaced.\n" + spec)
        self.repo.commit()
        self.assertIn("no dated", self.range_errors()[0])

    def test_ledger_only_push_is_exempt(self):
        self.repo.write("ROADMAP.md", "renewed\n")
        self.repo.write(".agents/handoffs/rm-1.md", "handoff\n")
        self.repo.commit()
        self.assertEqual(self.range_errors(), [])

    def test_test_only_push_is_exempt(self):
        self.repo.write("src/a.test.ts", "more\n")
        self.repo.commit()
        self.assertEqual(self.range_errors(), [])

    def test_range_spanning_several_commits_is_judged_as_a_whole(self):
        self.repo.write("src/a.ts", "two\n")
        self.repo.commit("code")
        self.add_log_entry()
        self.repo.commit("spec")
        self.assertEqual(self.range_errors(), [])

    def test_push_that_creates_the_spec_counts_its_entries_as_new(self):
        self.repo.git("rm", "-q", "master-spec.md")
        base = self.repo.commit("remove")
        self.repo.write("master-spec.md", checker.apply_traceability(SPEC))
        self.repo.write("src/a.ts", "two\n")
        self.repo.commit()
        self.assertEqual(checker.check_range(self.repo.path, base, "HEAD"), [])

    def test_unknown_base_raises_rather_than_passing(self):
        with self.assertRaises(checker.SpecError):
            checker.check_range(self.repo.path, "0" * 40, "HEAD")


class AppPathTests(unittest.TestCase):
    def test_application_paths(self):
        for path in (
            "src/app/App.tsx",
            "src-tauri/src/commands.rs",
            "src-tauri/tauri.conf.json",
            "android/app/src/main/AndroidManifest.xml",
            "package.json",
            ".github/workflows/ci.yml",
            "flatpak/com.leonardschwier.leotheca.yml",
        ):
            self.assertTrue(checker.is_app_path(path), path)

    def test_paths_that_do_not_change_the_application(self):
        for path in (
            "ROADMAP.md",
            ".agents/handoffs/rm-1.md",
            "CHANGELOG.md",
            "skills/README.md",
            "master-spec.md",
            "src/app/App.test.tsx",
            "src/test/setup-jsdom.ts",
            "android/app/src/test/java/Foo.java",
            "srcfoo/x.ts",
        ):
            self.assertFalse(checker.is_app_path(path), path)


class StructureTests(RepoCase):
    def structure_errors(self, text=None):
        if text is None:
            text = (self.repo.path / "master-spec.md").read_text(encoding="utf-8")
        return checker.check_structure(self.repo.path, text)

    def test_seeded_spec_is_clean(self):
        self.assertEqual(self.structure_errors(), [])

    def test_duplicate_id_fails(self):
        text = SPEC.replace("FR-SEARCH-002", "FR-SEARCH-001")
        errors = self.structure_errors(checker.apply_traceability(text))
        self.assertTrue(any("duplicate requirement id" in e for e in errors), errors)

    def test_missing_test_file_fails(self):
        (self.repo.path / "src/a.test.ts").unlink()
        errors = self.structure_errors()
        self.assertTrue(any("does not exist: src/a.test.ts" in e for e in errors), errors)

    def test_stale_traceability_fails_and_names_the_fix(self):
        text = checker.apply_traceability(SPEC).replace(
            "| FR-SEARCH-002 |", "| FR-SEARCH-003 | new | x | NONE |\n| FR-SEARCH-002 |"
        )
        errors = self.structure_errors(text)
        self.assertTrue(any("--update-traceability" in e for e in errors), errors)

    def test_pipes_in_a_cell_do_not_shift_the_test_column(self):
        text = SPEC.replace("It MUST search.", r"It MUST parse [[a\|b]].")
        rows = dict(checker.parse_requirements(text))
        self.assertEqual(checker.test_cell_paths(rows["FR-SEARCH-001"]), ["src/a.test.ts"])

    def test_generated_blocks_count_coverage_and_list_gaps(self):
        table, gaps = checker.render_traceability(SPEC)
        self.assertIn("| FR-SEARCH | Search | 2 | 1 | 1 | `src/a.test.ts` |", table)
        self.assertEqual(gaps, "- FR-SEARCH-002")

    def test_update_is_idempotent(self):
        once = checker.apply_traceability(SPEC)
        self.assertEqual(checker.apply_traceability(once), once)


class MainTests(RepoCase):
    def test_exit_codes(self):
        root = str(self.repo.path)
        self.assertEqual(checker.main(["--root", root]), 0)
        self.assertEqual(checker.main(["--root", root, "--base", self.base]), 0)
        self.repo.write("src/a.ts", "two\n")
        self.repo.commit()
        self.assertEqual(checker.main(["--root", root, "--base", self.base]), 1)
        self.assertEqual(checker.main(["--root", root, "--base", "0" * 40]), 2)

    def test_missing_spec_fails(self):
        (self.repo.path / "master-spec.md").unlink()
        self.assertEqual(checker.main(["--root", str(self.repo.path)]), 1)


if __name__ == "__main__":
    unittest.main()
