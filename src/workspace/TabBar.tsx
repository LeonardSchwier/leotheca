import { useEffect, useState } from "preact/hooks";
import type { OpenTab } from "./types";

interface TabBarProps {
  tabs: OpenTab[];
  pinnedPaths?: string[];
  activePath: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
  onCloseOthers: (path: string) => void;
  onCloseAll: () => void;
  onPin?: (path: string) => void;
  onUnpin?: (path: string) => void;
  onUnpinAndClose?: (path: string) => void;
  onRename: (path: string, currentName: string) => void;
  /** F07 Phase 3 follow-up, spec section 7.2. `beforePath: null` means
   * "move to the end of its own pinned/unpinned region." Both optional so
   * every existing caller keeps working unchanged (reordering simply isn't
   * offered where omitted, the same pattern `onPin`/`onUnpin` already use). */
  onReorder?: (path: string, beforePath: string | null) => void;
  onMoveLeft?: (path: string) => void;
  onMoveRight?: (path: string) => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  path: string;
}

export function TabBar({
  tabs,
  pinnedPaths = [],
  activePath,
  onSelect,
  onClose,
  onCloseOthers,
  onCloseAll,
  onPin = () => {},
  onUnpin = () => {},
  onUnpinAndClose = () => {},
  onRename,
  onReorder,
  onMoveLeft = () => {},
  onMoveRight = () => {},
}: TabBarProps) {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [draggingPath, setDraggingPath] = useState<string | null>(null);

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
    <div
      class="tab-bar"
      onDragOver={onReorder ? (e) => e.preventDefault() : undefined}
      onDrop={
        onReorder
          ? (e) => {
              e.preventDefault();
              const dragged = e.dataTransfer?.getData("text/plain");
              if (dragged) onReorder(dragged, null); // dropped on empty space past the last tab
              setDraggingPath(null);
            }
          : undefined
      }
    >
      {tabs.map((tab) => {
        const pinned = pinnedPaths.includes(tab.path);
        return (
        <div
          key={tab.path}
          class={`tab ${tab.path === activePath ? "tab-active" : ""} ${draggingPath === tab.path ? "tab-dragging" : ""}`}
          onClick={() => onSelect(tab.path)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu({ x: e.clientX, y: e.clientY, path: tab.path });
          }}
          draggable={!!onReorder}
          onDragStart={
            onReorder
              ? (e) => {
                  e.dataTransfer?.setData("text/plain", tab.path);
                  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
                  setDraggingPath(tab.path);
                }
              : undefined
          }
          onDragEnd={onReorder ? () => setDraggingPath(null) : undefined}
          onDragOver={
            onReorder
              ? (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }
              : undefined
          }
          onDrop={
            onReorder
              ? (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const dragged = e.dataTransfer?.getData("text/plain");
                  if (dragged && dragged !== tab.path) onReorder(dragged, tab.path);
                  setDraggingPath(null);
                }
              : undefined
          }
        >
          <span class="tab-name">
            {tab.name}
            {tab.dirty ? " •" : ""}
          </span>
          {pinned && <span class="tab-pin" aria-label={`${tab.name} is pinned`}>Pinned</span>}
          {!pinned && <button
            class="tab-close"
            onClick={(e) => {
              e.stopPropagation();
              onClose(tab.path);
            }}
            aria-label={`Close ${tab.name}`}
          >
            x
          </button>}
        </div>
      );
      })}
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
          <button onClick={() => onMoveLeft(menu.path)}>Move left</button>
          <button onClick={() => onMoveRight(menu.path)}>Move right</button>
          {pinnedPaths.includes(menu.path) ? (
            <>
              <button onClick={() => onUnpin(menu.path)}>Unpin</button>
              <button onClick={() => onUnpinAndClose(menu.path)}>Unpin and close</button>
            </>
          ) : (
            <>
              <button onClick={() => onPin(menu.path)}>Pin</button>
              <button onClick={() => onClose(menu.path)}>Close</button>
            </>
          )}
          <button
            onClick={() => onCloseOthers(menu.path)}
            disabled={!tabs.some((tab) => tab.path !== menu.path && !pinnedPaths.includes(tab.path))}
          >
            Close Others
          </button>
          <button onClick={onCloseAll}>Close All Unpinned</button>
        </div>
      )}
    </div>
  );
}
