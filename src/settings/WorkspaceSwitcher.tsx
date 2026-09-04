import { useEffect, useRef, useState } from "preact/hooks";
import {
  activateWorkspaceProfile,
  activeWorkspaceId,
  addWorkspaceFromPicker,
  forgetWorkspaceProfile,
  settingsPanelOpen,
  WorkspaceForgetUnsavedWorkError,
  workspaceProfiles,
} from "./store";
import { displayWorkspaceIcon, matchesWorkspaceSearch } from "./workspaceProfiles";
import {
  workspaceAddRequest,
  workspaceManageRequest,
  workspaceSwitcherOpenRequest,
} from "./workspaceSwitcherControl";
import type { WorkspaceIcon } from "./globalConfig";

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

export function workspaceIconGlyph(icon: string): string {
  return ICON_GLYPHS[displayWorkspaceIcon(icon)];
}

function locatorLabel(path: string, token: string | undefined): string {
  return token ? "Android workspace" : path;
}

function reportWorkspaceActionFailure(action: string): void {
  window.alert(`Could not ${action} workspace. Try again.`);
}

/** F20 Phase 2b-ii, spec section 15.2/16.6: shared by both places Forget
 * appears (this switcher and `WorkspaceProfilesSettings.tsx`). Forgetting
 * the active profile can be aborted by unsaved note content; this offers
 * the spec's secondary, explicitly-confirmed "forget without saving"
 * override rather than failing silently or reporting a generic error. */
export async function forgetWithUnsavedWorkConfirmation(id: string): Promise<void> {
  try {
    await forgetWorkspaceProfile(id);
  } catch (error) {
    if (error instanceof WorkspaceForgetUnsavedWorkError) {
      const discard = window.confirm(
        "This workspace has changes that have not been saved yet. Forget it anyway and lose those changes?",
      );
      if (!discard) return;
      try {
        await forgetWorkspaceProfile(id, { discardUnsaved: true });
      } catch {
        reportWorkspaceActionFailure("forget");
      }
      return;
    }
    reportWorkspaceActionFailure("forget");
  }
}

export function WorkspaceSwitcher() {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const previousOpenRequest = useRef(workspaceSwitcherOpenRequest.value);
  const previousAddRequest = useRef(workspaceAddRequest.value);
  const previousManageRequest = useRef(workspaceManageRequest.value);
  const openRequest = workspaceSwitcherOpenRequest.value;
  const addRequest = workspaceAddRequest.value;
  const manageRequest = workspaceManageRequest.value;
  const profiles = workspaceProfiles.value;
  const active = profiles.find((p) => p.id === activeWorkspaceId.value);
  const filtered = profiles.filter((profile) => matchesWorkspaceSearch(profile, query));

  const setPositionFromTrigger = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setMenuPosition({ top: rect.bottom + 4, left: rect.left });
  };

  const close = (restoreFocus = true) => {
    setOpen(false);
    setMenuPosition(null);
    setQuery("");
    setHighlighted(0);
    if (restoreFocus) triggerRef.current?.focus();
  };

  const openFromTrigger = () => {
    setPositionFromTrigger();
    setOpen(true);
  };

  useEffect(() => {
    if (openRequest === previousOpenRequest.current) return;
    previousOpenRequest.current = openRequest;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setMenuPosition({ top: rect.bottom + 4, left: rect.left });
    setOpen(true);
  }, [openRequest]);

  useEffect(() => {
    if (addRequest === previousAddRequest.current) return;
    previousAddRequest.current = addRequest;
    void addWorkspaceFromPicker().catch(() => reportWorkspaceActionFailure("add"));
  }, [addRequest]);

  useEffect(() => {
    if (manageRequest === previousManageRequest.current) return;
    previousManageRequest.current = manageRequest;
    settingsPanelOpen.value = true;
  }, [manageRequest]);

  useEffect(() => {
    if (!open) return;
    setHighlighted(0);
    queueMicrotask(() => searchRef.current?.focus());
    const handlePointer = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      if (triggerRef.current?.contains(e.target as Node)) return;
      close(false);
    };
    const handleWindowKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("mousedown", handlePointer);
    window.addEventListener("keydown", handleWindowKey);
    return () => {
      window.removeEventListener("mousedown", handlePointer);
      window.removeEventListener("keydown", handleWindowKey);
    };
  }, [open]);

  useEffect(() => {
    if (highlighted >= filtered.length) setHighlighted(Math.max(0, filtered.length - 1));
  }, [filtered.length, highlighted]);

  const handleActivate = async (id: string) => {
    const alreadyActive = id === activeWorkspaceId.value;
    close();
    if (alreadyActive) return;
    try {
      await activateWorkspaceProfile(id);
    } catch {
      // The store publishes workspaceSelectionError for activation failures.
      // Swallow the rejected action here so the UI error remains the one source
      // of truth instead of also producing an unhandled promise rejection.
    }
  };

  const handleAdd = async () => {
    close();
    try {
      await addWorkspaceFromPicker();
    } catch {
      reportWorkspaceActionFailure("add");
    }
  };

  const handleMenuKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      if (filtered.length) setHighlighted((value) => (value + 1) % filtered.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (filtered.length) setHighlighted((value) => (value - 1 + filtered.length) % filtered.length);
    } else if (event.key === "Enter" && filtered[highlighted]) {
      event.preventDefault();
      void handleActivate(filtered[highlighted].id);
    }
  };

  return (
    <div class="workspace-switcher">
      <button
        ref={triggerRef}
        class="workspace-switcher-trigger"
        aria-label={active ? "Switch workspace" : "Open workspace"}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? close(false) : openFromTrigger())}
      >
        <span class="workspace-switcher-icon" aria-hidden="true">{active ? workspaceIconGlyph(active.icon) : "📂"}</span>
        <span class="workspace-switcher-name">{active ? active.name : "Open workspace"}</span>
        <span class="workspace-switcher-caret" aria-hidden="true">▾</span>
      </button>
      {open && menuPosition && (
        <div
          ref={menuRef}
          class="workspace-switcher-menu"
          role="dialog"
          aria-label="Workspaces"
          style={{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px` }}
          onKeyDown={(event) => handleMenuKeyDown(event as unknown as KeyboardEvent)}
        >
          <input
            ref={searchRef}
            class="workspace-switcher-search"
            type="search"
            aria-label="Search workspaces"
            placeholder="Search workspaces"
            value={query}
            onInput={(event) => { setQuery(event.currentTarget.value); setHighlighted(0); }}
          />
          {profiles.length === 0 ? (
            <div class="workspace-switcher-empty">No workspaces yet</div>
          ) : filtered.length === 0 ? (
            <div class="workspace-switcher-empty">No matching workspaces</div>
          ) : null}
          <div role="list" aria-label="Workspace profiles">
            {filtered.map((profile, index) => {
              const isActive = profile.id === activeWorkspaceId.value;
              return (
                <div
                  key={profile.id}
                  class={`workspace-switcher-row ${isActive ? "active" : ""} ${index === highlighted ? "highlighted" : ""}`}
                  role="listitem"
                  aria-label={isActive ? `${profile.name}, current workspace` : profile.name}
                >
                  <button
                    class="workspace-switcher-row-button"
                    tabIndex={-1}
                    aria-current={isActive ? "true" : undefined}
                    onMouseEnter={() => setHighlighted(index)}
                    onClick={() => void handleActivate(profile.id)}
                  >
                    <span class="workspace-switcher-icon" aria-hidden="true">{workspaceIconGlyph(profile.icon)}</span>
                    <span class="workspace-switcher-row-name">{profile.name}<small>{locatorLabel(profile.path, profile.token)}</small></span>
                    {isActive && <span class="workspace-switcher-check" aria-hidden="true">✓</span>}
                  </button>
                  <button class="workspace-switcher-forget" aria-label={`Forget ${profile.name}`} title="Forget" onClick={() => void forgetWithUnsavedWorkConfirmation(profile.id)}>×</button>
                </div>
              );
            })}
          </div>
          <button class="workspace-switcher-add" onClick={() => void handleAdd()}>+ Add workspace</button>
        </div>
      )}
    </div>
  );
}
