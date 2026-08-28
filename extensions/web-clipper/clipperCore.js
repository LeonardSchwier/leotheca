/* global Node, URL */

(() => {
  const BLOCK_TAGS = new Set(["ARTICLE", "BLOCKQUOTE", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "P", "PRE", "SECTION"]);
  const IGNORED_TAGS = new Set(["NOSCRIPT", "SCRIPT", "STYLE"]);

  function cleanText(value) {
    return value.replace(/\s+/g, " ").trim();
  }

  function markdownLink(text, href) {
    try {
      const url = new URL(href);
      if (url.protocol === "http:" || url.protocol === "https:") return `[${text}](${url.href})`;
    } catch {
      // A selection can contain a relative or malformed link. Keep its text
      // rather than creating Markdown that may resolve unexpectedly later.
    }
    return text;
  }

  function nodeToMarkdown(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const element = node;
    if (IGNORED_TAGS.has(element.tagName)) return "";
    const content = Array.from(element.childNodes, nodeToMarkdown).join("");
    const text = cleanText(content);
    if (!text) return "";

    if (/^H[1-6]$/.test(element.tagName)) return `${"#".repeat(Number(element.tagName[1]))} ${text}\n\n`;
    if (element.tagName === "STRONG" || element.tagName === "B") return `**${text}**`;
    if (element.tagName === "EM" || element.tagName === "I") return `*${text}*`;
    if (element.tagName === "CODE") return `\`${text}\``;
    if (element.tagName === "A") return markdownLink(text, element.getAttribute("href") ?? "");
    if (element.tagName === "LI") return `- ${text}\n`;
    if (element.tagName === "BR") return "\n";
    if (BLOCK_TAGS.has(element.tagName)) return `${text}\n\n`;
    return content;
  }

  function fragmentToMarkdown(fragment) {
    return Array.from(fragment.childNodes, nodeToMarkdown)
      .join("")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function safeSourceUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
    } catch {
      return null;
    }
  }

  function sanitizeFileName(value) {
    const base = cleanText(value).replace(/[\\/:*?"<>|]/g, "-").replace(/\.+$/g, "").slice(0, 80);
    return base || "Clipped note";
  }

  function buildClip({ title, fragment, sourceUrl, includeSource }) {
    const excerpt = fragmentToMarkdown(fragment);
    if (!excerpt) throw new Error("Select some readable page content before clipping.");

    const heading = cleanText(title) || "Clipped note";
    const source = includeSource ? safeSourceUrl(sourceUrl) : null;
    const markdown = `# ${heading}\n\n${excerpt}${source ? `\n\nSource: ${source}` : ""}\n`;
    return { filename: `${sanitizeFileName(heading)}.md`, markdown };
  }

  globalThis.LeothecaClipperCore = { buildClip, fragmentToMarkdown, sanitizeFileName };
})();
