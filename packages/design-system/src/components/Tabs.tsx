import type { ComponentChildren, JSX } from "preact";
import { useRef } from "preact/hooks";
import { cx } from "./cx";
import { nextRovingIndex } from "./rovingKeys";

export interface TabItem {
  id: string;
  label: ComponentChildren;
  panel: ComponentChildren;
  disabled?: boolean;
}

export interface TabsProps {
  /** Accessible name of the tab list. */
  label: string;
  items: readonly TabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}

let tabsCounter = 0;

/** WAI-ARIA tabs with automatic activation: an arrow key both moves focus and
 * selects, because panels here render without a network or heavy load. */
export function Tabs({ label, items, value, onChange, className }: TabsProps): JSX.Element {
  const idRef = useRef<string | undefined>(undefined);
  if (!idRef.current) {
    tabsCounter += 1;
    idRef.current = `ds-tabs-${tabsCounter}`;
  }
  const baseId = idRef.current;
  const listRef = useRef<HTMLDivElement>(null);
  const selectedIndex = Math.max(
    0,
    items.findIndex((item) => item.id === value),
  );
  const selected = items[selectedIndex];

  function onKeyDown(event: JSX.TargetedKeyboardEvent<HTMLDivElement>) {
    const next = nextRovingIndex(
      event.key,
      selectedIndex,
      items.map((item) => !item.disabled),
    );
    if (next === null) return;
    event.preventDefault();
    onChange(items[next]!.id);
    const tabs = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabs?.[next]?.focus();
  }

  return (
    <div class={className}>
      <div
        ref={listRef}
        class="ds-tablist"
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
      >
        {items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`${baseId}-tab-${item.id}`}
            class="ds-tab"
            aria-selected={index === selectedIndex}
            aria-controls={
              index === selectedIndex ? `${baseId}-panel-${item.id}` : undefined
            }
            tabIndex={index === selectedIndex ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {selected && (
        <div
          id={`${baseId}-panel-${selected.id}`}
          class={cx("ds-tabpanel")}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${selected.id}`}
          tabIndex={0}
        >
          {selected.panel}
        </div>
      )}
    </div>
  );
}
