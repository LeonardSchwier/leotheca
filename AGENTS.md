# Instructions for coding agents

Before doing anything else in this repository, read `CONSTITUTION.md` in the repository root. It is the single source of truth for project rules, conventions, and standing decisions, kept there (not here) so every coding agent working on this repository, regardless of tool, reads the same rules.

This includes the tool-neutral "Parallel agent coordination and integration" protocol. Codex, Claude Code, and any other concurrent session must complete its repository-visible integration and claim checks before editing implementation files.

For the mechanical how-to behind that protocol and other recurring tasks (claiming and landing a roadmap item, running the full verification suite, resolving a `ROADMAP.md`/`CHANGELOG.md` merge conflict, splitting a large spec into phases, writing a new Markdown scanner module), see `skills/README.md` and the plain markdown files it indexes. Those files hold procedure, not policy; if one of them ever conflicts with `CONSTITUTION.md`, `CONSTITUTION.md` wins and the skill file should be corrected.

Do not duplicate its content here. If you need to add an instruction specific to one tool, add it to that tool's own file (for example `CLAUDE.md` for Claude Code) rather than here.
