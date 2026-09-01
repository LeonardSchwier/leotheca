# F11 Software Design Document: Visual Markdown Table Editor

**Status:** Approved for implementation design  
**Feature:** F11 Visual Markdown Table Editor  
**Target:** Desktop and Android  
**Last updated:** 2026-09-01

## 1. Summary

F11 adds a focused visual editor for ordinary GitHub Flavored Markdown pipe tables. Users can create a table, edit header and body cells, add, delete, and reorder rows or columns, set column alignment, and paste rectangular tab-separated data. Applying the draft replaces only the proven table source range in one CodeMirror transaction.

The feature is not a spreadsheet engine. It does not add formulas, merged cells, proprietary metadata, or a parallel table file. Cell values remain raw inline Markdown text. The visual editor may normalize formatting inside the selected table, but it must preserve every byte outside that exact table range.

A table-editing session is tied to the active note, workspace session, document generation, and source fingerprint. If the source table changes externally or can no longer be proven, Apply fails closed and preserves the user's draft for copying or reloading.

## 2. Motivation

Markdown tables are portable but tedious to edit, especially on touch devices. Adding a column requires modifying every row, alignment markers are easy to mistype, and pasted spreadsheet data needs manual pipe escaping. A visual grid can make common structural edits much easier without replacing Markdown as the source of truth.

The challenge is safe round-tripping. Pipe characters may be escaped or appear inside inline code, rows may be ragged, and a broad formatter can unintentionally alter the rest of the note. F11 therefore uses a dedicated proven table parser, retains exact source ranges, makes normalization explicit, and applies one isolated source edit.

## 3. Goals

1. Detect supported GFM pipe tables at the active cursor or selection.
2. Create a new ordinary Markdown table at the current editor selection.
3. Edit header and body cell Markdown in a visual grid.
4. Add, remove, and reorder rows and columns.
5. Set left, center, right, or default alignment per column.
6. Paste rectangular tab-separated data into the grid.
7. Serialize a valid deterministic GFM table.
8. Replace only the selected table range in one undoable editor transaction.
9. Preserve dirty content, selection, save coordination, and workspace-generation safety.
10. Provide a practical full-screen compact experience and complete keyboard access.

## 4. Non-goals

The first release does not include:

- formulas or calculated cells;
- sorting data by a column;
- filtering rows;
- merged cells;
- multiple header rows;
- frozen columns;
- rich-text editing inside cells;
- live rendered preview inside every cell;
- Excel or OpenDocument file import or export;
- CSV parsing with dialect and quote inference;
- editing HTML tables;
- editing tables inside code blocks;
- editing multiline cell values;
- changing multiple tables in one Apply action;
- bulk table formatting across a note;
- a proprietary table model stored outside the Markdown;
- collaborative concurrent editing.

## 5. Supported table syntax

### 5.1 Required structure

A supported table has:

1. one header row;
2. one delimiter row;
3. zero or more body rows.

Examples:

```markdown
| Name | Status |
| --- | :---: |
| Alpha | Active |
```

```markdown
Name | Status
--- | ---:
Alpha | Active
```

Outer pipes are optional. The delimiter row must contain at least three hyphens per column, with optional leading or trailing colons for alignment.

### 5.2 Cell separators

A pipe is a cell separator only when it is:

- not escaped by an odd number of immediately preceding backslashes;
- not inside a recognized inline code span;
- not outside the logical row because it is an optional outer pipe.

Examples:

```markdown
| Escaped \| pipe | `code | pipe` |
```

Both examples contain two cells, not three.

### 5.3 Excluded contexts

The table scanner ignores table-like lines inside:

- fenced code blocks;
- indented code blocks;
- HTML comments;
- raw HTML blocks where the Markdown parser treats the content as raw.

A table inside a list item or blockquote is not supported in the first release unless the scanner can remove and restore a uniform container prefix for every row without ambiguity. Initial implementation should treat such tables as unsupported and offer `Edit in source`.

### 5.4 Ragged rows

A source table may have different cell counts across rows. The visual editor opens it only after showing:

`This table has uneven rows. Applying will make every row use <N> columns.`

The draft width is the maximum of header, delimiter, and body row cell counts. Missing cells become empty. Extra delimiter cells create empty header cells. The user must explicitly continue before editing.

### 5.5 Malformed tables

The editor refuses visual mode when:

- delimiter row cannot be proven;
- a delimiter cell has fewer than three hyphens;
- the table range overlaps a code or unsupported container region;
- row boundaries are ambiguous;
- source exceeds hard limits;
- a parse would require guessing whether an unescaped pipe is content or delimiter.

The note remains fully editable in Source mode.

## 6. Table record and locator

```typescript
interface MarkdownTableRecord {
  sourceFrom: number;
  sourceTo: number;
  lineFrom: number;
  lineTo: number;
  rawSource: string;
  sourceFingerprint: string;
  documentFingerprint: string;
  lineEnding: "\n" | "\r\n";
  outerPipeStyle: "both" | "none" | "mixed";
  columns: TableColumn[];
  header: TableCell[];
  rows: TableCell[][];
  warnings: TableParseWarning[];
}

interface TableCell {
  rawMarkdown: string;
  sourceFrom?: number;
  sourceTo?: number;
}

interface TableColumn {
  alignment: "default" | "left" | "center" | "right";
}
```

Offsets are UTF-16 positions compatible with CodeMirror. The parser retains raw cell Markdown after removing syntactic padding that GFM itself does not preserve semantically.

A visual editing session owns an immutable source locator:

```typescript
interface TableEditSession {
  id: string;
  path: string;
  workspaceSession: number;
  openedDocumentGeneration: number;
  sourceFrom: number;
  sourceTo: number;
  sourceFingerprint: string;
  draft: TableDraft;
  dirty: boolean;
  state: "editing" | "applying" | "conflict" | "closed";
}
```

## 7. Entry points

Required entry points:

- Command Palette `Edit table visually` when the primary selection is inside a supported table;
- editor context action `Edit table visually`;
- document action when a table selection is detected;
- Command Palette `Insert Markdown table`;
- keyboard shortcut, configurable through the existing shortcut system.

When the cursor is not inside a supported table, `Edit table visually` explains why it is unavailable or offers Insert table.

F11 applies to the writable Source document. From Preview, a table context action may map the rendered table to its source range and open visual editing only when that mapping is exact and current.

## 8. Editing surface

### 8.1 Desktop presentation

The editor opens in a large modal or dedicated document utility surface owned by UX-01. It contains:

- title and source note context;
- table size summary;
- toolbar for row, column, alignment, and paste actions;
- scrollable grid;
- normalization and warning summary;
- Cancel and Apply actions.

While the session is open, the underlying table source is not independently editable. The application may make the active note read-only behind the modal or use a document-level edit lock. Other notes may remain navigable only if doing so does not orphan or hide the active draft. The simplest first release uses a modal that keeps the source note as the owning document.

### 8.2 Compact presentation

On compact layouts, the editor is full screen:

- top app bar with table title, Cancel, and Apply;
- horizontally and vertically scrollable grid region;
- sticky column header controls where feasible;
- bottom or overflow structural actions;
- safe-area and software-keyboard handling;
- no page-level horizontal scrolling outside the grid.

Cell editing uses the platform keyboard and keeps the active cell visible above it.

### 8.3 Grid structure

The grid includes:

- one header row;
- zero or more body rows;
- column controls for alignment, move, insert, and delete;
- row controls for move, insert, and delete;
- a clear distinction between table header cells and application controls.

The delimiter row is not directly edited as text. It is represented by alignment controls and generated during serialization.

### 8.4 Cell content

Cells edit raw inline Markdown as single-line text. The editor does not render the cell as HTML while typing.

Rules:

- literal tab input moves between cells rather than inserting a tab;
- line breaks are not permitted in one cell;
- pasted single-cell line breaks are normalized to spaces after explicit warning, unless they form a recognized rectangular TSV paste;
- leading and trailing padding spaces are not treated as semantic cell content;
- backslashes and inline Markdown are preserved as typed;
- pipe escaping is handled by serializer logic, not by blind global replacement.

An optional read-only rendered preview for the current cell may be considered after the core editor is stable, but is not required.

## 9. Grid operations

### 9.1 Rows

Required actions:

- add row above;
- add row below;
- delete row;
- move row up;
- move row down;
- append row.

The header row cannot be deleted or moved into the body. Deleting all body rows is allowed and serializes a valid header plus delimiter table.

### 9.2 Columns

Required actions:

- add column before;
- add column after;
- delete column;
- move column left;
- move column right;
- append column;
- set alignment.

A table must retain at least one column. Deleting the last column is blocked with an explanation.

Adding a column inserts an empty cell in header and every body row. Deleting a column removes its cells only from the in-memory draft until Apply.

### 9.3 Alignment

Alignment options:

- Default: `---`
- Left: `:---`
- Center: `:---:`
- Right: `---:`

Changing alignment never changes cell content.

### 9.4 Rectangular paste

When clipboard plain text contains tabs or multiple lines:

1. parse rows by CRLF, LF, or CR;
2. parse cells by tab;
3. remove one final empty line caused by a trailing newline;
4. preserve all other cell text;
5. calculate rectangle dimensions;
6. preview expansion if the paste exceeds current bounds;
7. commit the paste into the draft after limits are checked.

Paste starts at the active cell and may expand body rows and columns. It cannot replace the header as body accidentally. Pasting into a header cell fills header and subsequent rows according to the rectangle.

Quoted CSV semantics are not inferred. Commas remain text.

### 9.5 Keyboard interaction

Required desktop behavior:

- Tab moves to the next editable cell and may append a body row from the last cell when enabled;
- Shift+Tab moves to the previous cell;
- Arrow keys move the caret inside text, and grid movement uses a documented modified shortcut or navigation mode;
- Enter commits the current cell edit and moves down when not composing text;
- Escape reverts the active cell edit first, then closes an open menu, then requests session cancellation;
- Ctrl+Enter or platform equivalent applies the table;
- structural actions are available through shortcuts or menus, not pointer-only drag.

Input Method Editor composition must never be interrupted by grid navigation shortcuts.

## 10. Creating a table

`Insert Markdown table` opens a small setup step:

- number of columns, default 2;
- number of body rows, default 2;
- optional header labels;
- alignment defaults.

Limits are applied. Confirming inserts a serialized table at the current Source selection in one transaction and places the cursor in the first header cell or opens the visual editor immediately according to the chosen action.

Insertion rules:

- add surrounding line breaks only as needed for a separate Markdown block;
- replace selected text only after explicit confirmation when the selection is nonempty;
- preserve note line-ending convention;
- remain one undo step;
- never insert inside a code block or another proven table without warning.

## 11. Draft and dirty behavior

### 11.1 Draft ownership

All visual edits remain in memory until Apply. The note is not updated on every cell keystroke. The surface shows `Unsaved table changes` after the first draft mutation.

### 11.2 Cancel

Cancel with a clean draft closes immediately. Cancel with changes asks:

- Discard table changes;
- Keep editing.

`Copy draft as Markdown` is available from this confirmation and from conflict recovery.

### 11.3 Application lifecycle

The first release does not persist drafts across process termination. On Android activity recreation within the same process, the draft must survive through the application state holder. If the operating system kills the process, the user may lose an unapplied draft; the compact UI must not imply otherwise.

A later app-private draft recovery file requires separate privacy and lifecycle design.

## 12. Serialization

### 12.1 Canonical output

F11 writes a canonical table with outer pipes:

```markdown
| Name | Status |
| --- | :---: |
| Alpha | Active |
```

Rules:

- one space follows the opening pipe and precedes the closing pipe around each cell;
- delimiter cells use at least three hyphens and canonical alignment markers;
- every row has exactly the draft column count;
- missing cells serialize as empty;
- one source line per table row;
- the original note line-ending convention is preserved;
- no trailing whitespace is written;
- outer-pipe style is normalized even when the source omitted outer pipes;
- only the table range is normalized.

The Review area states when source formatting will normalize.

### 12.2 Cell escaping

The serializer tokenizes inline code spans and escaped characters. For cell text outside inline code:

- an unescaped separator pipe is escaped as `\|`;
- an already escaped pipe is not double-escaped;
- backslash parity is preserved correctly;
- tabs become spaces after paste processing;
- newlines are not permitted;
- outer padding is trimmed because GFM table cell padding is nonsemantic.

Pipes inside valid inline code spans remain unchanged. If a cell contains malformed code delimiters and an unescaped pipe, the serializer escapes the pipe rather than risking a new column.

### 12.3 Formatting disclosure

Before Apply, show a non-blocking notice when output differs in formatting beyond user cell changes, including:

- outer pipes added;
- ragged rows made rectangular;
- delimiter dashes normalized;
- cell padding normalized;
- unsafe pipes escaped.

The user can inspect `Preview Markdown` to see the exact replacement text.

## 13. Apply protocol

### 13.1 Document edit lock

Opening visual edit acquires a note-scoped edit-session lock for the table. Autosave may continue for the existing canonical document, but no other F11 session or structural source mutation may edit the same table range. F03 workspace refactor Apply is blocked until the table session closes or is explicitly cancelled.

### 13.2 Validation

On Apply:

1. validate draft dimensions and byte limits;
2. serialize canonical table text;
3. confirm workspace session and note path still match;
4. obtain current canonical document content;
5. confirm the exact source range still contains the original table fingerprint;
6. confirm no external-change conflict is unresolved;
7. apply one CodeMirror transaction replacing `sourceFrom..sourceTo`;
8. set the selection to a sensible position within the replacement;
9. release the edit-session lock;
10. let the normal save coordinator persist the changed note;
11. update workspace metadata after save.

A successful Apply means the canonical editor accepted the transaction. The surface may close before disk save only if the document header truthfully shows Dirty or Saving and save errors remain visible. It must not claim `Saved` until persistence succeeds.

### 13.3 Undo

The complete table replacement is one CodeMirror transaction with one user-event annotation. One Undo restores the exact original table source, including its prior spacing and outer-pipe style, because CodeMirror retains the deleted source in history.

### 13.4 Conflict

If validation fails:

- keep the draft in memory;
- do not change the note;
- enter Conflict state;
- show `The source table changed while the visual editor was open.`;
- offer `Reload source table`, `Copy draft as Markdown`, `Open source`, and `Cancel`.

The first release does not attempt an automatic three-way merge. Reload replaces the draft only after confirmation.

## 14. Size and resource limits

Interactive limits:

- maximum 200 body rows;
- maximum 50 columns;
- maximum 10,000 total cells including header;
- maximum 2 MiB serialized table source;
- maximum 100,000 characters in one cell.

A table exceeding any limit opens a read-only summary with:

- dimensions and source size;
- `Open in source`;
- `Copy table Markdown`;
- explanation that visual editing is unavailable.

There is no `Edit anyway` bypass in the first release. Paste or structural operations that would exceed limits are rejected before changing the draft.

## 15. Preview source mapping

To support a Preview context action, the Markdown render pipeline may annotate rendered tables with a generation-scoped source table ID. The mapping must:

- derive from exact parser records;
- remain in memory only;
- be invalidated on source or preview generation change;
- never use user-controlled HTML IDs without escaping;
- open F11 only when the mapped source fingerprint still matches.

If mapping is stale, the action opens Source at the table and asks the user to retry.

## 16. Architecture

Recommended modules:

```text
src/markdown/
  tables.ts
  tableTokenizer.ts

src/tableEditor/
  tableTypes.ts
  tableDraft.ts
  tableSerializer.ts
  tableClipboard.ts
  tableSessionStore.ts
  TableEditor.tsx
  TableGrid.tsx
  TableToolbar.tsx
  TableConflict.tsx
  tableCommands.ts
```

Parser and serializer are pure modules with round-trip fixtures. UI code does not locate source with ad hoc line splitting.

The table session store references the canonical `documentStore` from F07 or the compatible current workspace store. It does not own a second note body.

## 17. Concurrency and lifecycle

- Session open and Apply carry workspace session, path, document generation, and source fingerprint.
- A workspace transition with a dirty table draft asks the user to Apply, Discard, or Cancel transition.
- A note rename through F03 is blocked while its table session is open, or the session path migrates only through an explicitly tested typed adapter before Apply.
- F07 may move the owning note between groups, but the table session remains bound to the canonical path and document.
- External file change handling can mark the session conflicted.
- A stale Apply callback cannot mutate a newer note, another path, or another workspace.
- Only one visual table session may own a given note at a time. The application may allow sessions in different notes only after modal and state ownership are proven; the first release may permit one global session.

## 18. Error handling

Required errors:

- no supported table at cursor;
- malformed or unsupported table context;
- ragged table normalization warning;
- table exceeds limits;
- clipboard rectangle exceeds limits;
- source table changed;
- note changed externally;
- workspace switched or unavailable;
- serializer validation failure;
- canonical editor unavailable;
- save failure after Apply.

A save failure after Apply is a normal note save error. The canonical dirty content remains visible and recoverable; F11 must not roll back an accepted editor transaction automatically.

## 19. Security and privacy

- No table content leaves the device.
- Clipboard is read only after explicit paste and written only after explicit copy.
- Cell Markdown is edited as text, not executed.
- Any optional preview uses the existing sanitized Markdown renderer.
- Source mapping values are application-owned and generation-scoped.
- The feature cannot read or write outside the active contained note.
- Size limits protect memory and paste denial-of-service behavior.
- Logs contain dimensions and error classes, not cell content.
- No remote fonts, scripts, telemetry, or network service are added.

## 20. Accessibility

### 20.1 Grid semantics

The implementation must choose and fully implement either:

- a semantic table containing labeled text inputs and structural controls; or
- an ARIA grid with complete grid keyboard interaction.

A partial spreadsheet pattern is not acceptable.

Required information for each cell:

- row type and number;
- column number or header name;
- current value;
- whether it is a header cell;
- relevant validation error.

### 20.2 Structural actions

Add, delete, move, and alignment controls have explicit names such as `Move column Status left`. Pointer drag is optional and never required.

Deleting a row or column announces the result and places focus on a predictable adjacent cell. Destructive actions affecting nonempty cells require confirmation or immediate undo within the draft.

### 20.3 Keyboard and composition

- All operations are reachable without pointer.
- Focus order stays within the modal or full-screen route while open.
- IME composition is not interrupted by Enter, arrows, or Apply shortcuts.
- Escape behavior is layered and documented.
- Error summary links focus to the affected cell or control.

### 20.4 Compact and visual access

- Active cell, selection, header, and alignment are not conveyed by color alone.
- Focus indicators remain visible in forced colors.
- The grid supports 200 percent zoom and increased Android text size.
- Touch targets meet the compact minimum.
- Horizontal and vertical scroll regions are labeled and do not trap screen-reader navigation.

## 21. Performance requirements

- Table detection around the active cursor should complete within 50 ms for a typical note using precomputed structure or bounded local scanning.
- Opening a 10,000-cell table may take longer but must show visual feedback within 100 ms and remain cancellable before the editor is ready.
- Draft operations update only affected rows or columns and avoid cloning multi-megabyte structures unnecessarily.
- Grid rendering virtualizes rows and, when required, columns for large supported tables.
- Clipboard parsing and serialization run off the critical typing path and remain bounded by limits.
- Apply performs one source transaction and reparses only the affected note.
- No full workspace scan is triggered.

## 22. Functional requirements

**F11-FR-01** The system shall detect supported GFM pipe tables with exact UTF-16 source ranges.  
**F11-FR-02** The parser shall distinguish escaped pipes and pipes inside valid inline code spans from separators.  
**F11-FR-03** Table-like syntax in excluded code, comment, or unsupported container regions shall not open in visual mode.  
**F11-FR-04** Ragged tables shall require a normalization warning before editing.  
**F11-FR-05** The application shall support creating a new table at the current Source selection.  
**F11-FR-06** The visual editor shall edit one header row and zero or more body rows.  
**F11-FR-07** Users shall be able to add, delete, and reorder body rows.  
**F11-FR-08** Users shall be able to add, delete, and reorder columns while retaining at least one.  
**F11-FR-09** Users shall be able to set default, left, center, and right alignment per column.  
**F11-FR-10** Rectangular TSV paste shall fill and safely expand the draft within limits.  
**F11-FR-11** The draft shall remain in memory until Apply and shall not mutate the note per cell keystroke.  
**F11-FR-12** A dirty draft shall require confirmation before discard.  
**F11-FR-13** The serializer shall output valid canonical GFM Markdown with outer pipes.  
**F11-FR-14** The serializer shall safely escape separator pipes outside inline code without double-escaping.  
**F11-FR-15** Formatting normalization shall be disclosed and exact replacement Markdown shall be inspectable.  
**F11-FR-16** Apply shall validate workspace session, path, document generation, source range, and fingerprint.  
**F11-FR-17** Apply shall fail closed when the table can no longer be proven.  
**F11-FR-18** Apply shall replace only the table source range in one CodeMirror transaction.  
**F11-FR-19** One Undo shall restore the exact prior table source.  
**F11-FR-20** Bytes outside the table range shall remain unchanged.  
**F11-FR-21** A conflict shall preserve the draft and offer Reload, Copy draft, Open source, and Cancel.  
**F11-FR-22** Interactive row, column, cell, and byte limits shall be enforced before draft mutation.  
**F11-FR-23** Tables above limits shall remain available in Source and a read-only summary.  
**F11-FR-24** F07 group moves shall not duplicate or detach the canonical note during a table session.  
**F11-FR-25** F03 refactor Apply and table source Apply shall not run concurrently on the same note.  
**F11-FR-26** Save state after Apply shall remain truthful and use the normal save coordinator.  
**F11-FR-27** All cells and structural actions shall be keyboard and screen-reader operable.  
**F11-FR-28** Compact presentation shall provide equivalent editing without page-level horizontal scrolling.  
**F11-FR-29** The feature shall operate without accounts, telemetry, proprietary table storage, or network access.  
**F11-FR-30** Parser and serializer fixtures shall cover LF, CRLF, Unicode, escapes, code spans, and malformed input.

## 23. Acceptance criteria

1. A supported table at the Source cursor opens with the correct header, rows, alignments, and raw cell Markdown.
2. A pipe escaped with an odd backslash count does not create a column.
3. A pipe inside a valid inline code span does not create a column.
4. Table-like content in fenced code, indented code, comments, and unsupported block containers does not open visually.
5. A ragged table shows the exact rectangular width and requires confirmation before normalization.
6. Adding or deleting a row changes every column consistently in the draft only.
7. Adding, moving, or deleting a column updates header, every body row, and alignment together.
8. The last column cannot be deleted.
9. TSV paste begins at the active cell, expands safely, and rejects a result above limits without partial mutation.
10. Commas remain ordinary text and are not interpreted as CSV separators.
11. The canonical serializer produces valid GFM with correct alignment markers and line endings.
12. Unescaped separator pipes are escaped exactly once; pipes in inline code are retained.
13. `Preview Markdown` matches the exact text applied.
14. Apply changes no byte before or after the proven table range.
15. One Undo restores the exact original table, including ragged spacing and outer-pipe style.
16. A document or external source change that alters the table causes Conflict and no source mutation.
17. Conflict retains the complete draft and `Copy draft as Markdown` returns canonical text.
18. A save failure after Apply leaves the note dirty with standard Retry behavior and does not falsely show Saved.
19. Creating a table inserts one valid block with required surrounding newlines in one undo step.
20. A table above 200 rows, 50 columns, 10,000 cells, 2 MiB, or cell limit opens only the read-only summary.
21. Moving the note between F07 groups during the session does not change path ownership, content, or draft.
22. F03 structural Apply cannot mutate the same note until the table session reaches a safe state.
23. Desktop and Android support every structural action without drag.
24. Screen readers receive row, column, header, value, alignment, and error context.
25. No table content is logged, transmitted, or stored in proprietary persistent data.

## 24. Test plan

### 24.1 Parser unit tests

- Outer pipes present, absent, and mixed.
- All alignment forms and invalid delimiter cells.
- Escaped pipes with odd and even backslashes.
- Inline code spans with variable backtick delimiters and pipes.
- Empty cells, trailing cells, ragged rows, and zero body rows.
- LF, CRLF, Unicode, combining marks, and surrogate pairs.
- Fenced code, indented code, comments, lists, and blockquotes.
- Malformed tables and ambiguous row boundaries.

Property-based or fuzz tests should assert that parser output never produces overlapping source ranges and never throws on arbitrary text.

### 24.2 Serializer unit tests

- Alignment output.
- Rectangular padding.
- Pipe escaping without double-escape.
- Inline code preservation.
- Padding normalization.
- Line-ending preservation.
- Parse, serialize, parse structural equivalence for supported fixtures.
- One-column and empty-body tables.

### 24.3 Draft operation tests

- Add, delete, and move every row and column boundary.
- Preserve cell data through moves.
- Alignment follows columns.
- Header cannot become body.
- Minimum column constraint.
- TSV paste dimensions, expansion, final newline, and limit rejection.
- Unsaved dirty and cancel behavior.

### 24.4 Component and accessibility tests

- Desktop modal and compact full-screen surface.
- Complete selected table or grid keyboard pattern.
- IME composition.
- Focus after row or column deletion.
- Error summary and conflict actions.
- 200 percent zoom, forced colors, increased Android text size, and touch targets.
- Grid-local scrolling without page-level horizontal scrolling.

### 24.5 Integration tests

- Open dirty note, edit table, Apply, save, and Undo.
- External file change during session.
- Workspace switch with clean and dirty draft.
- F07 move between groups.
- F03 transaction lock.
- Preview source-map entry and stale mapping.
- Metadata index update after save.
- Save failure after accepted Apply.

### 24.6 Performance tests

- Typical 10 by 10 table.
- Maximum 200 by 50 table.
- 2 MiB boundary.
- Large clipboard input above limits.
- Repeated add, move, and delete operations without unbounded memory growth.

## 25. Rollout plan

### Phase 1: Parser and serializer

- Land fixture corpus, source ranges, canonical serializer, and round-trip tests.
- Add developer-only table inspection.

### Phase 2: Read and edit grid

- Add desktop visual surface, draft model, row, column, alignment, and Apply behind a feature flag.
- Verify byte isolation and one-step Undo.

### Phase 3: Create and paste

- Add table insertion, TSV paste, warnings, and limit handling.

### Phase 4: Compact and accessibility

- Add Android full-screen presentation, keyboard and screen-reader pattern, IME, zoom, and touch hardening.

### Phase 5: Integrations and general availability

- Add Preview mapping, F07 group safety, F03 mutation lock, docs, and telemetry-free performance tests.
- Enable by default after all gates pass.

## 26. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Parser splits pipes incorrectly | Corrupted table | Context-aware tokenizer, exact fixtures, fail closed on ambiguity |
| Formatter changes unrelated note text | Data loss | Exact range replacement and byte-isolation tests |
| Source changes while draft is open | Overwritten edits | Note-scoped lock, fingerprint validation, no auto-merge |
| Large grid freezes mobile | Unusable feature | Hard limits, virtualization, bounded clipboard parsing |
| Keyboard pattern conflicts with cell editing | Accessibility and input failure | Complete documented pattern and IME-aware handling |
| Normalization surprises users | Trust loss | Warning summary and exact Markdown preview |
| Save fails after Apply | False success | Canonical dirty state and existing Retry, never claim Saved early |
| Visual editor becomes spreadsheet scope | Complexity | Explicit non-goals and raw Markdown cell model |

## 27. Documentation changes

Update:

- user guide for supported table syntax, visual editing, paste, normalization, and limits;
- keyboard and accessibility reference;
- architecture documentation for table parser, serializer, and edit-session lock;
- troubleshooting for unsupported or conflicted tables;
- visual refresh integration documentation;
- roadmap status for F11.

## 28. Definition of done

F11 is done when:

- supported tables parse with exact safe ranges and ambiguous tables fail closed;
- every required row, column, alignment, creation, and TSV action works on desktop and Android;
- serializer output is deterministic valid GFM and normalization is disclosed;
- Apply changes only the table range in one undoable CodeMirror transaction;
- stale source, external edits, F03 refactors, workspace changes, and save failures cannot cause silent data loss;
- limits, virtualization, IME, keyboard, screen-reader, zoom, and compact gates pass;
- no formulas, proprietary table storage, accounts, telemetry, or network access are introduced;
- all functional requirements and acceptance criteria pass;
- documentation and comprehensive parser, serializer, component, integration, and platform tests land with implementation;
- no unresolved critical or high-severity data-integrity or accessibility defect remains.
