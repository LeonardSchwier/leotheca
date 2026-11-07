import unittest

import integrator_report as ir

GREEN = [{"conclusion": "SUCCESS", "status": "COMPLETED"}, {"conclusion": "SKIPPED", "status": "COMPLETED"}]
RED = [{"conclusion": "FAILURE", "status": "COMPLETED"}]
RUNNING = [{"conclusion": "", "status": "IN_PROGRESS"}]


def pr(branch="agent/rm-aa11/abc", rollup=GREEN, mergeable="MERGEABLE", draft=False):
    return {"number": 1, "headRefName": branch, "statusCheckRollup": rollup,
            "mergeable": mergeable, "isDraft": draft}


class ChecksStateTest(unittest.TestCase):
    def test_states(self):
        self.assertEqual(ir.checks_state(GREEN), "green")
        self.assertEqual(ir.checks_state(RED), "red")
        self.assertEqual(ir.checks_state(RUNNING), "pending")
        self.assertEqual(ir.checks_state(GREEN + RUNNING), "pending")
        self.assertEqual(ir.checks_state(GREEN + RED), "red")
        self.assertEqual(ir.checks_state([]), "green")


class ClassifyTest(unittest.TestCase):
    live = {"rm-aa11"}

    def action(self, p, live=None):
        return ir.classify(p, self.live if live is None else live)[0]

    def test_foreign_branches_are_ignored(self):
        self.assertEqual(self.action(pr("dependabot/npm_and_yarn/x")), "ignore")
        self.assertEqual(self.action(pr("feature/mine")), "ignore")

    def test_live_owner_keeps_their_pull_request(self):
        self.assertEqual(self.action(pr(rollup=RED)), "owner")
        self.assertEqual(self.action(pr(mergeable="CONFLICTING")), "owner")
        self.assertEqual(self.action(pr()), "owner")

    def test_dead_owner_red_or_conflicting_is_repaired(self):
        self.assertEqual(self.action(pr(rollup=RED), set()), "repair")
        self.assertEqual(self.action(pr(mergeable="CONFLICTING"), set()), "repair")
        self.assertEqual(self.action(pr(draft=True), set()), "repair")

    def test_dead_owner_green_is_merged(self):
        self.assertEqual(self.action(pr(), set()), "merge")

    def test_running_checks_wait(self):
        self.assertEqual(self.action(pr(rollup=RUNNING), set()), "wait")
        self.assertEqual(self.action(pr(rollup=RUNNING)), "wait")


if __name__ == "__main__":
    unittest.main()
