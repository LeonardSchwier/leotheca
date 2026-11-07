# F05 Software Design Document: Universal Quick Capture and Inbox

**Status:** Approved for implementation design  
**Feature:** F05 Universal Quick Capture and Inbox  
**Target:** Desktop and Android  
**Last updated:** 2026-09-01

## 1. Summary

F05 lets users capture text, links, and supported images into a local Leotheca workspace with minimal friction. It provides an in-app Capture Sheet, a local `leotheca://capture` automation route, Android share-target integration, configurable inbox destinations, and a bounded crash-safe pending queue for captures that arrive before a workspace can accept them.

A capture is never sent to a server and never requires an account. Leotheca does not fetch shared URLs or generate remote previews. The final result is ordinary Markdown plus ordinary local attachment files. When a destination note is already open, the capture is applied to the canonical in-memory document so a later autosave cannot overwrite it.

F05 integrates with F20 Workspace Profiles. Only one workspace is active at a time. A capture targeting another profile is queued until the user activates that profile through the authoritative workspace transition coordinator.

## 2. Motivation

Knowledge tools are most useful when adding a thought is easier than postponing it. Captures often arrive outside the note the user is editing: a copied idea, a browser URL, selected text from another Android app, or a photo. Without a reliable inbox, these fragments end up in unrelated apps or are lost.

Universal capture is also a high-risk write path. External intents are untrusted, Android URI permissions are short-lived, a workspace may be unavailable, and direct disk appends can race with a dirty open note. F05 therefore separates receipt, review, and commit. It keeps pending external data in bounded app-private storage until the final Markdown write succeeds or the user explicitly discards it.

## 3. Goals

1. Open a fast Capture Sheet from anywhere inside Leotheca.
2. Accept local capture deep links on desktop and Android.
3. Receive Android shared text, URLs, and images through standard share intents.
4. Append a readable Markdown block to a configured inbox note.
5. Optionally create a new note in a configured capture folder.
6. Support a date-pattern destination without requiring the complete F01 calendar feature.
7. Preserve external capture data across cold start, workspace recovery, and activity recreation.
8. Route every write through the active workspace bridge, canonical document state, and save coordinator.
9. Provide deterministic, retry-safe attachment ingestion.
10. Keep all processing local, bounded, secure, and understandable.

## 4. Non-goals

The first release does not include:

- URL fetching, Open Graph metadata, readability extraction, or screenshots;
- a cloud inbox or cross-device service;
- background reminders or scheduled captures;
- OCR;
- audio recording or speech-to-text;
- silent writes from arbitrary external deep links;
- an always-running desktop background agent;
- a required tray icon;
- clipboard monitoring;
- automatic capture from browser history;
- cross-workspace writing without activating the destination profile;
- support for arbitrary shared binary file types;
- annotation of shared images;
- automatic tagging through machine learning;
- hidden capture metadata inside notes.

A configurable desktop global shortcut may open the Capture Sheet while Leotheca is running. Keeping the app resident only to service the shortcut is out of scope.

## 5. Capture sources

### 5.1 In-app Capture Sheet

Entry points:

- Command Palette action `Quick Capture`;
- configurable in-app keyboard shortcut;
- optional global shortcut while the desktop process is running;
- mobile top-bar or overflow action;
- empty-state and inbox-note actions where useful.

The sheet opens without changing the current note. The text field receives focus unless a platform accessibility setting makes automatic focus inappropriate.

### 5.2 Local deep link

Supported route:

```text
leotheca://capture
```

Recognized query parameters:

| Parameter | Meaning |
|---|---|
| `text` | UTF-8 capture body |
| `title` | Suggested title for a new note or capture heading |
| `url` | Optional source URL, recorded but never fetched |
| `mode` | `append` or `new` |
| `profile` | Optional F20 profile UUID |
| `open` | `true` to open the result after commit |

Security and size rules:

- The decoded combined text, title, and URL payload is limited to 32 KiB.
- Unknown parameters are ignored only if the route is otherwise valid.
- Invalid enum or profile values are shown as review warnings, not executed.
- Absolute file paths, workspace paths, and Android content URIs are not accepted as note destinations through the URL.
- An external deep link always opens the Capture Sheet for review in the first release.
- The route cannot request deletion, arbitrary attachment reads, silent script execution, or an unrestricted target path.

### 5.3 Android share target

The Android activity registers for:

- `ACTION_SEND` with `text/plain`;
- `ACTION_SEND` with `text/uri-list` when a textual URL is available;
- `ACTION_SEND` with `image/*`;
- `ACTION_SEND_MULTIPLE` with `image/*`.

When both `EXTRA_TEXT` and image streams are present, both are represented in one pending capture.

The native receiving layer must ingest transient content URIs into app-private staging before the grant can expire. It must not assume a shared URI is a filesystem path.

### 5.4 Current selection helpers

Inside Leotheca, a future context action may prefill the Capture Sheet from selected text. It must still use the same request model and commit path. No separate direct append implementation is allowed.

## 6. Destinations

### 6.1 Destination modes

The Capture Sheet supports:

1. **Append to inbox note**
2. **Create new note in capture folder**
3. **Append to date-pattern note**

Default mode is Append to inbox note.

### 6.2 Inbox note

Default relative path:

```text
Inbox.md
```

The user may configure another contained Markdown path. Validation rules:

- path is workspace-relative;
- extension is `.md` or is normalized to `.md`;
- path cannot be under `.leotheca/`;
- traversal and absolute paths are rejected;
- parent folders may be created through contained bridge operations;
- the target is created if absent.

### 6.3 Capture folder

Default relative folder:

```text
Inbox/
```

For New note mode, a title is converted to a safe filename while preserving the visible title in the note when configured. Empty titles use a local timestamp. Collisions append `-2`, `-3`, and so on after a contained existence check.

Example:

```text
Inbox/Release-idea-2026-09-01-1432.md
```

Filename generation must be deterministic enough for preview and revalidated at commit.

### 6.4 Date-pattern target

A user may configure a limited local pattern such as:

```text
Daily/{{date:YYYY-MM-DD}}.md
```

Supported tokens in the first release:

- `{{date:YYYY-MM-DD}}`
- `{{date:YYYY-MM}}`
- `{{date:YYYY}}`

Tokens use the user's local calendar at commit time. Arbitrary format strings, shell expansion, and directory traversal are not supported. F01 may later adopt the same date-token utility.

### 6.5 Workspace profile

The destination profile selector uses F20's profile catalog.

Rules:

- default is the active profile;
- the user may designate one default capture profile;
- the profile UUID, not a display path, is persisted in capture preferences;
- a capture for a non-active profile is not written in the background;
- committing such a capture first invokes F20's save-safe activation flow;
- if activation fails or access must be relinked, the capture remains pending;
- forgetting a profile does not discard its pending captures without explicit user confirmation.

## 7. Capture Sheet experience

### 7.1 Fields

Required controls:

- multiline capture body;
- optional title;
- source URL when supplied;
- attachment thumbnails and remove actions;
- destination profile;
- destination mode and target preview;
- `Open after capture` option;
- primary `Capture` action;
- `Save for later` for external requests;
- `Discard` with confirmation for staged external data.

The target preview displays only a safe human-readable profile name and workspace-relative path. Android grant tokens are never shown.

### 7.2 Fast path

For an in-app text capture with a valid active destination:

- opening the sheet focuses the body;
- the configured submit shortcut commits;
- success closes the sheet and shows a truthful local confirmation;
- `Open after capture` navigates only after the write succeeds.

The application must not announce success when content is only queued or when an attachment copy remains incomplete.

### 7.3 External review

External requests show their source as `Shared from Android` or `Opened from local automation`, without trusting an arbitrary application label as security identity.

The user can edit all imported text before commit. The original pending item remains recoverable until the edited version commits successfully.

### 7.4 Pending Inbox

When one or more captures cannot commit, a local Pending Captures surface shows:

- received date and source type;
- safe text preview;
- attachment count and total size;
- intended profile and destination;
- status such as `Needs workspace access`, `Ready`, or `Previous attempt failed`;
- Review, Retry, Change destination, and Discard actions.

Pending captures are distinct from the Markdown inbox note. They are temporary app-private work awaiting an explicit commit.

### 7.5 Compact behavior

On Android and compact layouts:

- Capture is a full-height sheet or route;
- body input grows with content and respects the software keyboard;
- attachment strip scrolls horizontally inside its own region, not the page;
- target settings may collapse under a `Destination` row;
- primary actions remain reachable above safe-area insets;
- Android Back first closes nested pickers, then asks about an unsaved external draft, then exits the sheet.

## 8. Markdown output

### 8.1 Canonical append block

Default appended representation:

```markdown
### 2026-09-01 14:32

Captured text remains ordinary Markdown.

Source: <https://example.invalid/path>

![[attachments/capture-20260901-143200-photo.jpg]]
```

Rules:

- timestamp uses local time and ISO-like ordering;
- title replaces the timestamp heading when supplied, with timestamp available on the next line if configured;
- body text is inserted as supplied after newline normalization, not interpreted or fetched;
- source line is omitted when absent;
- attachment references use the application's ordinary local attachment syntax;
- one blank line separates fields;
- append adds exactly enough leading newlines to preserve a valid block boundary;
- the target note's existing LF or CRLF convention is preserved;
- no hidden capture ID is inserted into the Markdown.

The exact default may be exposed as a local capture template in a later phase. The first implementation keeps one versioned serializer to avoid arbitrary template execution.

### 8.2 New note representation

A new note contains optional supported frontmatter only when the user has configured capture defaults through existing settings. At minimum:

```markdown
# Release idea

Captured text.

Source: <https://example.invalid/path>
```

The visible heading is escaped as Markdown text. A title is not required.

### 8.3 URL behavior

The URL field is recorded literally after validation as an `http`, `https`, or other explicitly allowed user-facing URI scheme. It is never opened during capture and never used to fetch a title, favicon, preview, or content.

Potentially dangerous schemes are rendered as plain text unless the existing safe-link policy explicitly permits them.

## 9. Attachment ingestion

### 9.1 Limits

First-release limits:

- maximum 10 images per capture;
- maximum 25 MiB per image;
- maximum 100 MiB staged attachments per capture;
- maximum 250 MiB total pending-queue attachment storage;
- MIME must be `image/*` and content must be readable through the provided URI;
- unsupported items remain listed with a clear error and are not silently dropped.

Limits are checked before and during streaming because external metadata can be wrong.

### 9.2 Staging

For Android shares:

1. Native code receives the intent and validates count and declared MIME.
2. Each URI is streamed into an app-private file with a generated capture-item ID.
3. Actual byte count and basic image signature are recorded.
4. The staged manifest is committed atomically in app-private storage.
5. The UI receives only the pending item ID and safe metadata.

Original display names are sanitized for presentation and file generation. Path separators, control characters, bidirectional control characters, and reserved names are removed or replaced.

### 9.3 Workspace destination

Default attachment folder follows the workspace's existing attachment setting. Final names use:

```text
capture-<local-date>-<local-time>-<short-random>-<safe-name>.<ext>
```

The bridge chooses a collision-free contained path. Relative Markdown references are calculated from the destination note.

### 9.4 Retry-safe commit

A `CaptureCommitPlan` assigns final attachment paths before writes. Every staged file has a content fingerprint.

On retry:

- if the planned workspace attachment exists with the same fingerprint, reuse it;
- if it exists with different content, allocate a new path;
- never overwrite an existing attachment;
- keep staged files until the note commit succeeds;
- after success, remove staging data;
- if note commit fails after attachment copies, keep the plan and reuse those exact files on retry.

A user who discards a failed capture may be offered cleanup of new unreferenced files created by that capture. Cleanup is explicit and fingerprint-validated.

## 10. Pending queue

### 10.1 Storage

Pending captures live in platform app-private storage, not in the workspace:

```text
pending-captures/
  index.json
  <capture-id>/
    manifest.json
    attachments/
```

The index and manifests are versioned, runtime-decoded, and written atomically where supported.

```typescript
interface PendingCaptureV1 {
  version: 1;
  id: string;
  receivedAt: string;
  source: "in-app" | "deep-link" | "android-share";
  targetProfileId?: string;
  mode: "append" | "new" | "date";
  text: string;
  title?: string;
  sourceUrl?: string;
  openAfterCommit: boolean;
  attachments: PendingAttachment[];
  commitPlan?: CaptureCommitPlan;
  lastError?: PendingCaptureError;
}
```

### 10.2 Queue policy

- Maximum 50 pending captures.
- Text manifest storage is limited to 5 MiB total.
- Attachment storage follows the 250 MiB total limit.
- When a new external capture would exceed a limit, the user is shown a blocking choice to review existing pending items or reject the new share. Existing data is not deleted automatically.
- In-app drafts are not persisted unless the user chooses Save for later or a platform lifecycle event requires preservation.
- A successful commit removes the item only after all workspace writes are confirmed.
- Discard requires confirmation when attachments or nonempty text exist.

### 10.3 Privacy

Pending content is app-private but may still be included in device backups according to platform policy. The product documentation must state this and expose a `Clear pending captures` action. Platform backup exclusion may be applied to staged attachments if consistent with recovery expectations.

## 11. Commit protocol

### 11.1 Build plan

```typescript
interface CaptureCommitPlan {
  captureId: string;
  workspaceSession: number;
  profileId: string;
  notePath: string;
  noteMode: "append" | "create";
  expectedNoteFingerprint?: string;
  markdownBlock: string;
  attachments: PlannedCaptureAttachment[];
  createdAt: string;
}
```

The plan is recalculated when destination, body, title, URL, or attachment selection changes.

### 11.2 Activate destination

If the profile is not active:

1. preserve the current Capture Sheet draft in the pending queue;
2. call F20's authoritative profile activation flow;
3. drain current workspace saves and native operations;
4. on successful activation, rebuild the target plan against the active workspace;
5. on failure, return to the pending item with recovery actions.

The capture cannot write into a profile based only on a stored path or URI token while another workspace is active.

### 11.3 Commit attachments

Stream staged attachments to unique contained workspace paths. Record each successful copy in the pending plan for retry. Do not remove staging data.

### 11.4 Commit note

For an existing open target note:

- use the canonical in-memory document;
- append through one CodeMirror transaction at the document end;
- preserve current selection unless `Open after capture` requests navigation;
- serialize with the save coordinator;
- mark commit success only after the write succeeds.

For an existing closed target note:

- read through the bridge;
- compute and validate its fingerprint;
- construct append text with its line-ending convention;
- revalidate immediately before write;
- write through the bridge;
- fail closed on external change.

For a missing target note:

- create parent folders through contained operations;
- create the note only if the final path remains absent;
- never overwrite a file created concurrently.

### 11.5 Finalize

After note write success:

- incrementally update workspace metadata for the note;
- open and reveal the inserted block when requested;
- remove the pending manifest and staged files;
- report a truthful success message with destination profile and path;
- retain a lightweight in-memory undo opportunity only when it can safely perform a conflict-checked source removal. Persistent capture undo is out of scope.

## 12. Architecture

Recommended modules:

```text
src/capture/
  captureTypes.ts
  captureSettings.ts
  captureSerializer.ts
  captureDestinations.ts
  captureQueue.ts
  captureCommit.ts
  captureProtocol.ts
  CaptureSheet.tsx
  PendingCaptures.tsx

src/workspace/
  appendNote.ts

android/.../
  ShareIntentReceiver.kt
  PendingCaptureStore.kt
```

A native receipt layer stages external Android data. Shared TypeScript owns review, destination selection, Markdown serialization, and commit coordination. Platform bridges own contained reads, writes, directory creation, and attachment streams.

## 13. Bridge and manifest changes

### 13.1 Shared bridge

Add or expose typed operations for:

- append or replace contained note content under path authority;
- create contained parent directories;
- stream a staged attachment into a unique contained file;
- fingerprint a contained file when needed;
- remove a newly created capture attachment during explicit cleanup.

All operations participate in the existing in-flight bridge tracker and workspace transition drain.

### 13.2 Android manifest

Add narrow intent filters for the supported MIME types and actions. The main activity must handle both cold-start and already-running delivery. Intent payload parsing must occur in native code with count, size, and URI permission checks before data reaches JavaScript.

No broad file-management permission is requested. SAF workspace access remains authoritative.

### 13.3 Desktop protocol and shortcut

The desktop scheme registration routes only recognized Leotheca automation URLs. An optional global shortcut while the process is running opens an empty Capture Sheet. Shortcut registration errors, such as conflicts with another app, are shown in Settings and do not disable other capture routes.

## 14. Concurrency and lifecycle

- Every commit plan carries active profile ID and workspace session.
- Profile switch, workspace relink, or workspace generation change invalidates the plan and triggers rebuild.
- Pending external data survives process restart and Android activity recreation.
- A second share received while the Capture Sheet is open creates another pending item rather than overwriting the current draft.
- Multiple pending captures for one note commit serially by note path.
- Attachment streaming is bounded and cancellable.
- Open-document appends serialize with autosave and F02/F03/F04 mutations.
- A workspace transition cannot complete while a note or attachment write remains untracked.
- Stale completion callbacks cannot delete a newer pending item or show success in a different workspace.

## 15. Error and recovery model

Required errors and actions:

| Error | Required actions |
|---|---|
| No workspace profile | Choose or add workspace, Keep pending |
| Profile unavailable | Retry, Relink, Choose another profile, Keep pending |
| Target path invalid | Change destination |
| Note changed externally | Reload destination and retry, Create new note |
| Note save failed | Retry, Open destination, Keep pending |
| Attachment unreadable | Remove attachment, Retry |
| Attachment limit exceeded | Remove items, Keep text only, Cancel |
| Workspace storage full | Free space, Retry, Keep pending |
| Shortcut registration failed | Change shortcut, Disable global shortcut |
| Pending queue full | Review pending captures, Reject new capture |

Errors never discard the original staged content automatically.

## 16. Security and privacy

- No capture content leaves the device.
- URLs are recorded but never fetched.
- External deep links always require review in the first release.
- Input lengths, attachment counts, and stream sizes are bounded.
- Shared URIs are opened only with granted permissions and copied to app-private staging.
- External display names never become paths without sanitization.
- Workspace paths are selected from validated settings, not accepted from external parameters.
- Writes and directory creation are containment-checked.
- Existing files are never overwritten by attachment ingestion.
- Pending manifests never contain Android grant tokens after staging.
- Logs contain capture IDs and error classes, not captured text, URLs, or URI values.
- Rendered previews use existing safe-link and HTML sanitization rules.

## 17. Accessibility

- The Capture Sheet has a clear title, description, and logical field order.
- Imported versus user-entered content is not distinguished by color alone.
- Attachment remove controls include filenames in accessible names.
- Destination summaries are announced when changed.
- Commit progress and errors use polite live regions.
- Focus moves to the first invalid field after validation failure.
- A successful capture either restores prior focus or moves to the opened destination as requested.
- Pending Captures supports keyboard, screen-reader, and touch operation.
- Compact controls meet 44 by 44 CSS pixel targets and remain visible above the software keyboard.
- Discard confirmation clearly states what local staged data will be deleted.

## 18. Performance requirements

- Opening an empty in-app Capture Sheet should respond visually within 100 ms.
- External text-only capture staging should not block the UI thread.
- Attachment copies stream in bounded chunks and do not load complete images into JavaScript memory.
- Thumbnail generation is bounded and can fall back to an icon.
- Pending-list previews load lazily.
- Commit writes only the target note and selected attachments.
- A successful append reparses only the affected note in the workspace metadata index.
- Queue size checks use manifest metadata plus verified stream counts.
- Process startup should not decode full attachment bodies.

## 19. Functional requirements

**F05-FR-01** The application shall expose an in-app Quick Capture command and shortcut.  
**F05-FR-02** The application shall accept the defined `leotheca://capture` route with bounded validated parameters.  
**F05-FR-03** External deep-link captures shall require user review before writing.  
**F05-FR-04** Android shall accept supported text, URL, single-image, and multi-image share intents.  
**F05-FR-05** Android shared URIs shall be staged before transient permission can expire.  
**F05-FR-06** The Capture Sheet shall support append, new-note, and date-pattern destinations.  
**F05-FR-07** Destination paths shall be contained, validated, and prohibited under `.leotheca/`.  
**F05-FR-08** F20 profile UUIDs shall identify capture destinations.  
**F05-FR-09** A non-active destination profile shall be activated through F20 before commit.  
**F05-FR-10** Captures that cannot commit shall remain in a bounded app-private pending queue.  
**F05-FR-11** Pending data shall be removed only after successful commit or explicit discard.  
**F05-FR-12** Markdown output shall use the versioned local serializer and contain no hidden capture ID.  
**F05-FR-13** URLs shall never be fetched during capture.  
**F05-FR-14** Attachment count, item size, capture size, and total queue size shall be enforced.  
**F05-FR-15** Attachment filenames shall be sanitized and final paths shall be collision-free.  
**F05-FR-16** Existing attachment files shall never be overwritten.  
**F05-FR-17** Attachment retry shall reuse an existing planned file only when its fingerprint matches.  
**F05-FR-18** An open target note shall be changed through the canonical document and save coordinator.  
**F05-FR-19** A closed target note shall be re-read and conflict-checked before append.  
**F05-FR-20** New-note creation shall fail rather than overwrite a concurrently created file.  
**F05-FR-21** A commit shall report success only after attachments and note content are durable.  
**F05-FR-22** A successful commit shall refresh the target note's workspace metadata.  
**F05-FR-23** Multiple captures for one note shall serialize without lost updates.  
**F05-FR-24** Workspace transitions shall track and drain all capture writes.  
**F05-FR-25** Stale callbacks shall not delete pending data or publish success.  
**F05-FR-26** The feature shall require no account, telemetry, network service, or broad Android storage permission.  
**F05-FR-27** The Capture Sheet and Pending Captures shall be fully keyboard and screen-reader operable.  
**F05-FR-28** Core capture behavior shall be equivalent on desktop and Android.

## 20. Acceptance criteria

1. An in-app text capture appends one correctly separated Markdown block to the configured inbox.
2. Existing LF and CRLF line endings are preserved.
3. A missing inbox note and parent folder are created through contained operations.
4. A title collision in New note mode creates a safe unique filename without overwriting.
5. Date-pattern mode resolves against the user's local date at commit.
6. A deep link larger than the configured bound is rejected into a review error without writing.
7. A deep link cannot supply an absolute destination path or silently commit.
8. Android sharing of text opens a recoverable reviewed capture on cold start and warm start.
9. Android sharing of one or several images stages each readable item and reports unsupported items.
10. Revoking the transient source grant after staging does not lose the pending copy.
11. Attachment limits stop oversized input without deleting already pending captures.
12. Final attachment names are safe, unique, and never overwrite existing files.
13. Retrying after a note-write failure reuses same-fingerprint attachment copies instead of duplicating them.
14. A dirty open inbox note receives the append in memory and is not overwritten by an older disk snapshot.
15. An external change to a closed inbox note before write produces a conflict and preserves the pending capture.
16. Two captures committed rapidly to one note both appear exactly once.
17. Selecting another F20 profile invokes save-safe activation before any destination write.
18. Failed profile activation keeps the capture pending with Retry, Relink, and Change destination actions.
19. Process restart or Android activity recreation preserves every committed pending manifest and staged attachment.
20. Successful commit removes staging only after note durability is confirmed.
21. Discard requires confirmation and removes only the selected pending item's app-private data.
22. Shared URLs are stored as text and trigger no network request.
23. Capture progress, validation, and errors are accessible without color and every control is keyboard reachable.
24. The compact sheet works at 320 by 568 CSS pixels with the software keyboard visible.
25. No Android content URI, profile grant token, captured text, or source URL appears in logs.

## 21. Test plan

### 21.1 Unit tests

- Deep-link parameter decode, limits, and invalid values.
- Destination path validation and date tokens.
- Filename generation, sanitization, collision suffixes, and reserved names.
- Markdown append serializer for empty and nonempty files, LF, CRLF, Unicode, title, URL, and attachments.
- Pending manifest decode, unknown fields, corruption, and queue limits.
- Attachment fingerprint and retry-path selection.
- Commit-plan invalidation on profile or workspace generation change.

### 21.2 Component tests

- Empty in-app Capture Sheet.
- Prefilled external review.
- Destination profile and mode changes.
- Attachment list, errors, and remove actions.
- Pending-list Review, Retry, Change destination, and Discard.
- Keyboard submit, focus restoration, and unsaved-close confirmation.
- Compact software-keyboard layout.

### 21.3 Integration tests

- Append to clean open note.
- Append to dirty open note.
- Append to closed note changed externally.
- Create absent note and folders.
- Two same-note commits.
- Attachment copy success followed by note failure and retry.
- Workspace switch during attachment stream and note save.
- F20 activation success, relink requirement, and failure.
- Metadata index incremental refresh after commit.
- Deep-link cold start and already-running delivery.

### 21.4 Android tests

- `ACTION_SEND` text from multiple representative apps.
- `ACTION_SEND` text plus one image.
- `ACTION_SEND_MULTIPLE` with 1, 10, and more than 10 images.
- Incorrect MIME metadata and unreadable URI.
- Stream larger than declared size.
- Activity recreation during staging and review.
- Process death after staging and during commit.
- SAF grant loss and recovery.
- TalkBack, increased text size, and Android Back behavior.

### 21.5 Desktop tests

- Local protocol routing and payload limits.
- Protocol activation while app is closed and already running.
- In-app and optional global shortcut behavior.
- Shortcut conflict reporting.
- Unicode paths and Windows reserved filename handling.

### 21.6 Security tests

- Path traversal in title, deep-link parameters, and shared display name.
- Malicious URI schemes.
- Huge text and attachment denial-of-service attempts.
- Crafted content URI outside granted access.
- HTML and script payloads in capture body and title.
- Log inspection for content leakage.

## 22. Rollout plan

### Phase 1: In-app text capture

- Add settings, serializer, contained append, and Capture Sheet.
- Support active workspace only behind a feature flag.

### Phase 2: F20 profile and pending queue

- Add destination profile selector and save-safe activation.
- Add app-private pending storage and recovery UI.

### Phase 3: Local protocol

- Add reviewed `leotheca://capture` route and desktop lifecycle handling.
- Add optional running-process global shortcut.

### Phase 4: Android sharing and images

- Add narrow manifest filters, native URI staging, bounded attachment commit, and retry.
- Complete lifecycle and provider tests.

### Phase 5: General availability

- Enable by default after desktop and Android acceptance gates pass.
- Publish privacy, workflow, protocol, and troubleshooting documentation.

## 23. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Direct append races with dirty editor | Lost capture or note edits | Canonical open-document mutation and one save coordinator |
| External URI permission expires | Lost attachment | Native app-private staging during receipt |
| Malicious deep link writes content | Unwanted file modification | Review required, bounded parameters, no external target paths |
| Attachment retry duplicates files | Workspace clutter | Planned names, fingerprints, reuse, never overwrite |
| Queue grows without bound | Storage exhaustion | Count and byte limits with explicit user action |
| Profile switch writes to wrong workspace | Data leak | Profile UUID plus workspace session, F20 activation before commit |
| URL preview performs network access | Privacy violation | Store literal URL only, no fetch code path |
| Android provider behavior differs | Failed commit | Streamed bridge operations, explicit errors, lifecycle/provider tests |

## 24. Documentation changes

Update:

- user guide for Capture Sheet, inbox modes, and Android sharing;
- Settings reference for destination profile, note path, folder, and shortcut;
- local automation protocol documentation with limits and review semantics;
- privacy documentation for pending app-private data and no URL fetching;
- Android integration and manifest documentation;
- architecture documentation for pending queue and commit coordination;
- roadmap status for F05.

## 25. Definition of done

F05 is done when:

- in-app, deep-link, and Android share capture routes feed one validated request model;
- external data remains recoverable until a durable Markdown commit or explicit discard;
- no route can silently target an arbitrary path or inactive workspace;
- open and closed note writes are conflict-safe and serialize with existing saves;
- attachment ingestion is bounded, retry-safe, contained, and never overwrites files;
- F20 activation and workspace transitions are generation-authoritative;
- no URL fetch, account, telemetry, cloud queue, or broad storage permission is introduced;
- all functional requirements and acceptance criteria pass on desktop and Android;
- accessibility, lifecycle, privacy, and performance gates pass;
- documentation and tests land with the implementation;
- no unresolved critical or high-severity data-loss or security defect remains.
