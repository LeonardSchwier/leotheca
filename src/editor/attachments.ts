import { dirname, relativePathBetween } from "../workspace/paths";
import { writeWorkspaceBinaryFile } from "../workspace/tauriBridge";

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/svg+xml": "svg",
};

// Characters a plain-path-string join (see paths.ts) or a SAF display
// name could otherwise misread as a path separator or a reserved name.
const UNSAFE_NAME_CHARS = /[\\/:*?"<>|]/g;

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

function withSuffix(name: string, suffix: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0
    ? `${name.slice(0, dot)}-${suffix}${name.slice(dot)}`
    : `${name}-${suffix}`;
}

/**
 * Picks a file name for a newly saved attachment. A dropped file's own
 * name (sanitized of path-separator-like characters) is preserved,
 * matching how a file manager drop behaves; clipboard image data has no
 * meaningful name of its own (browsers typically hand it over as a
 * generic "image.png"), so that case falls back to a generated name, the
 * same "Pasted image <timestamp>" convention the wider note-taking
 * ecosystem's own paste handling uses. A random suffix is always
 * appended: neither platform's bridge exposes a cheap "does this file
 * already exist" check, so collision-avoidance here is generative, not
 * checked.
 */
export function attachmentFileName(
  mimeType: string,
  now: number,
  originalName?: string,
): string {
  const suffix = randomSuffix();
  const cleanOriginal = originalName?.trim().replace(UNSAFE_NAME_CHARS, "-");
  const hasRealName = cleanOriginal && !/^image(\.\w+)?$/i.test(cleanOriginal);
  if (hasRealName) return withSuffix(cleanOriginal, suffix);

  const ext = EXTENSION_BY_MIME[mimeType] ?? "png";
  return `Pasted image ${now}-${suffix}.${ext}`;
}

/**
 * Where a new attachment should be saved: the workspace's configured
 * attachments folder if one is set (WorkspaceSettings.attachmentsFolder),
 * otherwise next to the note that embeds it, this app's behavior before
 * that setting existed and still the default a bare markdown image link
 * implies.
 */
export function attachmentSaveDir(
  workspaceRoot: string,
  notePath: string,
  attachmentsFolder: string,
): string {
  const trimmed = attachmentsFolder.trim().replace(/^\/+|\/+$/g, "");
  return trimmed ? `${workspaceRoot}/${trimmed}` : dirname(notePath);
}

export interface SaveAttachmentOptions {
  bytes: Uint8Array;
  mimeType: string;
  notePath: string;
  workspaceRoot: string;
  attachmentsFolder: string;
  /** Caller-supplied timestamp (Date.now()) rather than read internally,
   * so the generated file name is deterministic and testable. */
  now: number;
  originalName?: string;
}

/**
 * Saves image bytes as a new attachment and returns the markdown link
 * target to insert at the cursor: a path relative to the note's own
 * folder, correct regardless of where the attachment was actually saved
 * (see attachmentSaveDir), since Preview resolves relative image links
 * the same way it always has, against the embedding note's own folder.
 */
export async function saveAttachment(
  options: SaveAttachmentOptions,
): Promise<string> {
  const {
    bytes,
    mimeType,
    notePath,
    workspaceRoot,
    attachmentsFolder,
    now,
    originalName,
  } = options;
  const dir = attachmentSaveDir(workspaceRoot, notePath, attachmentsFolder);
  const name = attachmentFileName(mimeType, now, originalName);
  const fullPath = `${dir}/${name}`;
  await writeWorkspaceBinaryFile(
    workspaceRoot,
    relativePathBetween(workspaceRoot, fullPath),
    bytes,
  );
  return relativePathBetween(dirname(notePath), fullPath);
}

export interface PastedOrDroppedFile {
  bytes: Uint8Array;
  mimeType: string;
  originalName?: string;
}

export interface InsertAttachmentsContext {
  notePath: string;
  workspaceRoot: string;
  attachmentsFolder: string;
  now: number;
}

/**
 * Saves one or more pasted/dropped image files as attachments and
 * returns the combined markdown text to insert at the cursor or drop
 * position: each file on its own `![]()` line, in the order given. Kept
 * separate from the CodeMirror wiring in MarkdownEditor.tsx (extracting
 * File objects from a paste/drop event, dispatching the actual editor
 * transaction) so this orchestration is unit-testable without a real
 * EditorView or DOM events.
 */
export async function attachmentsInsertText(
  files: PastedOrDroppedFile[],
  context: InsertAttachmentsContext,
): Promise<string> {
  const relativeLinks: string[] = [];
  for (const file of files) {
    const relative = await saveAttachment({
      bytes: file.bytes,
      mimeType: file.mimeType,
      originalName: file.originalName,
      notePath: context.notePath,
      workspaceRoot: context.workspaceRoot,
      attachmentsFolder: context.attachmentsFolder,
      now: context.now,
    });
    relativeLinks.push(relative);
  }
  return relativeLinks.map((link) => `![](${link})`).join("\n");
}
