---
name: architecture-survey
description: Weekly survey for shallow modules and duplicated seams that seeds cited roadmap items.
version: 1.0.0
author: Leonard Schwier
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [architecture, maintenance, survey, roadmap, leotheca]
    related_skills: [maintenance-review, integrator, roadmap-entry-format]
---

<!--
Variables: read CONSTITUTION.md (roadmap_file, handoff_dir, main_branch, ledger_branch).
SURVEY_INTERVAL_DAYS = 7
MAX_SEEDS = 3 per pass
SCOPE = src, src-tauri/src, android/app/src (never tests, generated files, node_modules)
-->

# Architecture survey

An agent pass, about weekly, that finds code worth restructuring and writes it down as roadmap seeds. It never asks a person a question and never changes application code. Idea from the public MIT repository `mattpocock/skills` (architecture improvement and codebase design skills), reworded.

Vocabulary: **deep module** = small interface, much behavior behind it. **Shallow module** = interface about as large as its body, so callers learn as much as they save. **Seam** = the place where two parts meet and where behavior can be swapped or tested. The terms are also defined in `GLOSSARY.md`, section Architecture.

## When

Run it when the newest `architecture-survey` handoff in `handoff_dir` is older than `SURVEY_INTERVAL_DAYS` days, or none exists. `integrator.md` and `maintenance-review.md` call it. One pass, then stop.

## One pass

1. Fetch main and the ledger. Read the last survey handoff and the roadmap, so you do not repeat a seed or a rejected idea.
2. Pick one area from `SCOPE`, the one changed most since the last survey (`git log --since=... --name-only`). One area per pass.
3. Look for these, with a command or file read for each:
   - A shallow module: a file of thin wrappers, or a function whose body only forwards to one other call.
   - A duplicated seam: the same translation or call pattern (IPC wrapper, path check, parse step) written in two or more places.
   - A leaky seam: callers reach past the interface into internals, or a test fake re-implements the real logic.
4. For each candidate write a cite: file, line range, and the other places it repeats. A candidate without at least two citations is dropped.
5. Rank by how often the code changes and how many callers it has. Keep the top `MAX_SEEDS`.
6. Seed each as one `⬜` roadmap item through the coordination-only exception in the constitution, in the format of `roadmap-entry-format.md`: title naming the module, the citations, the proposed deeper shape in one sentence, and acceptance criteria that keep behavior unchanged and tests green. Deduplicate against open and implemented items first.
7. Write a short handoff `architecture-survey` naming the area, date, SHA surveyed, seeds created and candidates dropped. If nothing qualifies, write "no candidates in this area" and stop.

## Never

No questionnaire or question to a person. No code change in the survey pass: implementation follows the seeded item through a normal claim. No seed without citations.
