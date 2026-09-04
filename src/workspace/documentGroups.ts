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

/** Repairs the compatibility layout from canonical documents after a tab
 * operation. Phase 1 has no secondary group or pins to preserve yet, which
 * keeps the old flat-tab behavior and its fallback-active-tab rule exact. */
export function synchronizePrimaryEditorLayout(
  layout: EditorLayoutState,
  tabPaths: readonly string[],
  activePath: string | null,
): EditorLayoutState {
  const repaired = createPrimaryEditorLayout(tabPaths, activePath);
  return {
    ...repaired,
    activeGroupId: "primary",
    groups: {
      primary: repaired.groups.primary,
      secondary: layout.groups.secondary,
    },
  };
}
