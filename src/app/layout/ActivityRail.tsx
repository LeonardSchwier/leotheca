import type { ComponentChildren } from "preact";
import { FilesIcon, BookmarkIcon, TagIcon, GraphIcon, SettingsIcon } from "../shellIcons";

/** UX-01 spec section 13.2: "a fixed navigation strip" for Files,
 * Bookmarks, Tags, and Graph, with Settings pinned at the bottom.
 * Presentational only, per section 24.2 ("Layout components receive
 * narrow props and callbacks. They do not create parallel workspace,
 * tab, editor, or search stores"): App.tsx owns every signal this reads
 * and every action it triggers, passed in as plain props so this
 * component has no state of its own to keep in sync and is trivially
 * testable without a real workspace. */
export interface ActivityRailProps {
  /** Which of the three mutually-exclusive Navigation Panel destinations
   * is currently showing, or null when the Navigation Panel is closed, or
   * it's showing something outside the rail's own three destinations
   * (this app's existing Task Hub/Collections panels -- real,
   * user-reachable panels with no assigned Activity Rail slot in the
   * base spec, so selecting Files/Bookmarks/Tags here always takes over
   * from them, matching this app's pre-existing single mutually-exclusive
   * panel-selection group). */
  activeDestination: "files" | "bookmarks" | "tags" | null;
  graphActive: boolean;
  tagsEnabled: boolean;
  onSelectFiles: () => void;
  onSelectBookmarks: () => void;
  onSelectTags: () => void;
  onOpenGraph: () => void;
  onOpenSettings: () => void;
}

function RailButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: ComponentChildren;
}) {
  return (
    <button
      class={`activity-rail-button ${active ? "active" : ""}`}
      aria-label={label}
      aria-current={active ? "true" : undefined}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function ActivityRail({
  activeDestination,
  graphActive,
  tagsEnabled,
  onSelectFiles,
  onSelectBookmarks,
  onSelectTags,
  onOpenGraph,
  onOpenSettings,
}: ActivityRailProps) {
  return (
    <nav class="activity-rail" aria-label="Primary navigation">
      <div class="activity-rail-primary">
        <RailButton active={activeDestination === "files"} label="Files" onClick={onSelectFiles}>
          <FilesIcon />
        </RailButton>
        <RailButton active={activeDestination === "bookmarks"} label="Bookmarks" onClick={onSelectBookmarks}>
          <BookmarkIcon />
        </RailButton>
        {tagsEnabled && (
          <RailButton active={activeDestination === "tags"} label="Tags" onClick={onSelectTags}>
            <TagIcon />
          </RailButton>
        )}
        <RailButton active={graphActive} label="Graph view" onClick={onOpenGraph}>
          <GraphIcon />
        </RailButton>
      </div>
      <div class="activity-rail-bottom">
        <RailButton active={false} label="Settings" onClick={onOpenSettings}>
          <SettingsIcon />
        </RailButton>
      </div>
    </nav>
  );
}
