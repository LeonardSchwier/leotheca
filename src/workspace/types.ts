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
  /** File size in bytes. Populated by findAllFiles (fileTreeStore.ts's
   * runSearch uses it to bound a content-read batch's combined size, see
   * SEARCH_BATCH_MAX_BYTES: a batch bounded only by file count still let a
   * handful of unusually large files produce a single native call's JSON
   * response too large to allocate, confirmed by a real on-device
   * OutOfMemoryError, 2026-08-28) and by findMarkdownFiles (linking/store.ts's
   * rebuildLinkIndex uses it alongside mtime as a stronger cache-identity
   * check, audit follow-up F-012, since a coarse or colliding mtime alone
   * can hide changed content). Undefined for a directory or wherever not
   * populated. */
  size?: number;
}

export type EditorMode = "live" | "source" | "reading";

export type TabKind = "text" | "image" | "canvas";

/** The one in-memory document record for an open workspace resource. Its
 * content and save state are never copied into an editor group, so future
 * split views cannot create competing save authorities for one path. */
export interface OpenDocument {
  path: string;
  name: string;
  kind: TabKind;
  /** Only meaningful for kind "text"; empty for images. */
  content: string;
  dirty: boolean;
  /** Non-null when the last save attempt failed. The user can see this
   * error and retry; the tab stays dirty until a successful write. */
  saveError: string | null;
}

/** Compatibility name for the current one-group tab UI. F07 Phase 1 keeps
 * this alias so callers can migrate to `OpenDocument` without changing the
 * visible tab behavior. */
export type OpenTab = OpenDocument;

export type EditorGroupId = "primary" | "secondary";

export interface EditorGroupState {
  id: EditorGroupId;
  tabPaths: string[];
  pinnedPaths: string[];
  activePath: string | null;
}

/** Logical editor placement, deliberately separate from OpenDocument
 * content. Phase 1 only exposes the permanent primary group; later F07
 * phases add pinning, secondary placement, view modes, and persistence. */
export interface EditorLayoutState {
  activeGroupId: EditorGroupId;
  groups: {
    primary: EditorGroupState;
    secondary?: EditorGroupState;
  };
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

const TEXT_EXTENSIONS = new Set([
  "md", "markdown", "txt", "text", "txt",
  "html", "htm", "css", "js", "jsx", "ts", "tsx", "vue", "svelte",
  "json", "yml", "yaml", "toml", "xml", "csv",
  "sh", "bash", "zsh", "fish", "bat", "ps1", "psm1",
  "py", "pyw", "rb", "pl", "pm",
  "c", "h", "cpp", "cxx", "cc", "hpp", "hh",
  "java", "kt", "kts", "groovy", "scala",
  "go", "rs", "swift", "m", "mm",
  "sql", "graphql", "gql",
  "ini", "cfg", "conf", "env", "properties",
  "log", "rst", "adoc", "org",
  "less", "sass", "scss",
  "sh", "bash", "zsh",
  "php", "erb", "eex", "heex", "leex",
  "vue", "svelte", "astro",
  "ex", "exs",
]);

/** Whitelist of file extensions that the app treats as text for full-text
 * search content reads. Non-whitelisted extensions are treated like images:
 * their name can match a search query, but their content is never read.
 *
 * This is F-005's main fix: without it, a vault containing PDFs, videos,
 * compressed archives, or any other binary file of a non-image extension
 * would get passed through Android string serialization in
 * readTextFilesBatch (FolderAccessPlugin.java's readOneFileOrNull replaces
 * invalid UTF-8 rather than rejecting it, per the audit) and Rust
 * read_to_string (which does reject invalid UTF-8 but still wastes native
 * work and IPC on an unreadable file), potentially producing garbage or
 * failing on a file that was never intended to be searched.
 *
 * The list is conservative: it includes everything the project actually
 * supports (markdown, code, config, data) and nothing else. If a user has
 * a custom text format not in this list, it won't be searched by content
 * but will still match by filename. */
export function isTextFile(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase();
  return !!ext && TEXT_EXTENSIONS.has(ext);
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
