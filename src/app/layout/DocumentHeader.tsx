import { useEffect, useRef, useState } from "preact/hooks";
import type { ViewMode } from "../../settings/workspaceSettings";
import { Button } from "../../ui/Button";
import { Icon as RegistryIcon, type IconName } from "../../ui/icons";
import { IconButton } from "../../ui/IconButton";
import { Menu } from "../../ui/Menu";
import { SegmentedControl } from "../../ui/SegmentedControl";
import { StatusIndicator } from "../../ui/StatusIndicator";

/** UX-01 spec section 13.5/UX-005: "Note-specific view, bookmark,
 * Inspector, and overflow actions shall appear in the Document Header or
 * compact equivalent" instead of the global toolbar. Scoped narrower than
 * the full spec for this pass, matching ActivityRail's own Medium+-first
 * phasing (section 30's Phase 2 guidance):
 *
 * - The path breadcrumb is the spec's own explicitly-allowed simpler
 *   variant ("The full path is available via tooltip or overflow
 *   details", 13.5), not a separate clickable segmented row.
 *
 * Title carries a note icon and a full-path tooltip; a real save-state
 * message (13.6) sits in the header's center, replacing the note-lock-bar
 * area's `.save-error-bar` duplicate for text notes at this width (the
 * bar stays for canvas/ink notes and narrower widths, where this header
 * doesn't render at all). `dirty`/`saving`/`saveError` are read straight
 * from the active tab's own OpenDocument fields (App.tsx), the exact same
 * single source of truth TabBar's dirty dot and the save-error-bar
 * already use -- this never recomputes save state independently, only
 * displays it a second place, so it cannot contradict them. `saving` in
 * particular is a real event (saveCoordinator.ts's onSaveStart, fired
 * when a write actually begins) rather than inferred from the 400ms
 * debounce timer, matching 13.6's explicit "must never display Saved
 * based only on a debounce timer."
 *
 * The Inspector trigger (13.5: "Inspector action reflects whether the
 * Inspector is open") toggles `inspectorOpen`, App.tsx's own signal;
 * Inspector.tsx itself renders elsewhere in the tree, not here -- this
 * button only reflects and requests that state, per 24.2's
 * presentational-only rule.
 *
 * Bookmark and Inspector are the first real call sites of the section 20
 * `IconButton` primitive (`ui/IconButton.tsx`), both toggles whose active
 * state maps directly onto that primitive's `active`/`aria-pressed`
 * prop; the overflow trigger and popup now use the shared `Menu` primitive,
 * whose disclosure semantics, keyboard behavior, viewport fitting, and
 * focus restoration do not fit the toggle-only IconButton contract. The
 * view-mode switch is the first real call site
 * of the section 20 `SegmentedControl` primitive (`ui/SegmentedControl.tsx`),
 * replacing the hand-written icon-only `.view-mode-switch` button row this
 * header used before; `SecondaryEditorPane.tsx`'s own
 * `.secondary-view-mode-switch` still uses the old hand-written markup and
 * stays out of this slice's claimed scope.
 *
 * The view selector's visible text labels implement 13.5's "The view
 * selector uses text labels at Wide and Expanded widths": this header
 * only renders at those widths (App.tsx hides it at Compact/Medium, where
 * the toolbar's own icon-only `.view-mode-switch` applies), so labels
 * here are always the correct presentation -- no width sniffing needed.
 * Icon+label together also satisfy 22.3's "Icon-only controls need a
 * persistent or discoverable label": the text is the persistent label,
 * and the `title`/`aria-label` split the primitive already provides
 * remains for the icon.
 *
 * The overflow menu (13.5: "Overflow contains lower-frequency current-note
 * actions and Help entries appropriate to the note") is new this pass:
 * Rename, Copy relative path, Delete (mirroring the file tree's own
 * FileContextMenu action set for the currently open note, so a user gets
 * the same actions whether they reach a note from the sidebar or from an
 * already-open tab) and Markdown Help. Every action is a plain callback
 * prop -- this component owns only the menu's open/closed state and its
 * own dismiss-on-outside-click/Escape behavior, never the note's actual
 * rename/delete/clipboard logic, per 24.2.
 */

const VIEW_MODE_ICONS: Record<ViewMode, IconName> = {
  source: "code",
  split: "columns",
  preview: "eye",
};

const VIEW_MODES: ViewMode[] = ["source", "split", "preview"];

/** How long a completed save stays visible as "Saved" before the header
 * goes quiet again (13.6's "about 1.5 seconds"). */
const SAVED_PULSE_MS = 1500;

export interface DocumentHeaderProps {
  /** The path relative to the active workspace, for the visible breadcrumb. */
  workspaceRelativePath: string;
  /** The complete native path, kept available as a title for long paths. */
  notePath: string;
  viewMode: ViewMode;
  onSetViewMode: (mode: ViewMode) => void;
  bookmarked: boolean;
  onToggleBookmark: () => void;
  dirty: boolean;
  saving: boolean;
  saveError: string | null;
  onRetrySave: () => void;
  inspectorOpen: boolean;
  onToggleInspector: () => void;
  onRename: () => void;
  onCopyRelativePath: () => void;
  onDelete: () => void;
  onShowHelp: () => void;
}

export function DocumentHeader({
  workspaceRelativePath,
  notePath,
  viewMode,
  onSetViewMode,
  bookmarked,
  onToggleBookmark,
  dirty,
  saving,
  saveError,
  onRetrySave,
  inspectorOpen,
  onToggleInspector,
  onRename,
  onCopyRelativePath,
  onDelete,
  onShowHelp,
}: DocumentHeaderProps) {
  // Triggered only by the real saving->settled transition below, never by
  // a timer racing typing: this is what keeps the "Saved" pulse honest
  // per 13.6 rather than a guess about whether autosave "probably" ran.
  const [showSavedPulse, setShowSavedPulse] = useState(false);
  const wasSaving = useRef(saving);
  useEffect(() => {
    if (wasSaving.current && !saving && !saveError) {
      setShowSavedPulse(true);
      const timer = setTimeout(() => setShowSavedPulse(false), SAVED_PULSE_MS);
      wasSaving.current = saving;
      return () => clearTimeout(timer);
    }
    wasSaving.current = saving;
  }, [saving, saveError]);

  const saveState: "error" | "saving" | "saved" | "dirty" | "clean" = saveError
    ? "error"
    : saving
      ? "saving"
      : showSavedPulse
        ? "saved"
        : dirty
          ? "dirty"
          : "clean";

  return (
    <div class="document-header">
      <div class="document-header-title">
        {workspaceRelativePath && (
          <span class="document-header-path" title={notePath}>
            <RegistryIcon name="folder" size={16} className="document-header-icon" />
            <span class="document-header-path-text">{workspaceRelativePath}</span>
          </span>
        )}
        <span class="document-header-savestate-wrapper" aria-hidden="true">
          {saveState === "dirty" && <span class="document-header-dirty-dot" title="Unsaved changes" />}
        </span>
      </div>
      <div
        class={`document-header-savestate document-header-savestate-${saveState}`}
      >
        {saveState === "error" && (
          <StatusIndicator variant="danger" size="sm" live="assertive">
            Save failed
            <Button
              variant="ghost"
              size="sm"
              className="document-header-savestate-retry"
              onClick={onRetrySave}
            >
              Retry
            </Button>
          </StatusIndicator>
        )}
        {saveState === "saving" && (
          <StatusIndicator variant="progress" size="sm" live="polite">
            Saving
          </StatusIndicator>
        )}
        {saveState === "saved" && (
          <StatusIndicator variant="success" size="sm" live="polite">
            Saved
          </StatusIndicator>
        )}
        {saveState === "dirty" && (
          <StatusIndicator size="sm" icon={false} ariaLabel="Unsaved changes">
            <span aria-hidden="true">•</span> Unsaved
          </StatusIndicator>
        )}
      </div>
      <div class="document-header-actions">
        <SegmentedControl
          aria-label="View mode"
          value={viewMode}
          onChange={onSetViewMode}
          size="sm"
          options={VIEW_MODES.map((mode) => ({
            value: mode,
            label: mode[0].toUpperCase() + mode.slice(1),
            icon: VIEW_MODE_ICONS[mode],
          }))}
          className="document-header-viewmode"
        />
        <IconButton
          icon={bookmarked ? "bookmarkFilled" : "bookmark"}
          label={bookmarked ? "Remove bookmark" : "Bookmark this note"}
          active={bookmarked}
          onClick={onToggleBookmark}
        />
        <IconButton
          icon="panelRight"
          label="Inspector"
          active={inspectorOpen}
          onClick={onToggleInspector}
        />
        <Menu
          label="More note actions"
          title="More note actions"
          triggerClassName="icon-button"
          trigger={<RegistryIcon name="moreHorizontal" size={16} />}
          items={[
            { id: "rename", label: "Rename", onSelect: onRename },
            {
              id: "copy-relative-path",
              label: "Copy Relative Path",
              onSelect: onCopyRelativePath,
            },
            {
              id: "delete",
              label: "Delete",
              icon: "warningTriangle",
              variant: "danger",
              onSelect: onDelete,
            },
            {
              id: "help",
              label: "Markdown Help",
              icon: "helpCircle",
              onSelect: onShowHelp,
            },
          ]}
        />
      </div>
    </div>
  );
}
