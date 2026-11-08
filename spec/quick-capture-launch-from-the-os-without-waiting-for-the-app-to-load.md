# Quick Capture: launch from the OS without waiting for the app to load

## Item

rm-9a637eae859ce76e, "Quick Capture: launch from the OS without waiting for the app to load". Slice 1: an OS entry (desktop command-line flag, Android widget and launcher shortcut) opens the existing capture sheet as soon as the workspace is restored, instead of queueing the capture or doing nothing. A native append that writes the inbox before the webview exists is NOT built here; it needs a device and is split into a blocked item.

## Acceptance

1. `leotheca://capture` received before settings finish loading (Android widget cold start) waits for settings, then opens the capture sheet for review. It is queued as a pending capture only when no workspace exists after settings loaded.
2. Desktop: `leotheca --capture` on a fresh process opens the capture sheet once the workspace is restored (buffered flag, taken once); on a running instance, single-instance forwarding emits `quick-capture-launch`, raises the window, and opens the sheet.
3. The flag is recognized by an exact, pure match on arguments after argv[0]; no other argument (a path, a URL, `--capture=1`) triggers it, and it never disturbs Markdown file-open extraction.
4. With no workspace the launch is a silent no-op (nothing is written, nothing is queued).
5. Android: a static launcher shortcut "Quick Capture" fires the same `leotheca://capture` VIEW intent as the widget, scoped to the app package; the widget builds its intent through one pure class; no new permission, no network, no camera, no microphone.
6. Capture content is never written without the sheet's review (existing F05-FR-03 stays).

## Context

Already present: `LeothecaQuickCaptureWidgetProvider` (`leotheca://capture`), the `capture` branch of `runAutomationUrl` in `src/app/App.tsx`, `parseAutomationUrl`, the deep-link plugin plus single-instance with its `deep-link` feature (a `leotheca://capture` argv already reaches `onOpenUrl` on Linux and Windows), `external_open` cold-start buffer pattern (`PendingOpenFile`, `open-external-file`). Gap found: the `capture` branch checks `workspacePath` immediately, unlike `new-note` and `open-note` which `await waitForSettingsLoaded()`; a cold widget tap therefore queues a pending capture instead of opening the sheet. Platform boundary: the Android build uses Capacitor, so the desktop flag path is Tauri-only and a no-op bridge exists for Android.

## Plan

1. Failing test then fix: `capture` branch awaits `waitForSettingsLoaded()` (`src/app/App.test.tsx`).
2. `src-tauri/src/quick_capture_launch.rs`: `requests_quick_capture`, `PendingQuickCapture`, `take_pending_quick_capture`; wire cold start and single-instance in `lib.rs`; Rust unit tests.
3. Bridge `takePendingQuickCapture` / `onQuickCaptureLaunch` (tauri impl, capacitor no-op); App effect opens the sheet; App tests.
4. Android: `QuickCaptureLaunch` pure class + JVM test; provider uses it; `res/xml/shortcuts.xml` + manifest meta-data + string; resource tests.
5. Docs: master-spec, CHANGELOG, README status, ANDROID_WIDGETS.md; seed the blocked device item.

## Out of scope

Native pre-webview inbox append (SAF write from Java before the WebView loads), iOS, a Lock Screen entry, a `.desktop` action file, any voice, camera, network or AI path, any new permission. Device-only behavior (widget placement, shortcut appearance, real cold-start latency) stays UNVERIFIED and is carried by the split item.

## Rulings

- Should the flag append straight to the inbox without a sheet? -> No, open the sheet | F05-FR-03 requires review of external captures and a silent write is irreversible for a mistyped trigger | Cost if wrong: one extra Enter press.
- New bridge functions or reuse `open-external-file`? -> New pair mirroring the existing one | the payload is not a file and overloading the file event would make `ExternalMarkdownFile` lie | Cost: two small bridge functions.
- Handle `leotheca://capture` argv in Rust too? -> No | the deep-link plugin already delivers it on a running and a fresh process | Cost if wrong: the flag is the only added entry.
- No workspace at launch: queue or ignore? -> Ignore | a bare launch carries no content, queueing an empty capture would only create noise | Cost: none.
- Raise the window on a relaunch? -> Yes, best effort, errors ignored | a sheet in a hidden window defeats the point | Cost: a no-op where the window manager refuses focus.
- Shortcut implementation: static `shortcuts.xml` | no runtime API, no permission, testable as a resource | Cost: label fixed to English until strings are localized.

## Glossary

Glossary: none

## Design system

No UI surface: the existing capture sheet is reused unchanged; the Android shortcut uses the existing launcher icon and a system-rendered label.

## Evidence

(filled at archive)
