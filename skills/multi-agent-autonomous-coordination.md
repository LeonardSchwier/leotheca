# Skill: Multi-Agent Autonomous Coordination Protocol

<!-- ==================================================================== -->
<!-- PROJECT VARIABLES - UPDATE THESE FOR YOUR PROJECT -->
<!-- ==================================================================== -->
<!-- REPO_FULL_NAME = LeonardSchwier/leotheca -->
<!-- REPO_NAME = leotheca -->
<!-- PROJECT_NAME = Leotheca -->
<!-- MAIN_BRANCH = main -->
<!-- CONSTITUTION_FILE = CONSTITUTION.md -->
<!-- ROADMAP_FILE = ROADMAP.md -->
<!-- CHANGELOG_FILE = agent-log/CHANGELOG.md -->
<!-- SKILLS_DIR = skills -->
<!-- SCRIPTS_DIR = scripts -->
<!-- ==================================================================== -->

**PURPOSE**: This file defines the exact protocol for MULTIPLE agents working SIMULTANEOUSLY in this repository. Every agent MUST follow this protocol to ensure:
- Zero human intervention required (no pull requests, no manual merges)
- No duplicate work (agents never work on the same feature)
- No blocked agents (agents find and solve their own blockers)
- Zero quality compromise (production-ready code every time)

**AUDIENCE**: All coding agents (Mistral Vibe, Claude Code, Codex, OpenCode, etc.) regardless of capability level.

**PRIORITY ORDER**:
1. This file (specific multi-agent protocol)
2. `{CONSTITUTION_FILE}` (general project rules)
3. Other skill files (mechanical procedures)

If this file conflicts with `{CONSTITUTION_FILE}`, `{CONSTITUTION_FILE}` wins and this file must be corrected immediately.

---

## 1. AGENT STARTUP PROTOCOL

Every agent session MUST begin with these steps in this exact order:

### 1.1 Environment Setup (5 minutes max)
- Ensure git is available: `git --version`
- Ensure node/npm: `node --version`, `npm --version`
- If Rust is needed and missing: install via `{SKILLS_DIR}/verification-suite.md` Cloud bootstrap
- Clone/update repository: `git clone https://github.com/{REPO_FULL_NAME}.git` or `git pull origin {MAIN_BRANCH}`
- Switch to main branch: `git checkout {MAIN_BRANCH}`

### 1.2 State Synchronization (CRITICAL)
```bash
# ALWAYS start with fresh remote state
git fetch origin {MAIN_BRANCH}
git reset --hard origin/{MAIN_BRANCH}
```

**NEVER** work from stale local state.

### 1.3 Read Authoritative Files (MANDATORY)
Read these files IN THIS ORDER:
1. `{CONSTITUTION_FILE}` (full file)
2. This file (`{SKILLS_DIR}/multi-agent-autonomous-coordination.md`)
3. `{ROADMAP_FILE}` (full file)
4. `{SKILLS_DIR}/roadmap-workflow.md`
5. `{SKILLS_DIR}/verification-suite.md`

**LOW-CAPABILITY NOTE**: If you cannot read all these files, read at minimum the sections noted in AGENTS.md.

---

## 2. WORK SELECTION PROTOCOL

**ELIGIBLE WORK**: Status `⬜`, not high-risk, no overlap with `🚧` items, not externally blocked.

**SEARCH ORDER**: `## Open Bugs` top to bottom, then `## Open Features` top to bottom.

### 2.2 Overlap Detection
```bash
git fetch origin agent/<work-item-slug>
git diff origin/{MAIN_BRANCH}..origin/agent/<work-item-slug> --name-only
```
If ANY file in your touch-set appears in ANY `🚧` branch diff, **SKIP** this item.

---

## 3. CLAIM MECHANISM

**Format**: `claim: <AGENT-ID>, <UTC-TIMESTAMP>, branch: agent/<work-item-slug>`

**Agent ID**: `<TOOL>-<MODE>-<SESSION-HASH>` (e.g., `MistralVibe-cloud-ABC12345`)

**Process**:
1. Edit {ROADMAP_FILE}: change `⬜` to `🚧` with claim
2. `git add {ROADMAP_FILE}`
3. `git commit -m "claim: <item> by <agent-id>"`
4. `git push origin {MAIN_BRANCH}` (this is your lock)

**On success**: Create branch: `git checkout -b agent/<slug> {MAIN_BRANCH}` && `git push origin agent/<slug>`

**On failure**: If push fails, another agent won the race. Find a different item.

---

## 4. ABANDONED CLAIM RECOVERY

**ABANDONED if ALL true for 4+ hours**:
- Status is `🚧` with claim
- Branch `agent/<work-item-slug>` has NO new commits
- No pushes to {MAIN_BRANCH} referencing this item
- No CI runs for this branch

**BEFORE RECLAIMING**: Verify no recent human work (repository owner commit within 1 hour = DO NOT RECLAIM)

**RECLAIM**:
1. Replace claim with: `claim: <YOUR-ID>, <TIMESTAMP>, branch: agent/<slug>, RECLAIMED from abandoned <OLD-ID>`
2. `git add {ROADMAP_FILE}` && `git push origin {MAIN_BRANCH}`
3. Create your own branch from current {MAIN_BRANCH}
4. Start fresh implementation (do NOT continue abandoned work)

---

## 5. IMPLEMENTATION PROTOCOL

**BEFORE CODING**:
- Read spec files from {ROADMAP_FILE}
- Read `documentation/ARCHITECTURE.md` (if exists)
- Read files you plan to modify + related tests

**RULES**:
- ONE item per branch
- Small, focused commits
- Tests first (before or alongside implementation)
- No shortcuts on error handling/edge cases

**QUALITY STANDARDS (NON-NEGOTIABLE)**:
- Type safety check passes
- Lint shows 0 errors
- All tests pass, count maintained/increased
- Build succeeds
- No null bytes in any changed file

**FOR LIMITED ENVIRONMENTS**: Push to `agent/<slug>` branch, use branch CI for verification.

---

## 6. CI VERIFICATION PROTOCOL

| Environment | Strategy |
|------------|----------|
| Full local | Run everything locally |
| Partial cloud | Local frontend + branch CI for backend |
| Limited cloud | Branch CI exclusively |

**Check CI Status**:
```bash
# GitHub CLI
gh run list --workflow ci.yml --branch agent/<work-item-slug> --limit 1

# GitHub API
curl -s -H "Authorization: token YOUR_TOKEN" \
  "https://api.github.com/repos/{REPO_FULL_NAME}/actions/runs?branch=agent/<work-item-slug>&per_page=1"
```

**Pre-Landing**: All checks pass + branch CI green + no null bytes.

---

## 7. BLOCKER RESOLUTION

**SELF-RESOLVE**:
- Merge conflict: resolve locally, retest
- Test failure: fix root cause, retest
- Missing dependency: install it
- {MAIN_BRANCH} moved: merge and continue

**EXTERNAL ONLY**: Document in {ROADMAP_FILE} and {CHANGELOG_FILE}, skip to next item.

---

## 8. LANDING PROTOCOL

**Pre-Landing Checklist**:
- [ ] Implementation complete
- [ ] All tests written and passing
- [ ] Documentation updated
- [ ] {ROADMAP_FILE} entry moved to Implemented with `✅`
- [ ] {CHANGELOG_FILE} entry added (if user-facing)
- [ ] All verification passes
- [ ] No null bytes
- [ ] Branch up to date with {MAIN_BRANCH}

**Process**:
1. Move item to `## Implemented` in {ROADMAP_FILE}
2. Add implementation summary with files touched, test counts, verification performed
3. `git add .` && `git commit -m "feat/fix: <item>\n\n<details>\n\nTests: X->Y\n...\nGenerated by <AGENT>\nCo-Authored-By: <ATTRIBUTION>"`
4. `git push origin {MAIN_BRANCH}`
5. Confirm commit present on remote {MAIN_BRANCH}
6. `git push origin --delete agent/<work-item-slug>`

---

## 9. AUTONOMOUS SESSION LOOP

```
WHILE session active AND eligible work exists:
    1. git fetch origin {MAIN_BRANCH} && git reset --hard origin/{MAIN_BRANCH}
    2. Integration pass: check all agent/* branches, land ready work
    3. Find next eligible ⬜ item
    4. Claim, implement, verify, land
    5. If no work: reclaim abandoned or code review mode
    6. REPEAT
```

**Integration Pass**: Check all `agent/*` branches, land if CI green and complete.

**When {ROADMAP_FILE} Empty**: Code review mode - find bugs, improve tests, update docs, add new items.

---

## 10. AGENT SHUTDOWN

**Graceful**: Finish current item or document partial work in {ROADMAP_FILE}.

**Emergency**: Push immediately to preserve work.

---

## 11. QUALITY CHECKLIST (LOW-CAPABILITY MODELS)

### Code Quality
- [ ] No `any` types (unless necessary with comment)
- [ ] All functions properly typed
- [ ] Error cases handled explicitly
- [ ] No unused imports/variables
- [ ] Follows existing style
- [ ] Comments explain WHY, not WHAT

### Test Quality
- [ ] Happy path covered
- [ ] Error cases covered
- [ ] Edge cases covered
- [ ] Tests fail when code broken (revert-confirm-restore)
- [ ] No skipped tests without explanation

### Security
- [ ] User input validated/sanitized
- [ ] No unintended network calls
- [ ] No eval/dynamic code execution
- [ ] No hardcoded secrets
- [ ] File paths validated

---

## 12. COMMON MISTAKES

- ❌ Working on claimed (`🚧`) items
- ❌ Skipping verification
- ❌ Waiting for human help on fixable blockers
- ❌ Not syncing with {MAIN_BRANCH}
- ❌ Not documenting blockers

---

## 13. EXAMPLE WORKFLOW

```bash
# Startup
git clone https://github.com/{REPO_FULL_NAME}.git
cd {REPO_NAME}
git checkout {MAIN_BRANCH}
git fetch origin {MAIN_BRANCH}
git reset --hard origin/{MAIN_BRANCH}

# Read files
# (Read {CONSTITUTION_FILE}, this file, {ROADMAP_FILE})

# Claim
git add {ROADMAP_FILE}
git commit -m "claim: <item> by <agent-id>"
git push origin {MAIN_BRANCH}

# Implement
git checkout -b agent/<slug> {MAIN_BRANCH}
# ... write code and tests ...

# Verify
# ... run verification suite ...

# Land
# (Update {ROADMAP_FILE}, move to Implemented, add {CHANGELOG_FILE} entry)
git add .
git commit -m "feat: <item>\nTests: X->Y\n..."
git push origin {MAIN_BRANCH}
git push origin --delete agent/<slug>

# Repeat
git fetch origin {MAIN_BRANCH}
git reset --hard origin/{MAIN_BRANCH}
```

---

## 14. MONITORING

Track in {CHANGELOG_FILE}:
- Items claimed/completed/abandoned
- Blockers encountered
- Time spent per item

---

**REMEMBER**: Zero human intervention. If you encounter an uncovered situation, document it and extend this protocol.