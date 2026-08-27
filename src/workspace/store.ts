import { batch, signal } from "@preact/signals";
import type { OpenTab, TabKind } from "./types";

export const openTabs = signal<OpenTab[]>([]);
export const activeTabPath = signal<string | null>(null);

export function activeTab(): OpenTab | undefined {
  return openTabs.value.find((t) => t.path === activeTabPath.value);
}

export function openOrFocusTab(path: string, name: string, content: string, kind: TabKind) {
  const existing = openTabs.value.find((t) => t.path === path);
  if (!existing) {
    openTabs.value = [...openTabs.value, { path, name, content, kind, dirty: false }];
  }
  activeTabPath.value = path;
}

export function updateTabContent(path: string, content: string) {
  openTabs.value = openTabs.value.map((t) =>
    t.path === path ? { ...t, content, dirty: true } : t,
  );
}

export function markTabSaved(path: string) {
  openTabs.value = openTabs.value.map((t) =>
    t.path === path ? { ...t, dirty: false } : t,
  );
}

/** Uses `batch()` throughout this file's multi-signal writes for the same
 * reason `closeAllTabs` does (see its own comment): anything reacting to
 * both `openTabs` and `activeTabPath`, namely the tab-persistence effect in
 * settings/store.ts, should only ever see states that were real, not an
 * intermediate step of getting there. */
export function closeTab(path: string) {
  batch(() => {
    openTabs.value = openTabs.value.filter((t) => t.path !== path);
    if (activeTabPath.value === path) {
      activeTabPath.value = openTabs.value.at(-1)?.path ?? null;
    }
  });
}

export function closeOtherTabs(path: string) {
  batch(() => {
    openTabs.value = openTabs.value.filter((t) => t.path === path);
    activeTabPath.value = path;
  });
}

export function closeAllTabs() {
  batch(() => {
    openTabs.value = [];
    activeTabPath.value = null;
  });
}

/** Closes any open tab for `path` itself or for a file nested under it
 * (used when a folder is trashed). */
export function closeTabsUnder(path: string) {
  const isUnder = (tabPath: string) => tabPath === path || tabPath.startsWith(`${path}/`);
  const stillOpen = openTabs.value.filter((t) => !isUnder(t.path));
  if (stillOpen.length === openTabs.value.length) return;
  batch(() => {
    openTabs.value = stillOpen;
    if (activeTabPath.value && isUnder(activeTabPath.value)) {
      activeTabPath.value = stillOpen.at(-1)?.path ?? null;
    }
  });
}

/** Updates any open tab whose path is `oldPath` or nested under it to point
 * at `newPath` instead, preserving editor state across a rename. */
export function renameOpenTab(oldPath: string, newPath: string, newName: string) {
  const rewrite = (tabPath: string) =>
    tabPath === oldPath ? newPath : tabPath.startsWith(`${oldPath}/`) ? newPath + tabPath.slice(oldPath.length) : null;

  batch(() => {
    let changed = false;
    openTabs.value = openTabs.value.map((t) => {
      const rewritten = rewrite(t.path);
      if (rewritten === null) return t;
      changed = true;
      return { ...t, path: rewritten, name: rewritten === newPath ? newName : t.name };
    });

    if (changed && activeTabPath.value) {
      const rewritten = rewrite(activeTabPath.value);
      if (rewritten !== null) activeTabPath.value = rewritten;
    }
  });
}
