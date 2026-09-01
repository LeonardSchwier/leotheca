# Android widgets

The Android home-screen widgets stay fully offline and route into the same local URL commands used by the app. `LeothecaNewNoteWidgetProvider` sends `leotheca://new-note`, while the favorites widget uses its own independent action.

## Cold-start new-note feedback

A warm `new-note` launch is handled by the already-running app and needs no extra native UI. A cold launch is different: the native activity and WebView must start, the persisted workspace grant must be restored, and only then can the existing web command create and open the quick note.

`MainActivity` detects only a cold `new-note` launch. Before starting the WebView it reads the app-private `config.json`, reconnects only if it contains the normal Android `/workspace` pointer and a persisted tree URI, snapshots the workspace root, and predicts the same collision-free `Untitled.md`, `Untitled 2.md`, and so on name that `createNoteQuick()` will use. It then shows a native indeterminate progress view labelled "Creating note" while the existing web flow remains the sole writer and opener of the note.

A background tracker watches only for that predicted file to appear in the granted workspace root. The overlay is removed shortly after the file appears, or after a bounded 12-second timeout if creation fails or the provider becomes unavailable. The tracker never creates, edits, caches, uploads, or otherwise owns note content. If there is no valid persisted workspace grant, no overlay is shown and the existing app behavior is left unchanged.

`NewNoteColdStartTrackerTest` covers deep-link recognition and quick-note name prediction. The Android CI job compiles the activity, runs JVM tests, builds the debug APK, and installs it in an emulator. This is not physical Android-device verification.
