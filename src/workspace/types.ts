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

/** A shared depth cap for every recursive directory walk over a workspace
 * (fileTreeStore.ts's expandAll/runSearch, linking/store.ts's
 * findMarkdownFiles, capacitorBridgeImpl.ts's getWorkspaceStats; the Rust
 * `workspace_stats` command has its own equivalent constant, since it
 * can't share this one across the IPC boundary). Guards against a symlink
 * inside a workspace pointing back at one of its own ancestors, which
 * would otherwise recurse forever: `listDir` (Rust `list_dir`, and
 * Android's SAF-backed equivalent) follows symlinks and none of these
 * walks track visited canonical paths, the only way to detect a true
 * cycle, which no platform this app targets exposes cheaply through the
 * existing directory-listing call. A plain depth cap doesn't detect a
 * cycle by name, it just stops descending once nesting gets unreasonable,
 * which is a complete fix for the actual failure mode (unbounded
 * recursion) even though it isn't true cycle detection: a workspace
 * legitimately nested 40 folders deep is not a realistic vault. Requires
 * a user to have manually symlinked a directory into their own vault
 * pointing back at an ancestor; no sync tool does this on its own. */
export const MAX_WALK_DEPTH = 40;
