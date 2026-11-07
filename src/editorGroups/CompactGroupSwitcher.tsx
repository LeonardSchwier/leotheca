import type { EditorGroupId } from "../workspace/types";

interface CompactGroupSwitcherProps {
  visibleGroupId: EditorGroupId;
  primaryActiveName: string | null;
  secondaryActiveName: string | null;
  onSelect: (groupId: EditorGroupId) => void;
}

/** F07 Phase 4's compact-layout group switcher (spec 8.2): "Working:
 * Project plan    Reference: Meeting notes". Switching groups here changes
 * which pane is mounted, never `activeGroupId` (spec 8.2's own "does not
 * close or merge anything"), so it does not affect which group a global
 * command or a new note open targets -- only what is currently visible. */
export function CompactGroupSwitcher({
  visibleGroupId,
  primaryActiveName,
  secondaryActiveName,
  onSelect,
}: CompactGroupSwitcherProps) {
  return (
    <div class="compact-group-switcher" role="tablist" aria-label="Editor group">
      <button
        role="tab"
        aria-selected={visibleGroupId === "primary"}
        class={visibleGroupId === "primary" ? "active" : ""}
        onClick={() => onSelect("primary")}
      >
        Working: {primaryActiveName ?? "—"}
      </button>
      <button
        role="tab"
        aria-selected={visibleGroupId === "secondary"}
        class={visibleGroupId === "secondary" ? "active" : ""}
        onClick={() => onSelect("secondary")}
      >
        Reference: {secondaryActiveName ?? "—"}
      </button>
    </div>
  );
}
