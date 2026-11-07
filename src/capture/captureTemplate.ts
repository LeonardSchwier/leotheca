/**
 * Quick Capture: optional note template.
 *
 * A template is an ordinary Markdown file from the workspace's templates
 * folder. It shapes one capture through single-pass placeholder substitution.
 * Nothing here touches the network or a new storage format.
 */

import { readTextFile } from "../workspace/tauriBridge";

/** Templates larger than this are rejected so a stray huge file cannot freeze or exhaust the sheet. */
export const MAX_CAPTURE_TEMPLATE_BYTES = 64 * 1024;

export interface CaptureTemplateValues {
  content: string;
  title?: string;
  url?: string;
  date?: Date;
}

const PLACEHOLDER = /\{\{\s*(content|title|url|date|time)\s*\}\}/g;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Renders `template` for one capture. Substitution is a single pass over the
 * template, so values (including the capture body) are never re-scanned and a
 * body containing "{{title}}" stays literal. Unknown placeholders are left as-is.
 *
 * If the template has no `{{content}}`, the body is appended after it so no
 * typed text is ever dropped. A URL not consumed by `{{url}}` becomes a
 * trailing `Source: <url>` line, matching the plain capture format.
 */
export function renderCaptureTemplate(
  template: string,
  values: CaptureTemplateValues,
): string {
  const when = values.date ?? new Date();
  const dateText = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`;
  const timeText = `${pad(when.getHours())}:${pad(when.getMinutes())}`;
  const body = values.content.trim();
  const url = values.url?.trim() ?? "";
  const title = values.title?.trim() ?? "";

  let usedContent = false;
  let usedUrl = false;
  let rendered = template.replace(PLACEHOLDER, (_match, name: string) => {
    switch (name) {
      case "content":
        usedContent = true;
        return body;
      case "title":
        return title;
      case "url":
        usedUrl = true;
        return url;
      case "date":
        return dateText;
      default:
        return timeText;
    }
  });

  const lineEnding = rendered.includes("\r\n") ? "\r\n" : "\n";
  rendered = rendered.replace(/(\r?\n)+$/, "");
  if (!usedContent) {
    rendered =
      rendered === "" ? body : `${rendered}${lineEnding}${lineEnding}${body}`;
  }
  if (url && !usedUrl) {
    rendered = `${rendered}${lineEnding}${lineEnding}Source: <${url}>`;
  }
  return rendered;
}

/** True when `path` is a direct child of `<root>/<templatesFolder>` with no traversal. */
export function isCaptureTemplatePathAllowed(
  workspaceRoot: string,
  templatesFolder: string,
  path: string,
): boolean {
  const normalized = path.replace(/\\/g, "/");
  if (normalized.split("/").some((segment) => segment === "..")) return false;
  const folder = templatesFolder.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const root = workspaceRoot.replace(/\\/g, "/").replace(/\/+$/, "");
  const prefix = folder ? `${root}/${folder}/` : `${root}/`;
  if (!normalized.startsWith(prefix)) return false;
  const rest = normalized.slice(prefix.length);
  return rest.length > 0 && !rest.includes("/");
}

/**
 * Reads a template through the workspace bridge. Throws a user-readable Error
 * (never the raw bridge error, which can carry paths) when the path escapes
 * the templates folder, the read fails, or the file is too large.
 */
export async function loadCaptureTemplate(
  workspaceRoot: string,
  templatesFolder: string,
  path: string,
): Promise<string> {
  if (!isCaptureTemplatePathAllowed(workspaceRoot, templatesFolder, path)) {
    throw new Error("Template is not inside the templates folder");
  }
  let text: string;
  try {
    text = await readTextFile(path);
  } catch {
    throw new Error("Template could not be read");
  }
  if (typeof text !== "string") throw new Error("Template could not be read");
  if (text.length > MAX_CAPTURE_TEMPLATE_BYTES) {
    throw new Error("Template is larger than 64 KiB");
  }
  return text;
}
