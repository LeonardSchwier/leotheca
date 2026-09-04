import { batch, computed, signal } from "@preact/signals";
import { createPrimaryEditorLayout, synchronizePrimaryEditorLayout } from "./documentGroups";
import type { EditorLayoutState, OpenDocument, OpenTab, TabKind } from "./types";

/** Canonical open-document store. Editor groups hold only references to
 * these records, ensuring one content and save authority per path. */
export const openDocuments = signal<OpenDocument[]>([]);
/** Compatibility selector for the present flat tab UI. It follows the
 * primary group's placement references, not a second writable tab store. */
export const openTabs = computed<OpenTab[]>(() => {
  const documentsByPath = new Map(openDocuments.value.map((document) => [document.path, document]));
  return editorLayout.value.groups.primary.tabPaths.flatMap((path) => {
    const document = documentsByPath.get(path);
    return document ? [document] : [];
  });
});
/** Compatibility selector for the primary group's active document. */
export const activeTabPath = computed(() => editorLayout.value.groups.primary.activePath);
/** F07 Phase 1's logical group state. The UI remains a single primary group
 * until later phases add pins and a secondary editor group. */
export const editorLayout = signal<EditorLayoutState>(createPrimaryEditorLayout([], null));

function updatePrimaryGroup(documents: OpenDocument[], activePath: string | null) {
  openDocuments.value = documents;
  editorLayout.value = synchronizePrimaryEditorLayout(
    editorLayout.value,
    documents.map((document) => document.path),
    activePath,
  );
}

export function activeTab(): OpenTab | undefined {
  return openDocuments.value.find((t) => t.path === activeTabPath.value);
}

/** Activates an already-open document through the primary group, preserving
 * the old tab-selection behavior while keeping group state authoritative. */
export function focusTab(path: string) {
  if (!openDocuments.value.some((document) => document.path === path)) return;
  batch(() => updatePrimaryGroup(openDocuments.value, path));
}

export function openOrFocusTab(path: string, name: string, content: string, kind: TabKind) {
  const existing = openDocuments.value.find((document) => document.path === path);
  batch(() => updatePrimaryGroup(
    existing
      ? openDocuments.value
      : [...openDocuments.value, { path, name, content, kind, dirty: false, saveError: null }],
    path,
  ));
}

export function updateTabContent(path: string, content: string) {
  openDocuments.value = openDocuments.value.map((t) =>
    t.path === path ? { ...t, content, dirty: true } : t,
  );
}

/** Marks a tab saved AND clears its revision. The save coordinator calls
 * this only when the write completed for the exact revision that was in
 * flight — never for a stale revision. The tab stays dirty until its
 * revision reaches the value of the last change() call. */
export function markTabSaved(path: string) {
  openDocuments.value = openDocuments.value.map((t) =>
    t.path === path ? { ...t, dirty: false } : t,
  );
}

export function markTabSaveError(path: string, error: string) {
  openDocuments.value = openDocuments.value.map((t) =>
    t.path === path ? { ...t, saveError: error } : t,
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
  batch(() => {
    const documents = openDocuments.value.filter((document) => document.path !== path);
    updatePrimaryGroup(documents, activeTabPath.value === path ? documents.at(-1)?.path ?? null : activeTabPath.value);
  });
}

export function closeOtherTabs(path: string) {
  batch(() => {
    updatePrimaryGroup(openDocuments.value.filter((document) => document.path === path), path);
  });
}

export function closeAllTabs() {
  batch(() => {
    updatePrimaryGroup([], null);
  });
}

/** Closes any open tab for `path` itself or for a file nested under it
 * (used when a folder is trashed). */
export function closeTabsUnder(path: string) {
  const isUnder = (tabPath: string) => tabPath === path || tabPath.startsWith(`${path}/`);
  const stillOpen = openDocuments.value.filter((t) => !isUnder(t.path));
  if (stillOpen.length === openDocuments.value.length) return;
  batch(() => {
    updatePrimaryGroup(
      stillOpen,
      activeTabPath.value && isUnder(activeTabPath.value) ? stillOpen.at(-1)?.path ?? null : activeTabPath.value,
    );
  });
}

/** Updates any open tab whose path is `oldPath` or nested under it to point
 * at `newPath` instead, preserving editor state across a rename. */
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

    let activePath = activeTabPath.value;
    if (changed && activePath) {
      const rewritten = rewrite(activePath);
      if (rewritten !== null) activePath = rewritten;
    }
    if (changed) updatePrimaryGroup(documents, activePath);
  });
}
