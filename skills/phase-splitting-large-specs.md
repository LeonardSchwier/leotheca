# Skill: splitting a large spec into honestly-scoped phases

Several roadmap features are backed by a full software design document
under `spec/*.md` (search for "SDD" in the filename or the roadmap
bullet). These are usually too large to implement, test, and verify to a
production-ready bar in one session. Attempting the whole thing anyway
produces one of two bad outcomes: a claim that sits `🚧` for days with no
progress, or a rushed "done" that silently skips real scope. Splitting
into phases is the established, repeated pattern in this codebase (see
`ROADMAP.md`'s F06 Phase 1/2a/2b/2c/4a/4b history for the fullest
example) and is preferred over either.

## How to split

1. Read the spec's own rollout/phasing section first if it has one (most do, usually near the end, e.g. "Rollout Plan"). Use its own phase boundaries rather than inventing new ones; the spec's author already thought about dependency order.
2. If the spec has no explicit phasing, or its phases are still too large, pick the smallest slice that is genuinely useful and demonstrable on its own: a read-only view before an editable one, same-note behavior before cross-note behavior, Preview-only support before Source-mode decorations, a new pure/parsing module with tests before any UI wiring.
3. Name the phase after what it delivers, not a version number nobody will remember the meaning of: `F04 Phase 1: heading-link parser, resolution, and Preview navigation`, not `F04 Phase 1`.
4. In the same commit that claims the phase, split the roadmap bullet into two: your claimed phase (now `🚧`), and a new `⬜` bullet for the remaining phases, naming what's still in them so the next session (or your own next claim) doesn't have to re-read the whole spec to figure out what's left.
5. State explicitly, in both the claim and later the Implemented writeup, what this phase does *not* do. A reader should be able to tell exactly where the line is without reading your diff.

## When phases turn out too coarse

If a "Phase N" already on the roadmap is still too large for one session,
split it further the same way (`Phase 4` became `Phase 4a` and
`Phase 4b`/`Phase 4c` in this codebase's real history when scale
hardening and accessibility hardening turned out to be separable, even
though the original spec only had one "Phase 4"). Update the roadmap
bullet's own name to reflect the finer split rather than leaving a stale
`Phase 4` reference elsewhere in the file; grep for the old name across
`ROADMAP.md` and fix every cross-reference in the same commit.

## Common phase boundaries that have worked well here

- Pure parsing/data-model module (with its own tests) before any UI that consumes it.
- Read-only or display-only behavior before an editable/interactive version of the same feature.
- Same-note or Source-only behavior before cross-note or Preview/Split-mode behavior that depends on tracking a second, independent state source.
- The "make it correct" phase before the "make it fast at scale" phase (e.g. virtualization for a note with thousands of headings landed as its own phase, after the plain nested-list version already worked correctly for ordinary notes).
- Full ARIA/accessibility hardening and real screen-reader validation as their own phase, since the latter usually can't be verified at all in a headless cloud sandbox and shouldn't block the functional slice.

## Do not

- Do not claim a phase that quietly depends on a later, unclaimed phase's work without saying so in the claim text (e.g. claiming Preview navigation for a link type that hasn't been parsed yet).
- Do not silently reduce a phase's already-claimed scope mid-implementation without updating the roadmap bullet to match what actually shipped; if reality turned out smaller than the claim promised, say so honestly rather than let the Implemented entry overstate it.
