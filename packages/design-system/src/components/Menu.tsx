import type { ComponentChildren, JSX } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { cx } from "./cx";

export type MenuAlign = "start" | "end";
export type MenuItemVariant = "default" | "danger";

export interface MenuItem {
  id: string;
  label: string;
  onSelect: () => void;
  icon?: ComponentChildren;
  disabled?: boolean;
  /** Says why the item is unavailable, and connects to it for screen readers. */
  disabledReason?: string;
  variant?: MenuItemVariant;
}

export interface MenuProps {
  label: string;
  trigger: ComponentChildren;
  items: readonly MenuItem[];
  align?: MenuAlign;
  disabled?: boolean;
  title?: string;
  className?: string;
  triggerClassName?: string;
}

interface PopupPosition {
  left: number;
  top: number;
  maxHeight: number;
}

const VIEWPORT_GUTTER = 8;
const TRIGGER_GAP = 4;
let menuCounter = 0;

function enabledItems(menu: HTMLElement): HTMLButtonElement[] {
  return Array.from(
    menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'),
  );
}

/** WAI-ARIA menu button. Position is computed in a layout effect, hidden until
 * measured, so the menu never flashes in the wrong place or off screen. */
export function Menu({
  label,
  trigger,
  items,
  align = "end",
  disabled = false,
  title,
  className,
  triggerClassName,
}: MenuProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PopupPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const focusEdgeRef = useRef<"first" | "last">("first");
  const idRef = useRef<string | undefined>(undefined);
  if (!idRef.current) {
    menuCounter += 1;
    idRef.current = `ds-menu-${menuCounter}`;
  }

  function close(restoreFocus: boolean) {
    setOpen(false);
    setPosition(null);
    if (restoreFocus) triggerRef.current?.focus();
  }

  function show(edge: "first" | "last" = "first") {
    if (disabled || items.length === 0) return;
    focusEdgeRef.current = edge;
    setOpen(true);
  }

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !menuRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const menuRect = menuRef.current.getBoundingClientRect();
    const maxHeight = Math.max(0, window.innerHeight - VIEWPORT_GUTTER * 2);
    const fittedHeight = Math.min(menuRect.height, maxHeight);

    const rawLeft =
      align === "end" ? triggerRect.right - menuRect.width : triggerRect.left;
    const left = Math.min(
      Math.max(VIEWPORT_GUTTER, rawLeft),
      Math.max(VIEWPORT_GUTTER, window.innerWidth - VIEWPORT_GUTTER - menuRect.width),
    );

    const belowTop = triggerRect.bottom + TRIGGER_GAP;
    const aboveTop = triggerRect.top - TRIGGER_GAP - fittedHeight;
    const roomBelow = window.innerHeight - VIEWPORT_GUTTER - belowTop;
    const roomAbove = triggerRect.top - VIEWPORT_GUTTER - TRIGGER_GAP;
    const preferredTop =
      roomBelow < fittedHeight && roomAbove > roomBelow ? aboveTop : belowTop;
    const top = Math.min(
      Math.max(VIEWPORT_GUTTER, preferredTop),
      Math.max(VIEWPORT_GUTTER, window.innerHeight - VIEWPORT_GUTTER - fittedHeight),
    );

    setPosition({ left, top, maxHeight });
    const available = enabledItems(menuRef.current);
    const target =
      focusEdgeRef.current === "last"
        ? available[available.length - 1]
        : available[0];
    target?.focus();
  }, [align, open]);

  useEffect(() => {
    if (!open) return;
    function dismissOnPointer(event: PointerEvent) {
      const target = event.target as Node | null;
      if (
        target &&
        !triggerRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        close(false);
      }
    }
    function dismissOnBlur() {
      close(false);
    }
    document.addEventListener("pointerdown", dismissOnPointer);
    window.addEventListener("blur", dismissOnBlur);
    return () => {
      document.removeEventListener("pointerdown", dismissOnPointer);
      window.removeEventListener("blur", dismissOnBlur);
    };
  }, [open]);

  function onMenuKeyDown(event: JSX.TargetedKeyboardEvent<HTMLDivElement>) {
    const menu = menuRef.current;
    if (!menu) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key === "Tab") {
      close(false);
      return;
    }
    const available = enabledItems(menu);
    if (available.length === 0) return;
    const current = available.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    let next: number | null = null;
    if (event.key === "ArrowDown") {
      next = current < 0 ? 0 : (current + 1) % available.length;
    } else if (event.key === "ArrowUp") {
      next =
        current < 0
          ? available.length - 1
          : (current - 1 + available.length) % available.length;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = available.length - 1;
    }
    if (next !== null) {
      event.preventDefault();
      available[next]?.focus();
    }
  }

  return (
    <span class={cx("ds-menu-anchor", className)}>
      <button
        ref={triggerRef}
        type="button"
        class={triggerClassName}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? idRef.current : undefined}
        title={title}
        disabled={disabled || items.length === 0}
        onClick={(event) => {
          event.stopPropagation();
          if (open) close(true);
          else show();
        }}
        onKeyDown={(event) => {
          if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            show(event.key === "ArrowUp" ? "last" : "first");
          }
        }}
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={menuRef}
          id={idRef.current}
          class="ds-menu"
          role="menu"
          aria-label={label}
          style={
            position
              ? {
                  left: `${position.left}px`,
                  top: `${position.top}px`,
                  maxHeight: `${position.maxHeight}px`,
                  visibility: "visible",
                }
              : { visibility: "hidden" }
          }
          onKeyDown={onMenuKeyDown}
        >
          {items.map((item) => {
            const reasonId = item.disabledReason
              ? `${idRef.current}-${item.id}-reason`
              : undefined;
            return (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                class={cx(
                  "ds-menu-item",
                  item.variant === "danger" && "ds-menu-item-danger",
                )}
                disabled={item.disabled}
                aria-describedby={reasonId}
                tabIndex={-1}
                onClick={() => {
                  if (item.disabled) return;
                  close(true);
                  item.onSelect();
                }}
              >
                {item.icon}
                <span class="ds-menu-item-content">
                  <span>{item.label}</span>
                  {item.disabledReason && (
                    <span id={reasonId} class="ds-menu-item-reason">
                      {item.disabledReason}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </span>
  );
}
