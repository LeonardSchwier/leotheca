import type { EditorGroupState, EditorLayoutState } from "./types";

/** Creates the one-group layout used while the legacy tab bar remains the
 * visible UI. Paths are de-duplicated here so a future second group starts
 * from the same unique-ownership invariant as the document store. */
export function createPrimaryEditorLayout(
  tabPaths: readonly string[],
  activePath: string | null,
): EditorLayoutState {
  const uniquePaths = [...new Set(tabPaths)];
  const repairedActivePath = activePath && uniquePaths.includes(activePath)
    ? activePath
    : (uniquePaths.at(-1) ?? null);
  const primary: EditorGroupState = {
    id: "primary",
    tabPaths: uniquePaths,
    pinnedPaths: [],
    activePath: repairedActivePath,
  };
  return { activeGroupId: "primary", groups: { primary } };
}

/** Repairs the primary layout from canonical documents after a tab operation,
 * preserving its valid pin region while later phases still defer secondary
 * groups and persisted layout. */
export function synchronizePrimaryEditorLayout(
  layout: EditorLayoutState,
  tabPaths: readonly string[],
  activePath: string | null,
): EditorLayoutState {
  const repaired = createPrimaryEditorLayout(tabPaths, activePath);
  const pinnedPaths = layout.groups.primary.pinnedPaths.filter((path) =>
    repaired.groups.primary.tabPaths.includes(path),
  );
  const unpinnedPaths = repaired.groups.primary.tabPaths.filter((path) => !pinnedPaths.includes(path));
  return {
    ...repaired,
    activeGroupId: "primary",
    groups: {
      primary: { ...repaired.groups.primary, tabPaths: [...pinnedPaths, ...unpinnedPaths], pinnedPaths },
      secondary: layout.groups.secondary,
    },
  };
}

/** Pins a primary-group path, placing it after existing pinned paths without
 * changing the canonical document order outside the two visible regions. */
export function pinPrimaryEditorLayout(layout: EditorLayoutState, path: string): EditorLayoutState {
  const primary = layout.groups.primary;
  if (!primary.tabPaths.includes(path) || primary.pinnedPaths.includes(path)) return layout;
  const pinnedPaths = [...primary.pinnedPaths, path];
  return {
    ...layout,
    groups: {
      ...layout.groups,
      primary: {
        ...primary,
        pinnedPaths,
        tabPaths: [...pinnedPaths, ...primary.tabPaths.filter((tabPath) => !pinnedPaths.includes(tabPath))],
      },
    },
  };
}

/** Removes a pin and returns the tab to the leading unpinned position. */
export function unpinPrimaryEditorLayout(layout: EditorLayoutState, path: string): EditorLayoutState {
  const primary = layout.groups.primary;
  if (!primary.pinnedPaths.includes(path)) return layout;
  const pinnedPaths = primary.pinnedPaths.filter((pinnedPath) => pinnedPath !== path);
  return {
    ...layout,
    groups: {
      ...layout.groups,
      primary: {
        ...primary,
        pinnedPaths,
        tabPaths: [...pinnedPaths, path, ...primary.tabPaths.filter((tabPath) => tabPath !== path && !pinnedPaths.includes(tabPath))],
      },
    },
  };
}
