import { useEffect, useRef } from "preact/hooks";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { searchKeymap } from "@codemirror/search";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import {
  autocompletion,
  completionKeymap,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { linkIndex, resolveWikilink } from "../linking/store";
import { escapeWikiLinkText } from "../linking/wikiSyntax";
import { scanHeadings, type HeadingRecord } from "../markdown/headings";
import { scanBlockIds, type BlockRecord } from "../markdown/blocks";
import { readTextFile } from "../workspace/tauriBridge";
import { livePreviewExtension } from "./livePreview";
import { attachmentsInsertText, type PastedOrDroppedFile } from "./attachments";
import { minimalChange } from "./textDiff";
import { parseSnippets, snippetExpansion } from "./snippets";
import { resolveBlockLinkAtCursor } from "./blockLinkActions";
import type { BlockLinkCopyRequest, BlockLinkCreateRequest } from "./blockLinkRequest";

export interface MarkdownEditorProps {
  path: string;
  value: string;
  onChange: (value: string) => void;
  /** The open workspace's root folder, needed to resolve a configured
   * attachments folder (see attachments.ts's attachmentSaveDir). */
  workspaceRoot: string;
  /** Where a pasted/dropped image is saved; see
   * WorkspaceSettings.attachmentsFolder. */
  attachmentsFolder: string;
  /** Whether pasting/dropping an image saves it as an attachment at all;
   * see WorkspaceSettings.pasteImagesEnabled. */
  pasteImagesEnabled: boolean;
  snippetsEnabled: boolean;
  snippets: string;
  /** A request to move the selection to a source range and scroll it
   * into view without remounting the editor or touching undo history,
   * e.g. from OutlinePanel's click-to-navigate (see
   * outline/outlineNavigation.ts). `requestId` must change for a repeat
   * request at the same range to re-apply; `null` means no pending
   * request. */
  reveal?: { from: number; to: number; requestId: number } | null;
  /** A request to insert literal text at the current selection, e.g. from
   * OutlinePanel/HeadingBreadcrumbs's insert-heading-link action (spec
   * section 9.4, see outline/outlineNavigation.ts's
   * `requestOutlineInsert`). Unlike `reveal` above, this is a normal,
   * undo-tracked editor edit: it replaces the current selection and moves
   * the cursor after the inserted text, exactly like typed input.
   * `requestId` must change for a repeat request with the same text to
   * re-apply; `null` means no pending request. */
  insertRequest?: { text: string; requestId: number } | null;
  /** A request to run F04 Phase 5d's "Copy block link" action (spec
   * section 7.4) against the current cursor position, e.g. from the
   * command palette's "Copy block link" entry (see
   * editor/blockLinkRequest.ts's `requestCopyBlockLinkAtCursor`). Unlike
   * `insertRequest` above, this never touches the current selection
   * itself: it locates the block *at* the cursor (not necessarily the
   * selection), inserts a fresh id there only if the block doesn't
   * already have one, and copies the resulting link to the clipboard,
   * all in one CodeMirror transaction plus a clipboard write.
   * `requestId` must change for a repeat request to re-apply; `null`
   * means no pending request. */
  blockLinkCopyRequest?: BlockLinkCopyRequest | null;
  /** A request to run F04 Phase 5e3's "Create block link" action (spec
   * section 21 Phase 5), e.g. from the command palette's "Create block
   * link" entry (see editor/blockLinkRequest.ts's
   * `requestCreateBlockLinkAtCursor`). Identical to `blockLinkCopyRequest`
   * above except it never writes to the clipboard: see
   * editor/blockLinkActions.ts's module doc comment for why Create is
   * scoped to stamping an id only, not inserting a link, unlike a
   * heading's own Copy/Insert pair. `requestId` must change for a repeat
   * request to re-apply; `null` means no pending request. */
  blockLinkCreateRequest?: BlockLinkCreateRequest | null;
  /** Reports the primary selection head (character offset) after every
   * transaction that changes it, including typing and the reveal effect
   * above; used by HeadingBreadcrumbs for Source-mode active-section
   * tracking (spec section 7.3). Not called on mere re-renders. */
  onCursorChange?: (pos: number) => void;
}

/** Suggests note names (and, when the setting is on, note aliases) while
 * typing `[[`, sourced from the same link index the backlinks panel and
 * preview link resolution already build (see src/linking/store.ts). Only
 * offers already-existing notes; there is no "create a new note from
 * here" affordance yet.
 *
 * Stops matching once a `#` appears in the bracket contents (F04 Phase 2):
 * past that point, `[[Note#` is the start of a heading-link fragment (see
 * headingLinkCompletions below), not a note name still being typed, and a
 * note name can never itself contain `#` (spec/f04-heading-block-links-
 * embeds.md section 5.2 reserves it as the fragment separator). */
export function wikilinkCompletions(context: CompletionContext): CompletionResult | null {
  const match = context.matchBefore(/\[\[([^[\]\n#]*)$/);
  if (!match) return null;

  const query = match.text.slice(2).toLowerCase();
  const from = match.from + 2;

  const seenLabels = new Set<string>();
  const options: { label: string; apply: string; type: string }[] = [];
  const addOption = (label: string | undefined) => {
    if (!label || seenLabels.has(label)) return;
    if (!label.toLowerCase().includes(query)) return;
    seenLabels.add(label);
    options.push({ label, apply: `${label}]]`, type: "text" });
  };

  for (const paths of linkIndex.value.pathsByNoteName.values()) {
    addOption(paths[0]?.split("/").pop()?.replace(/\.md$/i, ""));
  }
  for (const aliases of linkIndex.value.aliasesByPath.values()) {
    for (const alias of aliases) addOption(alias);
  }

  if (options.length === 0) return null;
  return { from, options, filter: false };
}

/** Matches the trigger point for F04 Phase 2's heading completion: `[[`,
 * an optional note-name portion (no `[`, `]`, newline, or `#`, mirroring
 * wikilinkCompletions' own note-name character class above), a `#`, then
 * the heading text typed so far. The `(?!\^)` right after the `#` excludes
 * a block-reference fragment (`[[Note#^block-id]]`, spec section 7): that
 * one instead triggers F04 Phase 3c's blockLinkCompletions below, a
 * separate completion source rather than one regex trying to serve both
 * heading and block queries. */
const HEADING_LINK_TRIGGER = /\[\[([^[\]\n#]*)#(?!\^)([^[\]\n]*)$/;

/** Builds one heading-completion option, escaping the heading's own
 * display text (spec section 6.2's "visible heading text") through
 * wikiSyntax.ts's escapeWikiLinkText so a heading literally containing
 * `#`, `|`, `[`, `]`, or `\` still round-trips correctly through
 * parseWikiLinks once inserted, rather than being reinterpreted as a
 * second delimiter. `detail` surfaces spec section 9.2's level, line
 * number, and duplicate-heading warning; full breadcrumb ancestry display
 * is not implemented in this phase (disclosed scope narrowing, see
 * ROADMAP.md's F04 Phase 2 entry). */
function headingCompletionOption(heading: HeadingRecord, isDuplicate: boolean) {
  return {
    label: heading.displayText,
    apply: `${escapeWikiLinkText(heading.displayText)}]]`,
    type: "text",
    detail: `H${heading.level} · line ${heading.line}${isDuplicate ? " · duplicate" : ""}`,
  };
}

/**
 * Suggests headings for a `[[Note#` (or same-note `[[#`) heading-link
 * fragment being typed, reusing the shared heading scanner
 * (markdown/headings.ts) rather than a second matching implementation, per
 * this claim's own scope instruction. `path` is this editor's own open
 * note: an empty note portion (`[[#`), or a note portion that resolves to
 * this exact path, suggests headings from the live, possibly-unsaved
 * document (`context.state.doc`) directly, matching spec section 9.2's
 * "for the current unsaved note, headings come from the canonical
 * in-memory scanner result." A different, already-existing note is read
 * fresh from disk on every trigger (no headings cache exists yet, a
 * disclosed scope narrowing, not the "workspace metadata index" section
 * 9.2 describes); a note that doesn't resolve at all, or that fails to
 * read, yields no suggestions rather than an error.
 */
export function headingLinkCompletions(path: string) {
  return async function (context: CompletionContext): Promise<CompletionResult | null> {
    const match = context.matchBefore(HEADING_LINK_TRIGGER);
    if (!match) return null;
    const groups = HEADING_LINK_TRIGGER.exec(match.text);
    if (!groups) return null;
    const [, noteName, headingQuery] = groups;
    const from = context.pos - headingQuery.length;

    let headings: HeadingRecord[];
    if (noteName === "") {
      headings = scanHeadings(context.state.doc.toString());
    } else {
      const targetPath = resolveWikilink(noteName);
      if (!targetPath) return null;
      if (targetPath === path) {
        headings = scanHeadings(context.state.doc.toString());
      } else {
        try {
          headings = scanHeadings(await readTextFile(targetPath));
        } catch {
          // Unreadable target note (deleted, permission change, a sync
          // tool mid-write): no suggestions, same as a note that doesn't
          // resolve at all, rather than surfacing a completion-popup error.
          return null;
        }
      }
    }

    const query = headingQuery.trim().toLowerCase();
    const occurrenceCounts = new Map<string, number>();
    for (const heading of headings) {
      occurrenceCounts.set(heading.key, (occurrenceCounts.get(heading.key) ?? 0) + 1);
    }

    const options = headings
      .filter((heading) => heading.displayText.toLowerCase().includes(query))
      .map((heading) => headingCompletionOption(heading, (occurrenceCounts.get(heading.key) ?? 0) > 1));

    if (options.length === 0) return null;
    return { from, options, filter: false };
  };
}

/** Matches the trigger point for F04 Phase 3c's block-id completion:
 * `[[`, an optional note-name portion, `#^`, then the id text typed so
 * far. The mirror image of HEADING_LINK_TRIGGER above (that one's
 * `(?!\^)` is exactly what routes a `#^` query here instead). */
const BLOCK_LINK_TRIGGER = /\[\[([^[\]\n#]*)#\^([^[\]\n]*)$/;

/** Builds one block-completion option per spec section 9.3: the id itself
 * as both label and inserted text (block ids are already wikilink-safe,
 * grammar `[A-Za-z0-9-]`, so unlike a heading's own display text this
 * never needs escapeWikiLinkText), with a short sanitized plain-text
 * preview of the block's own content and its line number in `detail`
 * ("a short sanitized plain-text preview and line number... does not show
 * full sensitive note bodies beyond the local UI"). */
function blockCompletionOption(block: BlockRecord, previewText: string, isDuplicate: boolean) {
  const preview = previewText.length > 60 ? `${previewText.slice(0, 60)}…` : previewText;
  return {
    label: block.id,
    apply: `${block.id}]]`,
    type: "text",
    detail: `${preview} · line ${block.line}${isDuplicate ? " · duplicate" : ""}`,
  };
}

/**
 * Suggests explicit block ids for a `[[Note#^` (or same-note `[[#^`)
 * block-link fragment being typed, reusing the shared block scanner
 * (markdown/blocks.ts) rather than a second matching implementation, the
 * same "one parser/scanner per consumer" rule headingLinkCompletions
 * above already follows. Mirrors that function's same-note/cross-note/
 * unreadable-note handling exactly, down to reading a different note
 * fresh from disk on every trigger (no metadata index exists yet for
 * this either). "Create block ID at cursor" (spec 9.3's other half, for
 * when no suitable block exists) is not implemented: it needs spec
 * section 7.4's generated-id insertion flow, a disclosed follow-up (see
 * ROADMAP.md), not attempted here.
 */
export function blockLinkCompletions(path: string) {
  return async function (context: CompletionContext): Promise<CompletionResult | null> {
    const match = context.matchBefore(BLOCK_LINK_TRIGGER);
    if (!match) return null;
    const groups = BLOCK_LINK_TRIGGER.exec(match.text);
    if (!groups) return null;
    const [, noteName, idQuery] = groups;
    const from = context.pos - idQuery.length;

    let docText: string;
    if (noteName === "") {
      docText = context.state.doc.toString();
    } else {
      const targetPath = resolveWikilink(noteName);
      if (!targetPath) return null;
      if (targetPath === path) {
        docText = context.state.doc.toString();
      } else {
        try {
          docText = await readTextFile(targetPath);
        } catch {
          // Unreadable target note: no suggestions, same as
          // headingLinkCompletions' identical handling above.
          return null;
        }
      }
    }

    const blocks = scanBlockIds(docText);
    const query = idQuery.trim().toLowerCase();
    const occurrenceCounts = new Map<string, number>();
    for (const block of blocks) {
      occurrenceCounts.set(block.key, (occurrenceCounts.get(block.key) ?? 0) + 1);
    }

    const options = blocks
      .filter((block) => block.id.toLowerCase().includes(query))
      .map((block) =>
        blockCompletionOption(
          block,
          docText.slice(block.contentFrom, block.contentTo).trim(),
          (occurrenceCounts.get(block.key) ?? 0) > 1,
        ),
      );

    if (options.length === 0) return null;
    return { from, options, filter: false };
  };
}

async function fileToBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

function pasteImageFiles(clipboardData: DataTransfer): File[] {
  return Array.from(clipboardData.items)
    .filter((item) => item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
}

function droppedImageFiles(dataTransfer: DataTransfer): File[] {
  return Array.from(dataTransfer.files).filter((file) => file.type.startsWith("image/"));
}

interface AttachmentSettings {
  workspaceRoot: string;
  attachmentsFolder: string;
  pasteImagesEnabled: boolean;
}

interface SnippetSettings {
  enabled: boolean;
  source: string;
}

function snippetKeymap(settingsRef: { current: SnippetSettings }) {
  return keymap.of([{
    key: "Tab",
    run(view) {
      if (!settingsRef.current.enabled || !view.state.selection.main.empty) return false;
      const cursor = view.state.selection.main.from;
      const expansion = snippetExpansion(view.state.doc.sliceString(0, cursor), parseSnippets(settingsRef.current.source));
      if (!expansion) return false;
      const from = expansion.from;
      view.dispatch({
        changes: { from, to: cursor, insert: expansion.replacement },
        selection: { anchor: from + expansion.replacement.length },
      });
      return true;
    },
  }]);
}

/**
 * Paste/drop-to-attach an image: saves it via editor/attachments.ts and
 * inserts a markdown link at the cursor (paste) or drop position (drop).
 * `settingsRef` is read fresh on every paste/drop rather than captured
 * once, since the editor extensions array (and this closure with it) is
 * only rebuilt when `path` changes (see the useEffect below), but
 * workspace settings can change while the same note stays open.
 */
function imageAttachmentExtension(path: string, settingsRef: { current: AttachmentSettings }) {
  async function insertFiles(view: EditorView, files: File[], atPos: number) {
    if (files.length === 0) return;
    const { workspaceRoot, attachmentsFolder } = settingsRef.current;
    const pastedFiles: PastedOrDroppedFile[] = await Promise.all(
      files.map(async (file) => ({
        bytes: await fileToBytes(file),
        mimeType: file.type,
        originalName: file.name,
      })),
    );
    const insertText = await attachmentsInsertText(pastedFiles, {
      notePath: path,
      workspaceRoot,
      attachmentsFolder,
      now: Date.now(),
    });
    if (!insertText) return;

    const pos = Math.min(atPos, view.state.doc.length);
    view.dispatch({
      changes: { from: pos, insert: insertText },
      selection: { anchor: pos + insertText.length },
    });
  }

  return EditorView.domEventHandlers({
    paste(event, view) {
      if (!settingsRef.current.pasteImagesEnabled || !event.clipboardData) return false;
      const files = pasteImageFiles(event.clipboardData);
      if (files.length === 0) return false;

      event.preventDefault();
      void insertFiles(view, files, view.state.selection.main.from);
      return true;
    },
    drop(event, view) {
      if (!settingsRef.current.pasteImagesEnabled || !event.dataTransfer) return false;
      const files = droppedImageFiles(event.dataTransfer);
      if (files.length === 0) return false;

      event.preventDefault();
      const pos =
        view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.from;
      void insertFiles(view, files, pos);
      return true;
    },
  });
}

/** The extensions array a fresh `EditorState` needs, factored out so both
 * the initial mount and a later file switch (see the two effects below)
 * build it identically. `imageAttachmentExtension` closes over `path`
 * directly (not a ref), since a pasted/dropped image needs to record
 * *this* extension's own file as `notePath` at save time; that's exactly
 * why switching files needs a fresh extensions array, not just a content
 * swap in an unchanged one. */
function buildExtensions(
  path: string,
  onChangeRef: { current: (value: string) => void },
  attachmentSettingsRef: { current: AttachmentSettings },
  snippetSettingsRef: { current: SnippetSettings },
  onCursorChangeRef: { current: ((pos: number) => void) | undefined },
) {
  return [
    lineNumbers(),
    highlightActiveLine(),
    history(),
    autocompletion({ override: [wikilinkCompletions, headingLinkCompletions(path), blockLinkCompletions(path)] }),
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, ...completionKeymap]),
    markdown({ codeLanguages: languages }),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    livePreviewExtension,
    imageAttachmentExtension(path, attachmentSettingsRef),
    snippetKeymap(snippetSettingsRef),
    EditorView.lineWrapping,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current(update.state.doc.toString());
      }
      // Covers typing (which moves the cursor as part of the same
      // transaction as docChanged) and plain cursor movement/selection
      // alike, including the reveal effect's own programmatic dispatch
      // below, per spec section 7.3's "programmatic navigation updates
      // after the editor transaction settles."
      if (update.docChanged || update.selectionSet) {
        onCursorChangeRef.current?.(update.state.selection.main.head);
      }
    }),
    EditorView.theme({
      "&": { height: "100%", fontSize: "var(--content-font-size)" },
      ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.6" },
      ".cm-content": { padding: "var(--space-4)" },
    }),
  ];
}

/**
 * CodeMirror 6 source-mode editor with markdown syntax highlighting and
 * inline live-preview decorations (headings, bold, italic, inline code,
 * wikilinks, and bullet list markers render in place; their markup hides
 * except on the line being edited, see livePreview.ts).
 */
export function MarkdownEditor({
  path,
  value,
  onChange,
  workspaceRoot,
  attachmentsFolder,
  pasteImagesEnabled,
  snippetsEnabled,
  snippets,
  reveal,
  insertRequest,
  blockLinkCopyRequest,
  blockLinkCreateRequest,
  onCursorChange,
}: MarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onCursorChangeRef = useRef(onCursorChange);
  onCursorChangeRef.current = onCursorChange;
  const attachmentSettingsRef = useRef<AttachmentSettings>({
    workspaceRoot,
    attachmentsFolder,
    pasteImagesEnabled,
  });
  attachmentSettingsRef.current = { workspaceRoot, attachmentsFolder, pasteImagesEnabled };
  const snippetSettingsRef = useRef<SnippetSettings>({ enabled: snippetsEnabled, source: snippets });
  snippetSettingsRef.current = { enabled: snippetsEnabled, source: snippets };

  // Creates the CodeMirror view once and keeps it alive for the component's
  // whole lifetime. A file switch used to destroy and recreate this (full
  // DOM teardown, fresh syntax-highlighting/decoration/event-handler setup
  // every time, 100-500ms on a large document); it now reconfigures this
  // same view in place instead, see the effect below.
  useEffect(() => {
    if (!hostRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: buildExtensions(
        path,
        onChangeRef,
        attachmentSettingsRef,
        snippetSettingsRef,
        onCursorChangeRef,
      ),
    });

    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    onCursorChangeRef.current?.(view.state.selection.main.head);

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Deliberately empty: this mounts the view once. `path`'s own
    // extensions and `value`'s own content are handled by the two effects
    // below instead of being dependencies here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reconfigures the existing view for a newly opened file instead of
  // recreating it. Skips its own first run: the mount effect above already
  // built the view with this exact path's extensions and content, so
  // reconfiguring again immediately would be redundant. Uses `setState`,
  // not `dispatch`, on purpose: `dispatch`'s changes are undo-tracked,
  // which would let Ctrl+Z after switching files undo back into the
  // *previous* file's content; `setState` starts a genuinely fresh
  // document and a fresh (empty) history for the file just opened.
  const isFirstPathRef = useRef(true);
  useEffect(() => {
    if (isFirstPathRef.current) {
      isFirstPathRef.current = false;
      return;
    }
    const view = viewRef.current;
    if (!view) return;
    view.setState(
      EditorState.create({
        doc: value,
        extensions: buildExtensions(
          path,
          onChangeRef,
          attachmentSettingsRef,
          snippetSettingsRef,
          onCursorChangeRef,
        ),
      }),
    );
    onCursorChangeRef.current?.(view.state.selection.main.head);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  // Syncs an external content change (currently only the Properties panel
  // editing frontmatter, see FrontmatterPropertiesPanel.tsx) into the live
  // document. A no-op on every render caused by the user's own typing:
  // that already went view -> onChange -> parent state -> this `value`
  // prop, so the view's document already matches `value` by the time this
  // runs, and the comparison below skips the dispatch. minimalChange
  // (not a whole-document replace) keeps the change confined to wherever
  // the text actually differs, so CodeMirror can map the user's cursor
  // and scroll position through unaffected when the edit came from
  // somewhere else in the document (the common case: a frontmatter edit
  // while the cursor is down in the body).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    const change = minimalChange(current, value);
    view.dispatch({ changes: change });
  }, [value]);

  // Reveals an outline-requested range: moves the selection there and
  // scrolls it into view, without remounting or touching undo. Tracks the
  // last-applied requestId (not just reveal !== null) so clicking the
  // same outline row again still re-scrolls even though from/to and the
  // path haven't changed since the last request.
  const lastRevealIdRef = useRef<number | null>(null);
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !reveal || reveal.requestId === lastRevealIdRef.current) return;
    lastRevealIdRef.current = reveal.requestId;
    const docLength = view.state.doc.length;
    const from = Math.min(Math.max(reveal.from, 0), docLength);
    const to = Math.min(Math.max(reveal.to, from), docLength);
    view.dispatch({
      selection: EditorSelection.range(from, to),
      scrollIntoView: true,
    });
  }, [reveal]);

  // Applies an insert-heading-link request: replaces the current
  // selection with the requested text and moves the cursor after it,
  // through a normal `dispatch` (undo-tracked, unlike the reveal effect
  // above), matching spec section 9.4's "selection replacement and undo
  // behave like normal editor input." Tracks the last-applied requestId
  // for the same reason reveal does: inserting the exact same text twice
  // in a row must still re-apply.
  const lastInsertIdRef = useRef<number | null>(null);
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !insertRequest || insertRequest.requestId === lastInsertIdRef.current) return;
    lastInsertIdRef.current = insertRequest.requestId;
    const { from, to } = view.state.selection.main;
    view.dispatch({
      changes: { from, to, insert: insertRequest.text },
      selection: { anchor: from + insertRequest.text.length },
      scrollIntoView: true,
    });
  }, [insertRequest]);

  // Applies a "Copy block link" request (spec section 7.4): reads the
  // live document and cursor position (never the stale `value` prop,
  // which can lag an in-flight keystroke) straight from the CodeMirror
  // view, since only this effect has one; see
  // editor/blockLinkActions.ts's resolveBlockLinkAtCursor for the actual
  // block-lookup/id-generation logic this only drives. Unlike the reveal
  // and insertRequest effects above, this never touches the current
  // selection: the id, when one needs creating, is inserted at the
  // found block's own content end regardless of where the cursor sits
  // inside that block, and CodeMirror maps the existing selection
  // forward across that edit on its own (no explicit `selection` in the
  // dispatched spec), exactly like any other edit typed elsewhere on the
  // same line would.
  const lastBlockLinkRequestIdRef = useRef<number | null>(null);
  useEffect(() => {
    const view = viewRef.current;
    if (
      !view ||
      !blockLinkCopyRequest ||
      blockLinkCopyRequest.requestId === lastBlockLinkRequestIdRef.current
    ) {
      return;
    }
    lastBlockLinkRequestIdRef.current = blockLinkCopyRequest.requestId;
    const cursor = view.state.selection.main.head;
    const resolution = resolveBlockLinkAtCursor(view.state.doc.toString(), cursor);
    if (!resolution) return;
    if (resolution.insertion) {
      view.dispatch({ changes: { from: resolution.insertion.from, insert: resolution.insertion.text } });
    }
    void navigator.clipboard.writeText(resolution.linkText);
  }, [blockLinkCopyRequest]);

  // Applies a "Create block link" request (spec section 21 Phase 5): the
  // identical block-lookup/id-generation steps as "Copy block link"
  // above, dispatched the same way, but with no clipboard write at all.
  // See editor/blockLinkActions.ts's module doc comment for why Create
  // stops there instead of also inserting the link text (unlike a
  // heading's own Insert action): a block link is always resolved at the
  // cursor, so inserting its own link back at that same cursor would
  // splice a self-reference into the block it names.
  const lastBlockLinkCreateRequestIdRef = useRef<number | null>(null);
  useEffect(() => {
    const view = viewRef.current;
    if (
      !view ||
      !blockLinkCreateRequest ||
      blockLinkCreateRequest.requestId === lastBlockLinkCreateRequestIdRef.current
    ) {
      return;
    }
    lastBlockLinkCreateRequestIdRef.current = blockLinkCreateRequest.requestId;
    const cursor = view.state.selection.main.head;
    const resolution = resolveBlockLinkAtCursor(view.state.doc.toString(), cursor);
    if (!resolution?.insertion) return;
    view.dispatch({ changes: { from: resolution.insertion.from, insert: resolution.insertion.text } });
  }, [blockLinkCreateRequest]);

  return <div class="markdown-editor" ref={hostRef} />;
}
