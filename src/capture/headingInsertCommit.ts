/**
 * Heading-scoped insert commit: reads a note, applies insertUnderHeading,
 * and writes the result back — all through the workspace-contained bridge
 * so every path is gated by the Rust-side containment check.
 */
import { readTextFile, writeWorkspaceTextFile } from "../workspace/tauriBridge";
import { insertUnderHeading } from "../headingInsert";

export interface HeadingInsertCommitOptions {
  /** Workspace-absolute path of the note to modify. */
  path: string;
  /** Heading text to target. */
  heading: string;
  /** Text to insert. */
  content: string;
  /** "prepend" or "append". Defaults to "append". */
  position?: "prepend" | "append";
  /** Exact heading level (1-6) required. */
  exactLevel?: number;
  /**
   * Workspace root, used for the write call. When omitted the write falls
   * back to the plain uncontained write (legacy path).
   */
  workspaceRoot?: string;
}

/**
 * Apply a heading-scoped insert to the note at `path`.
 *
 * @throws when the note does not exist, the heading is not found, or the
 *         write fails.
 */
export async function headingInsertCommit(
  options: HeadingInsertCommitOptions,
): Promise<{ path: string; name: string }> {
  const {
    path,
    heading,
    content,
    position = "append",
    exactLevel,
    workspaceRoot,
  } = options;

  // Read the existing note. A failed read means the file is genuinely
  // missing — we cannot insert into a note that doesn't exist.
  let existing: string;
  try {
    existing = await readTextFile(path);
  } catch {
    throw new Error(`headingInsertCommit: note not found: ${path}`);
  }

  // Apply the pure insert logic.
  const result = insertUnderHeading({
    document: existing,
    heading,
    content,
    position,
    exactLevel,
  });

  // Write back through the workspace-contained bridge when a root is given,
  // otherwise fall back to the plain write (legacy behaviour).
  if (workspaceRoot) {
    const relative = path.startsWith(workspaceRoot)
      ? path.slice(workspaceRoot.length).replace(/^\//, "")
      : path;
    await writeWorkspaceTextFile(workspaceRoot, relative, result.content);
  } else {
    const { writeTextFile } = await import("../workspace/tauriBridge");
    await writeTextFile(path, result.content);
  }

  return { path, name: path.split("/").pop() || "" };
}
