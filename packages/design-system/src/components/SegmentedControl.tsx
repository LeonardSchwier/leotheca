import type { ComponentChildren, JSX } from "preact";
import { useRef } from "preact/hooks";
import { cx } from "./cx";
import { nextRovingIndex } from "./rovingKeys";

export interface SegmentedOption<V extends string> {
  value: V;
  label: ComponentChildren;
  disabled?: boolean;
}

export interface SegmentedControlProps<V extends string> {
  /** Accessible name of the group. */
  label: string;
  options: readonly SegmentedOption<V>[];
  value: V;
  onChange: (value: V) => void;
  className?: string;
}

/** A single-select radio group: selection shows through weight and surface,
 * not color alone. */
export function SegmentedControl<V extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: SegmentedControlProps<V>): JSX.Element {
  const groupRef = useRef<HTMLDivElement>(null);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const tabStop = selectedIndex >= 0 ? selectedIndex : 0;

  function onKeyDown(event: JSX.TargetedKeyboardEvent<HTMLDivElement>) {
    const next = nextRovingIndex(
      event.key,
      tabStop,
      options.map((option) => !option.disabled),
    );
    if (next === null) return;
    event.preventDefault();
    onChange(options[next]!.value);
    const radios = groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    radios?.[next]?.focus();
  }

  return (
    <div
      ref={groupRef}
      class={cx("ds-segmented", className)}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      {options.map((option, index) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          class="ds-segmented-option"
          aria-checked={option.value === value}
          tabIndex={index === tabStop ? 0 : -1}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
