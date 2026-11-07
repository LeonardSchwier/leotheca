# Quick Capture: optional note template applied on capture

## Item

rm-7ee9751035fa41ff, "Quick Capture: optional note template applied on capture". The Quick Capture sheet can optionally shape a capture with a Markdown template file from the workspace's existing templates folder.

## Acceptance

1. With Templates enabled and at least one file in the templates folder, the sheet shows a "Template" select whose default is "None (plain capture)". With Templates disabled, or an empty/missing folder, no select appears and behavior is identical to today.
2. "None" produces byte-identical output to the current capture (regression test on both append and new-note paths).
3. A chosen template is read from the workspace at submit time and rendered by single-pass substitution of `{{content}}`, `{{title}}`, `{{url}}`, `{{date}}` (YYYY-MM-DD, local), `{{time}}` (HH:mm, local). Unknown placeholders are left verbatim. Substituted values are never re-scanned (a capture body containing `{{title}}` stays literal).
4. If the template has no `{{content}}`, the capture body is appended after the template, separated by a blank line. A source URL not consumed by `{{url}}` is appended as `Source: <url>`.
5. With a template, the built-in header (`### date time` / `# title` + timestamp) is not added: the template owns structure. Append mode keeps the existing blank-line separation and CRLF handling. New-note mode (daily target) writes the rendered text as the whole note.
6. Template read failure, a template larger than 64 KiB, or a path outside the templates folder/workspace aborts the capture with a visible error. The typed capture text is kept, nothing is written, and the user can pick "None" and retry.
7. The choice persists for the session (module signal), but is reset to None if the chosen file no longer exists in the folder listing. No network, no new storage format.

## Context

Read: `src/app/CaptureSheet.tsx`, `src/capture/captureCommit.ts`, `captureDestinations.ts`, `src/workspace/fileTreeStore.ts` (`listTemplates`, `NoteTemplate`), `src/settings/workspaceSettings.ts` (`templatesEnabled`, `templatesFolder`), `src/workspace/paths.ts`. Reusing the existing templates setting avoids a second template concept and keeps the change outside `src/settings` (held by another claim). Data flow: select -> `loadCaptureTemplate` (contained read) -> `renderCaptureTemplate` -> `appendToInboxNote` / `createNoteWithTitle` with `verbatim: true`.
Crash-freedom: read and list failures are caught and surfaced; the listing result is generation-guarded against sheet close; the template read is awaited inside the submit try/catch; empty, huge (64 KiB cap) and CRLF templates covered; non-UTF-8 bytes fail the read and abort with an error.

## Plan

1. `src/capture/captureTemplate.ts` + `.test.ts`: `renderCaptureTemplate`, `loadCaptureTemplate` (containment, size cap).
2. `src/capture/captureCommit.ts` + test: `verbatim` option (no header) for append and new note.
3. `src/app/CaptureSheet.tsx` + test: select, list loading, submit wiring, error path.

## Out of scope

A persisted default template setting (needs `src/settings`, claimed elsewhere; follow-up). Pending/Android-share captures applying templates. Template variables beyond the five above.

## Rulings

- Reuse existing templates folder vs new capture-only setting -> reuse | one template concept, no settings schema migration | easy to add a persisted default later.
- Missing `{{content}}` -> append body after template | existing templates written for "New note from template" have no placeholders and must not lose the capture | none.
- Failed template read -> abort, not silent plain capture | silent fallback would hide a broken config and produce unexpected note shape | user clicks None to retry.
- Substitution is single pass | prevents capture text injecting placeholders | none.

## Design system

Reuse: the existing `capture-sheet-field`, `capture-sheet-input`, `capture-sheet-select` classes and label pattern used by the "Capture into" select. No new CSS.

## Evidence

Filled at stage 6.

## Evidence

Landed a7eb21b (merge 6bf60fa) and 155617e. Hosted CI: CI run 42313292686 success and Agent policy run 42313292622 success on 155617e; its Rules and Release runs failed on an untriaged npm audit finding, a Prettier warning on master-spec.md and a release publish error, all outside this change and fixed by later commits. Main at 1a672b8, which contains 155617e: CI run 42315044064, Release run 42315044185, Rules run 42315044043 all success. Local checks by the implementing session: tsc 0, eslint 0 errors, npm test 174 files / 3264 passed, build ok; four new tests fail when captureCommit.ts is reverted. Not covered: persisted default-template setting, pending and Android-share captures.
