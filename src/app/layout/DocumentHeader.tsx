import type { ComponentType } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { ViewMode } from "../../settings/workspaceSettings";
import { BookmarkFilledIcon, BookmarkIcon, SourceModeIcon, SplitModeIcon, PreviewModeIcon } from "../shellIcons";
import { Icon as RegistryIcon } from "../../ui/icons";

/** UX-01 spec section 13.5/UX-005: "Note-specific view, bookmark,
 * Inspector, and overflow actions shall appear in the Document Header or
 * compact equivalent" instead of the global toolbar. Scoped narrower than
 * the full spec for this pass, matching ActivityRail's own Wide+-first
 * phasing (section 30's Phase 2 guidance):
 *
 * - Inspector and note-action overflow don't exist as concepts in this
 *   codebase yet (Properties/Backlinks are separate always-visible
 *   sidebar panels, not a togglable Inspector), so neither has a home
 *   here yet either.
 * - The path breadcrumb is the spec's own explicitly-allowed simpler
 *   variant ("The full path is available via tooltip or overflow
 *   details", 13.5), not a separate clickable segmented row.
 *
 * This pass adds what the previous one deliberately left out: title now
 * carries a note icon and a full-path tooltip, and a real save-state
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
 */

const VIEW_MODE_ICONS: Record<ViewMode, ComponentType> = {
  source: SourceModeIcon,
  split: SplitModeIcon,
  preview: PreviewModeIcon,
};

const VIEW_MODES: ViewMode[] = ["source", "split", "preview"];

/** How long a completed save stays visible as "Saved" before the header
 * goes quiet again (13.6's "about 1.5 seconds"). */
const SAVED_PULSE_MS = 1500;

export interface DocumentHeaderProps {
  noteName: string;
  notePath: string;
  viewMode: ViewMode;
  onSetViewMode: (mode: ViewMode) => void;
  bookmarked: boolean;
  onToggleBookmark: () => void;
  dirty: boolean;
  saving: boolean;
  saveError: string | null;
  onRetrySave: () => void;
}

export function DocumentHeader({
  noteName,
  notePath,
  viewMode,
  onSetViewMode,
  bookmarked,
  onToggleBookmark,
  dirty,
  saving,
  saveError,
  onRetrySave,
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
      <span class="document-header-title" title={notePath}>
        <RegistryIcon name="fileText" size={16} className="document-header-icon" />
        <span class="document-header-title-text">{noteName}</span>
      </span>
      <div
        class={`document-header-savestate document-header-savestate-${saveState}`}
        role={saveState === "error" ? "alert" : undefined}
      >
        {saveState === "error" && (
          <>
            <RegistryIcon name="alertCircle" size={16} />
            <span>Save failed</span>
            <button type="button" class="document-header-savestate-retry" onClick={onRetrySave}>
              Retry
            </button>
          </>
        )}
        {saveState === "saving" && (
          <>
            <RegistryIcon name="spinner" size={16} spin />
            <span>Saving</span>
          </>
        )}
        {saveState === "saved" && <span>Saved</span>}
        {saveState === "dirty" && (
          <span aria-label="Unsaved changes">
            <span aria-hidden="true">•</span> Unsaved
          </span>
        )}
      </div>
      <div class="document-header-actions">
        <div class="view-mode-switch">
          {VIEW_MODES.map((mode) => {
            const Icon = VIEW_MODE_ICONS[mode];
            const label = mode[0].toUpperCase() + mode.slice(1);
            return (
              <button
                key={mode}
                class={viewMode === mode ? "active" : ""}
                title={label}
                aria-label={label}
                onClick={() => onSetViewMode(mode)}
              >
                <Icon />
              </button>
            );
          })}
        </div>
        <button
          class={`icon-button ${bookmarked ? "active" : ""}`}
          aria-label={bookmarked ? "Remove bookmark" : "Bookmark this note"}
          title={bookmarked ? "Remove bookmark" : "Bookmark this note"}
          onClick={onToggleBookmark}
        >
          {bookmarked ? <BookmarkFilledIcon /> : <BookmarkIcon />}
        </button>
      </div>
    </div>
  );
}
