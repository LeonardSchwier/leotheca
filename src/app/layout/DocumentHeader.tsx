import type { ComponentType } from "preact";
import type { ViewMode } from "../../settings/workspaceSettings";
import { BookmarkFilledIcon, BookmarkIcon, SourceModeIcon, SplitModeIcon, PreviewModeIcon } from "../shellIcons";

/** UX-01 spec section 13.5/UX-005: "Note-specific view, bookmark,
 * Inspector, and overflow actions shall appear in the Document Header or
 * compact equivalent" instead of the global toolbar. Scoped narrower than
 * the full spec for this pass, matching ActivityRail's own Wide+-first
 * phasing (section 30's Phase 2 guidance):
 *
 * - Title, path, and save state are deliberately NOT duplicated here.
 *   TabBar already owns the active note's title and dirty/save-error
 *   display (see App.tsx's .save-error-bar), and rebuilding that as a
 *   second, parallel "truthful save state" surface risked exactly the
 *   kind of contradicting-sources-of-truth bug this SDD's own section
 *   13.6 warns against, for a component this pass has no way to verify
 *   against every real save-state transition. Left as-is; a real
 *   Document Header title/save-state merge is separate follow-up work.
 * - Inspector and note-action overflow don't exist as concepts in this
 *   codebase yet (Properties/Backlinks are separate always-visible
 *   sidebar panels, not a togglable Inspector), so neither has a home
 *   here yet either.
 *
 * What this pass DOES move here: the view-mode switch and the
 * bookmark-this-note toggle, the two note-level actions that were
 * otherwise sitting in the generic global toolbar with no clear
 * document-level home. Presentational only, per section 24.2: every
 * prop is a value or callback App.tsx already owns.
 */

const VIEW_MODE_ICONS: Record<ViewMode, ComponentType> = {
  source: SourceModeIcon,
  split: SplitModeIcon,
  preview: PreviewModeIcon,
};

const VIEW_MODES: ViewMode[] = ["source", "split", "preview"];

export interface DocumentHeaderProps {
  noteName: string;
  viewMode: ViewMode;
  onSetViewMode: (mode: ViewMode) => void;
  bookmarked: boolean;
  onToggleBookmark: () => void;
}

export function DocumentHeader({
  noteName,
  viewMode,
  onSetViewMode,
  bookmarked,
  onToggleBookmark,
}: DocumentHeaderProps) {
  return (
    <div class="document-header">
      <span class="document-header-title" title={noteName}>
        {noteName}
      </span>
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
