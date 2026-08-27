import { useMemo } from "preact/hooks";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { fileNameFromPath, resolveWikilink } from "../linking/store";
import "../linking/linking.css";

marked.setOptions({ gfm: true, breaks: false });

interface MarkdownPreviewProps {
  source: string;
  onOpenFile?: (path: string, name: string) => void;
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

export function MarkdownPreview({ source, onOpenFile }: MarkdownPreviewProps) {
  const html = useMemo(() => {
    const rendered = marked.parse(renderWikilinks(source), {
      async: false,
    }) as string;
    return DOMPurify.sanitize(rendered);
  }, [source]);

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
