export interface FsEntry {
  name: string;
  path: string;
  isDir: boolean;
  /** Milliseconds since the Unix epoch, matching Java's/JS's own
   * convention (Rust's is converted to this unit, not left in seconds, so
   * neither platform's cache logic needs to know which platform produced
   * a given value). Undefined for a directory, or on a platform/entry
   * where the underlying listing call didn't have it cheaply available. */
  mtime?: number;
  /** File size in bytes. Only populated by findAllFiles (fileTreeStore.ts's
   * runSearch uses it to bound a content-read batch's combined size, see
   * SEARCH_BATCH_MAX_BYTES: a batch bounded only by file count still let a
   * handful of unusually large files produce a single native call's JSON
   * response too large to allocate, confirmed by a real on-device
   * OutOfMemoryError, 2026-08-28), not by any other call site. Undefined
   * for a directory or wherever not populated. */
  size?: number;
}

export type EditorMode = "live" | "source" | "reading";

export type TabKind = "text" | "image" | "canvas";

export interface OpenTab {
  path: string;
  name: string;
  kind: TabKind;
  /** Only meaningful for kind "text"; empty for images. */
  content: string;
  dirty: boolean;
}

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "bmp",
  "ico",
]);

export function isImagePath(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase();
  return !!ext && IMAGE_EXTENSIONS.has(ext);
}

export function isCanvasPath(path: string): boolean {
  return path.toLowerCase().endsWith(".canvas");
}

/** Classifies resources consistently for interactive opening and session restore. */
export function classifyWorkspaceResource(path: string): TabKind {
  if (isImagePath(path)) return "image";
  if (isCanvasPath(path)) return "canvas";
  return "text";
}
