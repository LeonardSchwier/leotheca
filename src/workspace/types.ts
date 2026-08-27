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
}

export type EditorMode = "live" | "source" | "reading";

export type TabKind = "text" | "image";

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
