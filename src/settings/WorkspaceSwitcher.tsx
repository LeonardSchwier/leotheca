import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  activateWorkspaceProfile,
  activeWorkspaceId,
  addWorkspaceFromPicker,
  forgetWorkspaceProfile,
  settingsPanelOpen,
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

export function WorkspaceSwitcher() {
  const [open, setOpen] = useState(false);
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

  useEffect(() => {
    if (openRequest === previousOpenRequest.current) return;
    previousOpenRequest.current = openRequest;
    setOpen(true);
  }, [openRequest]);

  useEffect(() => {
    if (addRequest === previousAddRequest.current) return;
    previousAddRequest.current = addRequest;
    void addWorkspaceFromPicker();
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
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? close(false) : setOpen(true))}
      >
        <span class="workspace-switcher-icon" aria-hidden="true">{active ? workspaceIconGlyph(active.icon) : "📂"}</span>
        <span class="workspace-switcher-name">{active ? active.name : "Open workspace"}</span>
        <span class="workspace-switcher-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div ref={menuRef} class="workspace-switcher-menu" role="listbox" aria-label="Workspaces" onKeyDown={(event) => handleMenuKeyDown(event as unknown as KeyboardEvent)}>
          <input
            ref={searchRef}
            class="workspace-switcher-search"
            type="search"
            aria-label="Search workspaces"
            placeholder="Search workspaces"
            value={query}
            onInput={(event) => { setQuery(event.currentTarget.value); setHighlighted(0); }}
          />
          {workspaceProfiles.value.length === 0 ? (
            <div class="workspace-switcher-empty">No workspaces yet</div>
          ) : filtered.length === 0 ? (
            <div class="workspace-switcher-empty">No matching workspaces</div>
          ) : null}
          {filtered.map((profile, index) => {
            const isActive = profile.id === activeWorkspaceId.value;
            return (
              <div key={profile.id} class={`workspace-switcher-row ${isActive ? "active" : ""} ${index === highlighted ? "highlighted" : ""}`} role="option" aria-selected={isActive} aria-current={isActive ? "true" : undefined}>
                <button class="workspace-switcher-row-button" tabIndex={-1} onMouseEnter={() => setHighlighted(index)} onClick={() => void handleActivate(profile.id)}>
                  <span class="workspace-switcher-icon" aria-hidden="true">{workspaceIconGlyph(profile.icon)}</span>
                  <span class="workspace-switcher-row-name">{profile.name}<small>{locatorLabel(profile.path, profile.token)}</small></span>
                  {isActive && <span class="workspace-switcher-check" aria-hidden="true">✓</span>}
                </button>
                {!isActive && <button class="workspace-switcher-forget" aria-label={`Forget ${profile.name}`} title="Forget" onClick={() => void forgetWorkspaceProfile(profile.id)}>×</button>}
              </div>
            );
          })}
          <button class="workspace-switcher-add" onClick={() => void handleAdd()}>+ Add workspace</button>
        </div>
      )}
    </div>
  );
}
