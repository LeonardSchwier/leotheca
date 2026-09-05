import { useCallback, useRef, useState } from "preact/hooks";
import { linkIndex } from "../linking/store";
import { openDocuments } from "../workspace/store";
import { dirname } from "../workspace/paths";
import { readTextFile } from "../workspace/tauriBridge";
import { planNoteRename, type RenamePlan } from "./renamePlan";

export interface RenamePreviewState {
  oldPath: string;
  newPath: string;
  plan: RenamePlan;
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
   * it: this never renames anything itself, Apply automation is explicit
   * follow-up scope (see `renamePlan.ts`'s and this claim's own
   * ROADMAP.md entry). Resolves `true` immediately, with no dialog shown
   * at all, for a non-note path or a plan with nothing to review (most
   * renames, since most notes have no backlinks); otherwise shows the
   * Review dialog and resolves once the user continues (`true`) or
   * cancels (`false`).
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
    if (plan.edits.length === 0 && plan.blocked.length === 0) return true;

    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setPreview({ oldPath, newPath, plan });
    });
  }, []);

  const continueRename = useCallback(() => {
    resolverRef.current?.(true);
    resolverRef.current = null;
    setPreview(null);
  }, []);

  const cancelRename = useCallback(() => {
    resolverRef.current?.(false);
    resolverRef.current = null;
    setPreview(null);
  }, []);

  return { preview, confirmRenameWithPreview, continueRename, cancelRename };
}
