import { useCallback, useRef, useState } from "preact/hooks";
import { linkIndex } from "../linking/store";
import { openDocuments } from "../workspace/store";
import { dirname } from "../workspace/paths";
import { readTextFile, writeTextFile } from "../workspace/tauriBridge";
import { planNoteRename, type RenamePlan } from "./renamePlan";
import { applyRenamePlan } from "./renameExecutor";

export interface RenamePreviewState {
  oldPath: string;
  newPath: string;
  plan: RenamePlan;
  /** Set to true after applyRenamePlan succeeds; used by the caller to
   * know whether the wikilink rewrites have already been applied before
   * it calls renameEntry. */
  applied: boolean;
  /** Error message if applyRenamePlan failed; caller should surface this. */
  applyError?: string;
}

export interface RenamePreviewController {
  /** Non-null exactly while a Review dialog (spec section 9.2) needs
   * rendering; the caller renders `RenamePreviewDialog` from this. */
  preview: RenamePreviewState | null;
  /**
   * F03 Phase 2b-i (spec section 9.1: "every rename entry point must be
   * replaced or wrapped so a rename cannot bypass F03"). Call this with
   * exactly the same `(oldPath, newName)` a caller's own existing rename
   * flow already has, before its own `renameEntry` call, not instead of
   * it: this never renames anything itself; instead it plans the rewrite,
   * shows the Review dialog if there's anything to review, and — once the
   * user clicks Continue — applies the wikilink/markdown rewrites to the
   * other notes via `applyRenamePlan`. The caller then proceeds with its
   * own `renameEntry` call to actually rename the file.
   *
   * Resolves `true` immediately (no dialog) for a non-note path or a plan
   * with nothing to review; resolves `false` if the user cancels or if
   * the apply step fails (in which case `preview.applyError` carries the
   * message to surface to the user).
   */
  confirmRenameWithPreview: (oldPath: string, newName: string) => Promise<boolean>;
  continueRename: () => void;
  cancelRename: () => void;
}

/** A candidate note open in a tab may hold unsaved edits newer than disk;
 * see `renamePlan.ts`'s own doc comment on freshness (spec 9.5). Mirrors
 * `tasks/taskMutation.ts`'s identical open-tab-first, disk-fallback
 * read, the one other place in this codebase already needs "the
 * freshest available content for an arbitrary path." */
function readFreshestNote(path: string): Promise<string> {
  const open = openDocuments.value.find((document) => document.path === path);
  return open ? Promise.resolve(open.content) : readTextFile(path);
}

export function useRenamePreview(): RenamePreviewController {
  const [preview, setPreview] = useState<RenamePreviewState | null>(null);
  const resolverRef = useRef<((proceed: boolean) => void) | null>(null);

  const confirmRenameWithPreview = useCallback(async (oldPath: string, newName: string): Promise<boolean> => {
    // Only a text note's basename can ever be a wikilink target; skip the
    // read/plan work entirely for anything else (an image, a canvas...).
    if (!oldPath.toLowerCase().endsWith(".md")) return true;

    const newPath = `${dirname(oldPath)}/${newName}`;
    const plan = await planNoteRename(oldPath, newPath, linkIndex.value, readFreshestNote);
    const hasNothingToReview =
      plan.edits.length === 0 &&
      plan.blocked.length === 0 &&
      (plan.markdownEdits?.length ?? 0) === 0 &&
      (plan.markdownBlocked?.length ?? 0) === 0;
    if (hasNothingToReview) return true;

    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setPreview({ oldPath, newPath, plan, applied: false });
    });
  }, []);

  const continueRename = useCallback(() => {
    const current = preview;
    if (current) {
      // Apply the wikilink/markdown rewrites before resolving.
      void (async () => {
        const result = await applyRenamePlan(current.plan, {
          readNote: readFreshestNote,
          writeNote: (path: string, content: string) => writeTextFile(path, content),
        });
        if (result.success) {
          setPreview(null);
          resolverRef.current?.(true);
        } else {
          // Keep the dialog open so the user sees the error and can retry or cancel.
          setPreview((prev) => (prev ? { ...prev, applyError: result.error } : null));
          resolverRef.current?.(false);
        }
        resolverRef.current = null;
      })();
    } else {
      resolverRef.current?.(true);
      resolverRef.current = null;
      setPreview(null);
    }
  }, [preview]);

  const cancelRename = useCallback(() => {
    resolverRef.current?.(false);
    resolverRef.current = null;
    setPreview(null);
  }, []);

  return { preview, confirmRenameWithPreview, continueRename, cancelRename };
}
