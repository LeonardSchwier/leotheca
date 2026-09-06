# Skill: Multi-Agent Autonomous Coordination Protocol

**PURPOSE**: This file defines the exact protocol for MULTIPLE agents working SIMULTANEOUSLY in this repository. Every agent MUST follow this protocol to ensure:
- Zero human intervention required (no pull requests, no manual merges)
- No duplicate work (agents never work on the same feature)
- No blocked agents (agents find and solve their own blockers)
- Zero quality compromise (production-ready code every time)

**AUDIENCE**: All coding agents (Mistral Vibe, Claude Code, Codex, OpenCode, etc.) regardless of capability level. This protocol is written to be understandable by lower-capability models.

**PRIORITY ORDER**:
1. This file (specific multi-agent protocol)
2. `CONSTITUTION.md` (general project rules)
3. Other skill files (mechanical procedures)

If this file conflicts with `CONSTITUTION.md`, `CONSTITUTION.md` wins and this file must be corrected immediately.

---

## 1. AGENT STARTUP PROTOCOL

Every agent session MUST begin with these steps in this exact order:

### 1.1 Environment Setup (5 minutes max)
- Ensure git is available: `git --version`
- Ensure node/npm: `node --version`, `npm --version`
- If Rust is needed and missing: install via `skills/verification-suite.md` Cloud bootstrap
- Clone/update repository: `git clone https://github.com/LeonardSchwier/leotheca.git` or `git pull origin main`
- Switch to main branch: `git checkout main`

### 1.2 State Synchronization (CRITICAL)
```bash
# ALWAYS start with fresh remote state
git fetch origin main
git reset --hard origin/main
```

**NEVER** work from stale local state. This prevents merge conflicts and ensures all agents see the same truth.

### 1.3 Read Authoritative Files (MANDATORY)
Read these files IN THIS ORDER before any other action:
1. `CONSTITUTION.md` (full file, no skipping)
2. This file (`skills/multi-agent-autonomous-coordination.md`)
3. `ROADMAP.md` (full file, top to bottom)
4. `skills/roadmap-workflow.md` (for single-item mechanics)
5. `skills/verification-suite.md` (for testing requirements)

**LOW-CAPABILITY NOTE**: If you cannot read all these files due to context limits, read at minimum:
- `CONSTITUTION.md` sections: "Parallel agent coordination", "Engineering practices", "Guardrails against known agentic-AI failure modes"
- This file sections: "1. Agent Startup Protocol", "2. Work Selection Protocol", "3. Claim Mechanism"
- `ROADMAP.md` first 100 lines

---

## 2. WORK SELECTION PROTOCOL

### 2.1 Find Eligible Work

**ELIGIBLE WORK DEFINITION**: An item is eligible if ALL these are true:
- Status is `⬜` (unclaimed)
- Not in "High-risk feature categories" from CONSTITUTION.md (sync, telemetry, encryption, accounts, third-party code execution)
- No overlapping touch-set with any currently `🚧` item
- Not blocked on maintainer sign-off (check CONSTITUTION.md "High-risk feature categories")
- Not blocked on external dependencies

**SEARCH ORDER**: Always check in this exact order:
1. `## Open Bugs` - top to bottom
2. `## Open Features` - top to bottom
3. Stop at first eligible item. Do NOT skip ahead.

### 2.2 Overlap Detection (PREVENT DUPLICATE WORK)

Before claiming any item, check for overlap:

```bash
# For each currently 🚧 item:
# 1. Get its branch name from the claim
# 2. Check if branch exists on remote
# 3. If exists, fetch and examine its diff
git fetch origin agent/<work-item-slug>
git diff origin/main..origin/agent/<work-item-slug> --name-only
```

If ANY file in the eligible item's expected touch-set appears in ANY `🚧` branch diff, **SKIP** this item and check the next one.

**EXAMPLE**: If you plan to work on "Markdown tables" which touches `src/editor/table.ts`, and there's a `🚧` claim for "Advanced text formatting" whose branch diff includes `src/editor/table.ts`, then SKIP the Markdown tables item.

### 2.3 Blocked Item Handling

If the first eligible item is blocked:
- If blocked on maintainer sign-off: SKIP, record in agent log, check next item
- If blocked on external dependency: SKIP, check next item  
- If blocked on another `🚧` item: SKIP, check next item
- If blocked on CI/environment: **FIX THE BLOCKER FIRST** (see section 6)

Do NOT mark an item as "blocked" in ROADMAP.md unless the blocker is EXTERNAL (maintainer decision, unavailable credentials, etc.). Internal blockers (missing tests, merge conflicts) must be FIXED, not SKIPPED.

---

## 3. CLAIM MECHANISM (MUTUAL EXCLUSION LOCK)

### 3.1 Claim Format

To claim an item, you MUST edit ROADMAP.md and change:
```markdown
- ⬜ **Item Name** description here
```

To:
```markdown
- 🚧 **Item Name** claim: <AGENT-ID>, <UTC-TIMESTAMP>, branch: agent/<work-item-slug>
```

**AGENT-ID FORMAT**: `<TOOL>-<MODE>-<SESSION-HASH>`
- `<TOOL>`: `MistralVibe`, `ClaudeCode`, `Codex`, `OpenCode`, etc.
- `<MODE>`: `cloud`, `local`, `scheduled`, `manual`
- `<SESSION-HASH>`: First 8 characters of your session ID if available, otherwise a random 8-char alphanumeric

**EXAMPLE**: `claim: MistralVibe-cloud-ABC12345, 2026-09-06T14:30:00Z, branch: agent/markdown-tables-fix`

### 3.2 Claim Process (ATOMIC)

1. **LOCAL PREPARATION** (no git changes yet):
   - Create your work item slug: lowercase, hyphens, max 50 chars
   - Generate your agent ID and timestamp
   - Prepare the exact claim text

2. **ATTEMPT CLAIM ON MAIN**:
   ```bash
   # Ensure you're on main and up to date
   git checkout main
   git fetch origin main
   git reset --hard origin/main
   
   # Edit ROADMAP.md with your claim
   # Change ⬜ to 🚧 and add claim details
   
   # Commit ONLY the ROADMAP.md change
   git add ROADMAP.md
   git commit -m "claim: <item-name> by <agent-id>"
   
   # Push to main - this is your lock acquisition
   git push origin main
   ```

3. **CLAIM SUCCESS**: If push succeeds, you now OWN this item. No other agent can work on it.

4. **CLAIM FAILURE**: If push fails (conflict):
   - `git fetch origin main`
   - Check if the item is still `⬜` in origin/main
   - If still `⬜`: Retry claim
   - If now `🚧`: Another agent won the race. Find a different item.
   - **NEVER** force-push or try to overwrite another agent's claim.

### 3.3 Branch Creation

After successful claim, create your working branch:
```bash
git checkout -b agent/<work-item-slug> main
git push origin agent/<work-item-slug>
```

---

## 4. ABANDONED CLAIM RECOVERY (DEAD AGENT HANDLING)

### 4.1 Abandoned Claim Definition

A claim is considered ABANDONED if ALL of these are true:
- Item status is `🚧` with a claim
- Branch `agent/<work-item-slug>` has NO commits for 4+ hours
- No pushes to main referencing this item in 4+ hours
- No CI runs for this branch in 4+ hours

### 4.2 Recovery Protocol

1. **VERIFY ABANDONMENT**:
   ```bash
   # Check branch last commit time
   git ls-remote --heads origin agent/<work-item-slug>
   git log origin/agent/<work-item-slug> -1 --format='%ai'
   
   # Check for any activity on main related to this item
   git log origin/main --grep="<item-name>" --since="4 hours ago"
   ```

2. **CHECK FOR HUMAN WORK**:
   ```bash
   # Check if recent commits are by the repository owner
   git log origin/agent/<work-item-slug> -1 --format='%an %ae'
   ```
   
   If the author is the repository owner (Leonard Schwier) with a recent timestamp (within 1 hour), **DO NOT RECLAIM**. This is live human work.

3. **RECLAIM PROCEDURE**:
   - Add a new entry to ROADMAP.md replacing the abandoned claim:
     ```markdown
     - 🚧 **Item Name** claim: <YOUR-AGENT-ID>, <UTC-TIMESTAMP>, branch: agent/<work-item-slug>, RECLAIMED from abandoned <OLD-AGENT-ID>
     ```
   - Delete the abandoned branch if possible:
     ```bash
     git push origin --delete agent/<old-work-item-slug>
     ```
   - Create your own branch and proceed with implementation

### 4.3 Claims with Partial Work

If the abandoned branch has useful partial work:
- **DO NOT** try to continue it. The partial work may be in an inconsistent state.
- **DO** start from scratch on your own branch
- **DO** review the abandoned branch's commits to understand what was attempted
- **DO** mention in your commit message: "Reclaiming abandoned work by <old-agent>. Starting fresh implementation."

---

## 5. IMPLEMENTATION PROTOCOL

### 5.1 Before Writing Code

1. **READ DEPENDENCIES**:
   - Any spec files mentioned in the roadmap item
   - `documentation/ARCHITECTURE.md` for module boundaries
   - Any existing code files you plan to modify
   - Related test files

2. **PLAN THE CHANGE**:
   - List every file you will touch
   - List every test you will add
   - Identify any cross-file dependencies
   - Note any CONSTITUTION.md rules that apply

3. **CHECK FOR CONFLICTS**:
   ```bash
   git fetch origin main
   git diff main...HEAD --name-only  # Check what you've changed
   git diff HEAD...origin/main --name-only  # Check what main changed
   ```

### 5.2 Implementation Rules

- **ONE ITEM PER BRANCH**: Never bundle multiple roadmap items in one branch
- **SMALL COMMITS**: Each commit should be a single logical change
- **TESTS FIRST**: Write tests for new logic before or alongside implementation
- **NO SHORTCUTS**: Never skip error handling, edge cases, or documentation

### 5.3 Quality Standards (NON-NEGOTIABLE)

Every change MUST meet ALL of these:

1. **Type Safety**: `npx tsc --noEmit` passes
2. **Lint Clean**: `npx eslint .` shows 0 errors (warnings from existing code are OK)
3. **Tests Pass**: `npx vitest run` - all tests pass, count must not decrease
4. **Build Works**: `npm run build` succeeds
5. **Null Bytes**: `for f in $(git diff --name-only); do grep -cP '\x00' "$f"; done` all print 0
6. **Rust Checks** (if touching Rust): `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test`, `cargo check` all pass

**FOR LOWER-CAPABILITY MODELS**: If you cannot run these commands locally:
1. Push to your `agent/<work-item-slug>` branch
2. Wait for GitHub Actions CI to run
3. Fix any failures shown in CI
4. Repeat until CI passes

---

## 6. CI VERIFICATION PROTOCOL (FOR AGENTS WITHOUT FULL CI)

### 6.1 CI Requirements by Agent Type

| Agent Type | Can Run Frontend | Can Run Rust | CI Strategy |
|------------|------------------|--------------|-------------|
| Local (full setup) | ✅ Yes | ✅ Yes | Run full verification suite locally |
| Cloud (full setup) | ✅ Yes | ✅ Yes | Run full verification suite locally |
| Cloud (no Rust) | ✅ Yes | ❌ No | Run frontend locally, use branch CI for Rust |
| Cloud (limited) | ❌ No | ❌ No | Use branch CI for all verification |

### 6.2 Branch CI Strategy

If you cannot run verification locally:

1. **PUSH TO BRANCH**:
   ```bash
   git push origin agent/<work-item-slug>
   ```

2. **WAIT FOR CI**: GitHub Actions `.github/workflows/ci.yml` runs on every push

3. **CHECK CI STATUS**:
   ```bash
   # Using GitHub CLI
   gh run list --workflow ci.yml --branch agent/<work-item-slug> --limit 1
   
   # Or via API
   curl -s -H "Authorization: token YOUR_TOKEN" \
     "https://api.github.com/repos/LeonardSchwier/leotheca/actions/runs?branch=agent/<work-item-slug>&per_page=1"
   ```

4. **FIX AND REPEAT**: If CI fails, fix the issues and push again

### 6.3 Local Verification Fallback

If CI is unavailable or too slow:

1. **FRONTEND**: Always run locally if possible:
   ```bash
   npx tsc --noEmit
   npx vitest run --exclude '**/.claude/**' --exclude '**/node_modules/**'
   npx eslint . --ignore-pattern '.claude/**'
   npm run build
   ```

2. **RUST**: If Rust unavailable, document in commit: "Rust verification via CI only - cannot run locally in this environment"

### 6.4 Pre-Landing Verification

Before pushing to main, you MUST have:
- ✅ All applicable local checks pass
- ✅ Branch CI is green (if you pushed to branch)
- ✅ No null bytes in any changed file
- ✅ All new tests pass
- ✅ Test count same or higher than before

---

## 7. BLOCKER RESOLUTION PROTOCOL (AGENTS FIX THEIR OWN BLOCKERS)

### 7.1 Blocker Classification

| Blocker Type | Resolution | Escalate? |
|--------------|------------|-----------|
| Merge conflict | Resolve locally, retest | ❌ No |
| Test failure | Fix the code or test | ❌ No |
| Lint error | Fix the code | ❌ No |
| Build error | Fix dependencies or code | ❌ No |
| Missing dependency | Install it (if possible) | ❌ No |
| Maintainer sign-off required | Record blocker, skip item | ✅ Yes |
| Physical device needed | Record blocker, skip item | ✅ Yes |
| Platform limitation | Use fallback, document | ❌ No |

### 7.2 Common Blockers and Solutions

**MERGE CONFLICTS**:
1. `git fetch origin main`
2. `git merge origin/main` into your branch
3. Resolve conflicts manually
4. Re-run all verification
5. Continue implementation

**TEST FAILURES**:
1. Read the actual failing test output
2. Understand WHY it failed
3. Fix the root cause (not the test assertion)
4. Re-run tests to confirm fix

**MISSING DEPENDENCIES**:
1. Check `package.json` and `Cargo.toml`
2. Install missing packages: `npm install`
3. For Rust: follow `skills/verification-suite.md` bootstrap
4. If truly unavailable: document limitation and use CI

**MAIN MOVED WHILE WORKING**:
1. `git fetch origin main`
2. `git merge origin/main` into your branch
3. Resolve any conflicts
4. Re-run verification
5. Continue

### 7.3 External Blocker Documentation

If blocked on something you cannot fix:

1. **ADD TO ROADMAP**: Add a new `⬜` item at the top of Open Bugs:
   ```markdown
   - ⬜ **BLOCKER: <description>** Blocking <affected-item>. Needs: <what-is-needed>
   ```

2. **DOCUMENT IN COMMIT**: When committing your partial work:
   ```
   Blocked on: <specific-blocker>
   Next steps: <what-needs-to-happen>
   ```

3. **MOVE TO NEXT ITEM**: Immediately begin work on the next eligible item

---

## 8. LANDING PROTOCOL (DIRECT TO MAIN)

### 8.1 Pre-Landing Checklist

Before landing, ensure ALL are true:
- [ ] Implementation complete per roadmap item description
- [ ] All new tests written and passing
- [ ] Documentation updated (if applicable)
- [ ] ROADMAP.md entry updated to final state
- [ ] CHANGELOG.md entry added (if user-facing)
- [ ] All verification suite checks pass
- [ ] No null bytes in changed files
- [ ] Branch is up to date with main

### 8.2 Update ROADMAP Entry

Change your `🚧` entry to `✅` and move it to `## Implemented` section:

```markdown
# In Implemented section:
- ✅ **Item Name** (claim: <your-agent-id>, <timestamp>): <implementation-summary>. Tests: X->Y. Verification: <what-passed>.
```

**IMPLEMENTATION SUMMARY REQUIREMENTS**:
- What was actually built (not just the roadmap description)
- Files touched
- Test counts before/after
- Any explicit limitations (e.g., "no on-device test")
- Verification performed

### 8.3 Commit and Push

1. **CREATE FINAL COMMIT**:
   ```bash
   # Add all changed files
   git add .
   
   # Commit with descriptive message
   git commit -m "feat/fix: <item-name> implementation
   
   <detailed description of changes>
   
   Tests: <old-count> -> <new-count>
   Verification: <list of checks that passed>
   
   Generated by <AGENT-TYPE>.
   Co-Authored-By: <AGENT-ATTRIBUTION>"
   ```

2. **PUSH TO MAIN**:
   ```bash
   git push origin main
   ```

3. **VERIFY MAIN**:
   ```bash
   git fetch origin main
   git log origin/main -1  # Confirm your commit is there
   ```

### 8.4 Post-Landing Actions

1. **CONFIRM CI ON MAIN**: Check that main's CI passes for your commit
2. **DELETE BRANCH**:
   ```bash
   git push origin --delete agent/<work-item-slug>
   ```
3. **LOCAL CLEANUP**:
   ```bash
   git branch -D agent/<work-item-slug>
   git reset --hard origin/main
   ```

---

## 9. AUTONOMOUS SESSION LOOP

### 9.1 Continuous Operation

Every agent MUST follow this loop until session ends:

```
WHILE session active AND eligible work exists:
    1. Synchronize with remote main
    2. Perform integration pass (land any ready work)
    3. Find next eligible unclaimed item
    4. If found: Claim it, implement, verify, land it
    5. If not found: 
        a. Check for abandoned claims to reclaim
        b. If still no work: Switch to code review mode
    6. Repeat

IF blocked on item:
    1. Document the blocker
    2. Find next eligible item
    3. Continue
```

### 9.2 Integration Pass (START OF EVERY ITERATION)

Before claiming new work, every agent MUST:

1. **FETCH LATEST STATE**:
   ```bash
   git fetch origin main
   git fetch origin --prune  # Clean up deleted branches
   ```

2. **CHECK ALL AGENT BRANCHES**:
   ```bash
   git branch -r | grep 'origin/agent/'
   ```

3. **FOR EACH agent/* branch**:
   - Check if its CI is green
   - Check if its implementation is complete
   - If both true: Land it on main (merge, verify, delete branch)
   - If CI red: Leave it (owner must fix)
   - If incomplete: Leave it (owner must finish)

4. **CHECK FOR STALE CLAIMS**:
   - Any `🚧` item without a corresponding branch for 4+ hours = abandoned
   - Any `🚧` item with branch but no activity for 4+ hours = abandoned
   - Reclaim abandoned items per section 4

### 9.3 When ROADMAP is Empty

If no eligible work exists (all items implemented or blocked):

1. **CODE REVIEW MODE**:
   - Review recent commits in main
   - Look for bugs, missing edge cases, poor error handling
   - Check test coverage for gaps
   - Review documentation for accuracy

2. **ADD IMPROVEMENTS**:
   - Find and fix bugs
   - Improve test coverage
   - Update stale documentation
   - Add missing error handling

3. **CREATE NEW WORK**:
   - Review competitor changelogs (per CONSTITUTION.md)
   - Add new items to ROADMAP.md
   - Claim and implement them

---

## 10. AGENT SHUTDOWN PROTOCOL

### 10.1 Graceful Shutdown

When session is ending:

1. **FINISH CURRENT ITEM**:
   - If implementation complete: Land it on main
   - If incomplete: Update ROADMAP.md with current status

2. **DOCUMENT PARTIAL WORK**:
   - Add comment to ROADMAP.md item:
     ```markdown
     - 🚧 **Item Name** claim: <agent-id>, <timestamp>, branch: agent/<slug>, PARTIAL: <what's-done>, <what-remains>
     ```

3. **PUSH PARTIAL STATE**:
   ```bash
   git add .
   git commit -m "partial: <item-name> - <status>"
   git push origin agent/<work-item-slug>
   git push origin main  # For ROADMAP.md update
   ```

### 10.2 Emergency Shutdown (Token Limit, Crash)

If shutting down unexpectedly:

1. **PUSH IMMEDIATELY**:
   - Any uncommitted work: `git stash` then push to branch
   - Any ROADMAP.md changes: commit and push to main

2. **BRANCH PRESERVATION**:
   - Ensure `agent/<work-item-slug>` branch exists on remote
   - If not: `git push origin agent/<work-item-slug>`

---

## 11. QUALITY ASSURANCE CHECKLIST (FOR LOWER-CAPABILITY MODELS)

Before declaring any item done, verify ALL of these:

### 11.1 Code Quality
- [ ] No `any` types in TypeScript (unless absolutely necessary with comment)
- [ ] All functions have proper parameter types
- [ ] Error cases handled explicitly
- [ ] No unused imports or variables
- [ ] Follows existing code style and patterns
- [ ] Comments explain WHY, not WHAT
- [ ] No console.log or debug statements

### 11.2 Test Quality
- [ ] Tests cover happy path
- [ ] Tests cover error cases
- [ ] Tests cover edge cases (empty, null, boundary values)
- [ ] Tests actually fail when code is broken (revert-confirm-restore)
- [ ] Test names describe what they test
- [ ] No skipped or disabled tests without explanation

### 11.3 Security
- [ ] No user input used without validation/sanitization
- [ ] No network calls (per CONSTITUTION.md)
- [ ] No eval() or dynamic code execution
- [ ] No hardcoded secrets or credentials
- [ ] File paths properly validated
- [ ] No prototype pollution risks

### 11.4 Documentation
- [ ] Code changes documented in commit message
- [ ] Complex logic has inline comments
- [ ] API changes documented
- [ ] Breaking changes noted
- [ ] ROADMAP.md updated accurately

---

## 12. COMMON MISTAKES TO AVOID

### 12.1 Coordination Mistakes
- ❌ Not checking for other agents' claims before starting work
- ❌ Working on claimed items
- ❌ Not pushing claim to main (lock not acquired)
- ❌ Force-pushing over another agent's claim
- ❌ Claiming multiple items simultaneously

### 12.2 Quality Mistakes
- ❌ Skipping tests for "simple" code
- ❌ Only testing happy path
- ❌ Not running verification suite
- ❌ Claiming code is "done" when tests fail
- ❌ Ignoring lint errors
- ❌ Not handling edge cases

### 12.3 Process Mistakes
- ❌ Not syncing with remote main regularly
- ❌ Committing to wrong branch
- ❌ Not updating ROADMAP.md
- ❌ Not documenting blockers
- ❌ Stopping after one item when more work exists

### 12.4 Blocker Mistakes
- ❌ Treating fixable blockers as external
- ❌ Waiting for human intervention on internal blockers
- ❌ Not attempting to resolve merge conflicts
- ❌ Not investigating test failures

---

## 13. EXAMPLE WORKFLOW (STEP BY STEP)

```
# Agent: MistralVibe-cloud-session-XYZ
# Time: 2026-09-06T14:30:00Z

1. STARTUP:
   git clone https://github.com/LeonardSchwier/leotheca.git
   cd leotheca
   git checkout main
   git fetch origin main
   git reset --hard origin/main

2. READ AUTHORITATIVE FILES:
   Read CONSTITUTION.md
   Read skills/multi-agent-autonomous-coordination.md (this file)
   Read ROADMAP.md

3. FIND ELIGIBLE WORK:
   - Check Open Bugs: first item is "⬜ Fix markdown link parsing edge case"
   - Check for overlaps: no other 🚧 items touch markdown parsing
   - Not high-risk: OK to claim

4. CLAIM ITEM:
   Edit ROADMAP.md:
   - ⬜ Fix markdown link parsing edge case
   + 🚧 Fix markdown link parsing edge case claim: MistralVibe-cloud-XYZ12345, 2026-09-06T14:35:00Z, branch: agent/fix-md-link-parsing
   
   git add ROADMAP.md
   git commit -m "claim: fix markdown link parsing by MistralVibe-cloud-XYZ12345"
   git push origin main  # CLAIM ACQUIRED

5. CREATE BRANCH:
   git checkout -b agent/fix-md-link-parsing main
   git push origin agent/fix-md-link-parsing

6. IMPLEMENT:
   Read relevant files (src/parser/markdownLink.ts, tests/...)
   Write fix and tests
   Run: npx tsc --noEmit
   Run: npx vitest run
   Run: npx eslint .
   Fix any issues

7. VERIFY:
   All checks pass
   No null bytes
   Tests: 500 -> 502 (2 new tests)

8. LAND:
   Update ROADMAP.md: move to Implemented, change to ✅
   Add CHANGELOG.md entry
   git add .
   git commit -m "fix: markdown link parsing edge cases
   
   - Fixed parsing of links with special characters
   - Added tests for edge cases
   
   Tests: 500 -> 502
   Verification: tsc, vitest, eslint, build all pass
   
   Generated by Mistral Vibe.
   Co-Authored-By: Mistral Vibe <vibe@mistral.ai>"
   
   git push origin main
   git push origin --delete agent/fix-md-link-parsing

9. NEXT ITERATION:
   git fetch origin main
   git reset --hard origin/main
   # Repeat from step 3
```

---

## 14. MONITORING AND METRICS

Every agent should track and report (in agent-log/CHANGELOG.md):
- Items claimed
- Items completed
- Items abandoned (and why)
- Blockers encountered (and resolution)
- Time spent per item
- Test counts before/after

This data helps identify patterns and improve the protocol.

---

**REMEMBER**: The goal is ZERO human intervention. Every situation must be handleable by agents following this protocol. If you encounter a situation not covered by this protocol, document it and extend this file to handle it.