import { readTextFile, writeTextFile } from "../workspace/tauriBridge";

export type SortOrder = "name-asc" | "name-desc";
export type ViewMode = "source" | "split" | "preview";
/** "project-trash" moves a deleted entry into `<workspace>/.trash` (the
 * only behavior before this setting existed); "permanent" deletes it
 * outright. A third "system-trash" option (the OS's own trash/recycle bin)
 * is intentionally not offered: Android's Storage Access Framework has no
 * equivalent concept for an arbitrary picked folder, and adding it for
 * desktop only would make the setting behave differently per platform. */
export type DeleteBehavior = "project-trash" | "permanent";

/** Settings scoped to one workspace folder, stored inside that folder
 * itself (`<workspace>/.leotheca/settings.json`) so the folder is
 * self-contained and portable, the same way a project-local config
 * folder works. */
export interface WorkspaceSettings {
  version: 1;
  sortOrder: SortOrder;
  /** Applied to both the editor and the preview's reading font, in px. */
  fontSize: number;
  /** Applied once, when this workspace is opened; free to switch during
   * the session afterward without changing this setting. */
  defaultViewMode: ViewMode;
  deleteBehavior: DeleteBehavior;
  /** Paths open in the tab bar at the end of the last session, restored on
   * the next launch so the editor isn't blank every time the app starts. */
  lastOpenPaths: string[];
  lastActivePath: string | null;
  /** Whole-UI scale, as a percentage (100 = no scaling). Applied via the
   * CSS `zoom` property (see settings/store.ts), not `transform: scale()`:
   * `zoom` genuinely reflows layout and keeps pointer-event coordinates
   * (getBoundingClientRect, clientX/clientY) consistent with what's drawn,
   * which the graph view's canvas hit-testing depends on. A transform-based
   * scale would visually resize things without moving the layout boxes
   * pointer math reads from, breaking clicks in the scaled area. */
  uiZoom: number;
}

export const MIN_UI_ZOOM = 50;
export const MAX_UI_ZOOM = 200;
export const MIN_FONT_SIZE = 12;
export const MAX_FONT_SIZE = 24;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  version: 1,
  sortOrder: "name-asc",
  fontSize: 15,
  defaultViewMode: "source",
  deleteBehavior: "project-trash",
  lastOpenPaths: [],
  lastActivePath: null,
  uiZoom: 100,
};

// Plain string join is intentional here (not a path-resolution API call):
// both target platforms (Linux, Android) use forward slashes, and the
// result is always relative to a workspace path this app already owns.
function workspaceSettingsPath(workspacePath: string): string {
  return `${workspacePath}/.leotheca/settings.json`;
}

export async function loadWorkspaceSettings(workspacePath: string): Promise<WorkspaceSettings> {
  try {
    const raw = await readTextFile(workspaceSettingsPath(workspacePath));
    return { ...DEFAULT_WORKSPACE_SETTINGS, ...(JSON.parse(raw) as Partial<WorkspaceSettings>) };
  } catch {
    return DEFAULT_WORKSPACE_SETTINGS;
  }
}

export async function saveWorkspaceSettings(
  workspacePath: string,
  settings: WorkspaceSettings,
): Promise<void> {
  await writeTextFile(workspaceSettingsPath(workspacePath), JSON.stringify(settings, null, 2));
}
