import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  activateWorkspaceProfile,
  activeWorkspaceId,
  addWorkspaceFromPicker,
  forgetWorkspaceProfile,
  workspaceProfiles,
} from "./store";
import { displayWorkspaceIcon, matchesWorkspaceSearch } from "./workspaceProfiles";
import { workspaceSwitcherOpenRequest } from "./workspaceSwitcherControl";
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
  if (token) return "Android workspace";
  return path;
}

export function WorkspaceSwitcher() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const previousRequest = useRef(workspaceSwitcherOpenRequest.value);
  const active = workspaceProfiles.value.find((p) => p.id === activeWorkspaceId.value);
  const filtered = useMemo(
    () => workspaceProfiles.value.filter((profile) => matchesWorkspaceSearch(profile, query)),
    [workspaceProfiles.value, query],
  );

  const close = (restoreFocus = true) => {
    setOpen(false);
    setQuery("");
    setHighlighted(0);
    if (restoreFocus) queueMicrotask(() => triggerRef.current?.focus());
  };

  if (workspaceSwitcherOpenRequest.value !== previousRequest.current) {
    previousRequest.current = workspaceSwitcherOpenRequest.value;
    if (!open) setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    setHighlighted(0);
    queueMicrotask(() => searchRef.current?.focus());
    const handlePointer = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      if (triggerRef.current?.contains(e.target as Node)) return;
      close(false);
    };
    window.addEventListener("mousedown", handlePointer);
    return () => window.removeEventListener("mousedown", handlePointer);
  }, [open]);

  useEffect(() => {
    if (highlighted >= filtered.length) setHighlighted(Math.max(0, filtered.length - 1));
  }, [filtered.length, highlighted]);

  const handleActivate = async (id: string) => {
    const alreadyActive = id === activeWorkspaceId.value;
    close();
    if (!alreadyActive) await activateWorkspaceProfile(id);
  };

  const handleAdd = async () => {
    close();
    await addWorkspaceFromPicker();
  };

  const handleMenuKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (filtered.length) setHighlighted((value) => (value + 1) % filtered.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (filtered.length) setHighlighted((value) => (value - 1 + filtered.length) % filtered.length);
      return;
    }
    if (event.key === "Enter" && filtered[highlighted]) {
      event.preventDefault();
      void handleActivate(filtered[highlighted].id);
    }
  };

  return (
    <div class="workspace-switcher">
      <button
        ref={triggerRef}
        class="workspace-switcher-trigger"
        aria-label={active ? `Switch workspace, current workspace ${active.name}` : "Open workspace"}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? close(false) : setOpen(true))}
      >
        <span class="workspace-switcher-icon" aria-hidden="true">
          {active ? workspaceIconGlyph(active.icon) : "📂"}
        </span>
        <span class="workspace-switcher-name">{active ? active.name : "Open workspace"}</span>
        <span class="workspace-switcher-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div
          ref={menuRef}
          class="workspace-switcher-menu"
          role="listbox"
          aria-label="Workspaces"
          onKeyDown={(event) => handleMenuKeyDown(event as unknown as KeyboardEvent)}
        >
          <input
            ref={searchRef}
            class="workspace-switcher-search"
            type="search"
            aria-label="Search workspaces"
            placeholder="Search workspaces"
            value={query}
            onInput={(event) => {
              setQuery(event.currentTarget.value);
              setHighlighted(0);
            }}
          />
          {filtered.length === 0 && <div class="workspace-switcher-empty">No matching workspaces</div>}
          {filtered.map((profile, index) => {
            const isActive = profile.id === activeWorkspaceId.value;
            const isHighlighted = index === highlighted;
            return (
              <div
                key={profile.id}
                class={`workspace-switcher-row ${isActive ? "active" : ""} ${isHighlighted ? "highlighted" : ""}`}
                role="option"
                aria-selected={isActive}
                aria-current={isActive ? "true" : undefined}
              >
                <button
                  class="workspace-switcher-row-button"
                  tabIndex={-1}
                  onMouseEnter={() => setHighlighted(index)}
                  onClick={() => void handleActivate(profile.id)}
                >
                  <span class="workspace-switcher-icon" aria-hidden="true">{workspaceIconGlyph(profile.icon)}</span>
                  <span class="workspace-switcher-row-name">
                    {profile.name}
                    <small>{locatorLabel(profile.path, profile.token)}</small>
                  </span>
                  {isActive && <span class="workspace-switcher-check" aria-hidden="true">✓</span>}
                </button>
                {!isActive && (
                  <button
                    class="workspace-switcher-forget"
                    aria-label={`Forget ${profile.name}`}
                    title="Forget"
                    onClick={() => void forgetWorkspaceProfile(profile.id)}
                  >×</button>
                )}
              </div>
            );
          })}
          <button class="workspace-switcher-add" onClick={() => void handleAdd()}>+ Add workspace</button>
        </div>
      )}
    </div>
  );
}
