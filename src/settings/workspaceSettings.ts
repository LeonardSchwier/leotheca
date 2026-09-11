import {
  anyCorrupt,
  decodeArrayDroppingInvalidEntries,
  decodeBoolean,
  decodeEnum,
  decodeNullableString,
  decodeNumberInRange,
  decodeRelativeFolder,
  decodeString,
  decodeStringArray,
} from "./decode";
import { isPathWithinWorkspace } from "../workspace/paths";
import { readTextFile, writeWorkspaceTextFile } from "../workspace/tauriBridge";
import { createPrimaryEditorLayout } from "../workspace/documentGroups";
import type { EditorLayoutState, ViewMode } from "../workspace/types";

export type { ViewMode };
export type SortOrder = "name-asc" | "name-desc";
const SORT_ORDERS: readonly SortOrder[] = ["name-asc", "name-desc"];
const VIEW_MODES: readonly ViewMode[] = ["source", "split", "preview"];
/** "project-trash" moves a deleted entry into `<workspace>/.trash` (the
 * only behavior before this setting existed); "permanent" deletes it
 * outright. A third "system-trash" option (the OS's own trash/recycle bin)
 * is intentionally not offered: Android's Storage Access Framework has no
 * equivalent concept for an arbitrary picked folder, and adding it for
 * desktop only would make the setting behave differently per platform. */
export type DeleteBehavior = "project-trash" | "permanent";
const DELETE_BEHAVIORS: readonly DeleteBehavior[] = [
  "project-trash",
  "permanent",
];
export type AccentColor = "warm" | "ocean" | "forest" | "plum";
const ACCENT_COLORS: readonly AccentColor[] = [
  "warm",
  "ocean",
  "forest",
  "plum",
];

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
  version: 1 | 2;
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
  /** F07 Phase 2b: persisted editor layout state including split groups,
   * pinned tabs, and active paths. Version 2+ only; version 1
   * workspaces continue to use lastOpenPaths/lastActivePath for backward
   * compatibility. Legacy migration is planned for a future phase. */
  editorLayout?: EditorLayoutState;
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
  /** Whether `[[wikilink]]` syntax is parsed through F04 Phase 1's
   * structured grammar (see linking/wikiSyntax.ts and
   * linking/wikiResolver.ts): heading fragments (`[[Note#Heading]]`,
   * `[[#Heading]]`) and the `|Label` separator both resolve and render
   * as designed, and Preview click navigation follows a resolved
   * heading fragment to its target (spec
   * spec/f04-heading-block-links-embeds.md, section 21 Phase 1). Off,
   * `[[...]]` parses exactly as it did before this feature existed: the
   * complete text between the brackets is used whole as the note name,
   * with no `#`/`|` splitting at all. Defaults to on, per
   * CONSTITUTION.md's "Daily competitor feature scan" opt-out policy for
   * net-new functionality, matching every other feature flag in this
   * file. */
  headingLinksEnabled: boolean;
  /** Whether file-backed Collections (see collections/collectionStore.ts,
   * `.leotheca/collections.json`) can be created and opened at all.
   * Unlike every other feature flag in this file, this one defaults to
   * **off**: a deliberate, explicit deviation from CONSTITUTION.md's
   * "Daily competitor feature scan" opt-out-by-default convention, per
   * the maintainer's own direct instruction (2026-09-03) rather than a
   * competitor-parity claim. Off, the toolbar button, command palette
   * entry, and sidebar panel are all hidden, the same as before this
   * feature existed. */
  collectionsEnabled: boolean;
  /** Whether the per-note frontmatter lock UI and its edit guards are active. */
  noteReadOnlyLockEnabled: boolean;
  /** RTL Phase 2: Whether the workspace chrome (sidebar, toolbar) is mirrored for RTL languages. */
  rtlWorkspaceEnabled: boolean;
  /** F05: Default folder path for quick captures, relative to workspace root.
   * Empty means captures go to the currently selected directory. */
  captureInboxFolder: string;
  /** F05: Path to the inbox note for append mode, relative to workspace root. */
  captureInboxNote: string;
  /** F05: Date-pattern destination for new captures (e.g., "Daily/{{date:YYYY-MM-DD}}.md") */
  captureDatePattern: string;
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
  editorLayout: createPrimaryEditorLayout([], null),
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
  headingLinksEnabled: true,
  collectionsEnabled: false,
  noteReadOnlyLockEnabled: true,
  rtlWorkspaceEnabled: false,
  captureInboxFolder: "",
  captureInboxNote: "Inbox.md",
  captureDatePattern: "",
};

// Plain string join is intentional here (not a path-resolution API call):
// every workspace path this app hands back to the frontend, on every
// platform including Windows, is already forward-slash-separated (see
// workspace/paths.ts's own comment on where that's normalized), and the
// result is always relative to a workspace path this app already owns.
function workspaceSettingsPath(workspacePath: string): string {
  return `${workspacePath}/.leotheca/settings.json`;
}

function isValidGraphColorGroup(entry: unknown): entry is GraphColorGroup {
  if (typeof entry !== "object" || entry === null) return false;
  const candidate = entry as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    candidate.id !== "" &&
    typeof candidate.query === "string" &&
    typeof candidate.color === "string" &&
    /^#[0-9a-fA-F]{6}$/.test(candidate.color)
  );
}

export interface DecodedWorkspaceSettings {
  settings: WorkspaceSettings;
  /** True when the persisted file existed but at least one field (or the
   * file as a whole) did not decode as written: a JSON syntax error, a
   * wrong type, an out-of-range number, an unrecognized enum value, a
   * path escaping the workspace, or an unrecognized `version`. False for
   * the ordinary case of a missing file or a missing-but-valid field,
   * neither of which is corruption. Callers must not treat a corrupt
   * result as license to immediately persist the defaulted values back
   * over the original file; see saveWorkspaceSettings's own callers. */
  corrupt: boolean;
}

/** Decodes a workspace settings file's raw text against `workspaceRoot`
 * (needed to validate that `lastOpenPaths`/`lastActivePath` entries
 * actually resolve inside the workspace, not just that they're strings).
 * Unknown top-level fields (a newer app version's own settings this one
 * doesn't recognize yet) are preserved by spreading the parsed record
 * before overlaying validated known fields on top, so round-tripping
 * through `saveWorkspaceSettings` doesn't silently drop them. Exported
 * separately from `loadWorkspaceSettings` so its fixtures can exercise it
 * directly, without a native file read in the way. */

// F07 Phase 2b: validate editorLayout if present (version 2+).
// Version 1 workspaces won't have this field and continue to use
// lastOpenPaths/lastActivePath. This validator enforces all F07 spec
// invariants from section 9.1: primary always exists; path uniqueness;
// every pinned path occurs in its group's tabPaths; active path membership;
// ratio clamped to [0.30, 0.70]; all paths workspace-relative strings.
export function isValidEditorLayoutState(
  value: unknown,
  _workspaceRoot: string,
): value is EditorLayoutState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const layout = value as Record<string, unknown>;
  
  // Check required fields per spec 9.1 interface - these must be present and valid
  if (typeof layout.splitEnabled !== "boolean") return false;
  if (typeof layout.preferredRatio !== "number" || !Number.isFinite(layout.preferredRatio)) return false;
  // Spec 6.6: ratio clamped to [0.30, 0.70] for persistence; runtime may temporarily clamp tighter
  if (layout.preferredRatio < 0.30 || layout.preferredRatio > 0.70) return false;
  if (layout.activeGroupId !== "primary" && layout.activeGroupId !== "secondary") return false;
  if (layout.compactVisibleGroupId !== "primary" && layout.compactVisibleGroupId !== "secondary") return false;
  
  // Check groups structure
  if (typeof layout.groups !== "object" || layout.groups === null) return false;
  const groups = layout.groups as Record<string, unknown>;
  
  // Invariant: primary always exists
  if (!groups.primary || typeof groups.primary !== "object") return false;
  const primary = groups.primary as Record<string, unknown>;
  if (primary.id !== "primary") return false;
  
  // Check primary group structure
  if (!Array.isArray(primary.tabPaths)) return false;
  if (!Array.isArray(primary.pinnedPaths)) return false;
  if (primary.activePath !== undefined && primary.activePath !== null && typeof primary.activePath !== "string") return false;
  // Spec 5.4: viewMode is required on new layouts, but a v2 editorLayout
  // written before this field existed has no viewMode at all. Treating that
  // as invalid would fall through neither the valid-v2 nor legacy-migration
  // branch in decodeWorkspaceSettings, flag a perfectly good file as
  // corrupt, and silently discard the user's real open/pinned tabs. Missing
  // stays accepted; only a present-and-wrong value is rejected.
  if (primary.viewMode !== undefined && primary.viewMode !== "source" && primary.viewMode !== "split" && primary.viewMode !== "preview") return false;
  
  // Invariant: all paths are normalized contained workspace-relative strings
  const allPaths: string[] = [];
  const primaryTabPaths = primary.tabPaths as string[];
  
  // Validate all paths in primary
  for (const path of primaryTabPaths) {
    if (typeof path !== "string") return false;
    // Reject null bytes
    if (path.includes("\u0000")) return false;
    // Reject path traversal and backslashes
    if (path.includes("..") || path.includes("\\")) return false;
    // Reject empty paths (they should not appear in tab arrays)
    if (path === "") return false;
    // For absolute paths, check they are within workspace; for relative paths, accept as-is
    if (path.startsWith("/") && !isPathWithinWorkspace(_workspaceRoot, path)) return false;
    allPaths.push(path);
  }
  
  // Check optional secondary group
  if (groups.secondary !== undefined) {
    const secondary = groups.secondary as Record<string, unknown>;
    if (typeof secondary !== "object" || secondary === null) return false;
    if (secondary.id !== "secondary") return false;
    if (!Array.isArray(secondary.tabPaths)) return false;
    if (!Array.isArray(secondary.pinnedPaths)) return false;
    if (secondary.activePath !== undefined && secondary.activePath !== null && typeof secondary.activePath !== "string") return false;
    // Spec 5.4: viewMode is required on new layouts; see the primary-group
    // comment above for why a pre-existing v2 file without it must still
    // validate rather than be treated as corrupt.
    if (secondary.viewMode !== undefined && secondary.viewMode !== "source" && secondary.viewMode !== "split" && secondary.viewMode !== "preview") return false;
    
    const secondaryTabPaths = secondary.tabPaths as string[];
    // Validate all paths in secondary
    for (const path of secondaryTabPaths) {
      if (typeof path !== "string") return false;
      // Reject null bytes
      if (path.includes("\u0000")) return false;
      // Reject path traversal and backslashes
      if (path.includes("..") || path.includes("\\")) return false;
      // Reject empty paths (they should not appear in tab arrays)
      if (path === "") return false;
      // For absolute paths, check they are within workspace; for relative paths, accept as-is
      if (path.startsWith("/") && !isPathWithinWorkspace(_workspaceRoot, path)) return false;
      allPaths.push(path);
    }
  }
  
  // Invariant: path occurs in at most one tabPaths array (uniqueness)
  const seenPaths = new Set<string>();
  for (const path of allPaths) {
    if (seenPaths.has(path)) return false;
    seenPaths.add(path);
  }
  
  // Invariant: every pinned path occurs in its group's tabPaths
  const primaryPinnedPaths = primary.pinnedPaths as unknown[];
  if (!Array.isArray(primaryPinnedPaths)) return false;
  const primaryTabSet = new Set(primaryTabPaths);
  for (const pinnedPath of primaryPinnedPaths) {
    if (typeof pinnedPath !== "string") return false;
    // Pinned paths must also be valid paths (no null bytes, traversal, etc.)
    if (pinnedPath.includes("\u0000") || pinnedPath.includes("..") || pinnedPath.includes("\\")) return false;
    // For absolute paths, check they are within workspace
    if (pinnedPath.startsWith("/") && !isPathWithinWorkspace(_workspaceRoot, pinnedPath)) return false;
    if (!primaryTabSet.has(pinnedPath)) return false;
  }
  
  if (groups.secondary !== undefined) {
    const secondary = groups.secondary as Record<string, unknown>;
    const secondaryPinnedPaths = secondary.pinnedPaths as unknown[];
    if (!Array.isArray(secondaryPinnedPaths)) return false;
    const secondaryTabPaths = secondary.tabPaths as string[];
    const secondaryTabSet = new Set(secondaryTabPaths);
    for (const pinnedPath of secondaryPinnedPaths) {
      if (typeof pinnedPath !== "string") return false;
      // Pinned paths must also be valid paths (no null bytes, traversal, etc.)
      if (pinnedPath.includes("\u0000") || pinnedPath.includes("..") || pinnedPath.includes("\\")) return false;
      // For absolute paths, check they are within workspace
      if (pinnedPath.startsWith("/") && !isPathWithinWorkspace(_workspaceRoot, pinnedPath)) return false;
      if (!secondaryTabSet.has(pinnedPath)) return false;
    }
  }
  
  // Invariant: active path is absent only when the group has no tabs; active path belongs to its group
  if (primaryTabPaths.length === 0) {
    if (primary.activePath !== undefined && primary.activePath !== null) return false;
  } else {
    if (primary.activePath !== undefined && primary.activePath !== null) {
      if (typeof primary.activePath !== "string") return false;
      if (!primaryTabSet.has(primary.activePath)) return false;
    }
  }
  
  if (groups.secondary !== undefined) {
    const secondary = groups.secondary as Record<string, unknown>;
    const secondaryTabPaths = secondary.tabPaths as string[];
    const secondaryTabSet = new Set(secondaryTabPaths);
    if (secondaryTabPaths.length === 0) {
      if (secondary.activePath !== undefined && secondary.activePath !== null) return false;
    } else {
      if (secondary.activePath !== undefined && secondary.activePath !== null) {
        if (typeof secondary.activePath !== "string") return false;
        if (!secondaryTabSet.has(secondary.activePath)) return false;
      }
    }
  }
  
  // Invariant: activeGroupId must reference an existing group
  if (layout.activeGroupId === "secondary" && groups.secondary === undefined) return false;
  
  // Invariant: compactVisibleGroupId must reference an existing group (though secondary can exist but be hidden)
  if (layout.compactVisibleGroupId === "secondary" && groups.secondary === undefined) return false;
  
  return true;
}

// F07 Phase 2b: Legacy migration for v1 workspaces.
// Converts v1 lastOpenPaths/lastActivePath to v2 editorLayout format.
// Spec: f07-split-panes-pinned-tabs.md section 10.2
// This is a pure function, deterministic and idempotent.
export function migrateLegacyToEditorLayout(
  lastOpenPaths: string[],
  lastActivePath: string | null,
): EditorLayoutState {
  // De-duplicate paths while preserving order (first occurrence wins)
  const seen = new Set<string>();
  const uniquePaths: string[] = [];
  for (const path of lastOpenPaths) {
    if (typeof path === "string" && path !== "" && !seen.has(path)) {
      seen.add(path);
      uniquePaths.push(path);
    }
  }
  
  // Determine active path: use lastActivePath if it's in the unique set, otherwise last path or null
  const activePath = lastActivePath !== null && seen.has(lastActivePath)
    ? lastActivePath
    : (uniquePaths.length > 0 ? uniquePaths[uniquePaths.length - 1] : null);
  
  return {
    activeGroupId: "primary",
    splitEnabled: false,
    preferredRatio: 0.5,
    compactVisibleGroupId: "primary",
    groups: {
      primary: {
        id: "primary",
        tabPaths: uniquePaths,
        pinnedPaths: [],
        activePath,
        viewMode: "source",
      },
    },
  };
}

// F07 Phase 2b: Check if this is a v1 workspace (no editorLayout field).
export function isLegacyWorkspace(record: Record<string, unknown>): boolean {
  return record.editorLayout === undefined &&
         (Array.isArray(record.lastOpenPaths) || record.lastActivePath !== undefined);
}

/** `isValidEditorLayoutState` deliberately accepts a primary/secondary group
 * with no `viewMode` at all: a real v2 file written before that field
 * existed (see that function's own comment for why rejecting it would be
 * worse than accepting it). But `EditorLayoutState`'s type declares
 * `viewMode` as a required `ViewMode`, not optional, so passing such a
 * layout through unchanged gives every later consumer
 * (`restorePrimaryEditorLayout` included) a group whose `viewMode` is
 * `undefined` at runtime despite its type -- an invariant break of exactly
 * the kind this project's own history has already shipped once (the F07
 * Phase 2b-6 `viewMode`-required regression). Filling in the same default
 * `createPrimaryEditorLayout`/`createSplitLayout` already use for a freshly
 * created group closes that gap once here, so every other call site can
 * keep trusting the type. */
function withDefaultedViewModes(layout: EditorLayoutState): EditorLayoutState {
  const primaryNeedsDefault = layout.groups.primary.viewMode === undefined;
  const secondaryNeedsDefault =
    layout.groups.secondary !== undefined && layout.groups.secondary.viewMode === undefined;
  if (!primaryNeedsDefault && !secondaryNeedsDefault) return layout;
  return {
    ...layout,
    groups: {
      primary: primaryNeedsDefault
        ? { ...layout.groups.primary, viewMode: "source" }
        : layout.groups.primary,
      secondary: secondaryNeedsDefault
        ? { ...layout.groups.secondary!, viewMode: "preview" }
        : layout.groups.secondary,
    },
  };
}

export function decodeWorkspaceSettings(
  raw: string,
  workspaceRoot: string,
): DecodedWorkspaceSettings {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { settings: DEFAULT_WORKSPACE_SETTINGS, corrupt: true };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { settings: DEFAULT_WORKSPACE_SETTINGS, corrupt: true };
  }
  const record = parsed as Record<string, unknown>;

  const sortOrder = decodeEnum(
    record.sortOrder,
    SORT_ORDERS,
    DEFAULT_WORKSPACE_SETTINGS.sortOrder,
  );
  const fontSize = decodeNumberInRange(
    record.fontSize,
    MIN_FONT_SIZE,
    MAX_FONT_SIZE,
    DEFAULT_WORKSPACE_SETTINGS.fontSize,
  );
  const defaultViewMode = decodeEnum(
    record.defaultViewMode,
    VIEW_MODES,
    DEFAULT_WORKSPACE_SETTINGS.defaultViewMode,
  );
  const deleteBehavior = decodeEnum(
    record.deleteBehavior,
    DELETE_BEHAVIORS,
    DEFAULT_WORKSPACE_SETTINGS.deleteBehavior,
  );

  const decodedLastOpenPaths = decodeStringArray(
    record.lastOpenPaths,
    DEFAULT_WORKSPACE_SETTINGS.lastOpenPaths,
  );
  const containedLastOpenPaths = decodedLastOpenPaths.value.filter((path) =>
    isPathWithinWorkspace(workspaceRoot, path),
  );
  const lastOpenPaths = {
    value: containedLastOpenPaths,
    corrupt:
      decodedLastOpenPaths.corrupt ||
      containedLastOpenPaths.length !== decodedLastOpenPaths.value.length,
  };

  const decodedLastActivePath = decodeNullableString(
    record.lastActivePath,
    DEFAULT_WORKSPACE_SETTINGS.lastActivePath,
  );
  const lastActivePathEscapesWorkspace =
    decodedLastActivePath.value !== null &&
    !isPathWithinWorkspace(workspaceRoot, decodedLastActivePath.value);
  const lastActivePath = {
    value: lastActivePathEscapesWorkspace ? null : decodedLastActivePath.value,
    corrupt: decodedLastActivePath.corrupt || lastActivePathEscapesWorkspace,
  };

  const uiZoom = decodeNumberInRange(
    record.uiZoom,
    MIN_UI_ZOOM,
    MAX_UI_ZOOM,
    DEFAULT_WORKSPACE_SETTINGS.uiZoom,
  );
  const frontmatterAliasesEnabled = decodeBoolean(
    record.frontmatterAliasesEnabled,
    DEFAULT_WORKSPACE_SETTINGS.frontmatterAliasesEnabled,
  );
  const mathRenderingEnabled = decodeBoolean(
    record.mathRenderingEnabled,
    DEFAULT_WORKSPACE_SETTINGS.mathRenderingEnabled,
  );
  const pasteImagesEnabled = decodeBoolean(
    record.pasteImagesEnabled,
    DEFAULT_WORKSPACE_SETTINGS.pasteImagesEnabled,
  );
  const attachmentsFolder = decodeRelativeFolder(
    record.attachmentsFolder,
    DEFAULT_WORKSPACE_SETTINGS.attachmentsFolder,
  );
  const captureInboxFolder = decodeRelativeFolder(
    record.captureInboxFolder,
    DEFAULT_WORKSPACE_SETTINGS.captureInboxFolder,
  );
  const captureInboxNote = decodeString(
    record.captureInboxNote,
    DEFAULT_WORKSPACE_SETTINGS.captureInboxNote,
  );
  const captureDatePattern = decodeNullableString(
    record.captureDatePattern,
    DEFAULT_WORKSPACE_SETTINGS.captureDatePattern,
  );
  const frontmatterPropertiesEnabled = decodeBoolean(
    record.frontmatterPropertiesEnabled,
    DEFAULT_WORKSPACE_SETTINGS.frontmatterPropertiesEnabled,
  );
  const graphColorGroups = decodeArrayDroppingInvalidEntries(
    record.graphColorGroups,
    DEFAULT_WORKSPACE_SETTINGS.graphColorGroups,
    isValidGraphColorGroup,
  );
  const tagsEnabled = decodeBoolean(
    record.tagsEnabled,
    DEFAULT_WORKSPACE_SETTINGS.tagsEnabled,
  );
  const templatesEnabled = decodeBoolean(
    record.templatesEnabled,
    DEFAULT_WORKSPACE_SETTINGS.templatesEnabled,
  );
  const templatesFolder = decodeRelativeFolder(
    record.templatesFolder,
    DEFAULT_WORKSPACE_SETTINGS.templatesFolder,
  );
  const canvasEnabled = decodeBoolean(
    record.canvasEnabled,
    DEFAULT_WORKSPACE_SETTINGS.canvasEnabled,
  );
  const themesEnabled = decodeBoolean(
    record.themesEnabled,
    DEFAULT_WORKSPACE_SETTINGS.themesEnabled,
  );
  const accentColor = decodeEnum(
    record.accentColor,
    ACCENT_COLORS,
    DEFAULT_WORKSPACE_SETTINGS.accentColor,
  );
  const snippetsEnabled = decodeBoolean(
    record.snippetsEnabled,
    DEFAULT_WORKSPACE_SETTINGS.snippetsEnabled,
  );
  const snippets = decodeString(
    record.snippets,
    DEFAULT_WORKSPACE_SETTINGS.snippets,
  );
  const headingLinksEnabled = decodeBoolean(
    record.headingLinksEnabled,
    DEFAULT_WORKSPACE_SETTINGS.headingLinksEnabled,
  );
  const collectionsEnabled = decodeBoolean(
    record.collectionsEnabled,
    DEFAULT_WORKSPACE_SETTINGS.collectionsEnabled,
  );
  const noteReadOnlyLockEnabled = decodeBoolean(
    record.noteReadOnlyLockEnabled,
    DEFAULT_WORKSPACE_SETTINGS.noteReadOnlyLockEnabled,
  );
  const rtlWorkspaceEnabled = decodeBoolean(
    record.rtlWorkspaceEnabled,
    DEFAULT_WORKSPACE_SETTINGS.rtlWorkspaceEnabled,
  );


  // F07 Phase 2b: decode editorLayout with legacy migration
  // Priority: 1) valid v2 editorLayout, 2) migrate from v1 legacy, 3) default
  const editorLayoutRaw = record.editorLayout;
  let editorLayout: EditorLayoutState | undefined;
  
  if (editorLayoutRaw !== undefined && isValidEditorLayoutState(editorLayoutRaw, workspaceRoot)) {
    // Valid v2 layout. See withDefaultedViewModes's own comment: a real v2
    // file written before `viewMode` existed validates here with that field
    // missing, so it must be defaulted before this value is trusted as a
    // complete EditorLayoutState.
    editorLayout = withDefaultedViewModes(editorLayoutRaw);
  } else if (isLegacyWorkspace(record)) {
    // Migrate v1 legacy settings to v2 format
    // Use the already-decoded values (which have been validated and cleaned)
    editorLayout = migrateLegacyToEditorLayout(
      lastOpenPaths.value,
      lastActivePath.value,
    );
    // Migration is deterministic: same v1 input always produces same v2 output
    // It's also idempotent: running migration on already-migrated data produces same result
  } else {
    // No valid layout and no legacy to migrate - use default
    editorLayout = DEFAULT_WORKSPACE_SETTINGS.editorLayout;
  }

// Only versions 1 and 2 are supported. An unrecognized version is flagged as
  // corrupt (so it is never silently persisted back over) but its actual
  // value in `record` is left untouched by the spread below, rather than
  // forced to current, so a genuinely newer file's version marker survives a
  // round trip through an older app build instead of being downgraded.
  const versionCorrupt = record.version !== undefined && record.version !== 1 && record.version !== 2;

  // F07 Phase 2b: Bump version to 2 when migrating from v1 legacy format
  const isMigrated = editorLayoutRaw === undefined && isLegacyWorkspace(record) && editorLayout !== undefined;
  const versionValue = isMigrated ? 2 : (record.version === undefined ? 1 : record.version);

  const settings = {
    ...record,
    version: versionValue,
    sortOrder: sortOrder.value,
    fontSize: fontSize.value,
    defaultViewMode: defaultViewMode.value,
    deleteBehavior: deleteBehavior.value,
    lastOpenPaths: lastOpenPaths.value,
    lastActivePath: lastActivePath.value,
    editorLayout: editorLayout,
    uiZoom: uiZoom.value,
    frontmatterAliasesEnabled: frontmatterAliasesEnabled.value,
    mathRenderingEnabled: mathRenderingEnabled.value,
    pasteImagesEnabled: pasteImagesEnabled.value,
    attachmentsFolder: attachmentsFolder.value,
    frontmatterPropertiesEnabled: frontmatterPropertiesEnabled.value,
    graphColorGroups: graphColorGroups.value,
    tagsEnabled: tagsEnabled.value,
    templatesEnabled: templatesEnabled.value,
    templatesFolder: templatesFolder.value,
    canvasEnabled: canvasEnabled.value,
    themesEnabled: themesEnabled.value,
    accentColor: accentColor.value,
    snippetsEnabled: snippetsEnabled.value,
    snippets: snippets.value,
    headingLinksEnabled: headingLinksEnabled.value,
    collectionsEnabled: collectionsEnabled.value,
    noteReadOnlyLockEnabled: noteReadOnlyLockEnabled.value,
    rtlWorkspaceEnabled: rtlWorkspaceEnabled.value,
    captureInboxFolder: captureInboxFolder.value,
    captureInboxNote: captureInboxNote.value,
    captureDatePattern: captureDatePattern.value,
  } as unknown as WorkspaceSettings;

  // F07 Phase 2b: Corruption only when editorLayout is invalid AND cannot be migrated from legacy
  const editorLayoutCorrupt = editorLayoutRaw !== undefined && 
    !isValidEditorLayoutState(editorLayoutRaw, workspaceRoot) &&
    !isLegacyWorkspace(record);

  const corrupt =
    versionCorrupt ||
    editorLayoutCorrupt ||
    anyCorrupt(
      sortOrder,
      fontSize,
      defaultViewMode,
      deleteBehavior,
      lastOpenPaths,
      lastActivePath,
      uiZoom,
      frontmatterAliasesEnabled,
      mathRenderingEnabled,
      pasteImagesEnabled,
      attachmentsFolder,
      frontmatterPropertiesEnabled,
      graphColorGroups,
      tagsEnabled,
      templatesEnabled,
      templatesFolder,
      canvasEnabled,
      themesEnabled,
      accentColor,
      snippetsEnabled,
      snippets,
      headingLinksEnabled,
      collectionsEnabled,
      noteReadOnlyLockEnabled,
      captureInboxFolder,
      captureInboxNote,
      captureDatePattern,
    );

  return { settings, corrupt };
}

export async function loadWorkspaceSettings(
  workspacePath: string,
): Promise<DecodedWorkspaceSettings> {
  let raw: string;
  try {
    raw = await readTextFile(workspaceSettingsPath(workspacePath));
  } catch {
    // No file yet (first time this workspace has been opened) or it's
    // unreadable for a reason unrelated to its contents: an ordinary,
    // expected case, not corruption.
    return { settings: DEFAULT_WORKSPACE_SETTINGS, corrupt: false };
  }
  return decodeWorkspaceSettings(raw, workspacePath);
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
