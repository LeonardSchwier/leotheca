# F06 Software Design Document: Note Outline and Heading Breadcrumbs

**Status:** Approved for implementation design  
**Feature:** F06 Note Outline and Heading Breadcrumbs  
**Target:** Desktop and Android  
**Last updated:** 2026-09-01

## 1. Summary

F06 adds a live structural outline for the active note and a compact breadcrumb trail for the user's current section. The outline shows the note's heading hierarchy, follows the active Source or Preview location, supports precise keyboard navigation, and can copy or insert links through F04's shared serializer.

The feature is a projection of the current canonical note content. It does not generate a table of contents inside the Markdown, does not reorder sections, and does not rewrite headings. For open notes, the outline refreshes from in-memory content before save. For preview navigation, application-owned heading anchors map rendered sections back to the same source records.

F06 is the first recommended consumer of the shared heading scanner and note-location API. It can ship before the rest of F04 if copy-link controls remain disabled until the structured link serializer is available.

## 2. Motivation

Long notes are difficult to navigate when their structure is visible only by scrolling. A file tree answers where a note is in the workspace, but not where the current section is inside the note. Users also need a dependable way to copy a section link without manually reproducing heading text or guessing anchor syntax.

A useful outline must remain accurate while the note is dirty, preserve editor focus and selection, behave consistently in Source and Preview, and avoid writing generated structure back into the note. Breadcrumbs should add orientation without consuming excessive vertical space or becoming another navigation system with different heading rules.

## 3. Goals

1. Show every supported heading in the active note as a hierarchical outline.
2. Refresh the outline from canonical in-memory content while the user edits.
3. Highlight and reveal the section associated with the active Source or Preview location.
4. Navigate to a heading precisely without changing note content.
5. Display heading ancestry as clickable breadcrumbs.
6. Support keyboard, screen reader, pointer, and touch navigation.
7. Integrate copy-link and insert-link actions with F04's parser and serializer.
8. Handle duplicate headings without silently producing ambiguous links.
9. Scale to large notes through bounded parsing and rendering.
10. Fit the adaptive Inspector and compact sheet patterns defined by the visual refresh.

## 4. Non-goals

The first release does not include:

- writing a generated table of contents into the note;
- drag-and-drop section reordering;
- heading text editing from the outline;
- document folding or source-code folding controlled by outline expansion;
- automatic heading numbering;
- document-wide semantic summaries;
- workspace-wide outline aggregation;
- a minimap;
- arbitrary Markdown block navigation beyond headings;
- automatic block ID insertion;
- hidden heading metadata;
- persistent custom ordering separate from source order.

Outline expansion state changes only the outline presentation. It never hides source or preview content.

## 5. Heading model

F06 consumes the shared `HeadingRecord`:

```typescript
interface HeadingRecord {
  key: string;
  occurrence: number;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  rawText: string;
  displayText: string;
  sourceFrom: number;
  sourceTo: number;
  contentFrom: number;
  contentTo: number;
  line: number;
  column: number;
  sectionFrom: number;
  sectionTo: number;
  parentIndex?: number;
  childIndexes: number[];
}
```

`key` and `occurrence` follow F04 heading normalization. `parentIndex` is calculated by source order:

- a heading is a child of the nearest preceding heading with a lower level;
- when heading levels skip, the heading still attaches to the nearest valid ancestor;
- a level 1 heading has no heading parent;
- source order is authoritative.

Example:

```markdown
# Product
### Constraints
## Delivery
#### Android
```

Hierarchy:

```text
Product
  Constraints
  Delivery
    Android
```

The outline does not invent missing level 2 or level 3 nodes.

## 6. User interface

### 6.1 Entry points

The Outline is available through:

- an Outline tab in the contextual Inspector;
- Command Palette action `Show note outline`;
- configurable shortcut to show or focus the outline;
- a compact document-header action when the Inspector is not visible.

Before the refreshed shell lands, it may be hosted as a sidebar panel or dialog. The final behavior belongs in the adaptive Inspector on wide layouts and a full-height sheet on compact layouts.

### 6.2 Outline header

The header contains:

- `Outline` title;
- active heading count;
- optional filter field when the note has more than a small threshold, initially 20 headings;
- `Collapse all` and `Expand all` actions in an overflow menu;
- close or back control according to host surface.

The heading count is informational and not announced after every keystroke.

### 6.3 Outline rows

Each row shows:

- heading text;
- visual indentation derived from hierarchy, capped to preserve usable width;
- optional heading level in an accessible description;
- current-section indicator;
- duplicate-heading warning when relevant;
- context actions for Copy link and Insert link where available.

Empty headings display a localized placeholder such as `(Untitled heading)` while retaining exact source navigation.

The active row is visually distinct but is not automatically focused during typing. The outline follows the editor without stealing keyboard focus.

### 6.4 Collapse behavior

Users can collapse a heading's descendants inside the outline. Rules:

- collapse does not alter the note or preview;
- an active descendant of a collapsed node causes that ancestor to show an active-descendant indicator;
- by default, the active descendant is revealed without permanently expanding user-collapsed ancestors unless the user enabled `Auto-reveal active heading`;
- `Expand all` and `Collapse all` affect only current note outline state;
- collapse state is keyed by a bounded combination of note path, heading key, occurrence, and source fingerprint.

Initial release stores expansion state in memory. A bounded per-workspace persistence option may be added only if it does not create stale or unbounded settings.

### 6.5 Filter behavior

Filtering is case-insensitive over heading display text. Matching rows remain visible with their ancestor chain. Filtering does not change source order or collapse state. Clearing the filter restores the prior expansion state.

### 6.6 Empty states

- No note open: `Open a note to see its outline.`
- Note has no headings: `This note has no headings.`
- Filter has no match: `No headings match.` with `Clear filter`.
- Parser failure: preserve the last proven outline if safe and show `Outline could not be refreshed.` with Retry.

Malformed individual headings do not fail the complete outline.

## 7. Breadcrumbs

### 7.1 Placement

The breadcrumb trail appears in the Document Header when sufficient width exists. On compact layouts, the current section appears as one truncated row that opens a breadcrumb and outline sheet.

### 7.2 Content

Breadcrumb structure:

```text
Note title > Level 1 ancestor > Level 2 ancestor > Current heading
```

Rules:

- the note root is always first;
- only actual heading ancestors are shown;
- the current heading is last;
- before the first heading, only the note root appears;
- after the last heading, that heading remains current until note end;
- empty heading labels use the same placeholder as the outline;
- long trails collapse middle ancestors into an accessible overflow menu.

The note root opens the top of the note. Every heading segment navigates to that heading.

### 7.3 Source mode active section

The current Source section is calculated from the primary CodeMirror selection head:

- before the first heading: note root;
- inside a heading line: that heading;
- after a heading and before the next heading of equal or higher source position: nearest preceding heading;
- multi-range selection: use the main selection head;
- programmatic navigation updates after the editor transaction settles.

Cursor tracking is lightweight and does not rescan Markdown on every cursor move.

### 7.4 Preview mode active section

Rendered headings expose F04 application-owned anchor attributes. The active Preview section is calculated through `IntersectionObserver` plus scroll-position fallback:

- observe headings within the preview scroll container;
- choose the last heading whose top has crossed the configured reading threshold, initially the upper 25 percent of the viewport;
- before the first heading, use note root;
- on programmatic navigation, prefer the requested target until scrolling settles;
- disconnect observers when Preview unmounts or generation changes.

### 7.5 Split mode authority

In Split mode, breadcrumbs follow the pane the user most recently focused or directly scrolled:

- source cursor or keyboard action makes Source authoritative;
- direct Preview scroll, click, or keyboard navigation makes Preview authoritative;
- synchronized passive scrolling alone does not steal authority;
- the current authority is visually and accessibly identifiable in the mode control or breadcrumb description.

## 8. Navigation behavior

### 8.1 Outline selection

Selecting a row calls:

```typescript
openNote({
  path: activePath,
  location: {
    kind: "range",
    from: heading.contentFrom,
    to: heading.contentTo
  },
  focus: currentViewMode === "preview" ? "preview" : "source"
});
```

The note is already active in the common case, so the navigation layer should avoid re-reading or remounting it. It moves or reveals only the relevant pane.

### 8.2 Focus policy

Pointer activation leaves focus in the outline unless the user double-clicks or invokes `Go and focus editor`. Keyboard Enter navigates while retaining outline focus so users can explore multiple headings. A dedicated shortcut transfers focus to the editor at the active heading.

This policy must be tested with screen readers. A configuration is not needed in the first release.

### 8.3 Target highlight

The target heading may receive a brief nonessential highlight. It must:

- respect reduced motion;
- not alter selection when Preview is authoritative;
- not be the only navigation feedback;
- avoid continuous animation.

### 8.4 Stale headings

Every navigation request carries the active note generation. If the heading list changed after row activation:

- resolve by exact current source range only when it still matches the heading record;
- otherwise resolve unique `key` and occurrence from the latest canonical scan;
- if no safe target exists, keep the note open and show `That heading moved. The outline has been refreshed.`;
- never jump to an arbitrary duplicate heading.

## 9. Copy and insert link actions

### 9.1 Dependency on F04

F04's serializer is the only allowed creator of heading link text. Before F04 lands, F06 may ship navigation without copy or insert actions.

### 9.2 Copy link to heading

For a unique heading:

- select the shortest unambiguous note target according to the shared resolver;
- serialize `[[Note#Heading]]` with escaping;
- copy to clipboard;
- show a local confirmation.

When the note basename is ambiguous, use a path-qualified note target. When the note is unsaved and has no contained path, disable cross-note copy and offer Save note.

### 9.3 Duplicate headings

For a duplicate normalized heading, `Copy link` opens a choice:

1. `Create stable block link` on the selected heading, which delegates to F04 explicit block ID insertion;
2. `Copy note link only`;
3. Cancel.

F06 never copies an ambiguous heading link while presenting it as precise.

### 9.4 Insert link

`Insert link` inserts into the currently focused editable note, which may differ from the outlined reference note once F07 is present.

Rules:

- if the destination editor is the same note, same-note syntax may be used;
- if another note, include an unambiguous note target;
- insertion is one CodeMirror transaction at the current selection;
- selection replacement and undo behave like normal editor input;
- no insertion occurs when no writable editor has focus.

## 10. Live outline updates

### 10.1 Canonical source

For the active open note, the outline scans the current CodeMirror document or canonical workspace-store content, not the last disk save. This ensures heading changes appear before autosave.

### 10.2 Debounce and generation

- source changes schedule an outline scan after an initial 75 ms debounce;
- a newer edit cancels or supersedes an older pending result;
- short notes may scan synchronously when measured cost is low;
- large-note scans may run in a worker or cooperative task if profiling shows main-thread impact;
- cursor movement uses the latest completed heading list and does not trigger scanning.

### 10.3 Parse error resilience

Markdown is allowed to be incomplete while typing. The scanner returns provable headings from malformed content. A missing closing inline marker must not erase the rest of the outline unless structure truly cannot be determined.

### 10.4 Save and index integration

The active-note outline is local UI state. On save, the same scanner output or a verified equivalent updates the workspace metadata index for F04, F03, and other consumers. There must not be two heading normalizers.

## 11. State model

```typescript
interface NoteOutlineState {
  path?: string;
  documentGeneration: number;
  headings: HeadingRecord[];
  activeHeadingIndex?: number;
  authority: "source" | "preview";
  collapsedKeys: Set<string>;
  filterText: string;
  status: "idle" | "scanning" | "ready" | "error";
  error?: OutlineError;
}
```

`collapsedKeys` is bounded and cleared when a note identity changes through deletion or when the workspace switches. F03 path migrations update the note key without duplicating state.

## 12. Architecture

Recommended modules:

```text
src/outline/
  outlineTypes.ts
  outlineTree.ts
  outlineActiveSection.ts
  outlineStore.ts
  OutlinePanel.tsx
  OutlineRow.tsx
  HeadingBreadcrumbs.tsx
  outlineCommands.ts

src/markdown/
  headings.ts
```

CodeMirror integration supplies document-change and selection events. Preview integration supplies heading anchor registration and scroll-authority events. Both feed `outlineActiveSection.ts`, which contains no platform-specific code.

## 13. Concurrency and lifecycle

- Outline scans are tagged with note path, document generation, and workspace session.
- A result for an older note or edit cannot publish.
- File-open races follow the central note-open authority contract.
- Workspace switches clear observers, pending scans, active heading, filter, and transient errors.
- F03 path migration updates the active path under its mutation lock.
- F07 group changes select the active group's note as outline source.
- When the same note moves between groups, the outline follows the document identity without a rescan unless content changed.
- Preview observers disconnect when the rendered generation changes.

## 14. Security and privacy

- Heading content remains local.
- No network request or remote font is added.
- Heading text is rendered as text in the outline and breadcrumbs.
- Clipboard operations occur only after explicit user action.
- The feature does not persist note body excerpts.
- DOM anchor attributes are escaped application values and cannot inject HTML.
- Navigation cannot escape workspace containment because it targets the already active contained note.

## 15. Accessibility

### 15.1 Outline semantics

The outline uses a tree pattern only if complete tree keyboard behavior is implemented. Otherwise, use a nested list with buttons. A partial ARIA tree is not acceptable.

Required tree behavior when used:

- Up and Down move among visible rows;
- Right expands or enters children;
- Left collapses or moves to parent;
- Home and End move to first and last visible row;
- Enter navigates;
- Space may expand or collapse when the row has children;
- typeahead is optional because the filter field is available.

### 15.2 Announcements

- Active heading state is available but not announced on every editor cursor move.
- Navigating from the outline announces the destination heading and line.
- Duplicate warnings are textually described.
- Filter counts update through a polite live region after debounce.
- Copy success is announced once.

### 15.3 Breadcrumb semantics

Breadcrumbs use a named navigation landmark and ordered list. The current heading has `aria-current="location"`. Overflowed ancestors remain keyboard reachable.

### 15.4 Visual accessibility

- Active, hover, focus, duplicate, and collapsed states do not depend on color alone.
- Indentation remains understandable at 200 percent zoom and increased Android font size.
- Every compact action meets the minimum touch target.
- Focus indicators use the visual-system tokens and remain visible in forced colors.

## 16. Performance requirements

- Cursor movement and Preview scrolling must not rescan the Markdown.
- A typical note outline should refresh within 100 ms after the debounce.
- Notes with more than 500 headings use virtualized or windowed row rendering.
- Filtering should update within 100 ms for 10,000 heading fixture records.
- Only the active note has live CodeMirror-based outline tracking.
- Background indexed headings for other notes do not retain full source bodies.
- Intersection observers are scoped to one active preview and disconnected promptly.
- The feature adds no recursive workspace walk.

## 17. Functional requirements

**F06-FR-01** The outline shall show every supported active-note heading in source order.  
**F06-FR-02** The hierarchy shall use the nearest preceding lower-level heading without inventing missing levels.  
**F06-FR-03** The outline shall scan canonical in-memory content while the note is open.  
**F06-FR-04** Newer document generations shall supersede older scan results.  
**F06-FR-05** The active Source heading shall follow the main CodeMirror selection head.  
**F06-FR-06** The active Preview heading shall follow rendered heading position through bounded observers.  
**F06-FR-07** Split-mode breadcrumbs shall follow the last directly active pane.  
**F06-FR-08** Selecting an outline row shall navigate through the shared note-location API without remounting the editor.  
**F06-FR-09** Navigation shall fail safely when a heading moved or became ambiguous.  
**F06-FR-10** Outline collapse shall affect only outline presentation.  
**F06-FR-11** Filtering shall preserve source order and include matching ancestors.  
**F06-FR-12** Breadcrumbs shall show note root, actual ancestors, and current heading.  
**F06-FR-13** Long breadcrumb trails shall remain accessible through overflow.  
**F06-FR-14** Copy and insert actions shall use F04's resolver and serializer.  
**F06-FR-15** Duplicate headings shall not produce a falsely precise copied heading link.  
**F06-FR-16** Explicit block ID creation shall be delegated to F04 and require user action.  
**F06-FR-17** F07 shall determine which editor group's active note owns the outline.  
**F06-FR-18** F03 path migrations shall update outline state without creating duplicate state.  
**F06-FR-19** The feature shall work without accounts, telemetry, or network access.  
**F06-FR-20** The outline, breadcrumbs, filter, and link actions shall be keyboard and screen-reader operable.  
**F06-FR-21** Compact presentation shall avoid horizontal page scrolling at 320 CSS pixels.  
**F06-FR-22** The feature shall not modify note content except through an explicit F04 block-ID action.

## 18. Acceptance criteria

1. ATX and setext headings appear once, in exact source order, with correct display text and line number.
2. Skipped heading levels attach to the nearest preceding lower-level heading without placeholder nodes.
3. Editing a heading updates the outline from dirty in-memory content before autosave.
4. A stale scan result cannot replace the outline for a newer edit or another note.
5. Moving the Source cursor changes the active breadcrumb without rescanning the note.
6. Scrolling Preview changes the active breadcrumb according to the reading threshold.
7. Passive synchronized scrolling in Split does not steal authority from the pane the user last operated.
8. Selecting an outline row reveals the exact heading in Source and Preview.
9. Outline navigation does not remount CodeMirror, clear undo, or alter note content.
10. A moved or deleted target refreshes the outline and never jumps to an arbitrary duplicate.
11. Collapsing a node hides only descendant rows in the outline.
12. Filtering a deep child keeps its ancestor path visible and clearing restores prior expansion.
13. Breadcrumb overflow retains every hidden ancestor in a keyboard-accessible menu.
14. Before the first heading, the breadcrumb contains only the note root.
15. Copying a unique heading produces a valid escaped F04 link with an unambiguous note target.
16. Copying a duplicate heading offers stable block link creation instead of silently copying an ambiguous link.
17. An unsaved pathless note cannot copy a cross-note target and offers Save note.
18. The outline tree or list passes the selected keyboard interaction pattern completely.
19. Active changes during editor typing do not steal focus or trigger noisy screen-reader announcements.
20. A 10,000-heading fixture remains responsive and does not render every row at once.
21. Workspace switch clears stale outline and Preview observers.
22. F03 note rename preserves current outline state under the new path.
23. Desktop and Android compact presentations expose equivalent navigation and actions.
24. No network request or persistent note excerpt storage is introduced.

## 19. Test plan

### 19.1 Unit tests

- Heading hierarchy for all level transitions.
- Active Source section before, inside, between, and after headings.
- Active Preview selection from observed positions.
- Split authority transition rules.
- Collapse, active-descendant, and filter behavior.
- Breadcrumb construction and overflow grouping.
- Stale heading re-resolution.
- Duplicate-heading copy policy.

### 19.2 Parser fixtures

- ATX and setext forms;
- empty and formatted headings;
- escaped markers and trailing hashes;
- Unicode and surrogate pairs;
- LF and CRLF;
- code fences, comments, and malformed Markdown;
- duplicate normalized headings;
- notes with no headings and 10,000 headings.

### 19.3 Component tests

- Inspector and compact-sheet states.
- Keyboard tree or nested-list behavior.
- Filter and clear action.
- Collapse all and expand all.
- Breadcrumb navigation and overflow.
- Copy, insert, duplicate warning, and Save note actions.
- Focus retention during active-section updates.

### 19.4 Integration tests

- CodeMirror document and selection updates.
- Preview anchor observer registration and teardown.
- Source, Preview, and Split navigation.
- F04 serializer and explicit block-ID handoff.
- F07 active-group changes.
- F03 note path migration.
- Workspace switch during scan and preview observation.

### 19.5 Accessibility and platform tests

- Keyboard-only desktop navigation.
- Screen reader tree or list semantics.
- Breadcrumb landmark and current location.
- TalkBack on compact Android layout.
- 200 percent zoom, increased text size, reduced motion, and forced colors.
- 320 by 568 CSS pixel layout without page-level horizontal scrolling.

## 20. Rollout plan

### Phase 1: Shared heading scanner and read-only outline

- Land heading fixtures, tree construction, and active-note scan.
- Ship outline navigation behind a feature flag.

### Phase 2: Breadcrumbs and Preview tracking

- Add source cursor tracking, Preview observers, Split authority, and adaptive presentation.

### Phase 3: F04 actions

- Enable copy and insert link through the shared serializer.
- Add duplicate-heading stable block-link flow.

### Phase 4: Scale and accessibility

- Add large-outline virtualization, complete keyboard semantics, screen-reader validation, and compact hardening.

### Phase 5: General availability

- Enable by default and update documentation, shortcuts, and roadmap status.

## 21. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Parsing every cursor move is expensive | Typing latency | Scan only on debounced content changes; cursor uses existing records |
| Preview and Source disagree | Confusing breadcrumbs | One heading model, explicit Split authority, shared anchors |
| Duplicate heading link is ambiguous | Wrong navigation | Warn and delegate stable block ID creation |
| Outline steals editor focus | Poor writing experience | Active row follows without focus; explicit focus-transfer command |
| Large outline renders slowly | Unresponsive panel | Bounded scan, filtering, and virtualization |
| Persisted collapse state becomes stale | Incorrect presentation | In-memory bounded state first; fingerprinted keys if persistence is later added |
| Multiple heading parsers diverge | Broken F03/F04 behavior | One shared scanner and normalization contract |

## 22. Documentation changes

Update:

- user guide for Outline, breadcrumbs, filtering, and keyboard navigation;
- shortcut reference;
- accessibility documentation for tree or nested-list behavior;
- architecture documentation for heading scanner and active-section authority;
- F04 documentation for copy and block-link handoff;
- roadmap status for F06.

## 23. Definition of done

F06 is done when:

- the active note has one accurate live heading model shared with F04 and the workspace index;
- outline navigation and breadcrumbs work in Source, Preview, and Split without remounting the editor;
- duplicate headings never produce misleading precise links;
- no note content is changed except by an explicit delegated block-ID action;
- stale scans, note opens, preview generations, and workspace transitions cannot publish old state;
- large notes, keyboard use, screen readers, zoom, and compact layouts pass their gates;
- all functional requirements and acceptance criteria pass on desktop and Android;
- documentation and tests land with implementation;
- no unresolved critical or high-severity usability, accessibility, or data-integrity defect remains.
