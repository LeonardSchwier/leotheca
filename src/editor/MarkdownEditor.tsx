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
import { readTextFile } from "../workspace/tauriBridge";
import { livePreviewExtension } from "./livePreview";
import { attachmentsInsertText, type PastedOrDroppedFile } from "./attachments";
import { minimalChange } from "./textDiff";
import { parseSnippets, snippetExpansion } from "./snippets";

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
 * a block-reference fragment (`[[Note#^block-id]]`, spec section 7): block
 * completion is explicitly out of scope for this phase (see the F04
 * Phases 3-5 follow-up in ROADMAP.md), so typing `^` there simply shows no
 * heading suggestions rather than misclassifying it as a heading query. */
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
    autocompletion({ override: [wikilinkCompletions, headingLinkCompletions(path)] }),
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

  return <div class="markdown-editor" ref={hostRef} />;
}
