# Handoff: rm-1973fcb9bfc885be — inlineLocalImages restructures exported HTML

- Agent: hermes-local-20260921T234757Z-0e87c616
- Item: rm-1973fcb9bfc885be
- State: implementing
- Branch: agent/rm-1973fcb9bfc885be/7def3699ef3f
- Claim commit (main): 7f9bc9e
- Token: 7def3699ef3f67922616c748f627c395
- Lease until: 2026-09-22T01:40:58Z

## What the bug is

`inlineLocalImages` (`src/export/exportNoteHtml.ts`) inlines local image
attachments into exported HTML. It did so by round-tripping the whole Preview-pane
HTML fragment through `new DOMParser()` and returning `parsed.body.innerHTML`.

Parsing is faithful, but *re-serialization is not*: the HTML parser normalizes any
"imperfect" markup the Preview pane emits, so the exported document is silently
restructured relative to what the user saw in the editor. Concrete, reproduced
behaviors (jsdom, old implementation):

- `<p>hello<div>world</div></p>` → `<p>hello</p><div>world</div><p></p>`
  (a spurious empty `<p>` is introduced).
- `<table><tr><td>a</td><td>b</td></tr></table>` → `<table><tbody>…</tbody></table>`
  (an injected `<tbody>`).
- `<div><p>unclosed` → `<div><p>unclosed</p></div>` (tags "repaired").
- `<p><strong>bold</p>` → `<p><strong>bold</strong></p>` (a `</strong>` inserted).

Both the desktop and Android export paths call `inlineLocalImages`, so every
exported/printed note is affected whenever the source markup is not already
canonical. Fully-valid HTML round-trips cleanly, which is why the bug is invisible
in the common case and was not caught by the existing tests (they pass a
non-mutating `fakeParser`, so they cannot observe the restructure).

## The fix

Parse the fragment **only** to enumerate which `<img>` `src` values exist and need
inlining (deduping shared sources). Fetch/inline those into a `src → dataURI` map.
Then substitute **only** the `src="..."` value inside each `<img ...>` tag in the
**original** string, preserving the original quote style. We never return
`parsed.body.innerHTML`, so the rest of the fragment is byte-for-byte untouched.

Details:
- `src=` is matched only when immediately followed by a quote (double or single),
  so a `src=` substring inside another attribute's *value*
  (e.g. `alt="use src= for details"`) is not mistaken for the image source.
- `data:` srcs are left untouched.
- A failed/unreachable fetch leaves the original src intact (one bad attachment
  must not fail the export) — same semantics as before.
- If no src needed inlining, the input string is returned unchanged.

## Regression evidence

Added 8 regression tests to `src/export/exportNoteHtml.test.ts`. Each uses a real
(jsdom, mutating) `DOMParser` so they actually observe re-serialization. The key
ones:

- `preserves a table fragment without injecting a <tbody>` — **fails** on the old
  code with `Received: "<table><tbody>…"`, passes on the fix.
- `preserves a <p><div> fragment without injecting a spurious <p>` — fails on old,
  passes on fix.
- `preserves an unclosed tag fragment without repairing it` — fails on old, passes
  on fix.
- `inlines a src value and does not mutate surrounding markup` — the core behavior.
- `does not corrupt another attribute whose value contains the substring 'src='`.
- `preserves single-quoted src values when inlining`.
- `keeps data: src untouched and does not mutate surrounding markup`.
- `returns unchanged HTML and performs no fetch when there are no images`.

Revert-confirmed: with `src/export/exportNoteHtml.ts` reverted to the old
`return parsed.body.innerHTML;`, 4 of the 8 regression tests fail (including the
`<tbody>` injection); restoring the fix makes all 15 pass.

## Self-review (separate findings)

- Fast path (`dataUriBySrc.size === 0`) returns the input untouched — no string
  processing, correct.
- Dedup of shared `src` values is a behavior-preserving improvement over the old
  per-image fetch (two imgs sharing a src are now fetched once, both inlined).
- `tag.replace(quotedValue, ...)` replaces the exact quoted `src="…"` substring,
  preserving all other attributes and their order.
- The outer `<img\b[^>]*>` regex stops at the first `>`. A `>` *inside* a quoted
  src URI would truncate the tag match — a pre-existing limitation of this regex
  form (not introduced by this fix); the Preview pane never emits `>` in a src
  URI, so this is not reachable in practice.
- Quote style is preserved (single-quoted src stays single-quoted).

## Verification (exact commands, this tree)

- `npx tsc -p tsconfig.json --noEmit` → exit 0 (clean).
- `npm run lint` → exit 0 (clean).
- `npm run check-version` → "Version consistency check passed" (VERSION 0.1.0).
- `npm test` (vitest) → 151 files, 2824 tests, all pass.
- `npm run build` (vite) → built successfully (~17s). Chunk-size warning is
  pre-existing/informational, not a failure.

Frontend-only change (`src/export/exportNoteHtml.ts` + its test). Rust and
Android checks are not applicable — the fix does not touch `src-tauri/` or
`android/`; the Android plugin receives the already-built HTML string via the
unchanged `printNoteAndroid(html, title)` / `exportNoteHtmlAndroid` contract.

## Not yet done / next

- Push the work branch (implementation + tests + handoff) and publish the
  checkpoint.
- Finish the claim (transition to `done`) and push to main once the work branch
  is verified green.
