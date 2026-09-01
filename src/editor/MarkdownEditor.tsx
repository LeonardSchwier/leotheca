import { useEffect, useRef } from "preact/hooks";
import { EditorState } from "@codemirror/state";
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
import { linkIndex } from "../linking/store";
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
}

/** Suggests note names (and, when the setting is on, note aliases) while
 * typing `[[`, sourced from the same link index the backlinks panel and
 * preview link resolution already build (see src/linking/store.ts). Only
 * offers already-existing notes; there is no "create a new note from
 * here" affordance yet. */
export function wikilinkCompletions(context: CompletionContext): CompletionResult | null {
  const match = context.matchBefore(/\[\[([^[\]\n]*)$/);
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
) {
  return [
    lineNumbers(),
    highlightActiveLine(),
    history(),
    autocompletion({ override: [wikilinkCompletions] }),
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
}: MarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
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
      extensions: buildExtensions(path, onChangeRef, attachmentSettingsRef, snippetSettingsRef),
    });

    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;

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
        extensions: buildExtensions(path, onChangeRef, attachmentSettingsRef, snippetSettingsRef),
      }),
    );
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

  return <div class="markdown-editor" ref={hostRef} />;
}
