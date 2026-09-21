# Handoff: rm-aafb783f25b67c4e — Print/export a note on Android

## Session
- Agent: Claude-Code-cloud-20260921T232516Z-b419f37d
- Date: 2026-09-21
- Claim: rm-aafb783f25b67c4e (claimed 23:25:21Z, lease until 00:55:21Z)

## Task
Phase 3 of the print/export split (Phases 1-2, Desktop print and HTML
export, already `✅`): add the equivalent capability on Android, which has
no browser iframe/print API and no native "Save As" file dialog the way
Tauri/Desktop does.

## Implementation
- New Capacitor plugin `android/app/src/main/java/com/leonardschwier/leotheca/PrintExportPlugin.java`:
  - `printHtml(html, title)`: loads the given standalone HTML document into
    a throwaway off-screen `WebView`, then on `onPageFinished` drives the
    real `android.print.PrintManager` via `WebView.createPrintDocumentAdapter`
    — the same mechanism Chrome's own "Print" menu item uses, giving a real
    OS print dialog (with "Save as PDF") for free.
  - `exportHtml(html, defaultFileName)`: launches `Intent.ACTION_CREATE_DOCUMENT`
    (the standard Storage Access Framework "Save As" picker, same family as
    `FolderAccessPlugin.pickFolder`'s `ACTION_OPEN_DOCUMENT_TREE`), then
    writes the HTML bytes to the resulting `content://` URI via
    `ContentResolver.openOutputStream(uri, "wt")` in the `@ActivityCallback`.
    A cancelled picker resolves `{ saved: false }`, not an error (mirrors
    `FolderAccessPlugin.pickFolderResult`'s own cancelled-picker contract).
  - No manual registration needed in `MainActivity.java`: like
    `FolderAccessPlugin`, a `@CapacitorPlugin`-annotated class in the app's
    own package is auto-discovered by Capacitor at runtime (only
    `WorkspaceMutationPlugin` needs manual registration, because it
    *extends* another plugin, a documented limitation of that scanner).
- `src/workspace/capacitorBridgeImpl.ts`: new `printNote(title, bodyHtml)`
  and `exportNoteHtml(title, bodyHtml, defaultFileName)`, both reusing
  Phase 1/2's own `buildPrintDocument`/`buildExportDocument` builders so
  Android and Desktop print/export byte-identical markup. Unlike Desktop's
  `exportNoteHtml.ts`, no `inlineLocalImages` pass is needed first: this
  file's own `fileSrc` already resolves every Preview image to a `data:`
  URI (`FolderAccess.readFileAsDataUrl`), so the Preview pane's live
  `innerHTML` is already fully self-contained on Android.
- `src/app/App.tsx`: the existing `Capacitor.isNativePlatform()` branch in
  the note command list, previously `: []` on native, now adds "Print
  note" / "Export note to HTML…" commands wired to the two functions
  above, mirroring the Desktop branch's own command shape/error handling.

## Tests
- `src/workspace/capacitorBridgeImpl.test.ts`: 5 new tests — `printNote`
  builds the correct standalone document and calls the native bridge with
  the right shape; a native rejection propagates; `exportNoteHtml` builds
  the correct document and resolves `true`/`false` for save/cancel; a
  cancelled picker never rejects; an already-`data:` image in `bodyHtml`
  passes through unchanged (proving no image fetch/inline step runs on
  this platform). Extended the file's `registerPlugin` mock to dispatch by
  plugin name (`"PrintExport"` vs `"FolderAccess"`) so both plugins can be
  asserted on independently.
- No new Java/JVM-level unit test for `PrintExportPlugin.java` itself: this
  project's existing Android unit tests (`android/app/src/test/java/...`)
  have no Robolectric (or similar) shadow for `WebView`/`PrintManager`/
  `ContentResolver` already set up, and adding that harness was judged out
  of scope for this item. The Java code was instead verified the same way
  prior Android-touching items in this file document doing it: checked
  line-by-line against the real, published Android API signatures used
  (`WebView.createPrintDocumentAdapter(String)`, `PrintManager.print`,
  `Intent.ACTION_CREATE_DOCUMENT`, `ContentResolver.openOutputStream(Uri,
  String)`), reusing the exact `@ActivityCallback`/`startActivityForResult`
  pattern `FolderAccessPlugin.pickFolder`/`pickFolderResult` already use
  and this file's own doc comments cross-reference, **and** by a real
  compile + package (see below) — going one step further than most prior
  `🚧` Android entries in this file, which had no Android SDK available at
  all.

## Verification
- `npx tsc -p tsconfig.json --noEmit`: clean
- `npx eslint .`: clean
- `npm run check-version`: pass
- `npx vitest run` (full suite): **2816/2816 tests pass**, 151 files
- `npx vite build`: succeeds
- `cargo fmt --all -- --check` / `cargo clippy --all-targets -- -D warnings`
  / `cargo test` (77/77) / `cargo check`, from `src-tauri/`: all green (no
  Rust source touched by this item; run per the routine's minimum-checks
  list anyway)
- **Real Android SDK build, genuinely new for this sandbox**: this cloud
  environment had no Android SDK/`ANDROID_HOME` at session start, the
  blocker essentially every other Android-touching entry in this file
  discloses. This session bootstrapped one (Android commandline-tools,
  `platform-tools`, `platforms;android-35`, `build-tools;35.0.0`, matching
  `android/variables.gradle`'s `compileSdkVersion`/`targetSdkVersion`, via
  `sdkmanager` against the real `dl.google.com` repository, licenses
  accepted non-interactively) and confirmed the whole pipeline actually
  works end-to-end:
  - `npx cap sync android`: succeeds
  - `./gradlew testDebugUnitTest` (from `android/`): **BUILD SUCCESSFUL**,
    all existing Java unit tests still pass with `PrintExportPlugin.java`
    compiled into the tree
  - `./gradlew assembleDebug`: **BUILD SUCCESSFUL**, real
    `app-debug.apk` produced (16.7MB)
  - Confirmed `PrintExportPlugin.class` (and its inner
    `PrintExportPlugin$1` WebViewClient class) actually present in
    `app/build/intermediates/javac/debug/compileDebugJavaWithJavac/classes/`
    and the built APK's `classes.dex`, i.e. this is a real compile against
    the real Android SDK and real Capacitor/AndroidX classpath, not merely
    "the Java looks right."
  - No emulator/instrumented run: `/dev/kvm` is not present in this
    sandbox (checked directly), so `reactivecircus/android-emulator-runner`
    (the real emulator smoke test CI's own `android` job already runs)
    cannot run here. This is the one evidence gap this item cannot close
    from this sandbox.

## Hosted CI (confirmed after landing)
Real hosted `CI` run `35668352211` on the landed SHA (`02f52e8`): all 5
expected jobs green — `frontend`, `backend`, `android`, `appimage-smoke`,
`validation`. The `android` job's own "Install debug APK in emulator"
step (a real KVM-backed emulator on the GitHub-hosted runner, unlike this
sandbox) succeeded too: confirms the APK with `PrintExportPlugin` compiled
in installs and the package resolves on a real running Android emulator.
That step only runs `adb install` + `pm path`, not the app's UI, so it
does not exercise "Print note"/"Export note to HTML…" themselves — the
on-device UI gap below is unchanged — but it is one more genuine, hosted
confirmation beyond this session's own local build.

## What's still genuinely open
Real on-device/emulator confirmation that: the system print dialog
actually opens and offers "Save as PDF" for a printed note; the
`ACTION_CREATE_DOCUMENT` picker actually opens, and the file it produces
after picking a location is a valid, openable `.html` file with images
intact. None of this can be verified without either a physical Android
device or a KVM-backed emulator, neither available in this sandbox. Per
`skills/verification-suite.md`'s "physical device is not a universal
gate" rule and its landing-decision table's "unaffected... check is
unavailable but all changed behavior passes executable tests" row: all
changed *behavior this sandbox can execute* (the TS-level document
building and native-bridge call shape, plus a real compile/package of the
Java) is tested and green, so the code lands on `main`, but the roadmap
item itself stays blocked (not `✅`) on that one on-device confirmation.

## Landed
- Implementation commit: see `git log` for
  `feat(android): add print/export a note via native PrintManager and ACTION_CREATE_DOCUMENT`
  on `main` (this session's push).

## Next action
A session with real Android hardware (or a KVM-capable emulator) installs
the debug APK, opens a note with an image in Preview/Split view, runs
"Print note" and confirms the system print dialog opens with correct
content (and "Save as PDF" produces a valid PDF), then runs "Export note
to HTML…" and confirms the SAF picker opens, saving produces a valid
standalone `.html` file, and cancelling it does not error. Once both are
confirmed, mark `rm-aafb783f25b67c4e` `✅` with that evidence.

## Retry
Available whenever a session with physical Android device or KVM-backed
emulator access picks this up; no other condition gates it. Everything
else (code, unit tests, real SDK build) is already done.
