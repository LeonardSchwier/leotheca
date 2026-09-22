// Mermaid diagram rendering for the Preview pane.
//
// Architecture: the app's main parse uses `marked.parse(..., { async: false })`,
// so the extension cannot return a Promise. Instead, the marked extension
// emits a placeholder div carrying the diagram source in a data attribute.
// MarkdownPreview's useEffect then finds these placeholders in the rendered
// DOM and replaces each one with real SVG by calling renderMermaidToSvg(),
// which is async and safe to await in an effect context.
//
// Why a block-level marked extension (rather than a text preprocessing pass):
// a ```mermaid fence is a fenced code block to the lexer; the built-in code
// tokenizer would consume it before any inline-level text extension could see
// it. A text-pass rewrite would have to guess fence boundaries by hand.
//
// Sanitization: mermaid's securityLevel:'strict' plus DOMPurify (the app's
// final pipeline step) means diagram labels cannot inject script markup.
// The sanitizeMermaidSvg helper below is a second, defense-in-depth layer.
import { marked, type Tokens } from "marked";
import mermaid from "mermaid";

let mermaidRenderingActive = true;

export function setMermaidRenderingEnabled(enabled: boolean): void {
  mermaidRenderingActive = enabled;
}

let mermaidInitialized = false;
function ensureMermaidInitialized() {
  if (mermaidInitialized) return;
  mermaidInitialized = true;
  mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
}

let mermaidCounter = 0;

/**
 * Render a single mermaid diagram source string to sanitized SVG HTML,
 * falling back to a plain code block on any parse/render failure.
 * MarkdownPreview's useEffect calls this for each placeholder element.
 */
export async function renderMermaidToSvg(source: string): Promise<string> {
  ensureMermaidInitialized();
  const id = `mermaid-render-${mermaidCounter++}`;
  return mermaid
    .render(id, source)
    .then((result) => {
      if (typeof result.svg !== "string" || result.svg.length === 0) {
        throw new Error("mermaid produced no SVG");
      }
      return sanitizeMermaidSvg(result.svg);
    })
    .catch(() => codeBlockFallback(source));
}

const mermaidExtension = {
  name: "mermaid",
  level: "block" as const,
  start(src: string): number | undefined {
    const match = /^[ ]{0,3}```mermaid(\s|$)/m.exec(src);
    return match ? match.index : undefined;
  },
  tokenizer(src: string): Tokens.Generic | undefined {
    if (!mermaidRenderingActive) return undefined;
    const fence = /^(`{3,}|~{3,})mermaid[ \t]*\r?\n?/.exec(src);
    if (!fence) return undefined;
    const lines = src.slice(fence[0].length).split("\n");
    const bodyLines: string[] = [];
    let closed = false;
    for (let i = 0; i < lines.length; i++) {
      if (/^[ ]{0,3}```+[ \t]*$/.test(lines[i])) {
        closed = true;
        break;
      }
      bodyLines.push(lines[i]);
    }
    if (!closed) return undefined;
    const raw = bodyLines.join("\n").trim();
    if (!raw) return undefined;
    return { type: "mermaid", raw: fence[0] + bodyLines.join("\n") + "\n```", text: raw };
  },
  renderer(token: Tokens.Generic): string {
    // encodeURIComponent keeps the attribute value on a single line so
    // DOMPurify doesn't strip it (multi-line data attributes get dropped),
    // and unlike btoa it is safe for non-Latin1 source text (emoji, CJK,
    // accented labels) where btoa would throw InvalidCharacterError and
    // leave the user with an empty code block.
    const encoded = encodeURIComponent((token.text as string));
    return `<div class="mermaid-placeholder" data-mermaid-source="${encoded}"></div>`;
  },
};

export function sanitizeMermaidSvg(svg: string): string {
  return svg
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src|xlink:href)\s*=\s*"(?:javascript:|data:text\/html)[^"]*"/gi, "$1=\"#\"")
    .replace(/(href|src|xlink:href)\s*=\s*(?:javascript:|data:text\/html)[^\s>]+/gi, "$1=#");
}

function codeBlockFallback(source: string): string {
  const escaped = source
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<pre><code class="language-mermaid">${escaped}</code></pre>`;
}

// marked 15.x: the pack form ({ extensions: [...] }) is required; a bare
// extension object passed directly to `marked.use` is silently dropped.
marked.use({ extensions: [mermaidExtension] });
