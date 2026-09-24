# Changelog

## Unreleased

- Added an "Open file from outside the vault..." command (desktop only, via the Command Palette): pick any Markdown file on your computer and view it right away, using the same behavior as opening one via your file manager's "Open with" — a file inside your current workspace opens as an editable tab, and one outside it opens in the existing read-only scratch view with a button to open its containing folder as a workspace.

- Added `==highlighted text==` support, in both the Source editor and Preview: it now renders as a highlighted `<mark>` instead of literal `==` characters. Prefix the highlight with a color emoji (🔴 🟠 🟢 🔵 🟣) to color it, e.g. `==🔴important==`, following the same convention Obsidian uses. Picking a color from a menu isn't available yet — typing the emoji is the only way to set one for now.

- Added an "Export note to HTML…" command on desktop: saves the current note as a standalone `.html` file via a native Save dialog, with local attachment images embedded directly in the file so it opens correctly with no Leotheca installed. Same Preview/Split-view availability as "Print note" below. Android support is tracked separately and not yet available.

- Added a "Print note" command on desktop: prints the current note via the OS print dialog (which already offers "Save as PDF" on every desktop platform this app ships for), reusing the already-rendered Preview pane's own output rather than a second Markdown-to-HTML pipeline. Available whenever Preview or Split view is showing the note you want to print; switch to one of those views first if you're in Source view. Android support is tracked separately and not yet available.

- Preview now renders Markdown footnotes: a `[^1]` reference shows as a numbered, clickable superscript, and its `[^1]: ...` definition (which can span several lines when indented) renders in a "Footnotes" section at the end of the note, with a back-link from the definition to where it was referenced. Only footnotes actually referenced in the note appear there, numbered in the order they're first used. Previously `[^1]` and its definition rendered as plain, unlinked text.

- Quick Capture now traps focus properly while open, restores it to whatever you were doing when you close it, locks the page behind it from scrolling, and closes on the Android hardware back button as well as Escape, backdrop tap, or its own close button — all previously missing or only partially implemented. This is the first real use of the UX-01 refresh's new shared `Sheet` component (spec section 20), the touch-first, edge-anchored counterpart to the existing `Dialog` component; both now share one overlay stack so opening one above the other dismisses only the correct one.

- Workspace indexing, note save state, and empty Bookmarks/Tags panels now use shared accessible status primitives. Progress is marked busy and announced politely, save failures remain assertive and retryable, warning/success states pair text with local icons, and empty panels provide concise next-step guidance.

- Confirmation dialogs now use the UX-01 refresh's shared `Dialog` component, keeping the safe Cancel action focused first while consistently trapping and restoring focus, supporting Escape and backdrop cancellation, preventing the page behind the dialog from scrolling, and keeping the title and actions reachable when content is tall.

- The Document Header's "More note actions" menu now supports Arrow Up/Down, Home, End, Escape, and reliable focus restoration, skips disabled actions, and stays inside the visible window at screen edges. This is the first real use of the UX-01 refresh's shared `Menu` component; the existing Rename, Copy Relative Path, Delete, and Markdown Help actions are unchanged.

- The Activity Rail's Files/Bookmarks/Tags/Graph/Settings buttons now show a proper tooltip on hover and on keyboard focus (previously only a plain browser tooltip on hover, nothing on focus), as part of the ongoing UX-01 visual-system refresh's shared `Tooltip` component (spec section 20). It's dismissible with Escape and respects reduced-motion.

- The note view-mode switch (Source/Split/Preview) in the Document Header now supports arrow-key navigation between options, as part of the ongoing UX-01 visual-system refresh's shared `SegmentedControl` component (spec section 20). Its look and click behavior are unchanged.

- Started the UX-01 visual-system refresh (`spec/leotheca-visual-system-adaptive-ux-sdd.md`), Phase 1a: a full semantic design-token layer for light and dark ("Quiet Library" palette), contrast-checked accent mappings for Warm/Ocean/Forest/Plum that now differ correctly between themes, a new "Reading font" setting (Sans/Serif/Mono) for the rendered Markdown preview (previously always rendered in the monospaced editor font), and a local SVG icon registry ready for future migration. See ROADMAP.md for what's landed versus what's still open in this multi-phase refresh.

- Fixed the "Choose Folder"/"Add workspace" button on the welcome screen appearing to do nothing when the native folder picker itself failed (most notably on Android: some storage providers reject persistable access, a case `FolderAccessPlugin` already caught and rejected on the native side). The rejection never reached `workspaceSelectionError`, so the button silently reset to its idle label with no feedback at all. It now shows an actionable inline error so a retry (or choosing a different folder) is obvious, matching the same silently-swallowed-rejection fix already applied elsewhere (bookmarks, backlinks, diagnostics, external-file opens).

- Added support for opening a `.md` file directly from your file manager or another app, even when its folder isn't your currently open workspace (Desktop only). Leotheca now registers itself as an "Open with"/default-app option for Markdown files. A file inside your current workspace opens normally, as an editable tab; a file outside it opens in a new read-only view, with a button to open its containing folder as a workspace if you want to edit it. A new "Open Markdown files from outside your workspace" setting (Settings → General, on by default) lets you turn this off.

- Fixed the Rename Preview dialog never appearing for a rename whose only pending references elsewhere were Markdown-style links (`[label](target)`/`![alt](target)`), rather than wikilinks: the dialog's "anything to review?" check only looked at wikilink edits, so a real, correctly-computed Markdown-link edit never triggered the Review step at all, and the user got no warning that a Markdown link would break.

- Fixed a PDF shape tool (Square/Circle/Line) leaving its in-progress draft rectangle/line stuck on screen if the drag gesture was interrupted (an OS/browser context switch, a multi-touch conflict, the tab losing focus mid-drag) instead of ending normally.

- Fixed the split-pane divider getting stuck in a drag if the gesture was interrupted (an OS/browser context switch, a multi-touch conflict, the tab losing focus mid-drag) without ever delivering a pointer-up: any later, unrelated pointer movement anywhere on the page would keep silently resizing the split.

- Fixed Ctrl/Cmd-click "open in other group" on an image link opening the image into the same pane it was clicked in, instead of the other one, when that pane wasn't already the active group (e.g. reading the reference pane after last working in the primary one, then Ctrl/Cmd-clicking an image link there). Text-note links were unaffected in practice.

- Fixed the split-pane compact switcher (narrow windows and Android) not following a note into the secondary pane: "Split right" on a note, "Move active tab to other group", and Ctrl/Cmd-click "open in other group" on a link all correctly opened the note in the secondary group, but on a narrow window or phone the visible pane silently stayed on primary — the note appeared to go nowhere until you manually tapped the "Reference:" switcher. The switcher now follows the note it was just asked to open.

- Fixed a PDF annotation data-loss bug: drawing a new highlight, ink stroke, sticky note, or shape while a previous "Save annotations" click was still writing to disk (a real window — nothing disables drawing while a save is in progress) silently discarded that new annotation the moment the save finished, since the save's success handler reset every pending-annotation list to empty instead of only clearing what it had actually written. An annotation added mid-save now survives and is included in the next save.

- Fixed speech-to-text dictation being on by default: the toolbar's microphone button rendered for every note regardless of whether you'd ever asked for it, and its mount effect immediately probed platform speech availability — on Android, reaching the native `SpeechRecognizer` before you had expressed any interest in dictation, and prompting for microphone permission the first time you opened a note rather than after you turned dictation on. A new "Speech-to-text dictation" setting (Settings → General), off by default like other net-new opt-in features, now gates the button entirely; nothing speech-related runs until you switch it on. Also removed a dead code path on Android that fabricated a fake transcript (`"[Transcribed from Android: <n>ms of audio]"`) instead of running real recognition — unreachable in practice since real dictation already goes through a different, working path, but removed outright per the same fabricated-success-text policy already applied elsewhere.

- Added freehand ink, sticky notes, and simple shapes to PDF annotation, for scanned or image-only PDFs with no text layer to highlight: Draw for pen strokes, Note for a sticky note with your own text, and Square/Circle/Line/Polygon for simple shapes (drag to draw; Polygon is click-to-add-a-vertex, then Finish shape). All write back into the PDF using the same standard, reader-compatible annotation format as highlight/underline/strikethrough, in the same "Save annotations" action.

- Added PDF viewing and text annotation: open a `.pdf` file to see it rendered page by page with zoom, page navigation, and full-document text search. Select text and click Highlight, Underline, or Strikethrough to mark it up; annotations are written back into the PDF itself as standard, reader-compatible objects (not a separate sidecar file — verified to round-trip through another PDF library independent of the one this app uses to render), via an explicit "Save annotations" action rather than the usual autosave. Thumbnails and Android accessibility verification are not included.

- Added a compact-layout group switcher for split panes on narrow windows and Android: instead of squeezing both editor groups side by side, only one group's pane is shown at a time, with a "Working: <note> / Reference: <note>" switcher above it to swap which one is visible. Switching never closes, merges, or reorders anything — it only changes which pane is currently mounted. Rotating back to a wide window restores the normal side-by-side split automatically. Android's hardware Back button is not yet wired to this switcher, and the narrow/wide threshold is based on the whole window's width rather than the editor area's own width net of the sidebar and Inspector.

- Added Ctrl/Cmd-click on a note link in the preview to open it in the other editor group (creating a split if there isn't one yet) instead of the current one.

- Added tab reordering (drag to reorder, or right-click a tab for Move left/Move right) within either editor group, and restored cursor/scroll position when switching back to a note you'd already had open (previously every tab switch reset the cursor to the start of the note).

- Added split panes on desktop: a "Split right" toolbar button opens a second editor group beside the first, each with its own tabs and its own Source/Split/Preview mode, resizable by a draggable (and keyboard-operable) divider. Move the active tab to the other group, or close the second group to merge its tabs back. Canvas and ink notes aren't supported in the second group yet (they still open normally in the first); compact/Android layouts, and routing every note-opening feature (backlinks, search, tasks, etc.) into a specific group, are still to come.

- Fixed the Markdown table toolbar's "Add column right", "Delete column", and "Add row below" commands doing nothing, or inserting a new row in the wrong place, whenever the cursor sat immediately after a cell's text (the ordinary position right after typing or clicking a word) rather than inside its trailing padding. In particular, "Add row below" could silently insert the new blank row at the very top of the table instead of below the row you were actually in.

- Fixed a silent autosave failure: if saving a note's changes to disk failed (for example a full disk, a revoked folder permission, or an external drive going offline), the editor gave no indication anything was wrong at all — the note just quietly stopped saving, with the failed edit only ever kept in memory. A visible error now appears with the failure reason and a Retry button, and it clears automatically once a save succeeds again.

- Fixed Quick Capture's 32 KiB payload size limit being measured in JavaScript string length instead of real UTF-8 bytes, letting a capture containing CJK characters, emoji, accented Latin, Cyrillic, or other multi-byte text through at up to 2-3x the documented limit. The limit is now measured in actual UTF-8 bytes, matching the spec.

- Fixed clicking a file in the sidebar's file tree or search results whose file could no longer be read: it now shows an inline error explaining the file may have been moved, renamed, or deleted, instead of silently doing nothing. Clicking it again retries.

- Fixed opening a note from a Smart Collection (List, Table, Card, or Board view) whose file could no longer be read: it now shows an inline error explaining the note may have been moved, renamed, or deleted, instead of silently doing nothing. Clicking the note again retries.

- Fixed clicking a task in the Task Hub whose source note could no longer be read: it now shows an inline error explaining the note may have been moved, renamed, or deleted, instead of silently doing nothing. Clicking the task again retries.

- Fixed the Rename Preview dialog's suggested Markdown link updates: the suggested new path for a `[text](path)` or `![alt](path)` link almost always dropped the `.md` file extension (for example suggesting `notes` instead of `notes.md`), which would have produced a broken link if you copied it in by hand, and could additionally add a wrong extra `../` when the linking note sat above the renamed note's new folder. These suggestions are informational only (Leotheca does not rewrite Markdown-style links automatically yet), but they are now correct.

- Fixed a data-loss bug in the drawing (ink) note editor: opening a `.ink` file that was missing its viewport information (for example, one created by an older version, hand-edited, or written by another tool) silently discarded every existing stroke instead of showing them, and drawing anything new then overwrote the file, permanently losing the original drawing. Ink files are now decoded tolerantly, matching how Canvas files already handle unrecognized or missing data.

- Fixed a privacy/data-safety bug in Quick Capture: text or images captured externally (an automation deep link received while no workspace was open, or shared to Leotheca from another Android app) could be written straight into your inbox note the moment you next opened a workspace, without ever showing you the capture for review or letting you edit or discard it first. Opening a workspace no longer auto-commits anything; a pending capture now always waits in the Pending Captures list for your explicit Review, Retry, or Discard.

- Fixed voice dictation on Android doing nothing when you tapped the microphone button: the on-device speech recognizer was never actually told to start listening, so no text was ever inserted and no error was shown. Dictation now starts the recognizer for real and reports its actual transcript or a real error.

- Fixed clicking a graph node, or opening a Canvas card's linked file, whose target note had been renamed, deleted, or moved outside the app: both now show an inline error explaining the file may have been moved, renamed, or deleted, instead of silently doing nothing.

- Fixed clicking a backlink whose source note had been renamed, deleted, or moved outside the app: it now shows an inline error explaining the file may have been moved, renamed, or deleted, instead of silently doing nothing.

- Fixed clicking a Link Diagnostics finding (Settings → Health) whose source note had been renamed, deleted, or moved outside the app while Settings was still open: it now shows an inline error instead of silently doing nothing and leaving the Settings window stuck open.

- Fixed clicking a bookmark whose note had been renamed, deleted, or moved outside the app: it now shows an inline error explaining the file may have been moved, renamed, or deleted, instead of silently doing nothing.

- Fixed a rare data-loss bug where creating, editing, or deleting two Smart Collections in quick succession could silently drop one of those changes from what's actually saved to disk, even though it still appeared correctly until the app was restarted. Collection saves are now always written one at a time, in order.

- Fixed a rare data-loss bug where adding or removing two bookmarks/favorites in quick succession could silently drop one of them from what's actually saved to disk, even though it still appeared in the list until the app was restarted. Bookmark saves are now always written one at a time, in order.

- Fixed a Quick Capture data-loss bug: if appending a capture to your inbox note failed to save (for example, a transient disk or filesystem error) right after a later retry succeeded, the inbox note could end up containing only the new captured text, with your existing note content silently gone. A failed save now surfaces as an error instead of being mistaken for "the note doesn't exist yet" and overwriting it.

- Fixed the Android "New note" home-screen widget occasionally doing nothing right after a cold app start: if the note-creation request arrived while the app was still finishing loading your workspace, it was silently dropped instead of creating (and opening) the note once loading finished.

- Fixed an issue where dragging a card on a Canvas board could get "stuck" if the drag was interrupted (for example, by switching apps or windows mid-drag): the card could then jump to an unrelated position the next time you moved your mouse over the board, and that unwanted move was saved. Dragging is now always cleanly cancelled when interrupted.

- Fixed Undo and Redo in the drawing (ink) note editor: undoing or redoing a stroke now actually saves that change, instead of only updating what you see on screen. Previously an "undone" stroke could silently reappear the next time the file was reopened, and a redo was never actually saved either.

- Notes written in a right-to-left script (Hebrew, Arabic, and others) now display and edit with correct text direction, detected automatically per line/paragraph in both the editor and preview. Mirroring the surrounding app UI (sidebar position, tab order) for RTL is not part of this change.

- Added a fourth Android home-screen widget that opens straight into Quick Capture's review flow, instead of only being able to create a blank note or jump to Favorites from the home screen.

- Pinned tabs now survive restarting the app: reopening a workspace reopens your pinned notes alongside the last active one, instead of forgetting which tabs were pinned.

- Added a new Android home-screen widget that lists your favorited notes by name, so you can open one directly from the home screen without opening the app first.

- Turning off per-note read-only locking in workspace Settings now fully disables lock enforcement, including editor read-only state and Task Hub checkbox mutations, while keeping the portable frontmatter marker intact for when the feature is enabled again.

- You can now pin an open note to keep it at the front of the tab bar. Pinned notes stay open when you close other tabs or close all unpinned tabs, and can be removed only through the explicit Unpin and close action.

- Renaming a note now shows which links elsewhere reference it before the rename happens, so you can see what still needs updating by hand.
- Screen readers now announce navigating to a heading, a filtered heading count, and a copied heading link in the note outline and breadcrumbs.
- Notes can now be locked against accidental edits. Locking uses a plainly visible frontmatter marker, disables editing and write commands, and can be turned off per workspace in Settings.
- Smart Collections now include a Board view. Choose an indexed frontmatter property to group notes into ordered columns, with unassigned notes clearly separated. Boards are read-only, and selecting a card opens its note as usual.

- The command palette can now add or delete a row or column in the Markdown table under your cursor. Table edits keep the table's alignment and use normal undo.

- If Leotheca finds invalid data in its app-wide configuration, Settings now explains the problem and offers an explicit rewrite action. Normal theme and workspace-profile changes no longer silently replace the original configuration while it awaits repair.

- Block references now support headings. A trailing `^id` on an ATX or setext heading stays hidden in Preview, shares the normal block-ID namespace, and works with Copy block link.

- Workspace profiles can now be renamed and assigned a built-in icon. The workspace switcher is searchable and keyboard-operable, Settings has a Workspace profiles management section, and the command palette can switch, add, or manage workspaces without bypassing the existing workspace-transition coordinator.
- A workspace profile can now be relinked to a new folder (Settings > Workspace profiles > Relink) after its original folder moved or access was revoked, without losing its name, icon, or position in the list. Relinking rejects a folder already used by another known workspace and says which one.
- You can now forget the workspace you currently have open, not just other ones. If there are changes that have not been saved yet, forgetting is stopped by default; you can confirm a second time to forget anyway and discard those changes.
- If a workspace can't be opened when the app starts (its folder moved, or access was revoked), the welcome screen now says which workspace it was and offers Retry and Relink buttons directly, plus a list of your other workspaces to open instead.
- If switching to a different workspace fails while you're already using the app (its folder moved, or access was revoked), you now stay on the workspace you were already in instead of being dropped to a blank "no workspace" screen, and a banner offers Retry, Relink/Grant access, Open another workspace, or Forget that workspace, matching the recovery options already available at startup.
- Switching workspaces right after typing now properly saves that edit first instead of silently discarding it; if the save genuinely fails, the switch is stopped and a banner lets you retry or explicitly choose "Switch without saving."

- Smart Collections now support persisted list, table, and card result views. Table view can edit already-supported top-level scalar and simple-list frontmatter values in place through the same lossless source-range editor and app-owned save authority as normal note editing; stale/conflicting values and unsupported YAML remain read-only. Card view renders selected metadata fields without reading note bodies, and collection evaluation now has deterministic multi-key sorting; the UI for configuring sort keys is still deferred.
- Cold-starting the Android New note widget now shows native "Creating note" progress until the existing quick-note flow creates its expected file, instead of leaving the user staring at startup with no indication that the widget action is still working.
- Canvas files now keep every card, connection, and unrecognized field an editor doesn't understand instead of silently dropping them the next time any card is edited. A canvas card's linked file path is now resolved against the canvas file's own location and verified to stay inside the open workspace before it can be opened, the same containment check already applied to note attachments.
- Workspace settings, the app's global config, and bookmarks now validate their persisted file's contents on load instead of trusting them outright: an invalid value falls back to its default without discarding the rest of the file, and a workspace settings file that didn't fully decode shows a notice with an explicit "Rewrite settings file" action rather than being silently overwritten.
- Workspace mutations are now enforced at the native boundary on both desktop and Android: note autosave, attachment/settings/index writes, creates, renames, and deletes stay inside the active workspace. Desktop writes replace files crash-safely, and create and rename operations use native no-overwrite semantics so a concurrent external change cannot silently replace an existing path.
- The project's version number now has one canonical source (the root `VERSION` file), validated across every platform's build metadata in CI; a real release can no longer be tagged if the tag or the changelog has drifted from it.
- CI now uses one same-commit validation gate for frontend, Rust, Android emulator installation, and AppImage launch checks, and release publication requires that gate to pass.
- Android now exposes New note and Favorites as separate home-screen widgets instead of combining both actions in one widget.
- Frontmatter property edits now preserve unrelated comments, ordering, line endings, scalar types, and unsupported structures instead of rebuilding the entire frontmatter block. Complex values that cannot be edited losslessly in the Properties panel are shown read-only and remain editable in Source view.
- Opening a workspace now shows one level of folder structure right away instead of just the root; the existing "Expand all" button still walks the whole tree recursively.
- Switching between open notes no longer tears down and rebuilds the editor from scratch; large documents should feel noticeably snappier to switch into.
- Desktop saves (notes, attachments, settings) are now crash-safe: a save writes to a temporary file first and only replaces the real file once that write finishes, so a crash or forced quit mid-save can no longer leave a note truncated or empty.
- Switching workspaces is now authoritative: a workspace switch started before an earlier one has finished loading can no longer have the earlier switch overwrite it, and pending saves for the workspace being left are drained instead of racing the new one.
- The editor area now shows a short stoic-philosophy quote (with attribution) instead of a bare "No file open." message when no note is open.
- The wikilink/tag/backlink index is more robust on a large workspace: a single note that fails to read (a lock, a permission change, a sync tool mid-write) no longer prevents the rest of the workspace from being indexed, and a small notice now appears if any notes couldn't be read. The index also uses file size alongside modification time to detect changed content, narrowing a rare case where an edit could otherwise go unnoticed.
- The desktop app now reads more notes at once while rebuilding the wikilink index, which should make opening the Graph or Tags view on a large workspace feel faster. Android is unaffected.
- A new Outline button on a note's toolbar shows a live, hierarchical list of its headings; clicking one jumps the editor to that heading without losing your place or undo history. Breadcrumbs, copy/insert-link actions, and current-section tracking are not part of this first slice yet.
- A heading breadcrumb trail now appears above each note (in Source or Split view) showing the current section's ancestry; clicking a segment jumps there. It follows the Source cursor only for now; Preview-scroll tracking is not implemented yet, so breadcrumbs are hidden in Preview-only view.
- Preview now resolves an image embedded more than once in the same note (e.g. a diagram referenced twice) only once instead of reading the same file again for every occurrence.
- The heading breadcrumb trail now also appears in Preview-only view, following the section you're scrolled to.
- The Outline panel and heading breadcrumbs now have full-size touch targets on narrow screens and a visible keyboard focus ring.
- Keyboard focus now shows a visible outline on buttons, tabs, sidebar rows, and dialogs throughout the app, not just a few places; some browsers previously drew no focus indicator at all on these.
- Fixed a rare crash where a corrupted or hand-edited wikilink index cache file could abort indexing the whole workspace instead of just re-reading the one affected note.
- Wikilinks can now point at a specific heading, not just a whole note: `[[Note#Heading]]` links to a heading in another note, and `[[#Heading]]` links to a heading in the current note. Clicking one in Preview jumps straight to that heading. `[[Note|Custom text]]` (a link that shows different text than the note's name) also works correctly now. A heading that can't be found, or that matches more than one heading with the same name, is shown distinctly from a link to a missing note entirely. This can be turned off in Settings to go back to the previous plain wikilink behavior.
- A new Task Hub button lists every `- [ ]`/`- [x]` task across the whole workspace in one place; clicking a task opens its note and jumps straight to it.
- The Task Hub's checkbox now actually checks a task off (or reopens it), editing just that one task's checkbox in the note itself; if the note changed since the Task Hub last saw it, or the save fails, you get a clear message instead of a silently wrong edit. It can also filter by status, path, or tags, search by text, and group results by note or folder.
- `[[Note#Heading]]`/`[[#Heading]]` heading-links now render inline in Source view too (styled resolved, unresolved, or ambiguous the same way Preview already shows them), not just in the rendered Preview pane. Typing `[[Note#` or `[[#` now also suggests that note's actual headings to complete the link with, instead of only note names.
- A new Link Diagnostics button lists every wikilink in the workspace that's broken (points at a note that doesn't exist) or points at a heading that's missing or ambiguous; clicking a finding opens its note and jumps straight to the link. This first slice is read-only: fixing a link, or renaming/moving a note with its links updated automatically, is not part of it yet.

- The Outline panel and the heading breadcrumb trail now each offer Copy link and Insert link for a heading: Copy puts a ready-to-paste `[[Note#Heading]]` link on the clipboard, Insert drops the same link (in its shorter `[[#Heading]]` form) into the note at your cursor. Both are disabled for a heading with no text, or one that shares its exact text with another heading in the same note, since a link built from either would not point anywhere precisely; Insert is also disabled while a note is shown in Preview-only view, since there's nowhere to insert into.
- Fixed a rare mix-up where clicking one note right after another, or switching workspaces while a note was still opening, could momentarily show the wrong note or reopen one from the workspace you just left. The most recently clicked note now always wins.

Entries will accumulate here from the first tagged release onward.
