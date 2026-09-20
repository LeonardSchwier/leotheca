import { useCallback, useRef, useState } from "preact/hooks";
import { bookmarks, saveBookmarks } from "../bookmarks/store";
import { linkIndex, rebuildLinkIndex } from "../linking/store";
import { updateWorkspaceSettings } from "../settings/store";
import { openDocuments } from "../workspace/store";
import { dirname } from "../workspace/paths";
import { readTextFile, writeTextFile } from "../workspace/tauriBridge";
import type { EditorLayoutState, EditorGroupState } from "../workspace/types";
import { planNoteRename, type RenamePlan } from "./renamePlan";

export interface RenamePreviewState {
  oldPath: string;
  newPath: string;
  plan: RenamePlan;
}

/**
 * F03 Phase 2b-i Apply step (ROADMAP rm-b8b4267f997dc1e8, this claim
 * rm-7ac1a83c7fb8fc10). Applies a previously reviewed `RenamePlan`:
 * rewrites every structured wikilink and Markdown link that `planNoteRename`
 * planned, migrates `editorLayout`, `bookmarks`, and `workspaceSettings`
 * (all three of which may carry `oldPath`), and rebuilds the link index.
 *
 * The plan's `edits`/`markdownEdits` carry exact source ranges (`from`/`to`)
 * computed from the content that was read at planning time. This function
 * reads the current content again before applying so a note edited between
 * the Review and Apply steps (e.g. via a different tab) is handled correctly:
 * the `oldText` slice is verified to still be present at the same offset;
 * if the content has changed, the edit for that note is skipped (not applied
 * blindly at a stale offset).
 *
 * `workspaceSettings` migration is done here rather than in the caller so
 * that both rename entry points (Sidebar and App tab rename) share the same
 * code path. The settings store's own `effect` (settings/store.ts) will
 * persist the update to disk via `updateWorkspaceSettings` →
 * `saveWorkspaceSettings`; the bookmarks store does the same through
 * `saveBookmarks`.
 *
 * This function is deliberately exported and unit-testable with injected
 * `readNote`/`writeNote` so no Tauri/Capacitor bridge is required in tests.
 */
export interface ApplyRenameOptions {
  readNote: (path: string) => Promise<string>;
  writeNote: (path: string, content: string) => Promise<void>;
}

/** Replaces every `oldPath` reference in `editorLayout` with `newPath`.
 * Works across `tabPaths`, `activePath`, and `pinnedPaths`.
 * Returns a new object (immutable update). */
function migrateEditorLayout(
  layout: EditorLayoutState,
  oldPath: string,
  newPath: string,
): EditorLayoutState {
  const mapPath = (p: string | null): string | null =>
    p === oldPath ? newPath : p;

  const mapGroup = (group: EditorGroupState): EditorGroupState => ({
    ...group,
    tabPaths: group.tabPaths.map((p) => (p === oldPath ? newPath : p)),
    activePath: mapPath(group.activePath),
    pinnedPaths: group.pinnedPaths.map((p) => (p === oldPath ? newPath : p)),
  });

  return {
    ...layout,
    groups: {
      primary: layout.groups.primary ? mapGroup(layout.groups.primary) : layout.groups.primary,
      secondary: layout.groups.secondary ? mapGroup(layout.groups.secondary) : undefined,
    },
    activeGroupId: layout.activeGroupId,
    compactVisibleGroupId: layout.compactVisibleGroupId,
  };
}

/** Replaces every `oldPath` in a bookmarks list and returns the updated list. */
function migrateBookmarks(
  list: typeof bookmarks.value,
  oldPath: string,
  newPath: string,
): typeof bookmarks.value {
  return list.map((bm) =>
    bm.kind === "file" && bm.path === oldPath ? { ...bm, path: newPath } : bm,
  );
}

/**
 * Applies the planned wikilink and Markdown-link edits in `plan.edits` and
 * `plan.markdownEdits` to their target notes. Returns `{ applied, skipped }`
 * where `applied` is the number of edits successfully written and `skipped`
 * is the number of notes whose content had changed since planning (stale
 * edit, safely left alone).
 */
async function applyPlanEdits(
  plan: RenamePlan,
  options: ApplyRenameOptions,
): Promise<{ applied: number; skipped: number }> {
  const allEdits = [
    ...(plan.edits ?? []),
    ...(plan.markdownEdits ?? []).map((e) => ({
      path: e.path,
      from: e.from,
      to: e.to,
      oldText: e.oldText,
      newText: e.newText,
    })),
  ];

  // Group edits by note path so we read each note once.
  const editsByPath = new Map<string, { from: number; to: number; oldText: string; newText: string }[]>();
  for (const edit of allEdits) {
    const list = editsByPath.get(edit.path) ?? [];
    list.push(edit);
    editsByPath.set(edit.path, list);
  }

  let applied = 0;
  let skipped = 0;

  for (const [path, edits] of editsByPath) {
    let current: string;
    try {
      current = await options.readNote(path);
    } catch {
      skipped++;
      continue;
    }

    // Sort edits by `from` descending so we apply from the end of the
    // document first — this keeps earlier offsets valid.
    const sorted = [...edits].sort((a, b) => b.from - a.from);

    let updated = current;
    let allValid = true;
    for (const edit of sorted) {
      const slice = updated.slice(edit.from, edit.to);
      if (slice !== edit.oldText) {
        allValid = false;
        break;
      }
      updated = updated.slice(0, edit.from) + edit.newText + updated.slice(edit.to);
    }

    if (!allValid) {
      skipped++;
      continue;
    }

    try {
      await options.writeNote(path, updated);
      applied += edits.length;
    } catch {
      skipped++;
    }
  }

  return { applied, skipped };
}

/**
 * Top-level entry point: apply a reviewed rename plan. Call this immediately
 * after the user confirms the Review dialog (i.e. after `continueRename()`
 * has resolved the `confirmRenameWithPreview` promise with `true`).
 *
 * `workspaceRoot` is the absolute workspace root path, needed to rebuild
 * the link index. `settings` is the current `WorkspaceSettings` value;
 * `editorLayout` is the current `EditorLayoutState`; both are migrated and
 * persisted here. `aliasesEnabled` and `tagsEnabled` are the current
 * workspace settings flags, forwarded to `rebuildLinkIndex` so the rebuilt
 * index matches the user's active settings (matching every other
 * call-site in the codebase that rebuilds after a settings change).
 *
 * Returns a human-readable summary string suitable for a status message.
 */
export async function applyRenamePlan(
  oldPath: string,
  newPath: string,
  plan: RenamePlan,
  workspaceRoot: string,
  editorLayout: import("../workspace/types").EditorLayoutState,
  options: ApplyRenameOptions & {
    settings: import("../settings/workspaceSettings").WorkspaceSettings;
    aliasesEnabled?: boolean;
    tagsEnabled?: boolean;
  },
): Promise<string> {
  // 1. Apply wikilink / Markdown-link edits to other notes.
  const { applied, skipped } = await applyPlanEdits(plan, options);

  // 2. Migrate editor layout (tab paths, active path, pinned paths) for
  //    both the primary and secondary groups. Assigning a new object to
  //    the signal (rather than mutating in-place) ensures every consumer
  //    that watches `editorLayout.value` re-renders, and the
  //    `settings/store.ts` effect that persists `editorLayout` into
  //    `workspaceSettings.editorLayout` fires with the updated layout.
  //    We import the signal here (same pattern as `bookmarks`/`saveBookmarks`
  //    above) so the reassignment is synchronous and visible to the caller.
  const { editorLayout: layoutSignal } = await import("../workspace/store");
  const migratedLayout = migrateEditorLayout(editorLayout, oldPath, newPath);
  layoutSignal.value = migratedLayout;

  // 3. Migrate bookmarks.
  const migratedBookmarks = migrateBookmarks(bookmarks.value, oldPath, newPath);

  // 5. Persist bookmarks (saveBookmarks reads from `bookmarks.value`, so
  //    set the signal first).
  bookmarks.value = migratedBookmarks;
  await saveBookmarks().catch(() => {});

  // 6. Persist workspace settings (lastOpenPaths / lastActivePath).
  //    editorLayout is mutated directly via the signal (step 2 above).
  const currentSettings = options.settings;
  const migratedLastOpenPaths = currentSettings.lastOpenPaths.map(
    (p) => (p === oldPath ? newPath : p),
  );
  const migratedLastActivePath =
    currentSettings.lastActivePath === oldPath
      ? newPath
      : currentSettings.lastActivePath;

  await updateWorkspaceSettings({
    lastOpenPaths: migratedLastOpenPaths,
    lastActivePath: migratedLastActivePath,
  }).catch(() => {});

  // 7. Rebuild the link index so backlinks, tags, headings, and all other
  //    derived structures reflect the rename. Forward the current settings
  //    flags so the rebuilt index matches the user's active settings
  //    (matching every other rebuild call-site in the codebase).
  const aliasesEnabled = options.aliasesEnabled ?? true;
  const tagsEnabled = options.tagsEnabled ?? true;
  await rebuildLinkIndex(workspaceRoot, aliasesEnabled, tagsEnabled).catch(() => {});

  const parts: string[] = [];
  if (applied > 0) parts.push(`${applied} link${applied === 1 ? "" : "s"} updated`);
  if (skipped > 0) parts.push(`${skipped} note${skipped === 1 ? "" : "s"} skipped (content changed)`);
  if (parts.length === 0) parts.push("renamed");
  return parts.join(", ");
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
   * it: this never renames anything itself; Apply automation happens
   * through `applyRenameAfterRename` below. Resolves `true` immediately,
   * with no dialog shown at all, for a non-note path or a plan with nothing
   * to review (most renames, since most notes have no backlinks); otherwise
   * shows the Review dialog and resolves once the user continues (`true`)
   * or cancels (`false`).
   */
  confirmRenameWithPreview: (oldPath: string, newName: string) => Promise<boolean>;
  /**
   * Call this after `renameEntry` + `renameOpenTab` have succeeded and the
   * user has confirmed the Review dialog. Applies the plan stored in
   * `preview` (wikilink rewrites, metadata migration, index rebuild).
   * Safe to call multiple times for the same rename (idempotent).
   */
  applyRenameAfterRename: (oldPath: string, newPath: string) => Promise<string>;
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

export interface UseRenamePreviewOptions {
  workspaceRoot: string;
  editorLayout: import("../workspace/types").EditorLayoutState;
  workspaceSettings: import("../settings/workspaceSettings").WorkspaceSettings;
  /** Current workspace settings flag forwarded to `rebuildLinkIndex` on
   * apply, so the rebuilt index matches the user's active settings. */
  aliasesEnabled: boolean;
  /** Current workspace settings flag forwarded to `rebuildLinkIndex` on
   * apply, so the rebuilt index matches the user's active settings. */
  tagsEnabled: boolean;
}

export function useRenamePreview(opts: UseRenamePreviewOptions): RenamePreviewController {
  const { workspaceRoot, editorLayout, workspaceSettings, aliasesEnabled, tagsEnabled } = opts;
  const [preview, setPreview] = useState<RenamePreviewState | null>(null);
  const resolverRef = useRef<((proceed: boolean) => void) | null>(null);
  const pendingPlanRef = useRef<RenamePreviewState | null>(null);

  const confirmRenameWithPreview = useCallback(async (oldPath: string, newName: string): Promise<boolean> => {
    // Only a text note's basename can ever be a wikilink target; skip the
    // read/plan work entirely for anything else (an image, a canvas...).
    if (!oldPath.toLowerCase().endsWith(".md")) return true;

    const newPath = `${dirname(oldPath)}/${newName}`;
    const plan = await planNoteRename(oldPath, newPath, linkIndex.value, readFreshestNote);
    // Must also check the Markdown-link fields (spec 6.2/F03 Phase 2b-ii), not
    // just the wikilink ones: a plan can have zero wikilink edits/blocked and
    // still carry real markdownEdits/markdownBlocked entries (the common case
    // whenever the referrer has no unrelated wikilink of its own), and
    // RenamePreviewDialog.tsx already has a dedicated rendering section for
    // exactly that data. Skipping the dialog here made that whole section
    // unreachable in the running app regardless of what the plan contained.
    const hasNothingToReview =
      plan.edits.length === 0 &&
      plan.blocked.length === 0 &&
      (plan.markdownEdits?.length ?? 0) === 0 &&
      (plan.markdownBlocked?.length ?? 0) === 0;
    if (hasNothingToReview) return true;

    // Store the plan so `applyRenameAfterRename` can retrieve it after the
    // user confirms.
    pendingPlanRef.current = { oldPath, newPath, plan };

    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setPreview({ oldPath, newPath, plan });
    });
  }, []);

  const applyRenameAfterRename = useCallback(async (oldPath: string, newPath: string): Promise<string> => {
    // Look up the pending plan stored by `confirmRenameWithPreview`.
    const pending = pendingPlanRef.current;
    if (
      !pending ||
      pending.oldPath !== oldPath ||
      pending.newPath !== newPath
    ) {
      return "no pending plan";
    }
    pendingPlanRef.current = null;
    return applyRenamePlan(
      oldPath,
      newPath,
      pending.plan,
      workspaceRoot,
      editorLayout,
      {
        readNote: readFreshestNote,
        writeNote: (path, content) => writeTextFile(path, content),
        settings: workspaceSettings,
        aliasesEnabled,
        tagsEnabled,
      },
    );
  }, [workspaceRoot, editorLayout, workspaceSettings, aliasesEnabled, tagsEnabled]);

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

  return { preview, confirmRenameWithPreview, applyRenameAfterRename, continueRename, cancelRename };
}
