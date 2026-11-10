# Report failures of the quick new note, canvas and drawing commands

## Item

rm-ca75588cd818c9d0, "Report failures of the quick new note, canvas and drawing commands". When the quick-create commands cannot create or open their file, the user sees a plain message and the app raises no unhandled rejection.

## Acceptance

- A helper `createAndOpen(kind, create, open, report)` in `src/app/quickCreate.ts` runs `create`, then `open` with the returned path and name, resolves `true` on success and never rejects.
- A failed create calls `report` once with `Couldn't create the new <kind>: <reason>` and does not call `open`.
- A failed open after a successful create calls `report` once with `Created "<name>" but couldn't open it: <reason>`, for a rejected promise and for a synchronous throw.
- A `report` that itself throws does not make the helper reject.
- Ctrl+N, the palette entries New note, New canvas and New drawing, and the `new-note` automation command all go through the helper, with `window.alert` as the reporter (the convention of the other App failures, for example the PDF export).
- No `unhandledrejection` event fires in any of the failing paths.
- `createNoteQuick`, `createCanvasQuick` and `createInkQuick` (`src/workspace/fileTreeStore.ts`) resolve with the new file when only the tree refresh after a successful write fails, and still reject when the listing before the write or the write itself fails.

## Context

Read: `src/app/App.tsx` (callers at the Ctrl+N shortcut, the palette commands and the `new-note` branch of `runAutomationUrl`), `src/workspace/fileTreeStore.ts` (`createNoteQuick`, `createCanvasQuick`, `createInkQuick`, `createAutoNamedTextFile`), `src/app/App.test.tsx` (mock layout, alert spy pattern, the new-note automation tests).

Data flow: each `create*Quick` calls `requireWorkspacePath` (throws without a workspace), `listDir`, `createAutoNamedTextFile` (rethrows every error except the already-exists collision it retries) and `loadChildren`; `createNoteQuick` also awaits `syncRecentNotesWidget` (best-effort, never rejects). `handleOpenFile` rejects when the read of the new file fails and the request is still current. All five callers were `void create().then(open)` or an uncaught `await` in an async handler, so any of these failures became an unhandled rejection with nothing shown. A `new-note` URL carries the text it should contain, so a silent failure also drops that text.

Crash-freedom checklist: unhandled rejection (fixed by the helper), recovery (a failed create leaves no partial state; the write is the last mutation that matters, and the `loadChildren` refresh after it is now non-fatal, because a refresh that fails when the file is already on disk would read as a failed create and invite a duplicate), concurrency (two Ctrl+N presses each create their own collision-free name, unchanged), platform no-op (`window.alert` exists on desktop and Android WebViews, as the existing callers assume).

## Plan

1. `src/app/quickCreate.test.ts` first: seven unit cases, run and watch them fail (module missing). Then `src/app/quickCreate.ts`.
2. `src/workspace/fileTreeStore.test.ts` and `fileTreeStore.ts`: found by the independent Standards review, so the claim was widened to these two files. Tests first (a failing refresh after the write must still resolve; a failing write or pre-write listing must still reject), then `refreshAfterCreate`.
3. `src/app/App.test.tsx`: add `createCanvasQuick` and `createInkQuick` to the `fileTreeStore` mock; tests for Ctrl+N failing, a palette command failing, the `new-note` automation command failing, each with an `unhandledrejection` listener and an alert spy. Watch them fail against the old call sites, then rewire `App.tsx`.
4. `master-spec.md` change-log line and `CHANGELOG.md` bullet.

## Out of scope

The other floating promises found by the same grep (`flushPendingAutosave`, `rebuildLinkIndex`, `takePendingExternalFile`, the Graph view open) are not changed here; each needs its own look at whether it can reject. A create started in workspace A can still open A's file as a tab after the user has switched to workspace B (`handleOpenFile` takes its authority when it is called, after `create` resolves); that is how the commands behaved before and needs its own item. Replacing `window.alert` with an in-app toast: the app has no toast surface, and a new one is a design item.

## Rulings

- Where does the failure message appear? -> `window.alert`, through an injected `report` | every other App-level command failure in this file already uses it, and the helper stays testable without a DOM | Cost if wrong: swap the reporter at five call sites.
- One helper or fix each call site inline? -> one helper | five call sites with the same two failure modes; inline try/catch would repeat the message wording five times | Cost: one small module.
- Report "create failed" and "open failed" differently? -> yes | after a successful create the file exists, and telling the user "couldn't create" would invite a duplicate | Cost: one more string.
- Should a stale open (superseded by a newer open) be reported? -> no new handling | `handleOpenFile` already rethrows only when the request was still current, so a superseded open resolves | Cost: none.
- Does `report` run inside the catch only? -> yes, and it is itself guarded | an alert that throws must not recreate the rejection this item removes | Cost: a try/catch.
- Is the `new-note` automation command reported too? -> yes | it can carry the user's text; a silent no-op loses it, an alert tells them | Cost if wrong: a stray alert on a failed widget tap.
- Swallow a failed tree refresh after the write, or only reword the message? -> swallow it, in the three `create*Quick` functions | the helper cannot tell which step of `create` failed, and rewording would still call a finished create a failure; the refresh is cosmetic | Cost if wrong: a stale tree until the folder is listed again.
- Anything against the product rules? -> no | local files only, no network, no AI, no camera or microphone.

## Glossary

Glossary: none

## Design system

No UI surface: the message is a native `window.alert`, as in the neighbouring commands.

## Evidence

Filled at stage 7.
