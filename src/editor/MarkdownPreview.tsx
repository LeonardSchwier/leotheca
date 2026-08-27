import { useMemo } from "preact/hooks";
import { marked, type Tokens } from "marked";
import DOMPurify from "dompurify";
import katex from "katex";
import "katex/dist/katex.min.css";
import { fileNameFromPath, resolveWikilink } from "../linking/store";
import "../linking/linking.css";

marked.setOptions({ gfm: true, breaks: false });

/**
 * $inline$ and $$block$$ LaTeX math, rendered with KaTeX (a pure
 * client-side renderer with its own bundled fonts, no CDN or network
 * fetch involved, required by CONSTITUTION.md's "Offline by design"
 * rule). Registered as marked extensions rather than a raw text
 * pre-processing pass (compare renderWikilinks below) so `$` inside a
 * code span or block is left alone automatically: marked's inline lexer
 * only ever tries this tokenizer at positions the code-span tokenizer
 * hasn't already consumed.
 *
 * `mathRenderingActive` is a module-level flag rather than a closure
 * argument because marked extensions are registered once, globally, on
 * marked's shared singleton (see marked.use below); MarkdownPreview sets
 * it synchronously right before each parse call, from its own
 * mathRenderingEnabled prop (see WorkspaceSettings.mathRenderingEnabled),
 * and nothing else reads or writes it in between since marked.parse with
 * `async: false` runs entirely synchronously.
 */
let mathRenderingActive = true;

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderMath(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex, { throwOnError: false, displayMode });
  } catch {
    // katex's own throwOnError: false only guards LaTeX parse errors, not
    // every failure mode; fall back to the literal source rather than
    // crashing the whole preview pane over one malformed expression.
    return escapeHtml(displayMode ? `$$${tex}$$` : `$${tex}$`);
  }
}

// $$...$$, matching across lines. Market Solution #2's own convention: the
// closing $$ can be on the same line or a later one.
const BLOCK_MATH = /^\$\$([\s\S]+?)\$\$/;

// $...$, deliberately excluding a leading or trailing space inside the
// delimiters (Market Solution #2's own convention too) so ordinary currency
// text like "$5 and $10" is never mistaken for math.
const INLINE_MATH = /^\$((?!\s)(?:\\\$|[^$\n])+?)(?<!\s)\$(?!\$)/;

marked.use({
  extensions: [
    {
      name: "blockMath",
      level: "block",
      start: (src: string) => src.match(/\$\$/)?.index,
      tokenizer(src: string) {
        if (!mathRenderingActive) return undefined;
        const match = BLOCK_MATH.exec(src);
        if (!match) return undefined;
        return { type: "blockMath", raw: match[0], text: match[1].trim() };
      },
      renderer: (token: Tokens.Generic) => renderMath(token.text as string, true),
    },
    {
      name: "inlineMath",
      level: "inline",
      start: (src: string) => src.indexOf("$"),
      tokenizer(src: string) {
        if (!mathRenderingActive) return undefined;
        const match = INLINE_MATH.exec(src);
        if (!match) return undefined;
        return { type: "inlineMath", raw: match[0], text: match[1] };
      },
      renderer: (token: Tokens.Generic) => renderMath(token.text as string, false),
    },
  ],
});

interface MarkdownPreviewProps {
  source: string;
  onOpenFile?: (path: string, name: string) => void;
  /** Whether $inline$ / $$block$$ math renders via KaTeX at all; when
   * false, that syntax is left as ordinary text, same as before this
   * feature existed. Defaults to on, see
   * WorkspaceSettings.mathRenderingEnabled for why. */
  mathRenderingEnabled?: boolean;
}

function renderWikilinks(source: string): string {
  return source.replace(/\[\[([^\]]+)\]\]/g, (match, rawTarget: string) => {
    const target = rawTarget.trim();
    if (!target) return match;

    const label = target.replace(/([\\[\]])/g, "\\$1");
    const resolved = resolveWikilink(target);
    const href = `#leotheca-wikilink=${encodeURIComponent(target)}${resolved ? "&resolved=1" : ""}`;
    return `[${label}](${href})`;
  });
}

export function MarkdownPreview({ source, onOpenFile, mathRenderingEnabled = true }: MarkdownPreviewProps) {
  const html = useMemo(() => {
    mathRenderingActive = mathRenderingEnabled;
    const rendered = marked.parse(renderWikilinks(source), {
      async: false,
    }) as string;
    return DOMPurify.sanitize(rendered);
  }, [source, mathRenderingEnabled]);

  return (
    <div
      class="markdown-preview"
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={(event) => {
        const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>(
          'a[href^="#leotheca-wikilink="]',
        );
        if (!anchor) return;

        event.preventDefault();
        const target = decodeURIComponent(
          anchor.hash.slice("#leotheca-wikilink=".length).split("&")[0],
        );
        const path = resolveWikilink(target);
        if (path) onOpenFile?.(path, fileNameFromPath(path));
      }}
    />
  );
}
