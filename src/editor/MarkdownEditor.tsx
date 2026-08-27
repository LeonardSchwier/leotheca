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

  useEffect(() => {
    if (!hostRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        history(),
        autocompletion({ override: [wikilinkCompletions] }),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, ...completionKeymap]),
        markdown({ codeLanguages: languages }),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        livePreviewExtension,
        imageAttachmentExtension(path, attachmentSettingsRef),
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
      ],
    });

    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Re-create the editor when switching files; content sync for the same
    // file is handled by the caller diffing `value` if needed later.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  return <div class="markdown-editor" ref={hostRef} />;
}
