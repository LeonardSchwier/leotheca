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

export interface MarkdownEditorProps {
  path: string;
  value: string;
  onChange: (value: string) => void;
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

/**
 * CodeMirror 6 source-mode editor with markdown syntax highlighting and
 * inline live-preview decorations (headings, bold, italic, inline code,
 * wikilinks, and bullet list markers render in place; their markup hides
 * except on the line being edited, see livePreview.ts).
 */
export function MarkdownEditor({ path, value, onChange }: MarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

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
