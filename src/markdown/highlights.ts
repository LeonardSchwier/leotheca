import type { Tokens } from "marked";

export type HighlightColor = "red" | "orange" | "green" | "blue" | "purple";

const COLOR_EMOJI: Record<string, HighlightColor> = {
  "🔴": "red",
  "🟠": "orange",
  "🟢": "green",
  "🔵": "blue",
  "🟣": "purple",
};

const HIGHLIGHT_RE = /^==([^=\n]+?)==/;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface HighlightToken extends Tokens.Generic {
  type: "inlineHighlight";
  text: string;
  color: HighlightColor | null;
}

export const highlightExtension = {
  name: "inlineHighlight",
  level: "inline" as const,
  start: (src: string) => src.indexOf("=="),
  tokenizer(src: string) {
    const match = HIGHLIGHT_RE.exec(src);
    if (!match) return undefined;
    let content = match[1];
    let color: HighlightColor | null = null;
    const codePoint = content.codePointAt(0);
    if (codePoint !== undefined) {
      const leading = String.fromCodePoint(codePoint);
      if (COLOR_EMOJI[leading]) {
        color = COLOR_EMOJI[leading];
        content = content.slice(leading.length).replace(/^\s+/, "");
      }
    }
    return { type: "inlineHighlight", raw: match[0], text: content, color };
  },
  renderer(token: Tokens.Generic) {
    const highlight = token as HighlightToken;
    const inner = escapeHtml(highlight.text);
    if (highlight.color) return `<mark class="hl-${highlight.color}">${inner}</mark>`;
    return `<mark>${inner}</mark>`;
  },
};
