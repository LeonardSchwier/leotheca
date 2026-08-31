import { readTextFile, writeWorkspaceTextFile } from "../workspace/tauriBridge";

export type SortOrder = "name-asc" | "name-desc";
export type ViewMode = "source" | "split" | "preview";
/** "project-trash" moves a deleted entry into `<workspace>/.trash` (the
 * only behavior before this setting existed); "permanent" deletes it
 * outright. A third "system-trash" option (the OS's own trash/recycle bin)
 * is intentionally not offered: Android's Storage Access Framework has no
 * equivalent concept for an arbitrary picked folder, and adding it for
 * desktop only would make the setting behave differently per platform. */
export type DeleteBehavior = "project-trash" | "permanent";
export type AccentColor = "warm" | "ocean" | "forest" | "plum";

/** One entry in the graph view's color-groups list (see
 * graph/GraphView.tsx): every note whose display name contains `query`
 * (case-insensitive substring, matching this app's existing search
 * semantics) is drawn with `color` instead of the graph's default node
 * color. Groups are matched in array order, first match wins, so the
 * array's order is itself the group priority, not just insertion history. */
export interface GraphColorGroup {
  id: string;
  query: string;
  /** A CSS color string, always a `#rrggbb` hex value in practice since
   * it's only ever written by an `<input type="color">`. */
  color: string;
}

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
  /** Whether `[[wikilink]]` resolution, autocomplete, and backlinks also
   * consider a note's `aliases:` frontmatter field, not just its file
   * name (see linking/frontmatter.ts). Defaults to on; this exists as an
   * opt-out per CONSTITUTION.md's "Daily competitor feature scan" policy,
   * which requires net-new functionality queued from that scan to ship
   * toggleable rather than imposed unconditionally. */
  frontmatterAliasesEnabled: boolean;
  /** Whether $inline$ and $$block$$ LaTeX math renders via KaTeX in
   * Preview (see editor/MarkdownPreview.tsx). Defaults to on; also an
   * opt-out per CONSTITUTION.md's "Daily competitor feature scan" policy. */
  mathRenderingEnabled: boolean;
  /** Whether pasting or dropping an image into the editor saves it as a
   * new attachment file and inserts a markdown link to it (see
   * editor/attachments.ts and editor/MarkdownEditor.tsx). Defaults to
   * on; also an opt-out per CONSTITUTION.md's "Daily competitor feature
   * scan" policy, since this is net-new functionality, not existing
   * behavior being made configurable. */
  pasteImagesEnabled: boolean;
  /** Where a new attachment saved by pasting/dropping an image goes:
   * empty means next to the note that embeds it (this app's behavior
   * before this setting existed), otherwise a path relative to the
   * workspace root (e.g. "attachments"). Only affects where *new*
   * attachments are saved; an existing image link anywhere in the
   * workspace still resolves the same way it always has, relative to
   * the note that embeds it. */
  attachmentsFolder: string;
  /** Whether a "Properties" panel above the editor shows a note's
   * frontmatter fields (scalars and flat lists only, see
   * linking/frontmatter.ts's parseFrontmatterFields) as editable rows.
   * Defaults to on; also an opt-out per CONSTITUTION.md's "Daily
   * competitor feature scan" policy. Off, frontmatter is only ever
   * edited as raw text, same as before this feature existed. */
  frontmatterPropertiesEnabled: boolean;
  /** User-defined groups that color graph nodes matching a text query
   * differently from the graph's default node color (see
   * graph/GraphView.tsx). Empty by default, same as the graph view
   * itself: nothing is colored differently until the user defines a
   * group, so this doesn't change the graph's existing appearance for
   * anyone who never opens the new color-groups panel. */
  graphColorGroups: GraphColorGroup[];
  /** Whether `#tag` syntax and the `tags:` frontmatter field feed the Tags
   * panel (see tags/tags.ts and tags/TagsPanel.tsx). Defaults to on; also
   * an opt-out per CONSTITUTION.md's "Daily competitor feature scan"
   * policy. Off, the panel is empty and rebuildLinkIndex doesn't build
   * pathsByTag/tagsByPath at all, the same as before this feature existed. */
  tagsEnabled: boolean;
  /** Whether the "New note from template" command (see
   * workspace/fileTreeStore.ts's listTemplates/createNoteFromTemplate) is
   * offered at all. Defaults to on; ships as its own opt-out toggle
   * because this item's own ROADMAP.md entry requires "a separate
   * opt-out setting for each new capability" it adds. Off, the command
   * palette entry doesn't appear, the same as before this feature existed. */
  templatesEnabled: boolean;
  /** Where template notes are read from, as a path relative to the
   * workspace root (see listTemplates). Every Markdown file directly
   * inside this folder (not recursive, so the picker stays a flat list)
   * is offered as a template; a missing folder just means no templates
   * yet, not an error. */
  templatesFolder: string;
  /** Whether file-backed canvases can be created and opened. */
  canvasEnabled: boolean;
  /** Whether the workspace-specific accent choice is applied. */
  themesEnabled: boolean;
  /** A restrained accent choice that leaves the light/dark palette intact. */
  accentColor: AccentColor;
  /** Whether typing a configured `;trigger` followed by Tab expands it. */
  snippetsEnabled: boolean;
  /** One snippet per line: `trigger<TAB>replacement`. Stored with the
   * workspace so reusable local writing patterns travel with it. */
  snippets: string;
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
  frontmatterAliasesEnabled: true,
  mathRenderingEnabled: true,
  pasteImagesEnabled: true,
  attachmentsFolder: "",
  frontmatterPropertiesEnabled: true,
  graphColorGroups: [],
  tagsEnabled: true,
  templatesEnabled: true,
  templatesFolder: "Templates",
  canvasEnabled: true,
  themesEnabled: true,
  accentColor: "warm",
  snippetsEnabled: true,
  snippets: "todo\t- [ ] ",
};

// Plain string join is intentional here (not a path-resolution API call):
// every workspace path this app hands back to the frontend, on every
// platform including Windows, is already forward-slash-separated (see
// workspace/paths.ts's own comment on where that's normalized), and the
// result is always relative to a workspace path this app already owns.
function workspaceSettingsPath(workspacePath: string): string {
  return `${workspacePath}/.leotheca/settings.json`;
}

export async function loadWorkspaceSettings(
  workspacePath: string,
): Promise<WorkspaceSettings> {
  try {
    const raw = await readTextFile(workspaceSettingsPath(workspacePath));
    return {
      ...DEFAULT_WORKSPACE_SETTINGS,
      ...(JSON.parse(raw) as Partial<WorkspaceSettings>),
    };
  } catch {
    return DEFAULT_WORKSPACE_SETTINGS;
  }
}

export async function saveWorkspaceSettings(
  workspacePath: string,
  settings: WorkspaceSettings,
): Promise<void> {
  await writeWorkspaceTextFile(
    workspacePath,
    ".leotheca/settings.json",
    JSON.stringify(settings, null, 2),
  );
}
