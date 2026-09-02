# Skill: writing a Markdown structure scanner module

Several features (the heading outline, tables, and any future task-list
or wikilink extension) need to scan a note's raw Markdown text for one
kind of structural element and report it with exact source positions.
This codebase has an established, repeated shape for that. Follow it
instead of inventing a new one; `src/markdown/headings.ts` is the
canonical example to read first.

## Shape

1. **Pure, DOM-free, synchronous function(s) over a string.** `scanX(content: string): XRecord[]`. No editor, no DOM, no async; this is what makes it trivially unit-testable and reusable from both the editor and Preview without duplicating logic.
2. **Exact UTF-16 source ranges** on every record (start/end offsets into the original string, matching what CodeMirror and JavaScript string indexing both use), not line/column pairs computed separately, since the consumer almost always needs to feed a range straight back into an editor selection or a Preview DOM mapping.
3. **Skip fenced code blocks and other excluded contexts.** Every existing scanner (`headings.ts`, `tables.ts`) explicitly walks past fenced code blocks (and, for headings, block-level HTML comments) rather than pattern-matching the whole raw string. A structural marker that looks real but sits inside a code fence or comment must not be reported. Write a test proving this exclusion, not just an assumption it works.
4. **Handle both LF and CRLF line endings identically.** Test this directly with a fixture using each.
5. **Record parse warnings/ambiguity rather than silently normalizing them away** when the input is malformed-but-parseable (a ragged table row, a duplicate heading name). Callers can decide what to do with a warning; they cannot recover information a scanner already discarded.
6. **A documented, tested limitation is fine; a silent one is not.** `headings.ts` does not recognize a heading-like line inside a blockquote or list item, and says so directly in its own doc comment and in the roadmap entry that shipped it, rather than pretending full CommonMark compliance.

## Reuse, don't duplicate, existing normalization

If a new feature needs to identify "the same heading" another module
already scans and keys (e.g. F04's heading-link resolution reusing
`headings.ts`'s own key/occurrence normalization), reuse that module's
function directly rather than writing a second, subtly different
matching rule. Only one normalizer for a given concept should exist
long-term; if two currently disagree, that is a bug to fix, not a
precedent to extend.

## Wiring into the UI

1. A `useNoteX` hook (see `src/outline/useNoteHeadings.ts`) debounces re-scanning on content change and exposes the scanned records to components, so the scan itself stays UI-framework-agnostic and reusable from more than one component without duplicating the debounce/staleness logic.
2. A panel or inline component consumes the hook's output and renders it; keep click-to-navigate wired through the editor's existing `reveal`-style prop (see `MarkdownEditor`'s `reveal` prop and `OutlinePanel`'s click handler) rather than inventing a second navigation mechanism for a new feature.
3. If both a nested/tree rendering and a flat/virtualized rendering of the same records need to exist (large-list performance), factor the shared row markup into its own component (`OutlineRowContent.tsx` is the precedent) so the two renderers can never visually drift apart.

## Tests to write

- Every element kind the scanner recognizes, at minimum one direct positive case each.
- The fenced-code-block and (if applicable) HTML-comment exclusion, as an explicit test, not an assumption.
- CRLF/LF equivalence.
- Any duplicate-name or ambiguous-match handling the module defines.
- Hierarchy/relationship computation (parent/child, section ranges) if the scanner builds one, including an empty/no-match/no-elements-found state.
- A component-level test for debounced rescanning with stale-scan supersession, if you added a `useNoteX` hook, following `OutlinePanel.test.tsx`'s existing pattern for it.
