import { useEffect, useMemo, useRef } from "preact/hooks";
import { marked, type Tokens } from "marked";
import DOMPurify from "dompurify";
import katex from "katex";
import "katex/dist/katex.min.css";
import { fileNameFromPath, resolveWikilink } from "../linking/store";
import { dirname, resolvePath } from "../workspace/paths";
import { fileSrc } from "../workspace/tauriBridge";
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
  /** The path of the note being previewed, used to resolve a local
   * relative image link against its own folder (see
   * markLocalImageAttachments above). Optional so existing callers/tests
   * that render source in isolation still work; without it, local image
   * links render exactly as before this feature existed (an unresolved,
   * broken `<img src="...">`). */
  notePath?: string;
}

// Placeholder src prefix for a locally-resolved image, the same "encode a
// same-document fragment, decode and act on it after render" trick
// renderWikilinks below uses for [[wikilinks]]: DOMPurify already allows a
// bare "#..." fragment through unchanged (proven by that existing usage),
// and the real, resolved src (an asset:// URL on desktop or a data: URL on
// Android, see workspace/tauriBridge.ts's fileSrc) can only be obtained
// asynchronously, which a synchronous marked.parse call cannot wait on.
const ATTACHMENT_SRC_PREFIX = "#leotheca-attachment=";

// Any URI with a scheme (http:, https:, data:, etc.) is left for marked's
// own default image rendering: an absolute remote URL is exactly what
// CONSTITUTION.md's "Offline by design" rule already relies on the app's
// CSP to block from ever loading, not something to resolve here, and a
// data: URI already works natively as an <img src> with no resolution
// needed at all.
function isLocalRelativeTarget(target: string): boolean {
  return !/^[a-z][a-z0-9+.-]*:/i.test(target) && !target.startsWith("//");
}

const IMAGE_MARKDOWN = /!\[([^\]]*)\]\(([^)]+)\)/g;

/**
 * Rewrites a local, relative markdown image target (`![alt](image.png)`,
 * resolved the same way a browser resolves a relative URL: against the
 * folder of the note that embeds it, regardless of where the file was
 * actually saved, see editor/attachments.ts) into the placeholder href
 * above, carrying the resolved absolute path so the effect in
 * MarkdownPreview below can look the real file up after render. Absolute
 * URLs and data: URIs are left untouched, see isLocalRelativeTarget.
 */
function markLocalImageAttachments(source: string, noteDir: string | null): string {
  if (!noteDir) return source;
  return source.replace(IMAGE_MARKDOWN, (match, alt: string, rawTarget: string) => {
    const trimmed = rawTarget.trim();
    const withTitle = /^(\S+)(\s+"[^"]*")?$/.exec(trimmed);
    if (!withTitle) return match;
    const [, target, titleSuffix = ""] = withTitle;
    if (!isLocalRelativeTarget(target)) return match;

    const absolutePath = resolvePath(noteDir, target);
    return `![${alt}](${ATTACHMENT_SRC_PREFIX}${encodeURIComponent(absolutePath)}${titleSuffix})`;
  });
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

export function MarkdownPreview({
  source,
  onOpenFile,
  mathRenderingEnabled = true,
  notePath,
}: MarkdownPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const noteDir = notePath ? dirname(notePath) : null;

  const html = useMemo(() => {
    mathRenderingActive = mathRenderingEnabled;
    const withAttachments = markLocalImageAttachments(source, noteDir);
    const rendered = marked.parse(renderWikilinks(withAttachments), {
      async: false,
    }) as string;
    return DOMPurify.sanitize(rendered);
  }, [source, mathRenderingEnabled, noteDir]);

  // marked.parse is synchronous, but resolving a placeholder src into a
  // real, loadable one (fileSrc, see workspace/tauriBridge.ts) is not: on
  // desktop it's an asset:// URL, on Android it's a data: URL read off
  // disk. Both need an await, so the real src is filled in here, after
  // render, the same pattern ImageViewer.tsx already uses for a
  // standalone image tab.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;

    const images = container.querySelectorAll<HTMLImageElement>(
      `img[src^="${ATTACHMENT_SRC_PREFIX}"]`,
    );
    for (const img of Array.from(images)) {
      const absolutePath = decodeURIComponent(
        img.getAttribute("src")!.slice(ATTACHMENT_SRC_PREFIX.length),
      );
      void fileSrc(absolutePath).then((resolved) => {
        if (!cancelled) img.src = resolved;
      });
    }

    return () => {
      cancelled = true;
    };
  }, [html]);

  return (
    <div
      class="markdown-preview"
      ref={containerRef}
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
