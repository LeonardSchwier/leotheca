import { useEffect, useRef, useState } from "preact/hooks";
import {
  activateWorkspaceProfile,
  activeWorkspaceId,
  addWorkspaceFromPicker,
  forgetWorkspaceProfile,
  workspaceProfiles,
} from "./store";
import { displayWorkspaceIcon } from "./workspaceProfiles";
import type { WorkspaceIcon } from "./globalConfig";

/** F20 Phase 1, spec `leotheca-workspace-profiles-sdd.md` section 10:
 * a minimal switcher — an ordered profile list, click-to-switch, "Add
 * workspace," and "Forget" for a non-active profile — reachable from the
 * app header (section 9.1). Deliberately narrowed, per this claim's own
 * scope: no search field (10.2), no arrow-key row navigation (10.3's
 * fuller keyboard model), no command-palette entries (9.2), and no
 * Settings-panel management section (9.3), all left for F20 Phase 2 (see
 * ROADMAP.md). Escape-to-close, outside-click-to-close, and returning
 * focus to the opener are kept even in this narrowed slice: they are
 * baseline dropdown behavior already established elsewhere in this
 * codebase (see workspace/FileContextMenu.tsx), not "10.3 polish." */

const ICON_GLYPHS: Record<WorkspaceIcon, string> = {
  folder: "📁",
  book: "📖",
  journal: "📓",
  briefcase: "💼",
  school: "🎓",
  code: "💻",
  home: "🏠",
  archive: "🗄️",
};

function iconGlyph(icon: string): string {
  return ICON_GLYPHS[displayWorkspaceIcon(icon)];
}

export function WorkspaceSwitcher() {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const active = workspaceProfiles.value.find((p) => p.id === activeWorkspaceId.value);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  /** `.toolbar` scrolls horizontally on narrow viewports (`overflow-x: auto`
   * in App.css's mobile media query), which clips any `position: absolute`
   * descendant that overflows its box — the dropdown was rendering but
   * invisible, clipped by the toolbar, on Android. `position: fixed` with a
   * viewport coordinate computed from the trigger's own rect escapes that
   * clipping entirely, matching how FileContextMenu.tsx already positions
   * its own floating menu. */
  const toggle = () => {
    if (open) {
      close();
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setMenuPosition({ top: rect.bottom + 4, left: rect.left });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const handlePointer = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      if (triggerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("mousedown", handlePointer);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handlePointer);
      window.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const handleActivate = async (id: string) => {
    close();
    await activateWorkspaceProfile(id);
  };

  const handleAdd = async () => {
    close();
    await addWorkspaceFromPicker();
  };

  return (
    <div class="workspace-switcher">
      <button
        ref={triggerRef}
        class="workspace-switcher-trigger"
        aria-label={active ? "Switch workspace" : "Open workspace"}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggle}
      >
        <span class="workspace-switcher-icon" aria-hidden="true">
          {active ? iconGlyph(active.icon) : "📂"}
        </span>
        <span class="workspace-switcher-name">{active ? active.name : "Open workspace"}</span>
        <span class="workspace-switcher-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && menuPosition && (
        <div
          ref={menuRef}
          class="workspace-switcher-menu"
          role="listbox"
          aria-label="Workspaces"
          style={{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px` }}
        >
          {workspaceProfiles.value.length === 0 && (
            <div class="workspace-switcher-empty">No workspaces yet</div>
          )}
          {workspaceProfiles.value.map((profile) => {
            const isActive = profile.id === activeWorkspaceId.value;
            return (
              <div
                key={profile.id}
                class={`workspace-switcher-row ${isActive ? "active" : ""}`}
                role="option"
                aria-selected={isActive}
              >
                <button class="workspace-switcher-row-button" onClick={() => void handleActivate(profile.id)}>
                  <span class="workspace-switcher-icon" aria-hidden="true">
                    {iconGlyph(profile.icon)}
                  </span>
                  <span class="workspace-switcher-row-name">{profile.name}</span>
                  {isActive && (
                    <span class="workspace-switcher-check" aria-hidden="true">
                      ✓
                    </span>
                  )}
                </button>
                {!isActive && (
                  <button
                    class="workspace-switcher-forget"
                    aria-label={`Forget ${profile.name}`}
                    title="Forget"
                    onClick={() => void forgetWorkspaceProfile(profile.id)}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
          <button class="workspace-switcher-add" onClick={() => void handleAdd()}>
            + Add workspace
          </button>
        </div>
      )}
    </div>
  );
}
