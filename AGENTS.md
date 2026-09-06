# Instructions for coding agents

<!-- ==================================================================== -->
<!-- PROJECT VARIABLES - UPDATE THESE FOR YOUR PROJECT -->
<!-- ==================================================================== -->
<!-- REPO_FULL_NAME = LeonardSchwier/leotheca -->
<!-- REPO_NAME = leotheca -->
<!-- PROJECT_NAME = Leotheca -->
<!-- MAIN_BRANCH = main -->
<!-- CONSTITUTION_FILE = CONSTITUTION.md -->
<!-- ROADMAP_FILE = ROADMAP.md -->
<!-- CHANGELOG_FILE = CHANGELOG.md -->
<!-- AGENT_CHANGELOG_FILE = agent-log/CHANGELOG.md -->
<!-- SKILLS_DIR = skills -->
<!-- SCRIPTS_DIR = scripts -->
<!-- DOCS_DIR = documentation -->
<!-- ==================================================================== -->

**CRITICAL FOR LOW-CAPABILITY MODELS**: This repository operates with a fully autonomous multi-agent workflow. Human review is NEVER required. You MUST be able to complete your tasks independently.

Before doing anything else in this repository, read `{CONSTITUTION_FILE}` in the repository root. It is the single source of truth for project rules, conventions, and standing decisions, kept there (not here) so every coding agent working on this repository, regardless of tool, reads the same rules.

**FOR LOWER-CAPABILITY MODELS - MINIMUM REQUIRED READING:**
If you cannot read the entire {CONSTITUTION_FILE} due to context limits, you MUST at minimum read these sections:
1. {CONSTITUTION_FILE}: "Autonomous multi-agent pipeline" (primary workflow)
2. {CONSTITUTION_FILE}: "Parallel agent coordination and integration" (coordination rules)
3. {CONSTITUTION_FILE}: "Engineering practices" (quality standards)
4. {CONSTITUTION_FILE}: "Guardrails against known agentic-AI failure modes" (safety rules)
5. This file (AGENTS.md)
6. `{SKILLS_DIR}/multi-agent-autonomous-coordination.md` (detailed step-by-step protocol)

**IMPORTANT**: The autonomous workflow requires ALL agents to follow the same protocol. If you don't understand something, read it again. If you still don't understand, read the related skill files. If those don't clarify, ask for clarification but DO NOT proceed with guesswork.

This includes the tool-neutral "Parallel agent coordination and integration" protocol. Codex, Claude Code, and any other concurrent session must complete its repository-visible integration and claim checks before editing implementation files.

For the mechanical how-to behind that protocol and other recurring tasks (claiming and landing a {ROADMAP_FILE} item, running the full verification suite, resolving a {ROADMAP_FILE}/{CHANGELOG_FILE} merge conflict, splitting a large spec into phases, writing a new Markdown scanner module), see `{SKILLS_DIR}/README.md` and the plain markdown files it indexes. Those files hold procedure, not policy; if one of them ever conflicts with `{CONSTITUTION_FILE}`, `{CONSTITUTION_FILE}` wins and the skill file should be corrected.

**PRIMARY WORKFLOW FOR ALL AGENTS:**
1. Start: `git fetch origin {MAIN_BRANCH} && git reset --hard origin/{MAIN_BRANCH}`
2. Read: {CONSTITUTION_FILE}, then this file, then {ROADMAP_FILE}
3. Integration pass: Check all agent/* branches, land any ready work
4. Find eligible work: First ⬜ item in Open Bugs, then Open Features
5. Claim: Edit {ROADMAP_FILE}, change ⬜ to 🚧 with your agent ID, push to {MAIN_BRANCH}
6. Implement: Write production-ready code with tests
7. Verify: Run full test suite or use branch CI
8. Land: Move to Implemented with ✅, push directly to {MAIN_BRANCH}
9. Repeat: Go back to step 1

**NEVER DO THESE:**
- Work on items that are already 🚧 (claimed by others)
- Skip verification because "it looks fine"
- Wait for human help on fixable blockers
- Assume anything - always verify

Do not duplicate its content here. If you need to add an instruction specific to one tool, add it to that tool's own file (for example `CLAUDE.md` for Claude Code) rather than here.