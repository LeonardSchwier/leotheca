import { batch, computed, signal } from "@preact/signals";
import {
  activateGroup,
  createPrimaryEditorLayout,
  createSplitLayout,
  mergeSecondaryIntoPrimary,
  moveTabToGroup,
  pinGroupTab,
  restorePrimaryEditorLayout,
  unpinGroupTab,
  updateSplitRatio,
} from "./documentGroups";
import type { EditorGroupId, EditorGroupState, EditorLayoutState, OpenDocument, OpenTab, TabKind, ViewMode } from "./types";

/** Canonical open-document store. Editor groups hold only references to
 * these records, ensuring one content and save authority per path.
 * F07 Phase 6: the flat-tab compatibility layer is removed; the primary
 * group's accessors (openTabs, activeTabPath) are the canonical API. */
export const openDocuments = signal<OpenDocument[]>([]);
/** Primary group's tab list (F07 Phase 6: the flat-tab compatibility
 * selectors are now the canonical primary-group accessors). Follows the
 * primary group's placement references, not a second writable tab store. */
export const openTabs = computed<OpenTab[]>(() => tabsForGroup("primary"));
/** Primary group's active document path (F07 Phase 6: canonical
 * primary-group accessor). */
export const activeTabPath = computed(() => editorLayout.value.groups.primary.activePath);
/** The secondary group's own tab list (empty, not error, when no secondary
 * group exists), for the split-pane UI (F07 Phase 3). */
export const secondaryOpenTabs = computed<OpenTab[]>(() => tabsForGroup("secondary"));
export const secondaryActiveTabPath = computed(() => editorLayout.value.groups.secondary?.activePath ?? null);
/** Logical editor group state (F07 Phase 1-5). The primary group's
 * accessors (openTabs, activeTabPath) are the canonical API per F07 Phase 6. */
export const editorLayout = signal<EditorLayoutState>(createPrimaryEditorLayout([], null));

function tabsForGroup(groupId: EditorGroupId): OpenTab[] {
  const group = groupState(groupId);
  if (!group) return [];
  const documentsByPath = new Map(openDocuments.value.map((document) => [document.path, document]));
  return group.tabPaths.flatMap((path) => {
    const document = documentsByPath.get(path);
    return document ? [document] : [];
  });
}

function groupState(groupId: EditorGroupId): EditorGroupState | undefined {
  return groupId === "primary" ? editorLayout.value.groups.primary : editorLayout.value.groups.secondary;
}

/** Which group currently owns an open path. Every already-open path belongs
 * to exactly one group (documentGroups.ts's unique-ownership invariant), so
 * this is how a path-only call (close, focus, pin, rename...) finds the
 * right group without every caller needing to know or pass one. Defaults to
 * "primary" for a path that is not open in either group (the caller's own
 * guard then no-ops, matching this file's existing behavior throughout). */
function groupOwning(path: string): EditorGroupId {
  return editorLayout.value.groups.secondary?.tabPaths.includes(path) ? "secondary" : "primary";
}

/** Replaces one group's tab placement and (when given) the full canonical
 * document list, in one signal write. Each group's `tabPaths` is treated as
 * authoritative membership, exactly as documentGroups.ts's own multi-group
 * functions already treat it -- never re-derived from the full document
 * list, which is what let a two-group layout collapse back into one before
 * this generalization (every mutation re-assigned every open path to
 * primary). Pinned paths are trimmed to whatever remains in `tabPaths`. */
function setGroupTabs(groupId: EditorGroupId, tabPaths: string[], activePath: string | null, documents?: OpenDocument[]) {
  if (documents) openDocuments.value = documents;
  const layout = editorLayout.value;
  const group = groupId === "primary" ? layout.groups.primary : layout.groups.secondary;
  if (!group) return;
  const pinnedPaths = group.pinnedPaths.filter((path) => tabPaths.includes(path));
  const updatedGroup: EditorGroupState = { ...group, tabPaths, pinnedPaths, activePath };
  editorLayout.value = {
    ...layout,
    groups: {
      primary: groupId === "primary" ? updatedGroup : layout.groups.primary,
      secondary: groupId === "secondary" ? updatedGroup : layout.groups.secondary,
    },
  };
}

export function activeTab(): OpenTab | undefined {
  return openDocuments.value.find((t) => t.path === activeTabPath.value);
}

/** The active group's own active document -- the document a global command
 * (Save, Close tab, Toggle view mode...) should act on per spec section 6.5,
 * "operate on the active group unless they explicitly name another
 * target." Equals `activeTab()` whenever primary is the active group. */
export function activeGroupTab(): OpenTab | undefined {
  const path = groupState(editorLayout.value.activeGroupId)?.activePath ?? null;
  return path ? openDocuments.value.find((t) => t.path === path) : undefined;
}

/** Activates an already-open document in whichever group owns it, focusing
 * that group too (spec 6.5: focusing a tab makes its group active). */
export function focusTab(path: string) {
  const groupId = groupOwning(path);
  const group = groupState(groupId);
  if (!group || !group.tabPaths.includes(path)) return;
  batch(() => {
    setGroupTabs(groupId, group.tabPaths, path);
    editorLayout.value = { ...editorLayout.value, activeGroupId: groupId };
  });
}

/** Opens `path` if not already open, or focuses it if it is (spec 7.1's
 * routing policy: an already-open path always activates its owner group,
 * regardless of which group is currently active; a genuinely new path opens
 * into the active group, so ordinary opens keep landing in primary until a
 * split exists and secondary becomes active). */
export function openOrFocusTab(path: string, name: string, content: string, kind: TabKind, searchQuery?: string) {
  const existing = openDocuments.value.find((document) => document.path === path);
  const targetGroupId = existing ? groupOwning(path) : editorLayout.value.activeGroupId;
  const group = groupState(targetGroupId);
  if (!group) return;
  const documents = existing
    ? openDocuments.value.map((document) => (document.path === path ? { ...document, searchQuery } : document))
    : [...openDocuments.value, { path, name, content, kind, dirty: false, saving: false, saveError: null, searchQuery }];
  const tabPaths = existing ? group.tabPaths : [...group.tabPaths, path];
  batch(() => {
    setGroupTabs(targetGroupId, tabPaths, path, documents);
    editorLayout.value = { ...editorLayout.value, activeGroupId: targetGroupId };
  });
}

export function updateTabContent(path: string, content: string) {
  openDocuments.value = openDocuments.value.map((t) =>
    t.path === path ? { ...t, content, dirty: true } : t,
  );
}

/** Marks a tab as having a write actually in flight (saveCoordinator.ts's
 * own onSaveStart callback, fired when entry.inFlight is set true, never
 * on its debounce timer alone). Drives the Document Header's Saving
 * indicator (spec 13.6). */
export function markTabSaving(path: string) {
  openDocuments.value = openDocuments.value.map((t) =>
    t.path === path ? { ...t, saving: true } : t,
  );
}

/** Marks a tab saved AND clears its revision. The save coordinator calls
 * this only when the write completed for the exact revision that was in
 * flight — never for a stale revision. The tab stays dirty until its
 * revision reaches the value of the last change() call. */
export function markTabSaved(path: string) {
  openDocuments.value = openDocuments.value.map((t) =>
    t.path === path ? { ...t, dirty: false, saving: false } : t,
  );
}

export function markTabSaveError(path: string, error: string) {
  openDocuments.value = openDocuments.value.map((t) =>
    t.path === path ? { ...t, saving: false, saveError: error } : t,
  );
}

export function clearTabSaveError(path: string) {
  openDocuments.value = openDocuments.value.map((t) =>
    t.path === path ? { ...t, saveError: null } : t,
  );
}

/** Uses `batch()` throughout this file's multi-signal writes for the same
 * reason `closeAllTabs` does (see its own comment): anything reacting to
 * both `openTabs` and `activeTabPath`, namely the tab-persistence effect in
 * settings/store.ts, should only ever see states that were real, not an
 * intermediate step of getting there. */
export function closeTab(path: string) {
  const groupId = groupOwning(path);
  const group = groupState(groupId);
  if (!group || group.pinnedPaths.includes(path)) return;
  batch(() => {
    const documents = openDocuments.value.filter((document) => document.path !== path);
    const tabPaths = group.tabPaths.filter((tabPath) => tabPath !== path);
    const activePath = group.activePath === path ? (tabPaths.at(-1) ?? null) : group.activePath;
    setGroupTabs(groupId, tabPaths, activePath, documents);
  });
}

/** Closes every unpinned tab in `path`'s own group other than `path` itself
 * (spec 7.4 "Close other unpinned tabs in group"), leaving the other group
 * untouched. */
export function closeOtherTabs(path: string) {
  const groupId = groupOwning(path);
  const group = groupState(groupId);
  if (!group || !group.tabPaths.includes(path)) return;
  batch(() => {
    const keep = new Set([path, ...group.pinnedPaths]);
    const groupPaths = new Set(group.tabPaths);
    const documents = openDocuments.value.filter((document) => !groupPaths.has(document.path) || keep.has(document.path));
    const tabPaths = group.tabPaths.filter((tabPath) => keep.has(tabPath));
    setGroupTabs(groupId, tabPaths, path, documents);
  });
}

/** Lifecycle cleanup, deliberately including pinned documents in both
 * groups when a workspace closes or changes. Resets to a fresh single
 * primary group: a closed workspace has no secondary split to restore into
 * the next one (spec 15.3, "clear document and view states"). User-facing
 * broad-close controls call the per-group unpinned variant instead. */
export function closeAllTabs() {
  batch(() => {
    openDocuments.value = [];
    editorLayout.value = createPrimaryEditorLayout([], null);
  });
}

/** Closes only ordinary (unpinned) tabs in the given group (default
 * primary, matching this function's pre-split behavior). Pinned tabs
 * require an explicit unpin action. */
export function closeAllUnpinnedTabs(groupId: EditorGroupId = "primary") {
  const group = groupState(groupId);
  if (!group) return;
  batch(() => {
    const pinnedPaths = new Set(group.pinnedPaths);
    const groupPaths = new Set(group.tabPaths);
    const documents = openDocuments.value.filter((document) => !groupPaths.has(document.path) || pinnedPaths.has(document.path));
    const tabPaths = group.tabPaths.filter((path) => pinnedPaths.has(path));
    const activePath = group.activePath && tabPaths.includes(group.activePath) ? group.activePath : (tabPaths.at(-1) ?? null);
    setGroupTabs(groupId, tabPaths, activePath, documents);
  });
}

/** Restores a persisted primary-group pin state and view mode onto the
 * current layout, keeping only pins for paths that are actually open (see
 * documentGroups.ts's restorePrimaryEditorLayout). Callers restore tabs
 * first, then call this once tabPaths reflects what actually reopened. */
export function restoreEditorLayout(persisted: { pinnedPaths: readonly string[]; viewMode: ViewMode }) {
  editorLayout.value = restorePrimaryEditorLayout(editorLayout.value, persisted);
}

/** Pins/unpins/closes a path in whichever group owns it -- these three
 * commands are always reached from a specific tab (a keyboard shortcut on
 * the active tab, or a context-menu action on a clicked tab), so the owning
 * group is unambiguous and no group parameter is needed. */
export function pinTab(path: string) {
  editorLayout.value = pinGroupTab(editorLayout.value, groupOwning(path), path);
}

export function unpinTab(path: string) {
  editorLayout.value = unpinGroupTab(editorLayout.value, groupOwning(path), path);
}

/** The only user-facing removal path for a pinned tab. */
export function unpinAndCloseTab(path: string) {
  const groupId = groupOwning(path);
  const group = groupState(groupId);
  if (!group || !group.pinnedPaths.includes(path)) return;
  batch(() => {
    editorLayout.value = unpinGroupTab(editorLayout.value, groupId, path);
    closeTab(path);
  });
}

/** Closes any open tab for `path` itself or for a file nested under it, in
 * either group (used when a folder is trashed). */
export function closeTabsUnder(path: string) {
  const isUnder = (tabPath: string) => tabPath === path || tabPath.startsWith(`${path}/`);
  const stillOpen = openDocuments.value.filter((t) => !isUnder(t.path));
  if (stillOpen.length === openDocuments.value.length) return;
  batch(() => {
    (["primary", "secondary"] as const).forEach((groupId) => {
      const group = groupState(groupId);
      if (!group) return;
      const tabPaths = group.tabPaths.filter((tabPath) => !isUnder(tabPath));
      if (tabPaths.length === group.tabPaths.length) return;
      const activePath = group.activePath && isUnder(group.activePath) ? (tabPaths.at(-1) ?? null) : group.activePath;
      setGroupTabs(groupId, tabPaths, activePath);
    });
    openDocuments.value = stillOpen;
  });
}

/** Updates any open tab (in either group) whose path is `oldPath` or nested
 * under it to point at `newPath` instead, preserving editor state across a
 * rename. */
export function renameOpenTab(oldPath: string, newPath: string, newName: string) {
  const rewrite = (tabPath: string) =>
    tabPath === oldPath ? newPath : tabPath.startsWith(`${oldPath}/`) ? newPath + tabPath.slice(oldPath.length) : null;

  batch(() => {
    let changed = false;
    const documents = openDocuments.value.map((t) => {
      const rewritten = rewrite(t.path);
      if (rewritten === null) return t;
      changed = true;
      return { ...t, path: rewritten, name: rewritten === newPath ? newName : t.name };
    });
    if (!changed) return;

    openDocuments.value = documents;
    (["primary", "secondary"] as const).forEach((groupId) => {
      const group = groupState(groupId);
      if (!group) return;
      const tabPaths = group.tabPaths.map((tabPath) => rewrite(tabPath) ?? tabPath);
      const pinnedPaths = group.pinnedPaths.map((tabPath) => rewrite(tabPath) ?? tabPath);
      const activePath = group.activePath ? (rewrite(group.activePath) ?? group.activePath) : group.activePath;
      editorLayout.value = {
        ...editorLayout.value,
        groups: {
          primary: groupId === "primary" ? { ...group, tabPaths, pinnedPaths, activePath } : editorLayout.value.groups.primary,
          secondary: groupId === "secondary" ? { ...group, tabPaths, pinnedPaths, activePath } : editorLayout.value.groups.secondary,
        },
      };
    });
  });
}

// ============ F07 Phase 3: secondary group commands ============

/** `Split right`: creates the secondary group. With a path, moves that tab
 * there and activates it (spec 6.3's "Move to new group" shape); without
 * one, creates an empty secondary group and leaves primary active (spec
 * 6.3's "Split right without a target" shape) -- matching
 * documentGroups.ts's own already-shipped `createSplitLayout`, whose
 * empty-secondary case deliberately keeps `activeGroupId: "primary"`. A
 * no-op if a split already exists. */
export function splitRight(path: string | null = null) {
  if (editorLayout.value.splitEnabled) return;
  batch(() => {
    editorLayout.value = createSplitLayout(editorLayout.value, path);
  });
}

/** `Close secondary group` / the default `Merge into primary` action (spec
 * 6.4): folds secondary's tabs (pinned first, then unpinned, in that order)
 * into primary and collapses back to one group. Does not itself check for
 * unresolved save errors -- the caller (the merge-confirmation UI) is
 * responsible for that per spec 6.4's "present the existing save-recovery
 * flow first" requirement. */
export function closeSecondaryGroup() {
  editorLayout.value = mergeSecondaryIntoPrimary(editorLayout.value);
}

/** `Move to other group` / `Move active tab to other group`: moves the
 * active group's active tab to the other group, creating secondary first
 * if it doesn't exist yet. A no-op with no active tab. */
export function moveActiveTabToOtherGroup() {
  const layout = editorLayout.value;
  const sourceGroup = groupState(layout.activeGroupId);
  const path = sourceGroup?.activePath;
  if (!path) return;
  batch(() => {
    if (!layout.splitEnabled) {
      editorLayout.value = createSplitLayout(layout, path);
      return;
    }
    const targetGroupId: EditorGroupId = layout.activeGroupId === "primary" ? "secondary" : "primary";
    editorLayout.value = moveTabToGroup(layout, path, targetGroupId);
  });
}

/** Opens `path` explicitly in the group other than `sourceNotePath`'s own
 * (spec 6.3's `Open in other group` link-context entry point), creating
 * secondary first if needed. `sourceNotePath` -- the note whose rendered
 * preview the link was actually clicked in -- determines "other," not
 * `activeGroupId`: a click's own focus-group side effect (see
 * `App.tsx`'s pane-wrapper `onClick`) only runs later in the same bubble
 * phase, so `activeGroupId` can still name whichever pane was active
 * *before* this click. For a note target this is masked by an accidental
 * timing correction (`App.tsx`'s `handleOpenFile` awaits `readTextFile`
 * before calling this function, and that await yields long enough for
 * the pane wrapper's synchronous focus side effect to run first) -- but
 * the image-kind branch has no such await, so it reliably opens into the
 * very pane the link was clicked in instead of the other one. Resolving
 * from `sourceNotePath` fixes both branches the same way, without
 * depending on that timing accident. Falls back to `activeGroupId` when
 * no source is given (e.g. a future caller with no specific originating
 * pane, such as the file tree). Reuses `openOrFocusTab`'s already-open
 * handling (focus its owner group) when the path is open somewhere other
 * than the resolved target. */
export function openInOtherGroup(
  path: string,
  name: string,
  content: string,
  kind: TabKind,
  sourceNotePath?: string,
) {
  const layout = editorLayout.value;
  if (!layout.splitEnabled) {
    editorLayout.value = createSplitLayout(layout);
  }
  const sourceGroupId: EditorGroupId = sourceNotePath ? groupOwning(sourceNotePath) : editorLayout.value.activeGroupId;
  const targetGroupId: EditorGroupId = sourceGroupId === "primary" ? "secondary" : "primary";
  const existing = openDocuments.value.find((document) => document.path === path);
  batch(() => {
    if (existing) {
      if (groupOwning(path) !== targetGroupId) {
        editorLayout.value = moveTabToGroup(editorLayout.value, path, targetGroupId);
      } else {
        focusTab(path);
      }
      return;
    }
    const group = groupState(targetGroupId)!;
    setGroupTabs(targetGroupId, [...group.tabPaths, path], path, [
      ...openDocuments.value,
      { path, name, content, kind, dirty: false, saving: false, saveError: null },
    ]);
    // Same reasoning as createSplitLayout/moveTabToGroup: this note was
    // just deliberately opened into targetGroupId, so the compact
    // switcher must follow it too, not leave a narrow window/Android
    // still pointed at whichever group was visible before.
    editorLayout.value = { ...editorLayout.value, activeGroupId: targetGroupId, compactVisibleGroupId: targetGroupId };
  });
}

export function focusGroup(groupId: EditorGroupId) {
  editorLayout.value = activateGroup(editorLayout.value, groupId);
}

export function focusOtherGroup() {
  const layout = editorLayout.value;
  const other: EditorGroupId = layout.activeGroupId === "primary" ? "secondary" : "primary";
  if (!groupState(other)) return;
  editorLayout.value = activateGroup(layout, other);
}

export function setSplitRatio(ratio: number) {
  editorLayout.value = updateSplitRatio(editorLayout.value, ratio);
}

export function resetSplitRatio() {
  editorLayout.value = updateSplitRatio(editorLayout.value, 0.5);
}

/** Sets a group's own Source/Split/Preview mode (spec 5.4: each group has
 * an independent view mode). No-ops for a group that doesn't exist. */
export function setGroupViewMode(groupId: EditorGroupId, mode: ViewMode) {
  const group = groupState(groupId);
  if (!group || group.viewMode === mode) return;
  const layout = editorLayout.value;
  const updatedGroup: EditorGroupState = { ...group, viewMode: mode };
  editorLayout.value = {
    ...layout,
    groups: {
      primary: groupId === "primary" ? updatedGroup : layout.groups.primary,
      secondary: groupId === "secondary" ? updatedGroup : layout.groups.secondary,
    },
  };
}

// ============ F07 Phase 3 follow-up: within-group tab reordering ============
// Spec section 7.2: "Pinned and unpinned regions are distinct. Dragging an
// unpinned tab into the pinned region does not pin it implicitly ... Pin or
// Unpin is explicit." Both functions below enforce that the same way: a
// reorder or move never crosses from one region into the other.

function regionOf(group: EditorGroupState, pinned: boolean): string[] {
  return pinned ? group.pinnedPaths : group.tabPaths.filter((path) => !group.pinnedPaths.includes(path));
}

function applyReorderedRegion(groupId: EditorGroupId, group: EditorGroupState, pinned: boolean, reorderedRegion: string[]) {
  const pinnedPaths = pinned ? reorderedRegion : group.pinnedPaths;
  const tabPaths = pinned
    ? [...reorderedRegion, ...regionOf(group, false)]
    : [...group.pinnedPaths, ...reorderedRegion];
  const updatedGroup: EditorGroupState = { ...group, tabPaths, pinnedPaths };
  const layout = editorLayout.value;
  editorLayout.value = {
    ...layout,
    groups: {
      primary: groupId === "primary" ? updatedGroup : layout.groups.primary,
      secondary: groupId === "secondary" ? updatedGroup : layout.groups.secondary,
    },
  };
}

/** `Move tab left` / `Move tab right` (spec 7.2, section 13): swaps `path`
 * with its neighbor within its own pinned/unpinned region. A no-op at
 * either edge of that region, or for a path that isn't open. */
export function reorderTabWithinGroup(path: string, direction: "left" | "right") {
  const groupId = groupOwning(path);
  const group = groupState(groupId);
  if (!group || !group.tabPaths.includes(path)) return;
  const pinned = group.pinnedPaths.includes(path);
  const region = regionOf(group, pinned);
  const index = region.indexOf(path);
  const targetIndex = direction === "left" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= region.length) return;
  const reordered = [...region];
  [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
  applyReorderedRegion(groupId, group, pinned, reordered);
}

/** Pointer-drag reordering (spec 7.2): moves `path` to sit immediately
 * before `beforePath` within its own group, or to the end of its region
 * when `beforePath` is `null`. A no-op if `beforePath` belongs to the
 * other pinned/unpinned region (the drop indicator is expected to have
 * already constrained the drop to a valid position; this is the
 * corresponding data-layer guarantee, not merely a UI nicety) or isn't a
 * real open tab in this group. */
export function moveTabWithinGroup(path: string, beforePath: string | null) {
  const groupId = groupOwning(path);
  const group = groupState(groupId);
  if (!group || !group.tabPaths.includes(path) || path === beforePath) return;
  const pinned = group.pinnedPaths.includes(path);
  if (beforePath !== null) {
    if (!group.tabPaths.includes(beforePath) || group.pinnedPaths.includes(beforePath) !== pinned) return;
  }
  const region = regionOf(group, pinned);
  const withoutPath = region.filter((candidate) => candidate !== path);
  const insertAt = beforePath === null ? withoutPath.length : withoutPath.indexOf(beforePath);
  if (insertAt === -1) return;
  const reordered = [...withoutPath.slice(0, insertAt), path, ...withoutPath.slice(insertAt)];
  applyReorderedRegion(groupId, group, pinned, reordered);
}

// ============ F07 Phase 4: compact layout ============

/** Which group's editor/preview is mounted on a compact (narrow) layout,
 * where only one of the two groups can be shown at a time (spec 8.2). A
 * no-op for "secondary" when no secondary group exists, matching
 * `focusGroup`'s own guard -- switching the visible pane and switching the
 * active group are deliberately independent (spec 8.2: "does not close or
 * merge anything"), so this never touches `activeGroupId` itself. */
export function setCompactVisibleGroup(groupId: EditorGroupId) {
  const layout = editorLayout.value;
  if (!groupState(groupId)) return;
  if (layout.compactVisibleGroupId === groupId) return;
  editorLayout.value = { ...layout, compactVisibleGroupId: groupId };
}
