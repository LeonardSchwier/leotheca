import { useEffect, useState } from "preact/hooks";
import type { OpenTab } from "./types";

interface TabBarProps {
  tabs: OpenTab[];
  activePath: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
  onCloseOthers: (path: string) => void;
  onCloseAll: () => void;
  onRename: (path: string, currentName: string) => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  path: string;
}

export function TabBar({
  tabs,
  activePath,
  onSelect,
  onClose,
  onCloseOthers,
  onCloseAll,
  onRename,
}: TabBarProps) {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);

  useEffect(() => {
    if (!menu) return;
    const dismiss = () => setMenu(null);
    window.addEventListener("click", dismiss);
    window.addEventListener("blur", dismiss);
    return () => {
      window.removeEventListener("click", dismiss);
      window.removeEventListener("blur", dismiss);
    };
  }, [menu]);

  if (tabs.length === 0) return null;

  return (
    <div class="tab-bar">
      {tabs.map((tab) => (
        <div
          key={tab.path}
          class={`tab ${tab.path === activePath ? "tab-active" : ""}`}
          onClick={() => onSelect(tab.path)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu({ x: e.clientX, y: e.clientY, path: tab.path });
          }}
        >
          <span class="tab-name">
            {tab.name}
            {tab.dirty ? " •" : ""}
          </span>
          <button
            class="tab-close"
            onClick={(e) => {
              e.stopPropagation();
              onClose(tab.path);
            }}
            aria-label={`Close ${tab.name}`}
          >
            x
          </button>
        </div>
      ))}
      {menu && (
        <div class="context-menu" style={{ left: `${menu.x}px`, top: `${menu.y}px` }}>
          <button
            onClick={() => {
              const tab = tabs.find((t) => t.path === menu.path);
              if (tab) onRename(tab.path, tab.name);
            }}
          >
            Rename
          </button>
          <button onClick={() => onClose(menu.path)}>Close</button>
          <button onClick={() => onCloseOthers(menu.path)} disabled={tabs.length < 2}>
            Close Others
          </button>
          <button onClick={onCloseAll}>Close All</button>
        </div>
      )}
    </div>
  );
}
