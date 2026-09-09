import type { EditorGroupId, EditorGroupState, EditorLayoutState } from "./types";

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
    viewMode: "source",
  };
  return {
    activeGroupId: "primary",
    splitEnabled: false,
    preferredRatio: 0.5,
    compactVisibleGroupId: "primary",
    groups: { primary },
  };
}

/** Repairs the primary layout from canonical documents after a tab operation,
 * preserving its valid pin region and split fields while later phases still
 * defer secondary groups and persisted layout. */
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
    // Preserve split-related fields from the original layout
    splitEnabled: layout.splitEnabled,
    preferredRatio: layout.preferredRatio,
    compactVisibleGroupId: layout.compactVisibleGroupId,
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

// ============ F07 Phase 2b-6: Split Panes Support ============

/** Gets a group by ID from the layout. */
function getGroup(layout: EditorLayoutState, groupId: EditorGroupId): EditorGroupState | undefined {
  return groupId === "primary" ? layout.groups.primary : layout.groups.secondary;
}

/** Helper to update a specific group. */
function updateGroup(
  layout: EditorLayoutState,
  groupId: EditorGroupId,
  updateFn: (group: EditorGroupState) => EditorGroupState,
): EditorLayoutState {
  const group = getGroup(layout, groupId);
  if (!group) return layout;

  const updatedGroup = updateFn(group);
  if (updatedGroup === group) return layout;
  return {
    ...layout,
    groups: {
      primary: groupId === "primary" ? updatedGroup : layout.groups.primary,
      secondary: groupId === "secondary" ? updatedGroup : layout.groups.secondary,
    },
  };
}

/** Creates a secondary editor group with optional initial tab. */
export function createSplitLayout(
  layout: EditorLayoutState,
  initialTabPath: string | null = null,
): EditorLayoutState {
  const primary = layout.groups.primary;
  const newSecondary: EditorGroupState = {
    id: "secondary",
    tabPaths: initialTabPath ? [initialTabPath] : [],
    pinnedPaths: [],
    activePath: initialTabPath ?? null,
    viewMode: "preview",
  };
  return {
    ...layout,
    splitEnabled: true,
    activeGroupId: initialTabPath ? "secondary" : "primary",
    compactVisibleGroupId: "primary",
    groups: {
      primary: {
        ...primary,
        tabPaths: primary.tabPaths.filter((p) => p !== initialTabPath),
        activePath: primary.activePath === initialTabPath && primary.tabPaths.length > 1
          ? primary.tabPaths.find((p) => p !== initialTabPath) ?? null
          : primary.activePath,
      },
      secondary: newSecondary,
    },
  };
}

/** Moves a tab from one group to another. */
export function moveTabToGroup(
  layout: EditorLayoutState,
  path: string,
  targetGroupId: EditorGroupId,
): EditorLayoutState {
  const sourceGroup = getGroup(layout, layout.activeGroupId);
  const targetGroup = getGroup(layout, targetGroupId);
  
  if (!sourceGroup || !targetGroup || !sourceGroup.tabPaths.includes(path)) {
    return layout;
  }
  
  if (targetGroup.tabPaths.includes(path)) {
    return layout;
  }
  
  const newSource: EditorGroupState = {
    ...sourceGroup,
    tabPaths: sourceGroup.tabPaths.filter((p) => p !== path),
    pinnedPaths: sourceGroup.pinnedPaths.filter((p) => p !== path),
    activePath: sourceGroup.activePath === path && sourceGroup.tabPaths.length > 1
      ? sourceGroup.tabPaths.find((p) => p !== path) ?? null
      : sourceGroup.activePath,
  };
  
  const newTarget: EditorGroupState = {
    ...targetGroup,
    tabPaths: [...targetGroup.tabPaths, path],
    activePath: targetGroup.activePath ?? path,
  };
  
  return {
    ...layout,
    activeGroupId: targetGroupId,
    groups: {
      primary: layout.activeGroupId === "primary" ? newSource : (targetGroupId === "primary" ? newTarget : layout.groups.primary),
      secondary: layout.activeGroupId === "secondary" ? newSource : (targetGroupId === "secondary" ? newTarget : layout.groups.secondary),
    },
  };
}

/** Closes the secondary group, merging its tabs into primary. */
export function mergeSecondaryIntoPrimary(layout: EditorLayoutState): EditorLayoutState {
  if (!layout.splitEnabled || !layout.groups.secondary) {
    return layout;
  }
  
  const primary = layout.groups.primary;
  const secondary = layout.groups.secondary;
  
  const allPinned = [...primary.pinnedPaths, ...(secondary.pinnedPaths || [])];
  const allUnpinned = [
    ...primary.tabPaths.filter((p) => !allPinned.includes(p)),
    ...(secondary.tabPaths || []).filter((p) => !allPinned.includes(p)),
  ];
  
  const newPrimary: EditorGroupState = {
    ...primary,
    tabPaths: [...allPinned, ...allUnpinned],
    pinnedPaths: allPinned,
    activePath: secondary.activePath ?? primary.activePath,
  };
  
  return {
    ...layout,
    splitEnabled: false,
    activeGroupId: "primary",
    compactVisibleGroupId: "primary",
    groups: {
      primary: newPrimary,
      secondary: undefined,
    },
  };
}

/** Updates the split ratio preference. */
export function updateSplitRatio(layout: EditorLayoutState, ratio: number): EditorLayoutState {
  return {
    ...layout,
    preferredRatio: Math.max(0.30, Math.min(0.70, ratio)),
  };
}

/** Activates a specific group. */
export function activateGroup(layout: EditorLayoutState, groupId: EditorGroupId): EditorLayoutState {
  if (!getGroup(layout, groupId)) {
    return layout;
  }
  return {
    ...layout,
    activeGroupId: groupId,
  };
}

/** Pins a path in any group, placing it after existing pinned paths. */
export function pinGroupTab(layout: EditorLayoutState, groupId: EditorGroupId, path: string): EditorLayoutState {
  return updateGroup(layout, groupId, (group) => {
    if (!group.tabPaths.includes(path) || group.pinnedPaths.includes(path)) return group;
    const pinnedPaths = [...group.pinnedPaths, path];
    return {
      ...group,
      pinnedPaths,
      tabPaths: [...pinnedPaths, ...group.tabPaths.filter((tabPath) => !pinnedPaths.includes(tabPath))],
    };
  });
}

/** Removes a pin from any group, returning the tab to the leading unpinned position. */
export function unpinGroupTab(layout: EditorLayoutState, groupId: EditorGroupId, path: string): EditorLayoutState {
  return updateGroup(layout, groupId, (group) => {
    if (!group.pinnedPaths.includes(path)) return group;
    const pinnedPaths = group.pinnedPaths.filter((pinnedPath) => pinnedPath !== path);
    return {
      ...group,
      pinnedPaths,
      tabPaths: [...pinnedPaths, path, ...group.tabPaths.filter((tabPath) => tabPath !== path && !pinnedPaths.includes(tabPath))],
    };
  });
}
