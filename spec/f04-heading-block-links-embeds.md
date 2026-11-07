# F04 Software Design Document: Heading Links, Block References, and Embeds

**Status:** Approved for implementation design  
**Feature:** F04 Heading Links, Block References, and Embeds  
**Target:** Desktop and Android  
**Last updated:** 2026-09-01

## 1. Summary

F04 extends Leotheca's existing wikilinks from note-level navigation to precise knowledge references. Users can link to headings, create stable block references, embed a full note or selected section in Preview, autocomplete valid targets, and navigate consistently in Source, Preview, and Split modes.

The syntax remains readable plain Markdown. Explicit block IDs live in the note only when the user asks Leotheca to create one. Embeds are read-only projections of their source notes and never copy content into the referring file. All rendered content remains local and passes through the existing sanitization boundary.

F04 owns the structured wikilink grammar and resolver used by F03 diagnostics and refactoring, F06 copy-link actions, preview navigation, editor completion, and backlink records. Parallel link parsers are prohibited.

## 2. Motivation

Note-level wikilinks are effective for broad relationships but become imprecise in long notes. Users often need to reference one decision, paragraph, list item, or section. Copying that content creates drift. Generic anchor behavior also becomes fragile when headings are duplicated or reformatted.

F04 introduces two complementary target types:

- human-readable heading references for stable, unique section names;
- explicit block IDs for content that needs a durable identity independent of its visible wording.

Read-only embeds make those targets useful in dashboards, project summaries, and synthesis notes while preserving a single source of truth.

## 3. Goals

1. Parse note, heading, block, label, and embed parts of wikilinks into a structured record.
2. Support same-note and cross-note heading and block navigation.
3. Offer context-aware completion for notes, headings, and blocks.
4. Let users copy a link to a unique heading or create a stable block ID on explicit request.
5. Render full-note, heading-section, and block embeds as read-only content.
6. Resolve embedded relative links and images against the embedded source note.
7. Detect missing and ambiguous subtargets for F03.
8. Preserve compatibility with existing note-level links wherever resolution can prove intent.
9. Keep rendering sanitized, bounded, cancellable, and offline.
10. Keep source Markdown portable and understandable outside Leotheca.

## 4. Non-goals

The first release does not include:

- editing transcluded content in place;
- automatic insertion of block IDs during indexing;
- database-style live queries inside embeds;
- cross-workspace links or embeds;
- remote URL embeds;
- executable scripts or components in notes;
- automatic heading rename propagation outside F03's reviewed refactor flow;
- occurrence syntax for selecting one of several duplicate headings;
- arbitrary CSS supplied by notes;
- embedding binary files as editable objects;
- recursive embeds without limits;
- compatibility with every third-party wikilink dialect;
- a rich-text editor.

## 5. Syntax

### 5.1 Supported forms

```markdown
[[Note]]
[[Note|Visible label]]
[[Note#Heading]]
[[Note#Heading|Visible label]]
[[Note#^block-id]]
[[Note#^block-id|Visible label]]
[[#Heading]]
[[#^block-id]]
![[Note]]
![[Note#Heading]]
![[Note#^block-id]]
```

A same-note embed such as `![[#Heading]]` is supported subject to the same cycle safeguards as every embed.

### 5.2 Grammar rules

The parser recognizes an optional `!`, followed by `[[`, structured content, and the first valid unescaped `]]` terminator.

Inside the link:

- the first unescaped `|` separates target expression from visible label;
- the first unescaped `#` inside the target expression separates note target from fragment;
- a fragment beginning with `^` is a block ID;
- an empty note target means the current note;
- backslash may escape `\`, `#`, `|`, `[`, and `]` inside the structured expression;
- surrounding whitespace around the note target and fragment is trimmed for resolution but preserved in the source record;
- an empty fragment, empty block ID, or missing closing delimiter produces a malformed record, not a guessed valid link.

Recommended type:

```typescript
interface WikiLinkRecord {
  kind: "link" | "embed";
  raw: string;
  noteTarget: string;
  fragment?:
    | { kind: "heading"; value: string }
    | { kind: "block"; value: string };
  label?: string;
  sourceFrom: number;
  sourceTo: number;
  targetFrom: number;
  targetTo: number;
  fragmentFrom?: number;
  fragmentTo?: number;
  labelFrom?: number;
  labelTo?: number;
  parseStatus: "valid" | "malformed" | "legacy-fallback";
}
```

### 5.3 Legacy compatibility

The existing implementation historically treated more of the text inside `[[...]]` as one note target. Before changing parser semantics, the implementation must scan fixture workspaces for filenames containing raw `#` or `|`.

Compatibility rule:

- First attempt structured resolution.
- If the structured note portion does not resolve, but the complete unescaped legacy text resolves uniquely to an existing note, treat the record as a legacy whole-note link.
- Mark it `legacy-fallback` so F03 can offer a reviewed conversion to escaped syntax.
- Never reinterpret a uniquely resolvable legacy filename as a fragment link without review.

This fallback is for existing links, not the serializer. New links created by Leotheca use escaped structured syntax.

### 5.4 Display label

When no explicit label exists:

- a note link displays the note name;
- a heading link displays the heading text;
- a block link displays the block's first meaningful text, truncated for presentation, while retaining the full accessible description;
- unresolved links display the literal target expression.

Labels affect display only. They do not affect resolution or backlinks.

## 6. Heading targets

### 6.1 Supported headings

The shared scanner extracts:

- ATX headings from levels 1 through 6;
- setext headings from levels 1 and 2;
- exact source ranges for marker, visible content, and complete heading block;
- plain display text with inline Markdown formatting removed;
- section ranges extending from the heading through the content before the next heading of equal or higher level.

Headings inside excluded code or comment regions are ignored.

### 6.2 Normalization

Heading matching uses a deterministic `headingKey`:

1. remove parsed inline Markdown formatting from visible heading content;
2. decode local Markdown escapes and character entities recognized by the renderer;
3. trim leading and trailing whitespace;
4. collapse internal Unicode whitespace runs to one space;
5. apply Unicode-compatible case folding independent of UI locale.

Punctuation is retained. Diacritics are retained. Leotheca does not transliterate heading text for resolution.

The link serializer writes the current visible heading text, escaped as needed, not the normalized key.

### 6.3 Duplicate headings

Multiple headings in one note may share a normalized key. Such a fragment is ambiguous. Behavior:

- completion shows each occurrence with line number and ancestry;
- a manually typed ambiguous link is rendered as unresolved-ambiguous rather than silently selecting the first;
- F03 reports `ambiguous-heading`;
- `Copy link to heading` offers to create a stable block ID on the selected heading and copies a block link instead;
- no hidden occurrence suffix is added to the Markdown syntax in the first release.

### 6.4 Preview anchors

Rendered headings receive deterministic application-owned attributes:

```html
<h2 id="lt-heading-design-system-2" data-lt-heading-key="design system" data-lt-heading-occurrence="2">
```

The concrete slug algorithm may differ, but it must:

- be deterministic for one rendered document;
- produce unique valid DOM IDs;
- escape user input safely;
- not be used as the Markdown resolution authority;
- retain the normalized key and occurrence as data attributes for navigation.

## 7. Block references

### 7.1 Block ID syntax

An explicit block ID is a whitespace-delimited token at the end of a supported Markdown block:

```markdown
This decision remains valid for the first release. ^release-decision

- The user owns the Markdown files. ^local-first

> A quoted principle. ^principle

## Architecture boundary ^architecture-boundary
```

The identifier grammar is:

```text
[A-Za-z0-9][A-Za-z0-9-]{0,63}
```

IDs are case-sensitive for serialization and case-insensitive for duplicate detection. New IDs are generated in lowercase.

### 7.2 Eligible blocks

The first release supports IDs attached to:

- paragraphs;
- headings;
- individual list items;
- blockquotes;
- fenced code blocks when the ID appears on a separate immediately following line, not inside the code fence.

Tables, thematic breaks, and raw HTML blocks are not eligible in the first release unless the parser can prove a stable complete block range without ambiguity.

For a multi-line paragraph, blockquote, or list item, the ID belongs at the end of its final logical line. The scanner reports the complete block range and the ID token range.

### 7.3 Rendering

A valid block ID token is not shown as ordinary rendered text. The rendered block receives:

- a deterministic DOM ID;
- `data-lt-block-id`;
- an optional unobtrusive copy-link affordance on hover, focus, or long press.

Malformed or duplicate ID tokens remain visible as source-derived text or warning indicators according to parser certainty. The renderer must not hide text it cannot prove is an ID.

### 7.4 Creating an ID

`Copy block link` and `Create block link` are explicit user actions.

Flow:

1. Determine the selected Markdown block from the current cursor or preview element.
2. If it already has a unique valid ID, copy that link.
3. Otherwise propose a generated ID such as `b-7k3m2p9d` or a normalized human-readable candidate.
4. Confirm uniqueness against the active note.
5. Insert the token through one minimal CodeMirror transaction or the shared closed-file mutation helper.
6. Wait for canonical content acceptance.
7. Copy or insert the structured link.

Generated IDs use a local cryptographically strong random source when available. They contain no user or device identifier.

The application never adds IDs merely because a note is indexed or previewed.

## 8. Resolution model

```typescript
interface ResolvedWikiTarget {
  status: "resolved" | "missing-note" | "ambiguous-note" | "missing-fragment" | "ambiguous-fragment" | "malformed";
  notePath?: string;
  heading?: HeadingRecord;
  block?: BlockRecord;
  candidatePaths?: string[];
}
```

Resolution order for the note portion follows the shared F03 resolver. Fragment resolution happens only after exactly one note is resolved.

Same-note targets use the canonical current note path. A same-note link in an unsaved new note can resolve locally, but workspace-wide backlinks are provisional until the note has a contained path and successful save.

Every resolution result is tied to an index generation and workspace session. A click or completion selection revalidates the current target before opening.

## 9. Editor completion

### 9.1 Note completion

Typing `[[` or `![[` opens the existing note completion with:

- note name;
- path context;
- aliases;
- recency signal where already available;
- ambiguity indicator for duplicate names.

Selecting a note inserts the escaped note target but does not close completion if the user continues with `#`.

### 9.2 Heading completion

After `[[Note#`, completion shows headings from the resolved note:

- heading text;
- level;
- breadcrumb ancestry;
- line number;
- duplicate warning.

For the current unsaved note, headings come from the canonical in-memory scanner result. For a closed note, they come from the workspace metadata index and may be refreshed on demand if stale.

Selecting a unique heading inserts its escaped visible text.

### 9.3 Block completion

After `[[Note#^`, completion shows explicit block IDs with a short sanitized plain-text preview and line number. It does not show full sensitive note bodies beyond the local UI and does not keep those previews in persistent caches unless already part of the bounded metadata record.

The current note may also offer `Create block ID at cursor` when no suitable block exists.

### 9.4 Completion safety

Completion results are generation-authoritative. Results from an older target note or workspace cannot replace a newer completion query. Large notes may load block previews lazily.

## 10. Navigation

### 10.1 Link activation

Activating a resolved link calls the shared `OpenNoteRequest`:

- heading target uses `{ kind: "heading", headingKey }` plus the proven source range when available;
- block target uses `{ kind: "block", blockId }`;
- note target opens without a sublocation.

Modifier behavior should follow the existing open-note conventions. Once F07 exists, an explicit `Open in other group` action targets the secondary group without changing the core resolver.

### 10.2 Source mode

Source navigation moves the selection to the target content, scrolls it into view, and briefly highlights the range without altering the note.

For a heading block ID, the visible heading text is selected rather than only the hidden token.

### 10.3 Preview mode

Preview navigation scrolls to the rendered element and applies a short focus-safe highlight. It does not move DOM focus unless keyboard activation requires it. The target can receive temporary `tabindex=-1` for announced navigation, then restore its prior state.

### 10.4 Failed navigation

If a previously resolved target changes before activation:

- open the note if its path still resolves;
- show `The linked section moved or no longer exists`;
- offer `Search headings` or `Open diagnostics` when relevant;
- never scroll to an arbitrary similarly named target.

## 11. Embeds

### 11.1 Embed types

- `![[Note]]` renders the note body after frontmatter.
- `![[Note#Heading]]` renders that heading and its section through the next heading of equal or higher level.
- `![[Note#^block-id]]` renders the exact referenced block.

Frontmatter is not rendered as an embed body in the first release. A visible property table can be a separate future option.

### 11.2 Read-only presentation

Every embed has an application frame with:

- source note name;
- optional section label;
- `Open source note` action;
- resolved content or a clear placeholder;
- accessible `Embedded content from ...` label.

The frame must be visually quiet and must not make the embedded content look editable. Text selection and local link activation remain available.

### 11.3 Relative context

While rendering an embed:

- relative Markdown links resolve from the embedded note's directory;
- relative images and attachments resolve from the embedded note's directory;
- same-note wikilinks inside the embed refer to the embedded note, not the host note;
- heading and block anchors are namespaced to prevent DOM ID collisions in the host preview;
- activating a link carries the correct source context to the resolver.

### 11.4 Recursive embeds

Embeds may contain embeds under strict limits:

- maximum recursion depth: 3;
- maximum resolved embed instances per host preview: 25;
- maximum total source bytes loaded for one host preview: 1 MiB by default;
- duplicate target in the active recursion chain: cycle placeholder;
- per-note load timeout or cancellation on newer preview generation.

Required placeholders include:

- `Embedded note not found`;
- `Embedded heading not found`;
- `Embedded block not found`;
- `Embed cycle stopped`;
- `Embed limit reached`;
- `Could not read embedded note`.

These limits are implementation constants in the first release and may become advanced settings later.

### 11.5 Rendering and sanitization

Recommended pipeline:

```text
host canonical Markdown
  -> parse host and locate embeds
  -> resolve and load allowed local source slices
  -> recursively assemble an application-owned render tree
  -> render Markdown with source-context annotations
  -> sanitize complete assembled HTML with DOMPurify
  -> attach event handlers through application code
```

Sanitization happens after assembly so embedded HTML cannot bypass the host boundary. No embedded source may add scripts, event handlers, remote frames, or unrestricted style elements.

A nested embed read is cancellable and tied to preview generation. Stale reads cannot publish after the host note, workspace, or view mode changes.

### 11.6 Edit behavior

Embeds are not editable in Preview. In Source mode, users edit the literal `![[...]]` expression. `Open source note` is the supported route to editing embedded content.

## 12. Backlinks and metadata index

Link records gain structured target data:

```typescript
interface LinkRecord {
  sourcePath: string;
  kind: "wikilink" | "embed" | "markdown-link" | "image";
  rawTarget: string;
  noteTarget?: string;
  fragmentKind?: "heading" | "block";
  fragmentValue?: string;
  label?: string;
  sourceFrom: number;
  sourceTo: number;
  resolution?: LinkResolutionSummary;
}
```

Backlinks may be grouped as:

- links to note;
- links to this heading;
- links to this block;
- embeds of note or subtarget.

A note-level backlink view includes all resolved subtarget links because every subtarget also references the note. Context snippets are loaded lazily and sanitized.

The cache version must change. Corrupt or old cache data triggers a fresh scan.

## 13. Architecture

Recommended modules:

```text
src/linking/
  wikiSyntax.ts
  wikiResolver.ts
  wikiSerializer.ts
  linkNavigation.ts
  linkCompletion.ts

src/markdown/
  headings.ts
  blocks.ts
  links.ts

src/preview/
  embedResolver.ts
  embedRenderer.ts
  previewAnchors.ts
  embedLimits.ts
```

Responsibilities:

- `wikiSyntax.ts` parses and exposes exact source ranges.
- `wikiResolver.ts` maps syntax to current metadata targets.
- `wikiSerializer.ts` is the only creator of new wikilink text.
- `linkNavigation.ts` adapts resolved targets to `OpenNoteRequest`.
- `embedResolver.ts` owns recursion context, byte budgets, reads, and cancellation.
- the shared scanner owns heading and block extraction.
- the preview owns sanitized rendering, not resolution policy.

## 14. Concurrency and lifecycle

- All resolver, completion, navigation, and embed operations carry workspace session and request generation.
- Open-note headings and blocks come from current canonical editor content rather than an older disk index.
- Preview rebuilds cancel older nested embed reads.
- A save incrementally replaces heading, block, and outbound-link records for the affected note.
- A workspace transition drains bridge reads and prevents old embedded content from publishing.
- F03 acquires the workspace mutation lock before rewriting structured targets.
- Creating a block ID serializes with autosave through the canonical open document.
- A link click during an in-progress structural refactor is disabled or resolved only after the transaction reaches a terminal state.

## 15. Security and privacy

- All source and embeds remain local.
- No remote embeds, URL previews, or network fetches are introduced.
- Embedded image and attachment paths pass existing containment checks.
- The complete assembled preview is sanitized after recursive embed expansion.
- User content never becomes an HTML attribute without escaping.
- DOM IDs are application-generated and cannot inject markup.
- Block IDs are length- and character-limited.
- Embed byte, depth, and count limits protect memory and denial-of-service behavior.
- Android grant tokens and content URIs are not written into Markdown or logs.
- Clipboard actions copy only the requested link text and never note content implicitly.

## 16. Accessibility

- Resolved links expose meaningful accessible names, including note and fragment when no explicit label exists.
- Unresolved and ambiguous links have textual status and a discoverable action, not color alone.
- Embed frames are labeled regions with an `Open source note` control.
- Heading and block navigation works with keyboard activation.
- Temporary target highlights respect reduced motion and do not use animation as the only signal.
- Copy-link controls appear on focus as well as pointer hover.
- Completion lists expose note path, heading level, duplicate state, and block preview through proper option semantics.
- Error placeholders are readable by screen readers and do not trap focus.
- Touch targets meet the compact-layout minimum.

## 17. Performance requirements

- Heading, block, and structured link extraction share the one note scan used by the workspace metadata index.
- Completion for an indexed note should show initial headings within 100 ms after a resolved `#` query.
- A host preview with no embeds must not incur embedded-note reads.
- Embedded sources are loaded only on demand and cached by path plus content fingerprint within the active workspace session.
- Cache memory is bounded and released on workspace switch.
- Preview generation remains cancellable.
- The 1 MiB, 25-instance, and depth-3 limits are enforced before additional reads are scheduled.
- Large completion lists and backlink lists are virtualized above established thresholds.

## 18. Functional requirements

**F04-FR-01** The system shall parse note target, fragment, label, and embed marker into a structured record with exact source ranges.  
**F04-FR-02** The parser shall ignore wikilink-like text in excluded code and comment regions.  
**F04-FR-03** The resolver shall support same-note and cross-note heading and block targets.  
**F04-FR-04** Heading matching shall use the deterministic normalization defined in this SDD.  
**F04-FR-05** Duplicate headings shall be treated as ambiguous rather than resolved by order.  
**F04-FR-06** Explicit block IDs shall follow the defined grammar and eligible-block rules.  
**F04-FR-07** The application shall never insert a block ID without explicit user action.  
**F04-FR-08** New links shall be serialized only through the shared escaping serializer.  
**F04-FR-09** Legacy whole-note targets containing raw separators shall retain a unique-resolution fallback.  
**F04-FR-10** Completion shall support notes, headings, and explicit block IDs.  
**F04-FR-11** Completion results shall be workspace- and request-generation authoritative.  
**F04-FR-12** Activating a resolved target shall use the central note-location navigation API.  
**F04-FR-13** Source and Preview modes shall reveal the correct target without editing it.  
**F04-FR-14** Full-note embeds shall omit frontmatter from rendered content.  
**F04-FR-15** Heading embeds shall include the heading and its complete section range.  
**F04-FR-16** Block embeds shall include only the referenced parsed block.  
**F04-FR-17** Relative links and images inside embeds shall resolve from the embedded note's directory.  
**F04-FR-18** Same-note links inside embeds shall use the embedded note as source context.  
**F04-FR-19** Recursive embeds shall enforce cycle, depth, count, and byte limits.  
**F04-FR-20** The complete assembled preview shall pass through DOMPurify before display.  
**F04-FR-21** Embeds shall be read-only and expose Open source note.  
**F04-FR-22** Backlink records shall distinguish note, heading, block, and embed references.  
**F04-FR-23** Missing and ambiguous targets shall remain visible and feed F03 diagnostics.  
**F04-FR-24** Saves shall incrementally refresh the affected note's heading, block, and link records.  
**F04-FR-25** Stale embedded reads or resolver results shall never publish after newer user intent.  
**F04-FR-26** The feature shall work without accounts, telemetry, or network access.  
**F04-FR-27** All link, completion, embed, and copy controls shall be keyboard and screen-reader operable.  
**F04-FR-28** Source Markdown shall remain usable in external text editors without Leotheca metadata.

## 19. Acceptance criteria

1. Every supported syntax example parses into the expected structured fields and source ranges.
2. Escaped `#`, `|`, bracket, and backslash characters serialize and resolve correctly.
3. A unique existing legacy filename containing raw `#` or `|` remains resolvable through the compatibility fallback.
4. ATX and setext headings can be linked and opened in Source and Preview.
5. Heading matching is insensitive to case and collapsed whitespace but retains punctuation and diacritics.
6. Duplicate normalized headings produce ambiguity, not navigation to the first occurrence.
7. Creating a block link adds exactly one valid unique ID in one undoable source transaction.
8. Merely opening or indexing a note never adds a block ID.
9. Paragraph, list item, blockquote, heading, and post-fence block IDs resolve to the intended block.
10. Invalid and duplicate block IDs produce diagnostics and are not silently selected.
11. Heading and block completion shows correct line and context for the resolved target note.
12. Switching target notes during completion prevents older results from replacing the current list.
13. A heading link opens the exact source heading and correct preview anchor.
14. A full-note embed excludes frontmatter and includes the source-note action.
15. A heading embed stops before the next heading of equal or higher level.
16. A block embed renders only the referenced block.
17. Relative images and links inside an embed resolve as if rendered from the embedded note.
18. Same-note links inside an embed navigate within the embedded source note.
19. A direct or indirect embed cycle produces a cycle placeholder and no unbounded reads.
20. Depth, count, and source-byte limits stop further expansion with an accessible placeholder.
21. Script, event-handler, and unsafe HTML payloads in a nested embed are removed by the final sanitizer.
22. A workspace switch during embed loading prevents old content from appearing in the new workspace.
23. Backlinks distinguish ordinary links and embeds and retain fragment information.
24. F03 receives missing-note, ambiguous-note, missing-heading, ambiguous-heading, missing-block, and duplicate-block data.
25. No network request is issued for any link or embed behavior.

## 20. Test plan

### 20.1 Unit tests

- Structured syntax parsing and exact offsets.
- Escape and serializer round trips.
- Legacy target fallback.
- Heading extraction for ATX and setext forms.
- Inline-format stripping and normalized keys.
- Duplicate heading behavior.
- Block extraction and eligible-block boundaries.
- ID validation, duplicate detection, and random generation.
- Section-range calculation.
- Resolver status matrix.
- Embed recursion context and limit accounting.

### 20.2 Rendering tests

- Heading DOM anchors and namespacing.
- Hidden valid block IDs and visible malformed tokens.
- Full-note, heading, and block embeds.
- Relative links and images from nested sources.
- Sanitization after nested assembly.
- Error and cycle placeholders.
- Light, dark, reduced-motion, and forced-colors presentation.

### 20.3 Editor tests

- Note, heading, and block completion.
- Completion cancellation and stale results.
- Copy heading link.
- Create and copy block link in an open clean and dirty note.
- One-step undo after ID insertion.
- Same-note targets in unsaved content.

### 20.4 Integration tests

- Save updates index and backlinks.
- Link navigation into primary and secondary F07 groups.
- F06 outline copy-link uses the same serializer.
- F03 rename preserves labels and fragments.
- External source change while an embed is loading.
- Workspace switch during nested reads.
- Preview mode change during rendering.

### 20.5 Platform tests

Desktop and Android:

- contained nested-note and attachment reads;
- Unicode paths and headings;
- activity or window lifecycle interruption;
- keyboard or TalkBack operation;
- clipboard link actions;
- large note and embed-limit behavior.

## 21. Rollout plan

### Phase 1: Parser, headings, and navigation

- Land structured syntax and serializer fixtures.
- Extend metadata records and cache version.
- Add heading links and same-note navigation behind a feature flag.

### Phase 2: Block references

- Add explicit block extraction, ID insertion, copy actions, and diagnostics.
- Complete editor and preview navigation.

### Phase 3: Completion and backlinks

- Add heading and block completion.
- Upgrade backlink records and UI grouping.

### Phase 4: Read-only embeds

- Add full-note and section rendering, source context, limits, cancellation, and final sanitization.
- Enable Android after lifecycle and memory tests pass.

### Phase 5: General availability

- Enable by default.
- Update F03 and F06 integrations, user docs, and migration notes.

## 22. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| New separators reinterpret old filenames | Broken existing links | Unique legacy fallback, repository scan, reviewed F03 conversion |
| Duplicate headings navigate unpredictably | Wrong context | Treat as ambiguous and offer stable block ID |
| Block IDs pollute notes | Reduced portability | Insert only on explicit action, simple visible syntax |
| Nested embeds cause recursion or memory pressure | App instability | Cycle detection and strict depth, count, and byte budgets |
| Embedded content bypasses sanitizer | Security issue | Sanitize complete assembled output after expansion |
| Relative links use host context | Wrong targets | Carry source-note context through every nested render node |
| Stale async result appears | Cross-note or cross-workspace leak | Session and request generations with cancellation |
| Multiple parsers disagree | Incorrect diagnostics or refactors | One syntax parser, resolver, and serializer used by all features |

## 23. Documentation changes

Update:

- user guide with syntax examples and escaping rules;
- accessibility guide for link and embed controls;
- architecture documentation for parser, resolver, serializer, and embed pipeline;
- cache and metadata schema documentation;
- troubleshooting for ambiguous headings and block IDs;
- roadmap status for F04;
- F03 and F06 cross-reference documentation.

## 24. Definition of done

F04 is done when:

- one structured parser, resolver, and serializer serve editor, preview, backlinks, F03, and F06;
- heading and block links navigate precisely in Source, Preview, and Split modes;
- block IDs are stable, explicit, portable, and never inserted automatically;
- embeds remain read-only, bounded, source-context-correct, and sanitized after assembly;
- stale reads and workspace transitions cannot publish incorrect content;
- legacy link compatibility is tested and documented;
- all functional requirements and acceptance criteria pass on desktop and Android;
- accessibility and performance gates pass;
- documentation, architecture updates, cache migration, and tests land with implementation;
- no unresolved critical or high-severity security or data-integrity defects remain.
