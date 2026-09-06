<!-- Variables: SPEC_DIR = spec; ROADMAP_FILE = configured roadmap_file; WORKFLOW = roadmap-workflow.md -->

# Split a large item into complete slices

Use when one specification cannot be implemented and verified within a session. Read the entire relevant scope and its rollout plan before splitting.

1. Prefer the specification's existing independently testable phases.
2. Choose a coherent deliverable with explicit acceptance criteria. A foundation-only library can be a phase if clearly named as such; it is not a shipped user feature until its caller is wired.
3. Preserve every remaining requirement in one or more unclaimed follow-ups with dependencies. Do not erase difficult work or move already-required safety/error handling into an unspecified future phase.
4. Add/update the phase bullets in a fresh control transaction, then claim the chosen phase normally. Do not rewrite another live owner's scope. If the helper needs a clean tree, commit/push the split first, refresh, then claim.
5. Name phases by their behavior, not only a number. State what each implements, its touched contracts, how to verify it, and what remains.
6. If a phase must shrink mid-session, publish a truthful checkpoint, release/reclaim the corrected scope, and keep all outstanding requirements visible.

Good boundaries include a reusable parser with tests, then its navigation UI; one complete read-only flow, then an independently useful editing flow; or one platform implementation with explicit remaining platform work. Basic safety, valid data handling, error behavior, and accessibility required to use a shipped UI are part of that slice, not optional later polish.

Do not claim a phase whose unresolved prerequisite makes it impossible to work. Fix/claim the prerequisite or choose another runnable item. Reuse the same lease and verification protocol; splitting is not a way to bypass checks or inflate completion counts.
