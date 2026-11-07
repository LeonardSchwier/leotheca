Task: rm-fbcbd094e7cc8498 - Constitution and index pointers
Owner/token: released (finished)
Scope: CONSTITUTION.md, skills/pdlc-playbook.md, skills/security-and-static-analysis.md, skills/README.md, hooks/README.md
Acceptance: Master specification rule in the constitution pointing at skills/master-spec-maintenance.md and CI check; playbook link; security skill constitution reference and README row; text-rights and database skills referenced from the constitution; hooks/README.md e2e statement corrected; no rule weakened
Landed: 9a57542, c15b1e0, 6eb2dc7 on main (two follow-ups fixed Rules findings: an em dash and prettier table alignment in skills/README.md)
Checks: prettier --check on all five files (clean); node scripts/check-rules.mjs lines origin/main HEAD (clean); hosted Rules and Agent policy on 6eb2dc7 both success
CI: hosted CI and Release on 6eb2dc7 were queued at finish time; change is docs only
Missing evidence: none for the changed content
Note: the pre-push e2e smoke still skips until the root package.json gains a test:e2e script (package.json is owned by another agent); hooks/README.md says so truthfully
Next action: none
