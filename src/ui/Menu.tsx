/** UX-01 spec sections 15.3 and 20: shared anchored menu behavior for
 * current-shell disclosures. The primitive owns disclosure semantics,
 * viewport fitting, keyboard navigation, dismissal, and focus restoration;
 * callers only supply the trigger label/content and action descriptions.
 *
 * This is deliberately a native-button menu rather than an abstract overlay
 * manager. Phase 1 has one real disclosure to migrate, while the spec's
 * portal/back-button stack spans later adaptive-shell work. Keeping that
 * future concern out of this component avoids creating a second application
 * state store while still making the current menu complete and reusable.
 */
import type { ComponentChildren, JSX } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { Icon, type IconName } from "./icons";
import "./primitives.css";

export type MenuAlign = "start" | "end";
export type MenuItemVariant = "default" | "danger";

export interface MenuItem {
  id: string;
  label: string;
  onSelect: () => void;
  icon?: IconName;
  disabled?: boolean;
  disabledReason?: string;
  variant?: MenuItemVariant;
}

export interface MenuProps {
  /** Accessible name for the disclosure button. */
  label: string;
  /** Visible trigger content. Icon-only triggers should also set `title`. */
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
let menuIdCounter = 0;

function enabledItems(menu: HTMLElement): HTMLButtonElement[] {
  return Array.from(
    menu.querySelectorAll<HTMLButtonElement>(
      '[role="menuitem"]:not(:disabled)',
    ),
  );
}

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
    menuIdCounter += 1;
    idRef.current = `menu-${menuIdCounter}`;
  }

  function close(restoreFocus: boolean) {
    setOpen(false);
    setPosition(null);
    if (restoreFocus) {
      // Restore before an action callback runs. If that callback opens a
      // dialog, its own initial-focus effect then wins instead of a queued
      // menu restoration stealing focus back from the new overlay.
      triggerRef.current?.focus();
    }
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

    let left =
      align === "end" ? triggerRect.right - menuRect.width : triggerRect.left;
    left = Math.min(
      Math.max(VIEWPORT_GUTTER, left),
      Math.max(
        VIEWPORT_GUTTER,
        window.innerWidth - VIEWPORT_GUTTER - menuRect.width,
      ),
    );

    const belowTop = triggerRect.bottom + TRIGGER_GAP;
    const aboveTop = triggerRect.top - TRIGGER_GAP - fittedHeight;
    const roomBelow = window.innerHeight - VIEWPORT_GUTTER - belowTop;
    const roomAbove = triggerRect.top - VIEWPORT_GUTTER - TRIGGER_GAP;
    const preferredTop =
      roomBelow < fittedHeight && roomAbove > roomBelow ? aboveTop : belowTop;
    const top = Math.min(
      Math.max(VIEWPORT_GUTTER, preferredTop),
      Math.max(
        VIEWPORT_GUTTER,
        window.innerHeight - VIEWPORT_GUTTER - fittedHeight,
      ),
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
    const current = document.activeElement as HTMLButtonElement | null;
    const currentIndex = available.indexOf(current as HTMLButtonElement);
    let nextIndex: number | null = null;

    if (event.key === "ArrowDown") {
      nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % available.length;
    } else if (event.key === "ArrowUp") {
      nextIndex =
        currentIndex < 0
          ? available.length - 1
          : (currentIndex - 1 + available.length) % available.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = available.length - 1;
    }

    if (nextIndex !== null) {
      event.preventDefault();
      available[nextIndex]?.focus();
    }
  }

  return (
    <span class={["menu-anchor", className].filter(Boolean).join(" ")}>
      <button
        ref={triggerRef}
        type="button"
        class={["menu-trigger", triggerClassName].filter(Boolean).join(" ")}
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
          class="menu-popup"
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
                class={`menu-item menu-item-${item.variant ?? "default"}`}
                disabled={item.disabled}
                aria-describedby={reasonId}
                tabIndex={-1}
                onClick={() => {
                  if (item.disabled) return;
                  close(true);
                  item.onSelect();
                }}
              >
                {item.icon && <Icon name={item.icon} size={16} />}
                <span class="menu-item-content">
                  <span>{item.label}</span>
                  {item.disabledReason && (
                    <span id={reasonId} class="menu-item-reason">
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
