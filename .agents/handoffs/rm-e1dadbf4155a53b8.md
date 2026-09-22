# Handoff — rm-e1dadbf4155a53b8

## Summary
Fixed a bug in `inlineLocalImages` (`src/export/exportNoteHtml.ts`) where the `src`
attribute replacement targeted the wrong attribute when an earlier attribute (e.g. `alt`)
shared the same string value as `src`.

## Root Cause
`tag.replace(quotedValue, ...)` replaces the **first** occurrence of the string in the
entire `<img>` tag. When `alt="asset://x"` appears before `src="asset://x"`, the data URI
was written into `alt`, leaving `src` unchanged.

## Fix
Replaced the string-level `replace()` with an index-aware splice using
`srcMatch.index + srcMatch[0].indexOf(quotedValue)` to locate the exact `src` attribute
position and slice-replace at that offset.

## Files Changed
- `src/export/exportNoteHtml.ts` — fix
- `src/export/exportNoteHtml.test.ts` — regression test (6 new assertions)
- `ROADMAP.md` — entry added (open), then marked done

## Tests
- `npx vitest run src/export/exportNoteHtml.test.ts` → **30 passed** (including 1 new regression test)
- `npx tsc -p tsconfig.json --noEmit` → clean
- `npx eslint .` → clean
- `npm run check-version` → passed
- `npx vitest run` → **30,558 passed** (1,621 files)
- `node node_modules/vite/bin/vite.js build` → success
- `cargo fmt --all -- --check` → clean
- `cargo clippy --all-targets -- -D warnings` → clean
- `cargo test` → **77 passed**

## Landed SHA
- Work branch tip: `fcbb399`
- Merge commit on main: `ecd077b`
- Done-state commit: `c9c8324` (pushed to main)

## Self-Review Findings
- The fix is minimal: 9 lines changed in the implementation, 14 lines added to tests.
- The index computation `srcMatch.index + srcMatch[0].indexOf(quotedValue)` is correct:
  `srcMatch[0]` is the full `src="..."` match, `srcMatch[0].indexOf(quotedValue)` gives
  the offset of the quoted value within that match.
- All 30 export tests pass, including the existing tests that verify the happy path.
- No other call sites of `inlineLocalImages` are affected.

## CI
Pushed to main; CI will run on push.
