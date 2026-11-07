# Commit as a distinct agent identity

Merged as PR 88, merge commit 4d1ddf85dc5ec664d53f81ce311aef720cc4fac3. 41 script tests pass; required PR checks passed.

Hosted CI pending for the post-merge runs on main: Secret scan 42423470103,Agent policy 42423470145,Rules 42423470065,Release 42423470152,CodeQL 42423470099,CI 42423470126.

Not done on purpose: existing history keeps the owner as author (no rewrite). The warning is advisory, so a human pairing with an agent still works.

Learning: unpushed ledger commits are lost when the control tree is switched to origin/agent-ledger; this finish had to be redone. Parallel agents also collided on the fixed Playwright port 4173 (e2e agent asked to fix), and a spec archived on the ledger branch made every ledger push run the full gate.

Reflection: directory-wide claims and stray non-metadata files on the ledger branch cost hours -> seeded: move the PDF spec to main; the hook already judges ledger pushes against main, so keep the ledger metadata-only.
