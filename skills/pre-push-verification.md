<!-- Variables: read CONSTITUTION.md's remote, main_branch. TOOL = scripts/agent_ledger.py -->

# Pre-push verification gate

A concrete, mechanical checklist, not a restatement of general care. Read it before every push to the configured main branch. It applies even to a change that looks obviously correct — that feeling is exactly the failure mode this gate exists to catch, evidenced below.

## The gate

1. Identify every command `skills/verification-suite.md`'s applicable-checks table requires for your changed surface.
2. Run every one of them, in this session, against the exact working tree you are about to push. Not "the same class of check I ran earlier." Not "I'm confident this passes." Run it now, on this tree.
3. Read the actual output. A command that exits 0 with no new failures is evidence. A command you did not run is not evidence, no matter how small or obviously-correct the change looks.
4. If anything fails, fix the real cause and return to step 2. Never push while a check you could run locally is still red.
5. Only once every applicable check is genuinely green in this session, push.

## Never do these, whatever the time pressure

- Never write "already handles this correctly," "already works," or an equivalent claim in a commit message unless you executed that exact case in this session and watched it pass. If you haven't run it, don't claim it: run it first, or say plainly that it is unverified.
- Never push a second speculative fix for a CI failure without first reading the actual failing job's log and quoting the real error text. A second guess without that is a sign you are pattern-matching instead of diagnosing. Stop, fetch the log, identify the literal failure, then write the fix.
- Never treat hosted CI as your first test runner. It re-confirms what you already verified locally; it is not where you find out for the first time whether a change works. A local command finishes in seconds; a CI cycle costs everyone minutes with `main` red the whole time, and a chain of such pushes compounds that cost across every commit in the chain.
- Never hand-author `TOOL`'s ledger/`agent-state` metadata by guessing its shape. Always call the actual helper. If it errors, the error is the thing to fix — read the traceback, correct the real input — never a reason to write the JSON block by hand instead. A malformed entry breaks ledger commands for every agent, not only the task that wrote it.

## A concrete case from this repository (do not repeat this pattern)

On 2026-09-07, in this exact repository: a regex meant to trim leading/trailing dots and spaces from a filename was ported from a Java string-embedded pattern (`"^[.\\s]+"`, which Java's string-escape processing correctly turns into the regex `^[.\s]+`) into a JS/TS regex *literal* using the same double backslash (`/^[.\\s]+/`). That is a different, wrong pattern in a regex literal — `\\s` there means a literal backslash followed by a literal "s", never whitespace — because a regex literal and a string that gets re-parsed into a regex follow different escaping rules. The commit that introduced this was never run against the behavior it touched. A later commit re-enabled the very test that would have caught it, again without running it before pushing, and asserted in its own message that the function "already handles [this] correctly." It did not; that push broke `main`'s CI. Neither commit ran the one command (`npx vitest run <the affected file>`) that would have caught this in seconds. The lesson isn't "double-check regex escaping" — it's that this gate's step 2 was skipped twice in a row.

The same day (2026-09-07), a separate incident: a direct-to-main commit hand-wrote its own ledger `agent-state` comment instead of calling the actual helper script, using an `id` and `branch` shape that didn't match what the helper requires. Every ledger command parses and validates every entry before doing anything else, so this one malformed entry silently broke `list`/`claim`/`check`/`finish` for every agent — not a misrepresentation of one task's state, a break in the shared tool everyone depends on.
