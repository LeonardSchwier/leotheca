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
// The sanitizeMermaidSvg helper below is a second, defense-in-depth layer
// that adds DOMPurify SVG-profile sanitization on top of the regex checks.
import { marked, type Tokens } from "marked";
import mermaid from "mermaid";
import DOMPurify from "dompurify";

let mermaidRenderingActive = true;

export function setMermaidRenderingEnabled(enabled: boolean): void {
  mermaidRenderingActive = enabled;
}

export type MermaidTheme = "light" | "dark";

/**
 * The theme the app is showing right now: an explicit `data-theme` on the
 * root wins (src/settings/store.ts), otherwise the OS preference, which is
 * what theme.css follows when `data-theme` is absent.
 */
export function getAppMermaidTheme(): MermaidTheme {
  if (typeof document === "undefined") return "light";
  const explicit = document.documentElement.getAttribute("data-theme");
  if (explicit === "dark") return "dark";
  if (explicit === "light") return "light";
  const dark =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  return dark ? "dark" : "light";
}

/**
 * Call `onChange` whenever the app theme flips (data-theme attribute or OS
 * preference). Returns the unsubscribe function.
 */
export function watchAppMermaidTheme(
  onChange: (theme: MermaidTheme) => void,
): () => void {
  if (typeof document === "undefined") return () => {};
  let last = getAppMermaidTheme();
  const check = () => {
    const next = getAppMermaidTheme();
    if (next === last) return;
    last = next;
    onChange(next);
  };
  let observer: MutationObserver | undefined;
  if (typeof MutationObserver !== "undefined") {
    observer = new MutationObserver(check);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
  }
  const media =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)")
      : undefined;
  media?.addEventListener?.("change", check);
  return () => {
    observer?.disconnect();
    media?.removeEventListener?.("change", check);
  };
}

let initializedTheme: MermaidTheme | null = null;
function ensureMermaidInitialized(theme: MermaidTheme) {
  if (initializedTheme === theme) return;
  initializedTheme = theme;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: theme === "dark" ? "dark" : "default",
    fontFamily: "inherit",
    suppressErrorRendering: true,
    flowchart: { useMaxWidth: true },
    sequence: { useMaxWidth: true },
    gantt: { useMaxWidth: true },
  });
}

let mermaidCounter = 0;

/**
 * Render a single mermaid diagram source string to sanitized SVG HTML,
 * falling back to a plain code block on any parse/render failure.
 * MarkdownPreview's useEffect calls this for each placeholder element.
 * `theme` defaults to the app's current theme.
 */
export async function renderMermaidToSvg(
  source: string,
  theme: MermaidTheme = getAppMermaidTheme(),
): Promise<string> {
  const id = `mermaid-render-${mermaidCounter++}`;
  try {
    ensureMermaidInitialized(theme);
    const result = await mermaid.render(id, source);
    if (typeof result.svg !== "string" || result.svg.length === 0) {
      throw new Error("mermaid produced no SVG");
    }
    return sanitizeMermaidSvg(result.svg);
  } catch (error) {
    // A failed parse can leave mermaid's scratch element in the document.
    if (typeof document !== "undefined") {
      document.getElementById(id)?.remove();
      document.getElementById(`d${id}`)?.remove();
    }
    return mermaidErrorHtml(source, error);
  }
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
    return {
      type: "mermaid",
      raw: fence[0] + bodyLines.join("\n") + "\n```",
      text: raw,
    };
  },
  renderer(token: Tokens.Generic): string {
    // encodeURIComponent keeps the attribute value on a single line so
    // DOMPurify doesn't strip it (multi-line data attributes get dropped),
    // and unlike btoa it is safe for non-Latin1 source text (emoji, CJK,
    // accented labels) where btoa would throw InvalidCharacterError and
    // leave the user with an empty code block.
    const encoded = encodeURIComponent(token.text as string);
    return `<div class="mermaid-placeholder" data-mermaid-source="${encoded}"></div>`;
  },
};

export function sanitizeMermaidSvg(svg: string): string {
  const regexSanitized = svg
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(
      /(href|src|xlink:href)\s*=\s*"(?:javascript:|data:text\/html)[^"]*"/gi,
      '$1="#"',
    )
    .replace(
      /(href|src|xlink:href)\s*=\s*(?:javascript:|data:text\/html)[^\s>]+/gi,
      "$1=#",
    );
  // DOMPurify (default profile) as a second, defense-in-depth layer.
  // The default profile allows both SVG and HTML elements (mermaid emits
  // <a>, <img>, <text>, <path>, etc.) and strips <script>, inline event
  // handlers, and dangerous URL schemes. FORBID_TAGS explicitly removes
  // <foreignObject> (can carry live HTML with scripts) and <use> (can
  // reference external SVG resources).
  return DOMPurify.sanitize(regexSanitized, {
    FORBID_TAGS: [
      "foreignObject",
      "use",
      "script",
      "iframe",
      "object",
      "embed",
    ],
  });
}

// The injection-site guard.
//
// MarkdownPreview's mermaid effect writes this module's SVG output straight
// into the DOM via `el.outerHTML = svg` *after* the container's main
// DOMPurify pass (W-2026-11-01-2). `sanitizeMermaidSvg` above is
// defense-in-depth and already covers the common payloads, but a future
// mermaid release that emits raw <script>/<iframe>/<object>, inline
// on* handlers, or dangerous href schemes would land unsanitized at the
// injection site. This function is the last, explicit guard: it applies
// the same regex strip plus DOMPurify with the SVG profile and a FORBID
// list, so nothing dangerous survives no matter what mermaid emits.
export function sanitizeMermaidSvgForInjection(svg: string): string {
  const regexSanitized = svg
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(
      /(href|src|xlink:href)\s*=\s*"(?:javascript:|data:text\/html)[^"]*"/gi,
      '$1="#"',
    )
    .replace(
      /(href|src|xlink:href)\s*=\s*(?:javascript:|data:text\/html)[^\s>]+/gi,
      "$1=#",
    );
  return DOMPurify.sanitize(regexSanitized, {
    USE_PROFILES: { svg: true },
    FORBID_TAGS: [
      "script",
      "iframe",
      "object",
      "embed",
      "foreignObject",
      "use",
    ],
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * The error display: a notice with the reason, then the diagram source as a
 * plain code block so the user can still read and fix it. Never throws.
 */
export function mermaidErrorHtml(source: string, error?: unknown): string {
  const reason =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const firstLine = reason.split("\n")[0].trim().slice(0, 200);
  const notice = firstLine
    ? `<p class="mermaid-error-message">${escapeHtml(firstLine)}</p>`
    : "";
  return (
    `<div class="mermaid-error" role="note">` +
    `<p class="mermaid-error-title">This diagram could not be rendered.</p>${notice}` +
    `<pre><code class="language-mermaid">${escapeHtml(source)}</code></pre></div>`
  );
}

// marked 15.x: the pack form ({ extensions: [...] }) is required; a bare
// extension object passed directly to `marked.use` is silently dropped.
marked.use({ extensions: [mermaidExtension] });
