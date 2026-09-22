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

export type TabKind = "text" | "image" | "canvas" | "ink" | "pdf";

/** The one in-memory document record for an open workspace resource. Its
 * content and save state are never copied into an editor group, so future
 * split views cannot create competing save authorities for one path. */
export interface OpenDocument {
  path: string;
  name: string;
  kind: TabKind;
  /** Only meaningful for kind "text"; empty for images and PDFs, which
   * manage their own binary bytes and save lifecycle outside this string
   * field (see `pdf/PdfViewer.tsx`). */
  content: string;
  dirty: boolean;
  /** True for exactly the span between a debounced write actually starting
   * (saveCoordinator.ts's writeRevision setting entry.inFlight) and it
   * settling, success or failure. Drives the Document Header's real
   * Saving indicator (spec 13.6); never inferred from a debounce timer. */
  saving: boolean;
  /** Non-null when the last save attempt failed. The user can see this
   * error and retry; the tab stays dirty until a successful write. */
  saveError: string | null;
  /** Search query to highlight when opening from search results */
  searchQuery?: string;
}

/** Compatibility name for the current one-group tab UI. F07 Phase 1 keeps
 * this alias so callers can migrate to `OpenDocument` without changing the
 * visible tab behavior. */
export type OpenTab = OpenDocument;

export type EditorGroupId = "primary" | "secondary";

export type ViewMode = "source" | "split" | "preview";

export interface EditorGroupState {
  id: EditorGroupId;
  tabPaths: string[];
  pinnedPaths: string[];
  activePath: string | null;
  viewMode: ViewMode;
}

/** Logical editor placement, deliberately separate from OpenDocument
 * content. The primary group now owns its pin region; later F07 phases add
 * secondary placement, view modes, and persistence. */
export interface EditorLayoutState {
  activeGroupId: EditorGroupId;
  splitEnabled: boolean;
  preferredRatio: number;
  compactVisibleGroupId: EditorGroupId;
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

// A file whose basename has no extension at all — README, LICENSE, Makefile,
// a plain "notes", or an extension-less export dump from a migration tool.
// It is not in TEXT_EXTENSIONS (which is keyed by a dot-extension), so a
// whitelist-only predicate would classify it as binary and the app would
// never read it for content matching: a real note, missed. The OOM layers
// that cap this read (SEARCH_BATCH_MAX_BYTES, MAX_SEARCHABLE_FILE_BYTES,
// CONSERVATIVE_UNKNOWN_SIZE in fileTreeStore.ts) bound the native call's
// cost by *size*, not by a type guess, so reading an unknown-extension file
// is bounded exactly like a .md file of the same size; the extension
// whitelist above only exists to keep binary payloads (PDFs, video,
// archives, executables) out of string serialization on platforms that
// replace invalid UTF-8 instead of rejecting it.
//
// Directory-style basenames are not treated as "no extension" — a folder
// named "notes" or "Makefile" inside a vault is not a note — so the
// no-extension rule only applies to entries that are actually files.
const KNOWN_DIRECTORY_BASENAMES = new Set([
  "node_modules",
  ".git",
  ".github",
  ".idea",
  ".vscode",
]);

export function isTextFile(path: string, isDir: boolean): boolean {
  if (isDir) return false;
  const base = path.split("/").pop() ?? "";
  // Extension is everything after the last dot *only if there is a dot
  // that is not the leading dot of a hidden file*. A hidden file with no
  // other dot (".gitignore", ".env") has no extension in the normal sense,
  // and a file like "archive.tar.gz" has extension "gz" — both handled by
  // the same last-dot rule as a regular file, so the no-extension case is
  // really "no dot at all in the basename".
  const lastDot = base.lastIndexOf(".");
  const ext =
    lastDot > 0
      ? base.slice(lastDot + 1).toLowerCase()
      : lastDot === 0
        ? "" // leading dot only: hidden file, no extension
        : null; // no dot at all: no-extension file
  if (ext !== null) {
    return !!ext && TEXT_EXTENSIONS.has(ext);
  }
  // No dot in the basename at all.
  if (KNOWN_DIRECTORY_BASENAMES.has(base.toLowerCase())) return false;
  return true;
}

export function isCanvasPath(path: string): boolean {
  return path.toLowerCase().endsWith(".canvas");
}

export function isInkPath(path: string): boolean {
  return path.toLowerCase().endsWith(".ink");
}

export function isPdfPath(path: string): boolean {
  return path.toLowerCase().endsWith(".pdf");
}

/** Classifies resources consistently for interactive opening and session restore. */
export function classifyWorkspaceResource(path: string): TabKind {
  if (isImagePath(path)) return "image";
  if (isCanvasPath(path)) return "canvas";
  if (isInkPath(path)) return "ink";
  if (isPdfPath(path)) return "pdf";
  return "text";
}
