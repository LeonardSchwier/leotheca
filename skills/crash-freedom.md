---
name: crash-freedom
description: Keep the app crash-free — proactive hunt, not reactive tickets.
version: 1.0.0
author: Leonard Schwier
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [reliability, crash, testing, leotheca]
    related_skills: [maintenance-review, change-quality-gates, verification-suite, pre-push-verification]
---

<!--
Variables: read CONSTITUTION.md (main_branch, skills_dir, handoff_dir, roadmap_file).
CRASH_HUNT_MAX_AREA = one module or one command-family per pass
REGRESSION_TEST_REQUIRED = yes (every fix ships with a test that fails without it)
-->

# Keep the app crash-free

The owner does not report crashes one by one; the owner holds the standing expectation that the app **does not crash**. This skill is how an agent earns that. It applies in two modes: **proactive** (idle budget, high-risk area hunt) and **reactive** (a reported crash or CI failure) — both end in the same place: a fix **plus** a regression test, and a scan for siblings.

## The mindset shift

| Last year (reactive) | Now (ownership) |
| --- | --- |
| Owner reports crash → agent fixes that one | Agent hunts for what *could* crash in this area, fixes all of them |
| Fix the reported line | Find the root class (e.g. "unbounded read", "unhandled rejection") and fix every instance |
| Done when the reported case passes | Done when the whole class is covered by a regression test |
| Idle = wait for a ticket | Idle = crash-hunt the highest-risk area |

A single reported crash is a symptom. Your job is to treat it as a sample of a class, then reduce that class's size.

## Proactive crash-hunt pass (the standing use of idle budget)

1. **Pick the highest-risk area by impact, not recency.** Rank: (a) paths with real user data (save/sync/persistence), (b) large/external inputs (file reads, attachments, search over big trees), (c) async lifecycles (mount/unmount, background/resume, double-fire), (d) platform bridges (IPC, Capacitor, Tauri) and their no-op paths. Within the area, scope to CRASH_HUNT_MAX_AREA so the pass is bounded and claimable.
2. **Enumerate, don't spot-check.** List every public entrypoint in the area (command registrations, exported plugin methods, IPC handlers, effects/teardown, timers). For each, ask the crash-freedom checklist questions from CONSTITUTION.md. A fix to one command is the moment to check its siblings — the cheapest time to catch the class.
3. **Prove it, don't assume it.** For each suspected defect: reproduce on current main with a concrete input/state, or write the test that would have caught it. A hunch is not a bug. Keep proof small: one failing test or one concrete source contradiction.
4. **Fix the class, not the instance.** Apply the fix to every instance you found. Land the fix and the regression test in the same claimed change.
5. **Record coverage.** In the handoff, note the area, the entrypoints enumerated, the classes you covered, and the *next* unreviewed high-risk area, so the next worker advances instead of re-auditing.

## Reactive path (reported crash / CI failure)

1. Reproduce on current main with the minimal failing input. If you cannot reproduce, that is the first bug to fix — a non-reproducible report is a testability gap.
2. Classify the root cause as a **class** (unhandled rejection, unbounded buffer, lifecycle leak, race, no-op throw, partial write) before touching the line.
3. Fix every instance of that class you can find in the same area. Ship regression tests for each.
4. Run the crash-freedom checklist on the *adjacent* paths — the same owner action that hit one line usually can hit others.
5. Drive the affected CI green and inspect the exact landed SHA. Do not move on while a known crash remains on main.

## Completion rule

A crash-freedom change is complete when: the fix is on main, its regression test **fails without the fix and passes with it**, the sibling instances in the area are either fixed or opened as deduplicated items with reproduction, and the handoff names the next unreviewed area. "Fixed the reported crash" is not complete; "the class is covered and the area is less crash-prone than before" is.
