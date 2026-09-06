# Instructions for coding agents

**CRITICAL FOR LOW-CAPABILITY MODELS**: This repository operates with a fully autonomous multi-agent workflow. Human review is NEVER required. You MUST be able to complete your tasks independently.

Before doing anything else in this repository, read `CONSTITUTION.md` in the repository root. It is the single source of truth for project rules, conventions, and standing decisions, kept there (not here) so every coding agent working on this repository, regardless of tool, reads the same rules.

**FOR LOWER-CAPABILITY MODELS - MINIMUM REQUIRED READING:**
If you cannot read the entire CONSTITUTION.md due to context limits, you MUST at minimum read these sections:
1. CONSTITUTION.md: "Autonomous multi-agent pipeline" (primary workflow)
2. CONSTITUTION.md: "Parallel agent coordination and integration" (coordination rules)
3. CONSTITUTION.md: "Engineering practices" (quality standards)
4. CONSTITUTION.md: "Guardrails against known agentic-AI failure modes" (safety rules)
5. This file (AGENTS.md)
6. `skills/multi-agent-autonomous-coordination.md` (detailed step-by-step protocol)

**IMPORTANT**: The autonomous workflow requires ALL agents to follow the same protocol. If you don't understand something, read it again. If you still don't understand, read the related skill files. If those don't clarify, ask for clarification but DO NOT proceed with guesswork.

This includes the tool-neutral "Parallel agent coordination and integration" protocol. Codex, Claude Code, and any other concurrent session must complete its repository-visible integration and claim checks before editing implementation files.

For the mechanical how-to behind that protocol and other recurring tasks (claiming and landing a roadmap item, running the full verification suite, resolving a `ROADMAP.md`/`CHANGELOG.md` merge conflict, splitting a large spec into phases, writing a new Markdown scanner module), see `skills/README.md` and the plain markdown files it indexes. Those files hold procedure, not policy; if one of them ever conflicts with `CONSTITUTION.md`, `CONSTITUTION.md` wins and the skill file should be corrected.

**PRIMARY WORKFLOW FOR ALL AGENTS:**
1. Start: `git fetch origin main && git reset --hard origin/main`
2. Read: CONSTITUTION.md, then this file, then ROADMAP.md
3. Integration pass: Check all agent/* branches, land any ready work
4. Find eligible work: First ⬜ item in Open Bugs, then Open Features
5. Claim: Edit ROADMAP.md, change ⬜ to 🚧 with your agent ID, push to main
6. Implement: Write production-ready code with tests
7. Verify: Run full test suite or use branch CI
8. Land: Move to Implemented with ✅, push directly to main
9. Repeat: Go back to step 1

**NEVER DO THESE:**
- Work on items that are already 🚧 (claimed by others)
- Skip verification because "it looks fine"
- Wait for human help on fixable blockers
- Assume anything - always verify

Do not duplicate its content here. If you need to add an instruction specific to one tool, add it to that tool's own file (for example `CLAUDE.md` for Claude Code) rather than here.