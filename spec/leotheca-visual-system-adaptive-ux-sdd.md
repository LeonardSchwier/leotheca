# Visual System and Adaptive UX Refresh

**Status:** Proposed for approval  
**Feature label:** UX-01  
**Target:** Desktop and Android  
**Priority:** P1 foundational  
**Owners:** TBD  
**Last updated:** 2026-09-01

## 1. Summary

Leotheca shall receive a cohesive visual-system and interaction refresh that makes the application feel calm, modern, deliberate, and pleasant to use while preserving its complete local-first feature set.

The refresh is not a decorative reskin. It establishes:

- a semantic design-token system for light and dark themes;
- a consistent local icon language;
- reusable, accessible UI primitives;
- a clearer adaptive application shell;
- modernized navigation, tabs, document actions, panels, dialogs, and settings;
- improved editor and rendered-note typography;
- compact-screen behavior designed for touch rather than a compressed desktop toolbar;
- accurate, visible operational states for saving, indexing, loading, and errors;
- measurable accessibility and performance gates.

The intended character is a **quiet editorial workspace**. Notes remain the visual focus. The interface uses warm neutral surfaces, restrained borders and elevation, strong typography, clear hierarchy, and one user-selected accent color. It must not rely on gradients, glass effects, animated decoration, remote assets, or a generic dashboard aesthetic.

All existing note, workspace, search, linking, graph, Canvas, settings, and Android behaviors remain available. Visual modernization must not reduce reachability, keyboard support, touch support, data safety, startup speed, or offline guarantees.

## 2. Context and current baseline

Leotheca currently uses one shared Preact and TypeScript frontend across Tauri Desktop and Capacitor Android. CodeMirror 6 owns source editing. The application root coordinates global actions and workspace state, while feature modules own the file tree, tabs, editor, preview, linking, graph, settings, and related behavior.

The current interface is functional but visually utilitarian:

- Global actions are concentrated in a single toolbar.
- Several controls use a mix of inline SVG, Unicode characters, and text symbols.
- Files, Tags, and Bookmarks replace one another in the left sidebar, while Backlinks remain fixed below them.
- Frontmatter properties permanently consume vertical space above the editor.
- Tabs, menus, dialogs, empty states, and error states use minimally differentiated styles.
- The rendered note uses the bundled monospaced face for most content, which limits reading hierarchy.
- The responsive model primarily changes at one narrow breakpoint and makes the toolbar horizontally scrollable.
- Settings are presented as one long modal rather than an adaptive settings information architecture.
- The main application stylesheet contains many unrelated surface rules in one file, which makes consistent evolution harder.

This SDD improves those areas without replacing the core editor, file model, search/indexing model, workspace model, graph algorithms, Canvas model, or platform bridges.

### 2.1 Current implementation references

The implementation should be reviewed against at least these files before the first code change:

- `src/app/App.tsx`
- `src/app/App.css`
- `src/styles/theme.css`
- `src/editor/MarkdownEditor.tsx`
- `src/workspace/Sidebar.tsx`
- `src/workspace/TabBar.tsx`
- `src/linking/BacklinksPanel.tsx`
- `src/graph/GraphView.tsx`
- `src/settings/SettingsPanel.tsx`
- `src/settings/workspaceSettings.ts`
- the global configuration and workspace-session modules
- the Android safe-area, back-button, keyboard, long-press, and Storage Access Framework integrations

## 3. Product boundaries

The visual refresh must preserve Leotheca's product contract:

- Notes remain ordinary local Markdown files.
- Workspace settings remain local and portable according to the existing settings model.
- The application performs no network request for fonts, icons, themes, analytics, telemetry, account state, or visual assets.
- No account, cloud service, proprietary sync layer, or content database is introduced.
- Desktop and Android continue to use the same shared frontend and conceptual information architecture.
- The implementation must not require users to convert or migrate note content.
- The refresh must not silently change, move, delete, or rewrite user files.
- Existing keyboard shortcuts remain valid unless a separate approved shortcut change explicitly replaces one.

## 4. Dependencies and adjacent work

### 4.1 Workspace Profiles, F20

The final application header should use the approved Workspace Profiles control from F20 as the workspace identity and switcher entry point.

The visual-system foundation and most layout work may land before F20. Until F20 is available, the same header slot shall show the current workspace folder name and invoke the existing workspace action. UX-01 must not create a second profile or workspace-switching implementation.

### 4.2 Logo and application icon work

The roadmap's logo and launcher-icon work is a companion visual workstream. UX-01 defines how the mark is placed, sized, colored, and represented at small sizes, but the final mark itself requires separate visual approval.

The in-app refresh is not blocked by a new logo. A neutral bundled placeholder mark may be used during development. The release candidate must not ship with platform-default launcher artwork.

### 4.3 Transition and save correctness

Any visible save-state treatment must be driven by real editor and persistence state. It must not imply that a file is saved before the write completes.

Workspace transitions, note switches, and application close behavior must continue to obey the authoritative save and session-transition guarantees tracked elsewhere. UX-01 may expose those states, but must not weaken them.

### 4.4 Design review artifacts

Before the adaptive shell is implemented, the repository should contain or link to approved static reference screens for:

- wide desktop, light theme;
- wide desktop, dark theme;
- medium layout;
- compact Android layout;
- Settings on desktop and compact screens;
- loading, empty, dirty, save-error, and unavailable-workspace states.

References should be exportable as local PNG or SVG assets. No implementation shall depend on a hosted design file at runtime.

## 5. Problem statement

Leotheca exposes a broad set of capable local-first features, but its current visual organization makes the application feel more like a collection of controls than one coherent workspace.

The present toolbar gives global navigation, note-specific actions, view selection, help, and settings similar visual weight. On small screens, the same desktop action model becomes horizontally scrollable, which reduces discoverability and produces a compressed feel. The sidebar, properties, backlinks, tabs, dialogs, and settings do not yet share a consistent component language or adaptive behavior.

A successful refresh must therefore solve three problems together:

1. **Visual coherence:** Color, spacing, type, icons, focus, elevation, and motion need one semantic system.
2. **Information hierarchy:** Global navigation, workspace identity, document actions, and contextual note information need distinct places.
3. **Adaptive usability:** Desktop, tablet-size windows, and Android need one conceptual model with layouts designed for their available space and input method.

A reskin without these structural changes would preserve the underlying usability problems. A complete shell rewrite without strict parity and performance gates would risk functionality. This SDD defines an incremental middle path.

## 6. Goals

1. Make Leotheca feel premium, calm, recognizable, and intentional.
2. Keep note content visually dominant over application chrome.
3. Establish reusable tokens and primitives before broad surface changes.
4. Separate workspace-level, navigation-level, and note-level actions.
5. Replace the horizontally scrolling compact toolbar with touch-first navigation and action sheets.
6. Improve rendered-note readability while preserving source editing behavior.
7. Make light and dark themes equally complete.
8. Preserve the existing accent choices through semantic theme mapping.
9. Make all operational states truthful, legible, and recoverable.
10. Preserve all current functionality, shortcuts, data guarantees, and offline behavior.
11. Improve keyboard, screen-reader, zoom, contrast, and touch accessibility.
12. Avoid performance regression in typing, note switching, workspace opening, search, graph opening, or startup.
13. Make future feature work cheaper through a small, coherent component system.
14. Deliver the refresh in independently reviewable phases rather than one high-risk rewrite.

## 7. Non-goals

The first release of UX-01 does not include:

- cloud themes, online icon packs, remote fonts, or downloaded visual assets;
- user-authored CSS, a theme marketplace, or arbitrary custom themes;
- a plugin framework or third-party component framework;
- a native Android UI rewrite;
- a new Markdown parser or a replacement for CodeMirror;
- multi-pane editing, draggable editor groups, or tab pinning;
- changes to graph layout algorithms or Canvas document semantics;
- new search ranking, fuzzy matching, or query language behavior;
- new note-content features such as block references, tasks, or periodic notes;
- animated backgrounds, particles, parallax, spring-heavy motion, glow effects, or glassmorphism;
- pervasive cards around ordinary content;
- redesigning every brand asset inside the same implementation pull request;
- a permanently supported classic-UI mode;
- telemetry-backed experimentation or remote feature flags;
- changes to note or attachment file formats.

## 8. Design principles

### 8.1 Quiet editorial workspace

The interface should feel closer to a well-made reading and writing tool than to an analytics dashboard. Surfaces are calm. The content area has the strongest typographic hierarchy. Decoration is subordinate to purpose.

### 8.2 Content first

Application chrome should become visually quieter when the user is reading or writing. Selected and focused states remain unmistakable, but inactive controls should not compete with the note.

### 8.3 Progressive disclosure

Frequently used actions remain directly reachable. Less frequent or destructive actions move into well-labeled overflow menus, inspectors, or settings sections. Progressive disclosure must not become hidden functionality.

### 8.4 State over ornament

Color, badges, icons, and motion communicate selection, focus, loading, dirty state, success, warnings, and errors. They must not be used merely to make the application look busy.

### 8.5 One conceptual model, adaptive presentation

Files, Bookmarks, Tags, Graph, note actions, Properties, and Backlinks keep the same conceptual roles on Desktop and Android. Their presentation changes from docked panels to sheets when space requires it.

### 8.6 Local-first trust

The interface must make destructive boundaries and persistence states clear. A polished appearance must not obscure where data is stored, whether a note is saved, or what a destructive action affects.

### 8.7 Restrained consistency

A small set of repeated patterns is preferred over a unique visual treatment for every feature. New primitives are introduced only when several surfaces benefit from them.

### 8.8 Performance is part of appearance

Fast typing, immediate focus, stable layout, and responsive note switching are visual-quality requirements. Motion must never delay input or hide application work.

## 9. Settled product decisions

The following decisions are part of this proposal and should be treated as settled after UX-01 approval.

### 9.1 Visual direction

The default direction is named **Quiet Library**.

It uses:

- warm neutral canvas and panel surfaces;
- high-contrast ink-like text;
- restrained borders;
- low, selective elevation for floating surfaces only;
- moderate corner radii rather than fully rounded containers;
- one accent family selected by the user;
- proportional reading typography and monospaced source/code typography;
- a consistent locally bundled SVG icon set;
- subtle, short transitions for state changes and sheets.

No gradients are used in the standard application shell.

### 9.2 Navigation model

At medium and larger widths, a narrow Activity Rail provides stable access to:

- Files
- Bookmarks
- Tags
- Graph
- Settings

Files, Bookmarks, and Tags open in the left Navigation Panel. Graph remains a dedicated full-screen view. Settings opens as an adaptive dialog or full-screen settings view.

On compact screens, the Activity Rail is removed. The same navigation destinations appear in a full-height Navigation Sheet opened from the top application bar.

### 9.3 Contextual note information

Properties and Backlinks move into a shared **Inspector** with separate tabs.

- On expanded screens, the Inspector may be docked on the right.
- On wide and medium screens, it opens as a right-side sheet unless the viewport has enough room to dock it.
- On compact screens, it opens as a full-height sheet.

The Inspector is closed by default unless restored within the current application session. The initial release does not have to persist its width or open state across application restarts.

### 9.4 Document actions

View mode, bookmark state, Inspector access, and note-level overflow actions move from the global toolbar to a Document Header associated with the active note.

The Document Header is visible whenever a note is active. It contains:

- note title and optional path breadcrumb;
- truthful save state;
- Source, Split, and Preview selection;
- bookmark toggle;
- Inspector toggle;
- note action overflow.

Compact screens use a reduced header presentation described later in this SDD.

### 9.5 Reading typography

The source editor and code blocks continue to use the bundled monospaced face. Rendered prose uses a proportional local system font by default.

A new optional workspace setting named `readingFont` may provide:

- `sans`, default;
- `serif`;
- `mono`.

These choices use local system stacks and the already bundled monospaced face. They must never trigger a network font request.

### 9.6 Theme and accent compatibility

Existing Light, Dark, and System theme behavior remains. Existing accent values such as Warm, Ocean, Forest, and Plum remain valid and are mapped onto the new semantic tokens.

Unknown future accent values must degrade to the default accent without corrupting the stored value when preservation is possible.

### 9.7 No runtime dual UI

Development may use a local build flag while the shell is incomplete. The release must not maintain both old and new interfaces as user-selectable modes. Permanent dual UI would multiply test and accessibility burden.

### 9.8 No hidden feature removal

Every currently reachable action must appear in the new information architecture or retain its existing shortcut. A feature-parity checklist is a release gate.

## 10. User stories

### US-01: Focused writing

As a user editing a note, I see a calm document surface, clear save state, and only the actions relevant to that note.

### US-02: Fast navigation

As a user, I can move between Files, Bookmarks, Tags, Graph, and Settings through stable, recognizable navigation.

### US-03: Readable preview

As a user reading rendered Markdown, I get comfortable line length, proportional typography, clear heading rhythm, and polished code, table, image, quote, and link styles.

### US-04: Confident saving

As a user, I can distinguish unsaved, saving, saved, and failed states, and I can recover from a failed write.

### US-05: Productive compact use

As an Android or narrow-window user, I can reach every feature without horizontally scrolling an action toolbar or tapping undersized controls.

### US-06: Keyboard operation

As a keyboard user, I can navigate the app shell, tabs, menus, dialogs, settings, and editor without losing focus or encountering inaccessible icon-only controls.

### US-07: Accessible visual state

As a user with low vision, color-vision differences, reduced-motion preference, or increased zoom, I can understand the interface without relying on color alone.

### US-08: Familiar upgrade

As an existing user, I can update to the refreshed interface without migrating notes, relearning core shortcuts, or losing access to current features.

## 11. Information architecture

### 11.1 Global application level

The global application level owns:

- workspace identity and switching;
- navigation visibility;
- command palette entry;
- indexing or workspace-level background status;
- Help;
- Settings;
- platform window behavior where applicable.

### 11.2 Navigation level

The navigation level owns:

- Files and file-tree search;
- Bookmarks;
- Tags;
- entry into Graph;
- create-note and create-folder actions appropriate to the current navigation panel.

### 11.3 Document level

The document level owns:

- open tabs and current note identity;
- source, split, and preview modes;
- bookmark state for the current note;
- note actions;
- source editor and rendered preview;
- save state;
- note Properties and Backlinks through the Inspector.

### 11.4 Floating and modal level

The floating and modal level owns:

- command palette;
- menus and context actions;
- confirmation dialogs;
- Settings;
- compact Navigation Sheet;
- compact Tab Switcher;
- right-side or compact Inspector sheet;
- transient non-blocking notices.

## 12. Adaptive layout model

Layout is based on available CSS pixels, not a platform name. Increasing UI zoom may intentionally move a desktop window into a more compact layout.

### 12.1 Layout classes

| Class | Available width | Primary behavior |
|---|---:|---|
| Compact | `0px` to `719px` | Top bar, sheets, hidden desktop tab strip |
| Medium | `720px` to `1099px` | Activity Rail, overlay Navigation Panel, overlay Inspector |
| Wide | `1100px` to `1279px` | Activity Rail, docked Navigation Panel, overlay Inspector |
| Expanded | `1280px` and above | Activity Rail, docked Navigation Panel, optional docked Inspector |

These thresholds are initial values. Implementation may adjust a threshold by up to 32 CSS pixels during visual QA if the resulting behavior is documented and the shared TypeScript and CSS definitions remain aligned.

### 12.2 Shared dimensions

Initial reference dimensions:

| Element | Desktop reference | Compact reference |
|---|---:|---:|
| Global Top Bar | 44px | 52px plus safe-area inset |
| Activity Rail | 48px | not shown |
| Navigation Panel | 280px default, 220px to 400px | sheet width up to 100% |
| Inspector | 320px default, 280px to 420px | sheet width up to 100% |
| Tab Bar | 36px | replaced by Tab Switcher |
| Document Header | 44px | combined with compact top region |
| Tree row | 30px minimum | 44px minimum |
| Desktop control | 32px minimum | 44px minimum touch target |

Panel widths may be resized on pointer-based desktop layouts. Resize handles must be keyboard-operable or provide an accessible reset and size menu. Persistence across restarts is optional for the first release.

### 12.3 Wide and expanded layout

```text
+----------------------------------------------------------------------------+
| Workspace | background status                     Commands | Help | Window |
+----+----------------------+------------------------------------------------+
|    | Navigation Panel     | Tab Bar                                      |
| A  | Files                +-----------------------------------------------+
| c  | Bookmarks            | Document Header                              |
| t  | Tags                 +-----------------------------------------------+
| i  |                      |                                               |
| v  |                      | Editor / Preview / Split                      |
| i  |                      |                                               |
| t  |                      |                                               |
| y  |                      |                                               |
|    |                      |                                               |
|    |                      |                                Inspector      |
+----+----------------------+------------------------------------------------+
```

In Wide layout, the Inspector overlays from the right. In Expanded layout, it may dock and reduce document width only when the remaining document surface still meets the editor minimum width.

### 12.4 Medium layout

```text
+------------------------------------------------------------------+
| Workspace | background status               Commands | Settings  |
+----+-------------------------------------------------------------+
| A  | Tab Bar                                                     |
| c  +-------------------------------------------------------------+
| t  | Document Header                                             |
| i  +-------------------------------------------------------------+
| v  |                                                             |
| i  | Editor / Preview / Split                                    |
| t  |                                                             |
| y  |                                                             |
+----+-------------------------------------------------------------+
```

The Activity Rail remains visible. Navigation and Inspector open as collision-safe side sheets over the document surface. Opening one does not automatically close the other unless the remaining visible surface would be less than 320 CSS pixels.

### 12.5 Compact layout

```text
+--------------------------------------+
| safe-area inset                      |
| Menu | Note title       View | More  |
+--------------------------------------+
| save/error status or compact banner  |
+--------------------------------------+
|                                      |
| Editor / Preview                     |
|                                      |
|                                      |
+--------------------------------------+
```

Compact behavior:

- No horizontally scrolling global toolbar.
- Menu opens the full-height Navigation Sheet.
- Tapping the note title opens the Tab Switcher sheet.
- The current view mode remains directly reachable through one icon button. Selecting it opens a three-option Source, Split, Preview sheet or popover.
- Bookmark, Inspector, note actions, Command Palette, Help, and Settings remain reachable through labeled actions in the More menu or Navigation Sheet.
- Split mode renders source and preview vertically, each full width, with independent scrolling and a visible divider.
- Settings use a full-screen presentation.
- Long-press context actions use a bottom action sheet rather than a pointer-positioned menu.
- Graph and Canvas remain full-screen.
- Android back first closes the topmost dialog, menu, or sheet; then closes navigation; then exits Graph or Canvas; then falls through to existing application behavior.

### 12.6 Minimum supported viewport

The main shell must remain functional at 320 by 568 CSS pixels, excluding platform safe-area insets. Code blocks, wide Markdown tables, graph canvases, and other intrinsically wide content may scroll within their own region. The application shell itself must not require horizontal scrolling.

## 13. Application-shell specification

### 13.1 Global Top Bar

The Global Top Bar contains only workspace-level and application-level information.

Desktop and medium contents:

1. Workspace identity button
2. Optional workspace or indexing status
3. Flexible spacer
4. Command Palette button
5. Help action
6. Platform-specific window controls where the application already owns them

Settings lives at the bottom of the Activity Rail. On compact screens it is also available in the Navigation Sheet.

Requirements:

- The workspace name truncates visually but retains its full accessible name and tooltip.
- Indexing status appears only when work lasts longer than 250ms, reducing flicker.
- A progress value is shown only when the indexer supplies a meaningful value.
- The bar does not contain note-specific actions.
- The bar remains draggable where Tauri window dragging currently depends on the header, except over interactive controls.
- Safe-area insets are applied on Android.

### 13.2 Activity Rail

The Activity Rail is a fixed navigation strip at widths of 720px and above.

Primary destinations:

- Files
- Bookmarks
- Tags
- Graph

Bottom destination:

- Settings

Behavior:

- Exactly one of Files, Bookmarks, or Tags is selected when the Navigation Panel is visible.
- Selecting the active destination toggles the Navigation Panel closed at Medium width and may toggle it at larger widths.
- Graph opens its existing dedicated view and receives selected state while active.
- Settings opens Settings but does not replace the current navigation-panel selection.
- Icons have labels through tooltips and accessible names.
- Keyboard navigation uses arrow keys within the rail, Enter or Space to activate, and a visible focus ring.
- Selection is communicated by icon treatment, a shape or side indicator, and accessible state, not color alone.

### 13.3 Navigation Panel

The Navigation Panel has a stable panel header and a content area.

For Files, the header contains:

- title `Files`;
- primary New Note action;
- compact overflow containing New Folder, sort, expand/collapse, and other lower-frequency tree controls.

The file-search field appears directly below the header and remains local to Files.

For Bookmarks and Tags, the header changes label and shows only relevant actions.

Behavior:

- Existing lazy-loading and tree-expansion behavior remains.
- Existing search syntax and result behavior remain.
- Search progress and errors use a compact inline status region.
- Tree rows are single-line, truncate long names, and expose full names through accessible text or tooltip.
- Selected, hovered, focused, dirty-related, and context-target states are visually distinct.
- Folder disclosure uses a consistent chevron icon.
- File and folder controls do not use emoji or Unicode glyphs as primary icons.
- Desktop context menus remain pointer-positioned but must stay within the viewport.
- Compact long-press opens a bottom action sheet with the same actions.
- Create, rename, delete, move, sort, expand, and collapse remain available where currently supported.

### 13.4 Tab Bar

The desktop Tab Bar represents open notes, not navigation destinations.

Behavior:

- It uses proper tab-list and tab semantics.
- The active tab is visually connected to the document surface.
- A dirty tab shows a non-color-only dirty indicator.
- A save-error tab shows a persistent error indicator and accessible description.
- The close button appears on hover and keyboard focus for inactive desktop tabs, while remaining available to assistive technology.
- The active tab retains a directly visible close action unless only one tab exists and the current product behavior intentionally hides it.
- Many tabs scroll within the tab region or use an overflow menu without compressing titles below a usable width.
- Existing close, close others, close all, rename, and related context actions remain.
- Tab drag-reordering is not required.

Compact behavior:

- The horizontal Tab Bar is hidden.
- Tapping the active note title opens a Tab Switcher sheet.
- The sheet lists all open tabs with active, dirty, and error state.
- Each row can activate or close a tab.
- `Close others` and `Close all` remain available in the sheet overflow.
- The sheet preserves the current tab order.

### 13.5 Document Header

The Document Header belongs to the active note.

Desktop structure:

- left: note icon, title, optional path breadcrumb;
- center or flexible area: save-state message;
- right: view-mode segmented control, bookmark, Inspector, overflow.

Behavior:

- A long title truncates before actions are compressed.
- The full path is available via tooltip or overflow details.
- The view selector uses text labels at Wide and Expanded widths and may use icons with labels in a popover at Medium width.
- Bookmark state is visible and keyboard-operable.
- Inspector action reflects whether the Inspector is open.
- Overflow contains lower-frequency current-note actions and Help entries appropriate to the note.
- When no note is active, the Document Header is replaced by an intentional empty-state header rather than disabled note controls.

Compact behavior:

- Note title appears in the top bar and opens Tab Switcher.
- Save error appears immediately below the top bar as a persistent compact banner.
- Dirty or saving state may appear as a small labeled status next to the title when space allows.
- View selection and More remain direct top-bar actions.

### 13.6 Save-state model

The visual state must be derived from real persistence events and support:

| State | Trigger | Visual treatment | Accessibility behavior |
|---|---|---|---|
| Clean | Last write completed, no local changes | Normally quiet | No repeated announcement |
| Dirty | Local changes exist before write starts | Dot plus `Unsaved` where space allows | Accessible label contains `Unsaved changes` |
| Saving | File write has started | Small spinner plus `Saving` | Announce only when unusually long |
| Saved transient | Write completed successfully | `Saved` for about 1.5 seconds | Do not announce every autosave |
| Error | Write failed | Persistent error icon and `Save failed` | Assertive but concise live announcement |

A save error must offer a clear recovery action, such as Retry, and must remain visible until resolved, the tab closes with an explicit decision, or the user takes another existing recovery path.

The interface must never display `Saved` based only on a debounce timer.

### 13.7 Inspector

The Inspector consolidates contextual note metadata without permanently reducing editor height.

Initial tabs:

- Properties
- Backlinks

Properties behavior:

- Existing frontmatter reading and editing behavior remains.
- Field labels, inputs, validation, add/remove actions, and empty state use shared primitives.
- Raw frontmatter remains ordinary Markdown data and is not moved into a proprietary store.

Backlinks behavior:

- Existing backlink discovery and navigation remain.
- Results show source note, a concise context excerpt where currently available, and an explicit navigation target.
- Empty, loading, and error states are differentiated.

Docking behavior:

- Expanded: may dock at the right.
- Wide and Medium: right-side sheet by default.
- Compact: full-height sheet.
- Escape or Android back closes a non-modal Inspector sheet before leaving the note.
- Focus returns to the Inspector trigger after close.

### 13.8 Global and note action mapping

The refresh must explicitly preserve existing toolbar actions through the following mapping:

| Current responsibility | New primary location |
|---|---|
| Sidebar toggle | Global Top Bar or selected Activity Rail destination |
| Workspace identity/change | Workspace identity button |
| Indexing status | Global Top Bar status |
| Source, Split, Preview | Document Header view selector |
| Bookmark current note | Document Header |
| Open Bookmarks | Activity Rail or compact Navigation Sheet |
| Open Tags | Activity Rail or compact Navigation Sheet |
| Open Graph | Activity Rail or compact Navigation Sheet |
| Command Palette | Global Top Bar and existing shortcut |
| Help | Global Top Bar or compact Navigation Sheet |
| Settings | Activity Rail bottom or compact Navigation Sheet |
| Properties | Inspector |
| Backlinks | Inspector |

Before release, this table must be expanded into a complete parity inventory from the actual current application and checked item by item.

## 14. Editor and rendered-note specification

### 14.1 Source editor

CodeMirror remains the source editor and must not be remounted solely because navigation, theme, Inspector, or shell state changes.

The refreshed editor theme shall define:

- canvas and gutter surfaces through semantic tokens;
- clear but restrained active-line treatment;
- high-contrast cursor and selection;
- readable line numbers;
- visible search matches and current match;
- accessible autocomplete and command completion surfaces;
- consistent Markdown syntax coloring in both themes;
- error and diagnostic colors that do not rely on color alone where an icon or underline can be used;
- 16px default source size unless the existing workspace font-size setting overrides it;
- line height between 1.55 and 1.7;
- document padding that scales from 16px compact to 32px expanded.

Editor focus must be visually clear without drawing a permanent decorative border around the entire content area.

### 14.2 Rendered preview

The rendered note should read like a polished document.

Default rules:

- prose uses the selected `readingFont` stack;
- content column is centered with a preferred maximum line length of 72ch and a hard content maximum near 820px;
- narrow layouts use 16px to 20px horizontal padding;
- wide layouts use 32px to 48px horizontal padding;
- body size defaults to 16px and follows the existing note font-size preference where appropriate;
- body line height is approximately 1.7;
- headings use a consistent modular scale and stronger spacing above than below;
- first and last elements avoid accidental excess margins;
- links are recognizable without depending only on accent color;
- code blocks use the bundled monospaced face, clear background separation, internal scrolling, and existing copy behavior where available;
- inline code, tables, blockquotes, callouts, task lists, footnotes, math, images, and horizontal rules use the same semantic tokens;
- images fit the content column and retain existing opening or attachment behavior;
- wide tables scroll inside their own wrapper rather than widening the shell;
- selection styling remains visible in both themes.

### 14.3 Split mode

Wide and Medium:

- Source and Preview remain side by side.
- The divider is visible and easy to acquire.
- Each pane has a documented minimum width.
- Existing synchronized or independent scrolling behavior remains unchanged unless separately approved.

Compact:

- Source and Preview stack vertically.
- Each pane has a minimum height of 120px.
- Each pane scrolls independently.
- The divider is visually clear and has an accessible label.
- An optional drag-to-resize enhancement may follow, but is not required for the first release.

### 14.4 Empty document state

When no note is active, show an uncluttered state with:

- a concise title such as `Open or create a note`;
- primary actions for New Note and Open from Files;
- shortcuts where useful;
- no network-fed tips, rotating marketing cards, or decorative animation.

## 15. Search, Command Palette, menus, and dialogs

### 15.1 File and content search

Existing search behavior remains. Visual refresh requirements:

- search fields use a consistent leading icon, clear button, focus ring, and keyboard hint where one exists;
- results distinguish title, path, and excerpt through typography rather than multiple colored badges;
- query-in-progress, no-results, invalid-query, and indexing states are distinct;
- search results never jump under the pointer due solely to late decorative animation;
- compact results use full-width rows with 44px minimum target height.

### 15.2 Command Palette

Desktop:

- centered dialog, approximately 560px to 640px wide;
- search input focused on open;
- commands grouped or labeled by context where useful;
- shortcut hints aligned consistently;
- active result remains visible during keyboard navigation;
- Enter activates, Escape closes, and focus returns to the trigger.

Compact:

- full-screen or nearly full-screen sheet below the safe area;
- keyboard opening must not hide the active result or close action;
- the same command set remains available.

Search ranking behavior is not changed by UX-01.

### 15.3 Menus and context menus

Shared menu behavior:

- collision detection keeps the menu inside the viewport;
- menu items use text labels and optional leading icons;
- destructive actions use semantic danger styling but are not color-only;
- disabled actions explain their state when explanation is available;
- arrow-key navigation, Home, End, Enter, Space, and Escape work as appropriate;
- focus does not escape a modal menu interaction unexpectedly;
- pointer context menus and compact bottom action sheets expose equivalent actions.

### 15.4 Dialogs and confirmations

Dialogs use one shared implementation with:

- labeled title and optional description;
- focus trap;
- initial focus chosen deliberately;
- Escape close unless the operation cannot safely be interrupted;
- backdrop click behavior defined per dialog, not assumed globally;
- focus restoration;
- viewport and safe-area fitting;
- scrollable content region with stable header and action row;
- clear primary, secondary, and destructive action hierarchy.

Native `window.confirm` should be replaced on polished product paths with the shared confirmation dialog or compact action sheet, while retaining the same safety semantics.

### 15.5 Toasts and inline notices

Toasts are for short, non-critical confirmations such as a successful copy action. They must not be the only location for save failures, permission errors, missing workspaces, or destructive consequences.

Critical or recoverable errors use persistent inline banners, dialogs, or status regions with an explicit action.

## 16. Settings redesign

### 16.1 Desktop Settings

Settings opens as a large adaptive dialog, approximately 800px wide and no more than 85vh tall.

It contains:

- left category navigation;
- right scrollable content pane;
- stable title and close action;
- optional sticky footer only where unsaved settings require explicit Apply or Cancel.

Suggested categories:

1. General
2. Appearance
3. Editor and Files
4. Features
5. Templates and Snippets
6. Shortcuts
7. About

Existing settings remain present and retain current immediate-save or explicit-save behavior unless changed in a separate approved specification.

### 16.2 Compact Settings

Settings uses a full-screen presentation.

- A category landing page lists the same categories.
- Selecting a category opens a detail page.
- Android back returns to the category list before closing Settings.
- The software keyboard must not cover the active field or final form actions.
- Each category retains a stable heading and Close or Back action.

### 16.3 Settings controls

- Boolean values use a consistent switch or checkbox according to meaning.
- Exclusive small sets use a segmented control or radio group.
- Numeric ranges show current value and validation.
- Descriptions explain consequences, especially for deletion, attachments, frontmatter, workspace behavior, and platform permissions.
- Reset actions clearly state their scope.
- Appearance previews may show local sample text, but must not render remote content.
- Theme and accent choices show selected state through more than color alone.

### 16.4 Appearance settings

Appearance includes:

- Theme: System, Light, Dark
- Accent: Warm, Ocean, Forest, Plum
- Reading font: Sans, Serif, Mono
- Existing UI zoom
- Existing editor or note font size

A motion preference setting is not required because `prefers-reduced-motion` is authoritative. A future explicit override may be specified separately.

## 17. Graph and Canvas presentation

### 17.1 Graph

The existing Graph remains a dedicated full-screen view and keeps its current data and layout logic.

Visual changes:

- a clear Graph header with title, local/workspace scope, search/filter, options, and Close;
- related controls grouped by purpose rather than placed as a flat row;
- secondary controls may move into a settings sheet or popover;
- node, edge, label, selected, hovered, and group colors derive from semantic graph tokens;
- existing custom color-group behavior remains;
- empty and loading states use shared status patterns;
- compact layout respects safe areas and 44px touch targets;
- the Canvas remains the dominant surface, with chrome visually receding after interaction where safe.

No continuous decorative animation is introduced.

### 17.2 Canvas

Canvas keeps its current document model and interaction behavior.

Visual changes should focus on:

- toolbar grouping;
- selected-node handles;
- zoom controls;
- empty-state guidance;
- dialogs, menus, and color controls;
- safe-area and touch-target consistency;
- light and dark token mapping.

UX-01 must not alter Canvas file serialization or coordinate semantics.

## 18. Welcome, loading, empty, and error states

### 18.1 Welcome and workspace launcher

When no workspace is active, the welcome view presents:

- Leotheca mark and name;
- one-sentence local-first explanation;
- primary Open Workspace action;
- recent workspaces from F20 when available;
- recovery actions for unavailable workspaces;
- no account prompt, online template gallery, or remote illustration.

### 18.2 Loading

Loading indicators must reflect real work.

- Work under 250ms should generally not show a spinner.
- Work over 250ms may show a local spinner and text.
- Work over 2 seconds should, where possible, explain what is loading.
- Skeleton layouts may be used only when they match the eventual structure and do not imply unavailable content.

### 18.3 Empty states

Every major surface defines a useful empty state:

- no notes open;
- empty workspace;
- no bookmarks;
- no tags;
- no backlinks;
- no search results;
- empty graph;
- no recent workspaces.

An empty state contains at most one primary action and one secondary path unless recovery requires more.

### 18.4 Error states

Errors must answer:

1. What failed?
2. What, if anything, is at risk?
3. What can the user do now?

Examples include:

- note save failed;
- settings write failed;
- folder permission lost;
- workspace unavailable;
- file no longer exists;
- invalid filename;
- search index failed;
- attachment operation failed.

Error copy should be concise, preserve technical detail behind an expandable section where useful, and avoid blaming the user.

## 19. Visual design system

### 19.1 Token architecture

Components must consume semantic tokens rather than literal theme colors.

Recommended layers:

1. **Primitive values:** neutral and accent scales, spacing values, type sizes.
2. **Semantic values:** canvas, panel, raised, text, border, accent, success, warning, danger.
3. **Component aliases:** optional aliases only when a shared primitive has a distinct interaction contract.

Example files:

```text
src/styles/tokens.css
src/styles/theme.css
src/styles/base.css
src/styles/motion.css
```

Literal colors should be limited to token definition files and feature-specific visualizations that cannot use semantic colors directly.

### 19.2 Reference color tokens

The following values define the initial implementation target. Final values may change during contrast review, but token names and semantic roles should remain stable.

#### Light theme

| Token | Initial value | Role |
|---|---|---|
| `--color-canvas` | `#F6F5F2` | application background |
| `--color-panel` | `#FCFBF9` | navigation and document surfaces |
| `--color-raised` | `#FFFFFF` | floating menus and dialogs |
| `--color-muted-surface` | `#EFEEEA` | low-emphasis region |
| `--color-hover` | `#E9E7E1` | pointer hover |
| `--color-selected` | `#E8E0D3` | selected warm-accent surface |
| `--color-text` | `#25231F` | primary text |
| `--color-text-secondary` | `#68635B` | secondary text |
| `--color-text-muted` | `#756F66` | metadata only |
| `--color-border` | `#D8D4CB` | standard border |
| `--color-border-strong` | `#BEB8AD` | emphasized divider |
| `--color-accent` | `#725331` | default Warm accent |
| `--color-accent-hover` | `#5E4328` | warm accent hover |
| `--color-accent-soft` | `#EDE3D5` | warm accent tint |
| `--color-on-accent` | `#FFFFFF` | text on solid accent |
| `--color-success` | `#2F6B4F` | success state |
| `--color-warning` | `#8B6116` | warning state |
| `--color-danger` | `#A43D35` | destructive and error state |
| `--color-focus` | `#28647A` | focus ring |

#### Dark theme

| Token | Initial value | Role |
|---|---|---|
| `--color-canvas` | `#171815` | application background |
| `--color-panel` | `#1E201C` | navigation and document surfaces |
| `--color-raised` | `#262824` | floating menus and dialogs |
| `--color-muted-surface` | `#2B2D28` | low-emphasis region |
| `--color-hover` | `#31332E` | pointer hover |
| `--color-selected` | `#3A342B` | selected warm-accent surface |
| `--color-text` | `#F0EEE7` | primary text |
| `--color-text-secondary` | `#B8B4AA` | secondary text |
| `--color-text-muted` | `#918C82` | metadata only |
| `--color-border` | `#3B3D37` | standard border |
| `--color-border-strong` | `#55574F` | emphasized divider |
| `--color-accent` | `#D1AD77` | default Warm accent |
| `--color-accent-hover` | `#E1C18D` | warm accent hover |
| `--color-accent-soft` | `#3A3125` | warm accent tint |
| `--color-on-accent` | `#1B1712` | text on solid accent |
| `--color-success` | `#78B994` | success state |
| `--color-warning` | `#D5A350` | warning state |
| `--color-danger` | `#E07A70` | destructive and error state |
| `--color-focus` | `#70B6CF` | focus ring |

Accent mappings for Ocean, Forest, and Plum must define at least solid, hover, soft, and on-accent values in both themes. Every mapping must pass the same contrast gates as Warm.

### 19.3 Surface and elevation rules

- Application canvas has no shadow.
- Docked panels use borders, not shadows.
- Floating menus, popovers, dialogs, and sheets may use one low-elevation shadow token.
- Modal dialogs may use a stronger elevation token.
- Shadows remain neutral and subtle in dark mode.
- Ordinary settings groups and note content are not wrapped in decorative cards by default.

### 19.4 Typography

Font stacks:

```css
--font-ui: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
  "Segoe UI", sans-serif;
--font-reading-sans: ui-sans-serif, system-ui, -apple-system,
  BlinkMacSystemFont, "Segoe UI", sans-serif;
--font-reading-serif: ui-serif, Georgia, Cambria, "Times New Roman", serif;
--font-mono: "Source Code Pro", ui-monospace, SFMono-Regular, Consolas,
  "Liberation Mono", monospace;
```

Reference size scale:

- 11px: compact metadata only
- 12px: labels and secondary metadata
- 13px: dense UI controls
- 14px: standard desktop UI text
- 16px: standard note body and compact UI text
- 18px: panel or dialog title
- 22px: document heading level
- 28px and 36px: major rendered headings

Weights are limited primarily to 400, 500, 600, and 700. Text hierarchy should not depend on many near-identical gray values.

### 19.5 Spacing

Reference spacing scale:

- 2px
- 4px
- 6px
- 8px
- 12px
- 16px
- 20px
- 24px
- 32px
- 40px
- 48px

Components should consume named spacing tokens. Arbitrary one-off values require a documented layout reason.

### 19.6 Corner radius

Reference radius scale:

- 4px: small internal element
- 6px: standard control
- 10px: menus, popovers, compact panels
- 14px: dialogs and sheets
- 999px: true pills such as compact statuses only

Large surfaces such as the editor, navigation panel, and settings content should not all become rounded cards.

### 19.7 Icons

Leotheca shall use one local SVG icon registry.

Icon rules:

- one consistent outline style;
- approximately 1.75px stroke at a 20px canvas;
- rounded caps and joins where appropriate;
- primary sizes of 16px, 20px, and 24px;
- no emoji, text symbol, or Unicode character as the primary representation of a core control;
- icons inherit current color unless a semantic state requires otherwise;
- every icon-only control has an accessible label and tooltip on pointer layouts;
- destructive, warning, and status icons have text or accessible state support;
- icons are bundled and tree-shakeable or imported individually;
- no runtime icon download and no large third-party icon package unless separately justified.

A central `src/ui/icons.tsx` or equivalent registry is preferred over repeated inline SVG markup in feature components.

### 19.8 Focus

- Use `:focus-visible` for pointer-aware focus presentation.
- Default focus ring is at least 2px with a visible offset or inner/outer contrast pair.
- Focus remains visible against canvas, panel, raised, selected, accent, warning, and danger surfaces.
- Focus is never removed without an equivalent replacement.

## 20. UI primitives

The refresh should introduce only the primitives needed by multiple surfaces.

Initial set:

- `Button`
- `IconButton`
- `SegmentedControl`
- `TextField`
- `SearchField`
- `Select` or menu-backed selector
- `Checkbox`
- `Switch`
- `RadioGroup`
- `Tooltip`
- `Menu`
- `ContextMenu`
- `Dialog`
- `Sheet`
- `Tabs`
- `StatusIndicator`
- `InlineBanner`
- `Toast`
- `EmptyState`
- `Spinner`
- `Divider`

Each primitive must define:

- sizes;
- visual variants;
- loading and disabled behavior where relevant;
- keyboard behavior;
- accessible name and description requirements;
- pointer and touch behavior;
- light and dark states;
- reduced-motion behavior;
- test coverage expectations.

The project should not create an abstract primitive when only one feature uses it and native markup is sufficient.

## 21. Interaction and motion

### 21.1 Timing

Reference durations:

- hover and pressed state: 80ms to 120ms;
- small popover or menu: 140ms to 180ms;
- sheet or dialog entrance: 180ms to 220ms;
- panel width and layout changes: no more than 180ms where animation does not cause content instability;
- transient saved state: approximately 1.5 seconds before returning to quiet clean state.

### 21.2 Motion rules

- Animate opacity and transform where possible.
- Avoid animating dimensions of the CodeMirror editor during typing.
- Do not animate every file-tree row on load.
- Do not delay focus until an entrance animation completes.
- Do not use spring or bounce motion for standard productivity interactions.
- Use motion to explain origin and destination of a menu, sheet, or selected state.
- `prefers-reduced-motion: reduce` disables non-essential movement and shortens required transitions to near-instant.

### 21.3 Feedback

- Pointer hover is subtle and immediate.
- Pressed state is visually distinct from hover.
- Drag handles, where present, change cursor and expose an accessible alternative.
- Long-running actions show progress only when real progress exists.
- Disabled controls do not masquerade as normal controls with low opacity alone; state and explanation remain accessible.

## 22. Accessibility requirements

UX-01 targets WCAG 2.2 AA for the shared frontend.

### 22.1 Contrast

- Normal text: at least 4.5:1.
- Large text: at least 3:1.
- Meaningful icons, control boundaries, selected indicators, and focus indicators: at least 3:1 against adjacent colors.
- Placeholder text must not be the only label.
- Muted text that does not meet normal-text contrast may be used only for non-essential decorative metadata and should still aim for 4.5:1.

### 22.2 Keyboard

All Desktop functionality must be operable by keyboard where the platform interaction model supports it.

Required areas:

- Activity Rail
- Navigation Panel and tree
- Tab Bar and Tab Switcher
- Document Header
- Inspector
- Command Palette
- menus and context menus
- dialogs and confirmations
- Settings categories and controls
- Graph controls
- Canvas controls outside the graphical editing surface

Focus order must follow visual order. Opening and closing an overlay restores focus predictably.

### 22.3 Screen reader

- Landmarks identify application navigation, main document, and complementary Inspector regions.
- Icon-only buttons have explicit names.
- Tabs, menus, trees, dialogs, sheets, and progress states use appropriate semantics.
- Dirty state and save error are available in tab and document labels.
- Save errors and permission loss use concise live announcements.
- Repeated autosave success is not announced on every write.
- Visual truncation does not truncate the accessible name.

### 22.4 Touch

- Compact interactive targets are at least 44 by 44 CSS pixels where possible.
- Adjacent destructive and common actions have sufficient separation.
- Long-press has an equivalent discoverable action through an overflow button.
- Hover is never required to discover or use an action on Android.

### 22.5 Zoom, reflow, and text size

- The shell reflows without horizontal scrolling at 320 CSS pixels.
- The interface remains usable at 200 percent browser or application zoom.
- Text does not clip at common Android font-scale settings.
- Sticky headers and footers do not leave less than 160px usable content height where avoidable.
- The compact keyboard and safe-area insets are tested on physical Android hardware.

### 22.6 Reduced motion and forced colors

- Reduced motion disables non-essential entrance and selection animation.
- Forced-colors mode retains visible control boundaries and selection.
- Icons and status indicators do not disappear when background images or custom colors are suppressed.

## 23. Data and settings model

### 23.1 Existing values

The following existing settings remain authoritative:

- global theme behavior;
- workspace accent choice;
- UI zoom;
- note or editor font size;
- default Source, Split, or Preview mode;
- existing feature toggles and workspace preferences.

### 23.2 New optional value

UX-01 may add:

```ts
type ReadingFont = "sans" | "serif" | "mono";

interface WorkspaceSettings {
  readingFont?: ReadingFont;
}
```

Decoding rules:

- missing value defaults to `sans`;
- unknown value defaults visually to `sans`;
- unknown stored values should be preserved where the existing non-destructive settings decoder supports preservation;
- the setting affects rendered Markdown prose only, not source editor code or code blocks.

### 23.3 Session-only layout state

The first release may keep these in application memory only:

- active navigation destination;
- whether Navigation Panel is open at Medium width;
- whether Inspector is open;
- active Inspector tab;
- temporary panel widths;
- open Settings category.

Persisting these values across restarts is optional and should be specified separately if introduced.

### 23.4 No content migration

No note file, frontmatter block, attachment, search index format, Canvas document, graph data, or workspace path is changed by the visual refresh.

## 24. Architecture and implementation shape

### 24.1 Proposed module structure

A possible target structure is:

```text
src/
  app/
    layout/
      AppShell.tsx
      GlobalTopBar.tsx
      ActivityRail.tsx
      NavigationPanel.tsx
      DocumentHeader.tsx
      Inspector.tsx
      CompactNavigationSheet.tsx
      CompactTabSwitcher.tsx
      adaptiveLayout.ts
  ui/
    Button.tsx
    IconButton.tsx
    SegmentedControl.tsx
    TextField.tsx
    Tooltip.tsx
    Menu.tsx
    Dialog.tsx
    Sheet.tsx
    Tabs.tsx
    StatusIndicator.tsx
    InlineBanner.tsx
    EmptyState.tsx
    icons.tsx
  styles/
    tokens.css
    theme.css
    base.css
    motion.css
```

This is a design target, not a requirement to create every file before a component is used.

### 24.2 State ownership

- `App.tsx` or its existing store remains the composition boundary for global application and workspace state.
- Layout components receive narrow props and callbacks. They do not create parallel workspace, tab, editor, or search stores.
- File-tree behavior remains owned by workspace modules.
- CodeMirror state remains owned by the editor module.
- Backlink calculation remains owned by linking modules.
- Graph and Canvas domain state remain in their existing features.
- Shared UI primitives own presentation and generic interaction only.

### 24.3 Adaptive-layout state

One shared TypeScript utility shall expose the active layout class to logic that truly needs a different interaction pattern. CSS media queries handle ordinary styling.

Requirements:

- no feature-specific copies of breakpoint numbers;
- one match-media subscription per application, not one per control;
- server-side rendering is not required;
- resize changes preserve active editor and tab state;
- crossing a breakpoint closes or converts overlays safely without trapping focus;
- CSS and TypeScript threshold definitions are tested for alignment.

### 24.4 CSS strategy

- Keep CSS custom properties as the theme transport.
- Split the monolithic application stylesheet incrementally by shell or feature.
- Do not introduce CSS-in-JS or a utility framework as part of UX-01.
- Use class names scoped by component or feature convention.
- Avoid selectors coupled to deep incidental DOM structure.
- Keep CodeMirror theme rules near the editor integration.
- Retain a small global reset and typography baseline.

### 24.5 Overlay system

Dialog, Sheet, Menu, Tooltip, and Toast should share:

- a portal root;
- z-index tokens;
- focus restoration;
- Escape handling;
- scroll-lock policy;
- Android back integration for dismissible overlays;
- safe-area offsets;
- collision and viewport fitting where relevant.

A central overlay manager is justified only if it simplifies back-button ordering and focus ownership. It must not become a second application state store.

### 24.6 Icon migration

Core controls should migrate to the registry in stages. During migration, visual duplication is acceptable on development branches, but a release gate must verify that primary shell controls no longer use emoji or Unicode glyphs.

### 24.7 Theme application

Theme changes must update CSS variables without remounting the editor or application shell. Accent changes update semantic accent tokens. Graph and Canvas read their colors from the same mapped token layer or an explicit feature token adapter.

## 25. Performance requirements

### 25.1 General

- No runtime network requests are added.
- No continuous animation loop is added to the shell.
- The icon system must not load an entire large icon bundle when only a small subset is used.
- Hidden Graph, Canvas, Settings, and heavy sheets should not perform expensive work solely because their trigger is rendered.
- Theme changes should be CSS-variable updates rather than large component-tree rebuilds.
- CodeMirror must preserve its current view and document state across shell-only updates.

### 25.2 Regression budgets

Measured on representative Desktop and Android hardware using the same workspace fixture:

- median shell-ready time must not regress by more than 10 percent;
- median workspace-open time must not regress by more than 10 percent;
- median note-switch visible response must not regress by more than 10 percent;
- typing must remain visually immediate under the existing large-note test fixture;
- opening Navigation Panel, Inspector, menus, or Settings should provide first visual response within 100ms after input;
- sheet and dialog animations should sustain a visually smooth frame rate on the supported Android baseline;
- memory after opening and closing Settings, Graph, and Inspector repeatedly must not grow without bound.

If current automated performance baselines do not exist, Phase 0 must create them before shell implementation.

### 25.3 Layout stability

- Loading icons or status text must not shift primary document actions unexpectedly.
- Scrollbars and panel opening should avoid avoidable content jumps.
- Font fallback must not cause a remote-load reflow.
- The transient Saved state reserves or overlays sufficient space so the header does not oscillate during autosave.

## 26. Privacy and security

- All fonts, icons, illustrations, and marks are local system resources or application-bundled assets.
- CSS must not contain remote `url()` resources.
- No visual preview fetches remote Open Graph data, avatars, favicons, or website thumbnails.
- Tooltips, toasts, screenshots, and error details must not expose Android URI tokens or other sensitive platform locators.
- HTML preview sanitization remains unchanged and must not be weakened for richer styling.
- The new Dialog and Sheet components must not render untrusted HTML.
- No telemetry is introduced to evaluate the redesign.
- Recent-workspace visuals follow F20 privacy constraints and do not cache note content.

## 27. Functional requirements

### Foundation

**VIS-001:** The application shall define semantic light and dark theme tokens for surfaces, text, borders, accent, focus, success, warning, danger, elevation, spacing, radii, and motion.

**VIS-002:** All primary shell surfaces shall consume semantic tokens rather than hard-coded theme colors.

**VIS-003:** Existing Warm, Ocean, Forest, and Plum accents shall remain selectable and shall map to contrast-tested semantic accent tokens in both themes.

**VIS-004:** Core UI icons shall use one local SVG icon language and shall not depend on runtime network access.

**VIS-005:** Shared controls shall use reusable accessible primitives where at least two application surfaces need the same behavior.

**VIS-006:** Light and Dark themes shall be treated as equal release targets, not as one theme with an approximate inversion.

### Shell and navigation

**UX-001:** The application shall expose Compact, Medium, Wide, and Expanded layout behavior from one shared adaptive-layout definition.

**UX-002:** Widths at or above 720px shall expose an Activity Rail for Files, Bookmarks, Tags, Graph, and Settings.

**UX-003:** Compact layouts shall replace the Activity Rail and horizontal global toolbar with a top bar and Navigation Sheet.

**UX-004:** The Global Top Bar shall contain workspace and application-level actions only.

**UX-005:** Note-specific view, bookmark, Inspector, and overflow actions shall appear in the Document Header or compact equivalent.

**UX-006:** Every existing global toolbar action shall have an identified location and remain reachable after the refresh.

**UX-007:** The application shell shall not require horizontal scrolling at 320 CSS pixels.

### Navigation, tabs, and Inspector

**NAV-001:** Files, Bookmarks, and Tags shall render in one Navigation Panel with destination-specific headers and actions.

**NAV-002:** Existing file-tree functionality, search, sorting, expand/collapse, create, rename, move, delete, and context actions shall remain available where currently supported.

**TAB-001:** Desktop tabs shall expose active, dirty, save-error, and close state with accessible semantics.

**TAB-002:** Compact layouts shall expose open tabs through a Tab Switcher sheet with activation and close actions.

**INS-001:** Properties and Backlinks shall be available through one Inspector with separate tabs.

**INS-002:** The Inspector shall dock only when sufficient document width remains and shall otherwise use an adaptive sheet.

### Editing and reading

**EDIT-001:** CodeMirror shall remain mounted and retain editor state during shell-only updates.

**EDIT-002:** Source editor colors, gutter, selection, cursor, search, completion, and syntax styling shall use the new theme tokens.

**READ-001:** Rendered prose shall use a proportional local font by default and retain monospaced code styling.

**READ-002:** Preview content shall use a readable maximum line length and responsive padding.

**READ-003:** Source, Split, and Preview modes shall remain available on every supported layout.

**READ-004:** Compact Split mode shall stack source and preview vertically without widening the shell.

### Operational state

**STATE-001:** Save status shall distinguish clean, dirty, saving, transient saved, and error states based on real persistence events.

**STATE-002:** Save errors shall remain visible and offer recovery.

**STATE-003:** Indexing, loading, empty, and error states shall use consistent, truthful visual patterns.

**STATE-004:** Critical errors shall not be communicated only by a disappearing toast.

### Settings and overlays

**SET-001:** Desktop Settings shall use category navigation and a scrollable content pane.

**SET-002:** Compact Settings shall use a full-screen category and detail model compatible with Android back behavior.

**SET-003:** Every existing setting shall remain reachable and retain its current persistence semantics.

**OVR-001:** Dialogs, sheets, menus, and tooltips shall fit within the viewport and safe-area insets.

**OVR-002:** Modal overlays shall trap and restore focus correctly.

**OVR-003:** Android back shall dismiss the topmost dismissible overlay before performing lower-level navigation.

### Accessibility, privacy, and performance

**A11Y-001:** Normal text, meaningful controls, icons, and focus indicators shall meet the defined WCAG 2.2 AA contrast gates.

**A11Y-002:** Compact touch targets shall be at least 44 by 44 CSS pixels where possible.

**A11Y-003:** Icon-only controls shall have accessible names, visible tooltips on pointer layouts, and non-hover access on touch layouts.

**A11Y-004:** The application shall remain usable at 200 percent zoom and at 320 by 568 CSS pixels.

**A11Y-005:** Reduced-motion and forced-colors preferences shall retain usable state and navigation.

**PRIV-001:** UX-01 shall add no network request, telemetry, remote font, remote icon, or remote visual asset.

**PERF-001:** Shell, workspace-open, note-switch, and typing performance shall remain within the stated regression budgets.

**PERF-002:** Theme and shell state changes shall not remount CodeMirror or re-index the workspace.

**DATA-001:** UX-01 shall not modify note, attachment, graph, Canvas, or workspace content formats.

## 28. Acceptance criteria

### Visual system

**AC-01:** Light and Dark themes have approved reference captures for the welcome view, shell, editor, preview, navigation, Inspector, Settings, dialogs, Graph, and Canvas controls.

**AC-02:** Warm, Ocean, Forest, and Plum pass contrast review for default, hover, selected, focus, and on-accent states in both themes.

**AC-03:** Core shell controls use the approved icon registry. No primary shell action is represented only by an emoji or Unicode glyph.

**AC-04:** No runtime network request occurs when changing theme, opening Settings, opening a note, or rendering the shell from a clean installation.

### Functional parity

**AC-05:** A maintained parity checklist confirms that every pre-refresh toolbar, sidebar, tab, Properties, Backlinks, Graph, Help, Command Palette, and Settings action remains reachable.

**AC-06:** Existing keyboard shortcuts continue to invoke the same functional action unless a separately approved change is documented.

**AC-07:** File creation, folder creation, rename, move, delete, search, sort, expand/collapse, bookmark, tag, backlink, graph, Canvas, attachment, and template paths pass their existing integration tests.

**AC-08:** No note or workspace migration is required to launch the refreshed application.

### Adaptive behavior

**AC-09:** At 1440 by 900 CSS pixels, Activity Rail and Navigation Panel are docked, the document remains comfortably readable, and the Inspector can dock without reducing the editor below its minimum width.

**AC-10:** At 900 by 700 CSS pixels, Activity Rail remains available while Navigation Panel and Inspector use overlays without trapping or losing focus.

**AC-11:** At 360 by 800 and 320 by 568 CSS pixels, the shell has no horizontal scrollbar, all core actions remain reachable, and touch targets meet the compact requirement.

**AC-12:** Compact layout does not present a horizontally scrolling global toolbar.

**AC-13:** Compact Source, Split, and Preview modes all work. Split uses a vertical stack with independent scrolling.

**AC-14:** Android safe areas, software keyboard, long press, and back navigation pass physical-device verification.

### Editor, tabs, and saving

**AC-15:** Switching Activity Rail destinations, opening Inspector, changing theme, and opening Settings do not remount CodeMirror or lose selection, scroll, undo history, composition, or unsaved text.

**AC-16:** Dirty, saving, saved, and save-error states appear only in response to the corresponding persistence state.

**AC-17:** A simulated save failure remains visible, appears on the active document and its tab, exposes Retry, and clears only after a successful recovery or an explicit existing resolution path.

**AC-18:** With 30 open tabs, the active tab remains reachable and identifiable on desktop, and every tab is available in the compact Tab Switcher.

**AC-19:** Long filenames and paths truncate visually without losing their complete accessible name.

### Settings and overlays

**AC-20:** Every existing setting appears in exactly one documented category or intentionally linked subflow.

**AC-21:** Desktop and compact Settings can be opened, navigated, and closed with pointer, keyboard, and Android back where applicable.

**AC-22:** Menus and context menus remain entirely within the viewport at each edge and corner.

**AC-23:** Opening and closing Dialog, Sheet, Menu, Command Palette, Settings, and Inspector restores focus to the initiating control or a documented safe fallback.

### Accessibility

**AC-24:** Automated accessibility checks report no critical violations on the shell, Settings, Navigation Panel, Inspector, Command Palette, and representative dialogs.

**AC-25:** Manual keyboard testing reaches every Desktop control without pointer use and without a focus trap outside an intentional modal.

**AC-26:** Screen-reader testing identifies application navigation, active tab, main document, Inspector, dirty state, save error, dialogs, and progress state accurately.

**AC-27:** At 200 percent zoom, actions reflow rather than overlap, and Settings remains usable.

**AC-28:** With reduced motion enabled, no non-essential slide, fade, or selection movement remains longer than 50ms.

### Performance and reliability

**AC-29:** Performance measurements remain within the defined 10 percent regression budgets on the approved fixtures.

**AC-30:** Repeatedly opening and closing Settings, Inspector, Graph, and compact sheets does not produce unbounded event listeners, portals, or memory growth.

**AC-31:** Changing layout class during an active edit preserves note content, tab identity, editor selection, and the authoritative workspace session.

**AC-32:** The complete automated Desktop and Android test suites pass, followed by manual Linux Desktop and physical Android sign-off.

### Documentation

**AC-33:** README screenshots and feature descriptions show the refreshed shell in both Desktop and Android form.

**AC-34:** Architecture documentation describes the new shell, primitives, token layer, and adaptive-layout ownership.

**AC-35:** Roadmap entries for the visual refresh and logo work are updated without claiming completion before all release gates pass.

**AC-36:** Repository text added by UX-01 follows the repository writing rules, including the prohibition on em dashes.

## 29. Test plan

### 29.1 Unit tests

Test at minimum:

- adaptive-layout classification at every boundary;
- TypeScript and CSS breakpoint alignment helper where feasible;
- theme and accent mapping;
- reading-font decoding and defaults;
- save-state transitions;
- tab dirty and error labels;
- action mapping and compact overflow contents;
- menu collision calculations;
- overlay dismissal ordering;
- focus-return target selection;
- reduced-motion behavior decisions;
- unknown theme or accent fallback;
- no remote URL validation for theme asset declarations where practical.

### 29.2 Component tests

Test at minimum:

- `GlobalTopBar`
- `ActivityRail`
- `NavigationPanel`
- `TabBar`
- `CompactTabSwitcher`
- `DocumentHeader`
- save-status indicator
- `Inspector`
- `Dialog`
- `Sheet`
- `Menu`
- `Settings` category navigation
- compact Settings detail navigation
- Command Palette presentation
- empty, loading, warning, and error states

Each shared primitive requires keyboard and accessible-name assertions appropriate to its semantics.

### 29.3 Integration tests

Scenarios:

1. Open a workspace and restore tabs.
2. Create a note, type, autosave, and confirm truthful state.
3. Simulate save failure and Retry.
4. Switch Source, Split, and Preview.
5. Open and close Files, Bookmarks, Tags, and Inspector without editor-state loss.
6. Search files and content while indexing.
7. Rename, move, and delete through pointer and keyboard paths.
8. Open Properties and edit frontmatter.
9. Open a backlink and preserve expected tab behavior.
10. Open Graph, filter it, and return to the same note.
11. Open Canvas and use existing controls.
12. Open Settings, change theme, accent, zoom, font size, and reading font.
13. Resize across all layout classes during an active edit.
14. Exercise 30 open tabs and compact tab switching.
15. Use Command Palette from every layout.
16. Use F20 workspace switching when available and verify shell state cannot cross sessions.
17. Restore from an unavailable or permission-lost workspace state.
18. Verify Android back ordering across nested overlays.

### 29.4 Visual-regression matrix

Capture representative states in:

- Light and Dark;
- Warm, Ocean, Forest, and Plum accents;
- 1440 by 900;
- 1100 by 760;
- 900 by 700;
- 720 by 700;
- 360 by 800;
- 320 by 568;
- 100, 125, 150, and 200 percent UI zoom where supported.

Representative content:

- empty workspace;
- large file tree;
- long folder and note names;
- many tabs;
- dirty and save-error tabs;
- Markdown with headings, lists, tasks, table, code, quote, math, image, links, and footnotes;
- Properties with several field types;
- many backlinks;
- no search results and many search results;
- Graph with default and custom groups;
- Settings sections with validation and destructive actions;
- Android keyboard open;
- safe-area inset variations.

Visual diffs should detect unintended layout or token changes. They do not replace manual visual review.

### 29.5 Accessibility testing

Automated:

- semantic roles and names;
- contrast where tooling can calculate it;
- focusable elements inside hidden overlays;
- duplicate IDs;
- landmark structure;
- dialog labeling.

Manual:

- full keyboard pass;
- screen-reader pass on at least one Desktop platform and Android;
- 200 percent zoom and increased Android font scale;
- reduced motion;
- forced colors or high-contrast mode where supported;
- touch-only operation on physical Android hardware.

### 29.6 Performance testing

Record before and after values for:

- application shell ready;
- workspace open with standard and large fixtures;
- first note visible;
- note switch with warm and cold file reads;
- first keystroke response;
- sustained typing in a large note;
- theme change;
- Navigation Panel open;
- Inspector open;
- Settings open;
- Graph open;
- repeated overlay open and close memory profile.

Tests should use the same fixture, hardware class, and build mode for comparison.

### 29.7 Platform verification

Linux Desktop is the first manual desktop gate if that remains the project's primary Desktop target. Windows and macOS receive smoke verification as builds become part of the release process.

Android requires physical-device checks for:

- status and navigation bar insets;
- software keyboard resize or overlay behavior;
- touch target size;
- long press;
- bottom and side sheets;
- back button ordering;
- orientation change if supported;
- low and mid-range rendering performance;
- persisted workspace access after process restart.

## 30. Incremental implementation plan

UX-01 must be implemented as a sequence of reviewable changes. Each phase should leave the default branch functional.

### Phase 0: Baseline and audit

Deliverables:

- complete current-action parity inventory;
- screenshots of current representative states;
- accessibility baseline;
- performance baseline;
- list of existing inline SVG, Unicode, and emoji controls;
- mapping of current styles to future semantic tokens;
- approved reference mockups.

No user-visible layout change is required.

### Phase 1: Tokens, icons, and primitives

Deliverables:

- token files and theme mappings;
- accent mappings;
- local icon registry;
- Button, IconButton, SegmentedControl, Tooltip, Menu, Dialog, and status primitives needed by the current shell;
- theme application without editor remount;
- focused accessibility tests.

The current layout may still be used, now driven by the new foundation.

### Phase 2: Desktop shell and Document Header

Deliverables:

- Global Top Bar;
- Activity Rail;
- docked Navigation Panel;
- redesigned Tab Bar;
- Document Header;
- action migration from the old toolbar;
- truthful save-state UI;
- no functionality removed.

Start at Wide and Expanded layouts while preserving the current narrow path temporarily on the development branch.

### Phase 3: Inspector and adaptive shell

Deliverables:

- Properties and Backlinks Inspector;
- Medium overlay navigation;
- Expanded Inspector docking;
- compact top bar;
- Navigation Sheet;
- Tab Switcher;
- compact view-mode chooser;
- compact vertical Split mode;
- Android back and safe-area integration.

The old horizontally scrolling compact toolbar is removed only after parity is complete.

### Phase 4: Settings and overlay completion

Deliverables:

- categorized Desktop Settings;
- full-screen compact Settings;
- shared confirmation dialogs;
- viewport-safe menus and context menus;
- compact action sheets;
- Command Palette refresh;
- consistent focus and dismissal behavior.

### Phase 5: Editor, preview, Graph, Canvas, and states

Deliverables:

- CodeMirror token theme;
- proportional preview typography and `readingFont` setting;
- polished Markdown elements;
- Graph and Canvas chrome refresh;
- welcome, empty, loading, and error states;
- final accent and contrast pass.

### Phase 6: Hardening and release

Deliverables:

- full parity sign-off;
- visual-regression matrix;
- accessibility sign-off;
- performance sign-off;
- physical Android sign-off;
- README screenshots;
- architecture and settings documentation;
- removal of temporary build flags and obsolete CSS;
- roadmap and release-note updates.

## 31. Pull request strategy

Recommended pull-request boundaries:

1. Baselines and design documentation
2. Tokens and icon registry
3. Shared controls and overlay infrastructure
4. Desktop shell and action mapping
5. Inspector and tab modernization
6. Compact and Android adaptive behavior
7. Settings and Command Palette
8. Editor, preview, Graph, and Canvas polish
9. Accessibility, performance, cleanup, screenshots, and docs

A pull request should not combine a broad visual change with unrelated domain refactoring. Existing feature tests should move only when required by a new semantic component boundary.

## 32. Rollout

Leotheca has no telemetry or remote cohort system, so rollout is build-based rather than account-based.

Recommended approach:

1. Develop behind a local build-time flag only while parity is incomplete.
2. Make the new token layer the default before replacing the shell.
3. Remove the old shell and the development flag before release.
4. Publish one preview build for manual Desktop and Android testing if the project distribution process supports it.
5. Ship the final refresh as one documented user-facing release after all acceptance gates pass.

A permanent Classic UI switch is not recommended because it doubles maintenance, test, documentation, and accessibility obligations.

## 33. Documentation changes

Update at minimum:

- `README.md` screenshots and interface descriptions;
- architecture documentation for the shell, primitives, tokens, overlays, and adaptive state;
- Settings documentation for `readingFont` if added;
- keyboard and navigation documentation;
- Android navigation and back behavior notes;
- roadmap status for visual refresh and logo work;
- release notes explaining where moved actions now live;
- contributor guidance for tokens, icons, primitives, and no-remote-asset rules.

Documentation should explain behavior, not only appearance.

## 34. Risks and mitigations

| Risk | Consequence | Mitigation |
|---|---|---|
| Large `App.tsx` and `App.css` changes create regressions | Lost actions or state coupling | Phase work, parity inventory, narrow component props, integration tests |
| Shell state remounts CodeMirror | Lost selection, undo, composition, or performance | Keep editor ownership stable, assert view identity in tests |
| Compact actions become hidden in overflow | Reduced discoverability | Preserve direct primary actions, labeled sheets, parity review |
| Android keyboard and safe areas break overlays | Inaccessible fields or buttons | Physical-device test gate, shared inset tokens, back-order tests |
| Accent variants fail contrast | Inaccessible selected and focus states | Semantic accent mapping and automated plus manual contrast review |
| Too many new primitives create an internal framework | Slower development and abstraction burden | Add only reused primitives, prefer native semantics |
| Animation reduces responsiveness | Lag and battery cost | Short CSS transform/opacity motion, reduced-motion support, budgets |
| New preview font surprises existing users | Perceived loss of familiar appearance | Provide local Sans, Serif, and Mono choices, retain source mono |
| Settings reorganization loses options | Functional regression | One-to-one settings inventory and category acceptance test |
| Inspector relocation makes metadata less visible | Users miss Properties or Backlinks | Direct Document Header trigger, state badge where useful, Help update |
| F20 is not ready when shell lands | Duplicate workspace UI | Stable workspace slot with temporary existing-folder adapter |
| Logo project delays release | Visual inconsistency | Treat mark as companion, allow neutral local placeholder until release gate |
| CSS and TypeScript breakpoints diverge | Incorrect overlay behavior | Central constants, boundary tests, documented thresholds |
| Visual polish increases CSS size and complexity | Maintenance and startup regression | Token reuse, stylesheet split, size review, no framework dependency |
| Menus and dialogs regress focus | Keyboard and screen-reader failure | Shared overlay primitives, component tests, manual accessibility pass |

## 35. Open design approvals

The SDD settles behavior and structure. The following visual assets still require maintainer approval before release implementation is considered final:

1. Final Quiet Library light and dark palette after contrast testing
2. Final Leotheca mark and launcher icon
3. Final reference captures for Wide, Medium, and Compact layouts
4. Final Ocean, Forest, and Plum accent mappings

These approvals must not alter the functional information architecture without updating this SDD.

## 36. Definition of done

UX-01 is complete only when:

- the semantic token system is the source of truth for the shell;
- Light and Dark themes are equally implemented;
- all existing accent choices work and pass contrast review;
- core controls use the local icon registry;
- the Activity Rail, Navigation Panel, Document Header, tabs, and Inspector are in production;
- Compact layout uses touch-first sheets and no horizontal global toolbar;
- all current actions and settings pass the parity checklist;
- CodeMirror retains state and performance through shell operations;
- save status is truthful and recoverable;
- preview typography and Markdown elements meet the approved reference;
- Settings, Command Palette, dialogs, menus, Graph, and Canvas controls use the shared visual system;
- accessibility acceptance criteria pass;
- performance budgets pass;
- no network, telemetry, or content-format change is introduced;
- Linux Desktop and physical Android sign-off are complete;
- README, architecture, contributor, roadmap, and release documentation are current;
- temporary flags, duplicate shell code, obsolete icons, and dead CSS are removed;
- all automated tests pass.

## Appendix A: Feature-parity audit template

Use this table during Phase 0 and expand it until every current action is represented.

| Current surface | Current action | New surface | Pointer | Keyboard | Compact touch | Test ID | Status |
|---|---|---|---|---|---|---|---|
| Global toolbar | Toggle sidebar | Top Bar / Activity Rail | Yes | Yes | Yes | TBD | Pending |
| Global toolbar | Source view | Document Header | Yes | Yes | Yes | TBD | Pending |
| Global toolbar | Split view | Document Header | Yes | Yes | Yes | TBD | Pending |
| Global toolbar | Preview view | Document Header | Yes | Yes | Yes | TBD | Pending |
| Global toolbar | Bookmark note | Document Header | Yes | Yes | Yes | TBD | Pending |
| Global toolbar | Open Bookmarks | Activity Rail | Yes | Yes | Yes | TBD | Pending |
| Global toolbar | Open Tags | Activity Rail | Yes | Yes | Yes | TBD | Pending |
| Global toolbar | Open Graph | Activity Rail | Yes | Yes | Yes | TBD | Pending |
| Global toolbar | Command Palette | Top Bar | Yes | Yes | Yes | TBD | Pending |
| Global toolbar | Help | Top Bar / Navigation Sheet | Yes | Yes | Yes | TBD | Pending |
| Global toolbar | Settings | Activity Rail / Navigation Sheet | Yes | Yes | Yes | TBD | Pending |
| File sidebar | New note | Navigation Panel | Yes | Yes | Yes | TBD | Pending |
| File sidebar | New folder | Navigation Panel overflow | Yes | Yes | Yes | TBD | Pending |
| File sidebar | Sort | Navigation Panel overflow | Yes | Yes | Yes | TBD | Pending |
| File sidebar | Expand/collapse | Navigation Panel overflow | Yes | Yes | Yes | TBD | Pending |
| Tab context menu | Rename | Tab menu / Tab Switcher | Yes | Yes | Yes | TBD | Pending |
| Tab context menu | Close | Tab / Tab Switcher | Yes | Yes | Yes | TBD | Pending |
| Tab context menu | Close others | Tab menu / Tab Switcher | Yes | Yes | Yes | TBD | Pending |
| Tab context menu | Close all | Tab menu / Tab Switcher | Yes | Yes | Yes | TBD | Pending |
| Properties | View/edit frontmatter | Inspector | Yes | Yes | Yes | TBD | Pending |
| Backlinks | Navigate backlink | Inspector | Yes | Yes | Yes | TBD | Pending |

## Appendix B: Required visual reference states

The design review package should contain at least:

1. First run with no workspace
2. F20 recent-workspace launcher
3. Wide editor, source mode
4. Wide preview, long-form Markdown
5. Wide split mode with Inspector docked
6. Medium layout with Navigation Panel overlay
7. Medium layout with Inspector overlay
8. Compact source mode
9. Compact vertical split mode
10. Compact Navigation Sheet
11. Compact Tab Switcher with dirty and error states
12. Desktop Settings, Appearance
13. Compact Settings category list and detail
14. Command Palette
15. Context menu and compact action sheet
16. Save failure banner and Retry
17. Empty Bookmarks, Tags, Backlinks, and search results
18. Graph, light and dark
19. Canvas controls, light and dark
20. 200 percent zoom example

## Appendix C: Review checklist for a new component

Before adding a new UI component, confirm:

- It cannot be expressed cleanly with existing primitives and native semantics.
- It consumes semantic tokens.
- It has Light and Dark states.
- It has keyboard and accessible-name behavior.
- It has compact touch behavior when applicable.
- It does not fetch remote assets.
- It respects reduced motion.
- It does not remount or duplicate domain state.
- It has at least one component or integration test.
- Its use is documented if future contributors are expected to reuse it.
