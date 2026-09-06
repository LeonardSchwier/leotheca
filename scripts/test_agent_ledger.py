#!/usr/bin/env python3
"""Behavioral lease tests, including real competing fast-forward Git pushes.

Run: PYTHONDONTWRITEBYTECODE=1 python3 scripts/test_agent_ledger.py
Set TMPDIR to a writable workspace directory when the system temp dir is denied.
"""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


sys.dont_write_bytecode = True
SPEC = importlib.util.spec_from_file_location("agent_ledger", Path(__file__).with_name("agent_ledger.py"))
ledger = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ledger)
NOW = datetime(2026, 9, 6, 12, 0, tzinfo=timezone.utc)
CONFIG = "# Constitution\n<!-- agent-config:start -->\n```json\n{}\n```\n<!-- agent-config:end -->\n"
ROADMAP = """# Roadmap

Intro stays byte-for-byte.

## Implemented

- ✅ **Old feature**: Existing history stays.

## Open

### Bugs

- ⬜ **Alpha**: First line with `code`.
  A continuation paragraph with café.

  - Nested list entry, including **bold**.
  Last line of Alpha.

- ⬜ **Beta**: A separate task.

### Features

- 🚧 **Legacy** (claim: old-session, branch: `agent/missing`): Keep original claim prose.
  Old notes remain useful.

- ⬜ **Gamma**: Another task.
"""


def git(root, *args, check=True):
    return subprocess.run(["git", "-C", str(root), *args], text=True, capture_output=True, check=check)


class LeaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix=".agent-ledger-test-", dir=os.environ.get("TMPDIR", str(Path.cwd())))
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.root = self.base / "checkout"
        self.root.mkdir()
        git(self.root, "init", "-q", "-b", "main")
        self.configure(self.root)
        (self.root / "CONSTITUTION.md").write_text(CONFIG, encoding="utf-8")
        (self.root / "ROADMAP.md").write_text(ROADMAP, encoding="utf-8")
        self.commit()

    @staticmethod
    def configure(root):
        git(root, "config", "user.name", "Lease Test")
        git(root, "config", "user.email", "lease-test@example.invalid")

    def commit(self, root=None):
        root = root or self.root
        git(root, "add", "--all")
        git(root, "commit", "-q", "-m", "Record local test transaction")

    def act(self, command, now=NOW, root=None, **kwargs):
        return ledger.Ledger(root or self.root, now).execute(command, **kwargs)

    def claim(self, title="Alpha", agent="test-session-a", touch=None, now=NOW, root=None, resource=None):
        return self.act("claim", now=now, root=root, title=title, agent=agent, touch=touch or ["src/alpha"], resource=resource or [])["metadata"]

    def owned(self, command, state, now=NOW, **kwargs):
        return self.act(command, now=now, id=state["id"], token=state["token"], **kwargs)

    def test_claim_requires_clean_tree_and_check_works_in_dirty_implementation(self):
        state = self.claim()
        self.assertEqual(state["owner"], "test-session-a")
        self.assertIn(f"agent/{state['id']}/", state["branch"])
        self.assertTrue(self.owned("check", state)["valid"])
        self.assertEqual(len(self.act("list")["items"]), 5)
        with self.assertRaisesRegex(ledger.LedgerError, "dirty"):
            self.claim(title="Beta", agent="another", touch=["src/beta"])
        self.assertEqual(git(self.root, "log", "--format=%s").stdout.count("Record local test transaction"), 1)

    def test_unrelated_dirty_files_are_rejected_before_any_roadmap_write(self):
        before = (self.root / "ROADMAP.md").read_bytes()
        (self.root / "uncommitted-work.txt").write_text("Another task's work")
        with self.assertRaisesRegex(ledger.LedgerError, "dirty"):
            self.claim()
        self.assertEqual((self.root / "ROADMAP.md").read_bytes(), before)

    def test_touch_path_and_semantic_collisions(self):
        self.claim(touch=["src/editor"], resource=["Save-Pipeline"])
        self.commit()
        for path in ("src/editor", "src/editor/nested/save.ts", "src", "."):
            with self.subTest(path=path), self.assertRaisesRegex(ledger.LedgerError, "overlap"):
                self.claim(title="Beta", agent="session-b", touch=[path])
        with self.assertRaisesRegex(ledger.LedgerError, "Resource overlap"):
            self.claim(title="Beta", agent="session-b", touch=["unrelated.ts"], resource=["save-pipeline"])
        state = self.claim(title="Beta", agent="session-b", touch=["src/editorial/view.ts"])
        self.assertEqual(state["touch"], ["src/editorial/view.ts"])

    def test_exact_file_is_reserved_but_sibling_file_is_independent(self):
        self.claim(touch=["src/App.tsx"])
        self.commit()
        with self.assertRaisesRegex(ledger.LedgerError, "overlap"):
            self.claim(title="Beta", agent="session-b", touch=["src/App.tsx"])
        self.claim(title="Beta", agent="session-b", touch=["src/Sidebar.tsx"])

    def test_one_live_claim_per_agent_and_stable_identity_after_release(self):
        first = self.claim()
        self.commit()
        with self.assertRaisesRegex(ledger.LedgerError, "already owns"):
            self.claim(title="Beta", touch=["src/beta"])
        self.owned("release", first, note="Handed back while locating dependency")
        self.commit()
        second = self.claim()
        self.assertEqual(first["id"], second["id"])
        self.assertNotEqual(first["token"], second["token"])
        self.assertEqual(second["note"], "Handed back while locating dependency")
        for command in ("check", "renew", "release", "block", "finish"):
            with self.subTest(command=command), self.assertRaisesRegex(ledger.LedgerError, "Stale token"):
                self.owned(command, first, note="An old process woke up")

    def test_owner_expiry_and_takeover_boundaries_include_clock_skew(self):
        original = self.claim()
        self.commit()
        self.assertTrue(self.owned("check", original, now=NOW + timedelta(minutes=84, seconds=59))["valid"])
        for command in ("check", "renew", "release", "block", "finish"):
            with self.subTest(command=command), self.assertRaisesRegex(ledger.LedgerError, "expired"):
                self.owned(command, original, now=NOW + timedelta(minutes=85), note="Too late")
        with self.assertRaisesRegex(ledger.LedgerError, "already claimed"):
            self.claim(agent="replacement", now=NOW + timedelta(minutes=94, seconds=59))
        replacement = self.claim(agent="replacement", now=NOW + timedelta(minutes=95))
        self.assertEqual(replacement["id"], original["id"])
        self.assertNotEqual(replacement["token"], original["token"])
        self.commit()
        with self.assertRaisesRegex(ledger.LedgerError, "Stale token"):
            self.owned("renew", original, now=NOW + timedelta(minutes=95))

    def test_expired_owner_must_claim_a_new_token_even_without_a_successor(self):
        state = self.claim()
        self.commit()
        with self.assertRaisesRegex(ledger.LedgerError, "expired"):
            self.owned("renew", state, now=NOW + timedelta(hours=3))
        reclaimed = self.claim(now=NOW + timedelta(hours=3))
        self.assertNotEqual(reclaimed["token"], state["token"])
        self.assertEqual(git(self.root, "branch", "--list", "agent/*").stdout, "")

    def test_renew_preserves_scope_and_note_and_check_supports_margin(self):
        state = self.claim(resource=["editor-save"])
        self.commit()
        renewed = self.owned("renew", state, now=NOW + timedelta(minutes=15))["metadata"]
        self.assertEqual(renewed["token"], state["token"])
        self.assertEqual(renewed["touch"], state["touch"])
        self.assertEqual(renewed["resources"], ["editor-save"])
        self.assertEqual(renewed["lease_until"], "2026-09-06T13:45:00Z")
        self.assertTrue(self.owned("check", state, now=NOW + timedelta(minutes=15), margin_minutes=84)["valid"])
        with self.assertRaisesRegex(ledger.LedgerError, "insufficient"):
            self.owned("check", state, now=NOW + timedelta(minutes=15), margin_minutes=85)
        with self.assertRaisesRegex(ledger.LedgerError, "nonnegative"):
            self.owned("check", state, margin_minutes=-1)

    def test_block_releases_scope_until_retry_and_preserves_note(self):
        first = self.claim()
        self.commit()
        blocked = self.owned("block", first, note="Runner unavailable; retry automatically")["metadata"]
        self.assertEqual(blocked["retry_at"], "2026-09-06T13:00:00Z")
        self.assertNotIn("owner", blocked)
        self.commit()
        with self.assertRaisesRegex(ledger.LedgerError, "not due"):
            self.claim(now=NOW + timedelta(minutes=64, seconds=59))
        # Ownership is released, so another task may use the same scope now.
        self.claim(title="Beta", agent="session-b")
        self.commit()
        with self.assertRaisesRegex(ledger.LedgerError, "overlap"):
            self.claim(now=NOW + timedelta(minutes=65))

    def test_block_can_be_reclaimed_at_retry_boundary(self):
        state = self.claim()
        self.commit()
        self.owned("block", state, note="Dependency unavailable")
        self.commit()
        reopened = self.claim(now=NOW + timedelta(minutes=65))
        self.assertEqual(reopened["note"], "Dependency unavailable")
        self.assertNotEqual(reopened["token"], state["token"])

    def test_legacy_observation_is_finite_and_cannot_be_extended(self):
        self.assertTrue(any("Legacy" in warning for warning in self.act("list")["warnings"]))
        with self.assertRaisesRegex(ledger.LedgerError, "Observe a legacy"):
            self.claim(title="Legacy")
        observed = self.act("observe", title="Legacy", touch=["src/legacy"], resource=[], note="Inspected old prose; branch is missing")["metadata"]
        self.assertNotIn("owner", observed)
        self.assertEqual(observed["lease_until"], "2026-09-06T14:00:00Z")
        self.commit()
        with self.assertRaisesRegex(ledger.LedgerError, "overlap"):
            self.claim(touch=["src/legacy/parser.ts"])
        before = (self.root / "ROADMAP.md").read_bytes()
        again = self.act("observe", now=NOW + timedelta(hours=1), title="Legacy", touch=["src/legacy"], resource=[], note="Inspected old prose; branch is missing")
        self.assertTrue(again["unchanged"])
        self.assertEqual((self.root / "ROADMAP.md").read_bytes(), before)
        with self.assertRaisesRegex(ledger.LedgerError, "already claimed"):
            self.claim(title="Legacy", now=NOW + timedelta(minutes=124, seconds=59))
        reclaimed = self.claim(title="Legacy", now=NOW + timedelta(minutes=125))
        self.assertEqual(reclaimed["id"], observed["id"])
        self.assertIn("Keep original claim prose", (self.root / "ROADMAP.md").read_text())

    def test_legacy_scope_can_widen_without_extending_grace_or_hiding_conflicts(self):
        observed = self.act("observe", title="Legacy", touch=["src/legacy"], resource=[], note="Initial evidence")["metadata"]
        self.commit()
        active = self.claim(resource=["editor-state"])
        self.commit()
        later = NOW + timedelta(minutes=15)
        widened = self.act("observe", now=later, title="Legacy", touch=["src/alpha"],
                           resource=["editor-state"], note="Discovered shared caller")["metadata"]
        self.assertEqual(widened["id"], observed["id"])
        self.assertEqual(widened["observed_at"], observed["observed_at"])
        self.assertEqual(widened["lease_until"], observed["lease_until"])
        self.assertEqual(widened["touch"], ["src/alpha", "src/legacy"])
        self.assertEqual(widened["resources"], ["editor-state"])
        self.assertEqual(widened["note"], "Discovered shared caller")
        self.commit()
        with self.assertRaisesRegex(ledger.LedgerError, "Scope now overlaps"):
            self.owned("check", active, now=later)
        # A conflicting owner can still release safely instead of being trapped.
        self.owned("release", active, now=later, note="Yield to newly observed legacy scope")
        self.commit()
        with self.assertRaisesRegex(ledger.LedgerError, "overlap"):
            self.claim(title="Beta", agent="new-session", touch=["src/alpha"], now=later)

    def test_claim_and_renew_preserve_every_unrelated_byte_and_existing_note(self):
        state = self.claim()
        self.commit()
        self.owned("release", state, note="Prior result: café, -- and --> remain data")
        self.commit()
        state = self.claim()
        self.commit()
        state = self.owned("renew", state, now=NOW + timedelta(minutes=15))["metadata"]
        self.assertEqual(state["note"], "Prior result: café, -- and --> remain data")
        text = (self.root / "ROADMAP.md").read_text()
        prose = "".join(line for line in text.splitlines(keepends=True)
                        if not line.startswith("  <!-- agent-state:") and not line.startswith("  Agent: "))
        self.assertEqual(prose.replace("- 🚧 **Alpha**", "- ⬜ **Alpha**"), ROADMAP)

    def test_cli_reports_local_results_and_stale_tokens_with_nonzero_exit(self):
        script = Path(__file__).with_name("agent_ledger.py")
        prefix = [sys.executable, str(script), "--root", str(self.root)]
        claimed = subprocess.run(prefix + ["claim", "--title", "Alpha", "--agent", "cli-session", "--touch", "src/alpha"],
                                 text=True, capture_output=True, check=True)
        result = json.loads(claimed.stdout)
        self.assertTrue(result["local_only"])
        state = result["metadata"]
        checked = subprocess.run(prefix + ["check", "--id", state["id"], "--token", state["token"], "--margin-minutes", "10"],
                                 text=True, capture_output=True, check=True)
        self.assertTrue(json.loads(checked.stdout)["valid"])
        stale = subprocess.run(prefix + ["check", "--id", state["id"], "--token", "0" * 32], text=True, capture_output=True)
        self.assertEqual(stale.returncode, 2)
        self.assertIn("Stale token", json.loads(stale.stderr)["error"])

    def test_duplicate_titles_and_ids_fail_closed(self):
        path = self.root / "ROADMAP.md"
        path.write_text(ROADMAP + "\n- ⬜ **Alpha**: Duplicate title.\n", encoding="utf-8")
        self.commit()
        with self.assertRaisesRegex(ledger.LedgerError, "duplicate exact titles"):
            self.claim()
        path.write_text(ROADMAP, encoding="utf-8")
        self.commit()
        state = self.claim()
        self.commit()
        text = path.read_text()
        metadata = next(line for line in text.splitlines() if "<!-- agent-state:" in line)
        path.write_text(text.replace("- ⬜ **Beta**: A separate task.", "- 🚧 **Beta**: A separate task.\n" + metadata))
        self.commit()
        with self.assertRaisesRegex(ledger.LedgerError, "Duplicate item IDs"):
            self.owned("check", state)

    def test_malformed_unknown_nonadjacent_and_duplicate_metadata_fail_closed(self):
        path = self.root / "ROADMAP.md"
        original = path.read_bytes()
        additions = [
            "  <!-- agent-state: {broken} -->\n",
            '  <!-- agent-state: {"schema":999} -->\n',
            '  <!-- agent-state: {"schema":1,"schema":1} -->\n',
            "  <!-- agent-state: {} --> trailing\n",
            "  <!-- agent-state {} -->\n",
        ]
        for addition in additions:
            with self.subTest(addition=addition):
                path.write_bytes(original.replace(b"- \xe2\xac\x9c **Beta**: A separate task.\n", ("- ⬜ **Beta**: A separate task.\n" + addition).encode()))
                with self.assertRaises(ledger.LedgerError):
                    self.act("list")
        path.write_bytes(original)
        state = self.claim()
        metadata = next(line for line in path.read_text().splitlines(keepends=True) if "<!-- agent-state:" in line)
        for replacement in ("  An intervening paragraph.\n" + metadata, metadata + metadata):
            path.write_text(original.decode().replace("- ⬜ **Alpha**: First line with `code`.\n", "- 🚧 **Alpha**: First line with `code`.\n" + replacement))
            with self.assertRaisesRegex(ledger.LedgerError, "nonadjacent"):
                self.act("list")

    def test_finish_moves_entire_item_without_swallowing_a_heading(self):
        state = self.claim()
        self.commit()
        self.owned("finish", state, note="Regression and applicable checks passed; commit abc123")
        text = (self.root / "ROADMAP.md").read_text()
        self.assertLess(text.index("- ✅ **Alpha**"), text.index("## Open"))
        for prose in ("First line with `code`.", "A continuation paragraph with café.", "- Nested list entry, including **bold**.", "Last line of Alpha."):
            self.assertEqual(text.count(prose), 1)
            self.assertLess(text.index(prose), text.index("## Open"))
        unchanged_tail = ROADMAP[ROADMAP.index("- ⬜ **Beta**"):]
        self.assertTrue(text.endswith(unchanged_tail))
        self.assertEqual(text.count("### Features"), 1)
        with self.assertRaisesRegex(ledger.LedgerError, "Stale token"):
            self.owned("finish", state, note="Duplicate completion")

    def test_finish_item_directly_before_heading_and_crlf_preservation(self):
        path = self.root / "ROADMAP.md"
        path.write_bytes(ROADMAP.replace("\n", "\r\n").encode())
        self.commit()
        state = self.claim(title="Beta", touch=["src/beta"])
        self.commit()
        self.owned("finish", state, note="Passed\nPreserve note with --> markup")
        output = path.read_bytes()
        self.assertNotIn(b"\n", output.replace(b"\r\n", b""))
        self.assertIn(b"### Features\r\n\r\n-", output)
        completed = self.act("list")["items"]
        self.assertEqual(next(item for item in completed if item["title"] == "Beta")["metadata"]["note"], "Passed\nPreserve note with --> markup")

    def test_configuration_changes_lease_and_roadmap_path(self):
        (self.root / "PLAN.md").write_text(ROADMAP)
        config = {"roadmap_file": "PLAN.md", "lease_minutes": 30, "heartbeat_minutes": 5, "clock_skew_minutes": 1, "main_branch": "trunk", "handoff_dir": ".agents/handoffs"}
        (self.root / "CONSTITUTION.md").write_text(CONFIG.replace("{}", json.dumps(config)))
        self.commit()
        state = self.claim()
        self.assertEqual(state["lease_until"], "2026-09-06T12:30:00Z")
        self.assertEqual((self.root / "ROADMAP.md").read_text(), ROADMAP)

    def test_invalid_scope_and_config_cannot_escape_checkout(self):
        for path in ("../elsewhere", "/etc/passwd", "src/../other", "src/*.ts", "C:/escape", ".git/config", "src\\file.ts"):
            with self.subTest(path=path), self.assertRaises(ledger.LedgerError):
                self.claim(touch=[path])
        (self.root / "CONSTITUTION.md").write_text(CONFIG.replace("{}", '{"roadmap_file":"../escape.md"}'))
        self.commit()
        with self.assertRaisesRegex(ledger.LedgerError, "Unsafe touch path"):
            self.act("list")

    def test_simultaneous_fast_forward_claims_have_exactly_one_winner(self):
        remote = self.base / "remote.git"
        subprocess.run(["git", "init", "--bare", "-q", "-b", "main", str(remote)], check=True)
        git(self.root, "remote", "add", "origin", str(remote))
        git(self.root, "push", "-q", "-u", "origin", "main")
        competitors = []
        for number in range(2):
            checkout = self.base / f"agent-{number}"
            subprocess.run(["git", "clone", "-q", str(remote), str(checkout)], check=True)
            self.configure(checkout)
            state = self.claim(agent=f"session-{number}", root=checkout)
            self.commit(checkout)
            competitors.append((checkout, state))
        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(lambda entry: git(entry[0], "push", "origin", "HEAD:main", check=False), competitors))
        self.assertEqual(sum(result.returncode == 0 for result in results), 1)
        winner = next(entry for entry, result in zip(competitors, results) if result.returncode == 0)
        loser = next(entry for entry, result in zip(competitors, results) if result.returncode != 0)
        # Discard only this isolated test contender's unaccepted claim commit.
        git(loser[0], "fetch", "-q", "origin", "main")
        git(loser[0], "reset", "--hard", "origin/main")
        with self.assertRaisesRegex(ledger.LedgerError, "already claimed"):
            self.claim(agent=loser[1]["owner"], root=loser[0])
        with self.assertRaisesRegex(ledger.LedgerError, "Stale token"):
            self.act("check", root=loser[0], id=winner[1]["id"], token=loser[1]["token"])
        # The winner may die without pushing a branch. Expiry alone permits recovery.
        recovered = self.claim(agent=loser[1]["owner"], root=loser[0], now=NOW + timedelta(minutes=95))
        self.assertEqual(recovered["id"], winner[1]["id"])
        self.assertNotEqual(recovered["token"], winner[1]["token"])
        self.commit(loser[0])
        git(loser[0], "push", "-q", "origin", "HEAD:main")
        self.assertEqual(git(remote, "for-each-ref", "refs/heads/agent/").stdout, "")


if __name__ == "__main__":
    unittest.main(verbosity=2)
