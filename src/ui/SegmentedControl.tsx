/** UX-01 spec section 20 "UI primitives" (Phase 1: "Button, IconButton,
 * SegmentedControl, Tooltip, Menu, Dialog, and status primitives needed
 * by the current shell"). See Button.tsx's own header comment for the
 * shared rationale; this is the next slice of that list.
 *
 * An exclusive single-select group (spec 15.6/16: "Exclusive small sets
 * use a segmented control or radio group"), implemented as the W3C ARIA
 * Authoring Practices "radio group" pattern: `role="radiogroup"` around
 * `role="radio"` options, roving `tabindex` (only the checked option, or
 * the first enabled one when nothing is checked, is in the Tab order),
 * and Arrow/Home/End keys that move focus *and* selection together in
 * one step -- unlike a native HTML radio group, there is no separate
 * "focus it, then activate it" phase, matching how a tab-like exclusive
 * toggle (view mode, theme, filter) is actually used here.
 *
 * Each option can be icon-only (icon set, no visible text -- the pattern
 * DocumentHeader.tsx's existing hand-written view-mode switch already
 * uses) or text-only (no icon -- the pattern Settings' toggles use, e.g.
 * "Follow System"/"Light"/"Dark"). `label` is required either way: it is
 * always the accessible name, and doubles as the visible text or the
 * native `title` tooltip depending on whether `icon` is set, the same
 * split IconButton.tsx already uses for the identical reason.
 */
import { useRef } from "preact/hooks";
import type { JSX } from "preact";
import { Icon, type IconName } from "./icons";
import "./primitives.css";

export type SegmentedControlSize = "sm" | "md";

export interface SegmentedControlOption<Value extends string> {
  value: Value;
  /** Accessible name for this option; also the visible label when `icon`
   * is not set, or the pointer tooltip/aria-label when it is. */
  label: string;
  icon?: IconName;
  disabled?: boolean;
}

export interface SegmentedControlProps<Value extends string> {
  options: SegmentedControlOption<Value>[];
  value: Value;
  onChange: (value: Value) => void;
  size?: SegmentedControlSize;
  /** Accessible name for the group as a whole (spec 22.3: "Icon-only
   * buttons have explicit names" applies at the group level too when
   * every option is icon-only). Required, not inferred. */
  "aria-label": string;
  className?: string;
}

function enabledIndexes<Value extends string>(
  options: SegmentedControlOption<Value>[],
): number[] {
  return options
    .map((option, index) => (option.disabled ? -1 : index))
    .filter((index) => index !== -1);
}

export function SegmentedControl<Value extends string>({
  options,
  value,
  onChange,
  size = "md",
  className,
  ...rest
}: SegmentedControlProps<Value>): JSX.Element {
  const groupLabel = rest["aria-label"];
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const selectedIndex = options.findIndex((option) => option.value === value);
  const enabled = enabledIndexes(options);
  // Roving tabindex target: the checked option when it is itself enabled,
  // otherwise the first enabled option, so a fully-disabled group (or one
  // whose current value has no matching/enabled option) never leaves
  // every option out of the Tab order and never leaves more than one in
  // it (single Tab stop is the whole point of roving tabindex).
  const tabStopIndex =
    selectedIndex !== -1 && !options[selectedIndex]?.disabled
      ? selectedIndex
      : (enabled[0] ?? -1);

  function focusAndSelect(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    buttonRefs.current[index]?.focus();
    onChange(option.value);
  }

  function moveFocus(from: number, direction: 1 | -1) {
    if (enabled.length === 0) return;
    let cursor = from;
    for (let step = 0; step < options.length; step++) {
      cursor = (cursor + direction + options.length) % options.length;
      if (!options[cursor]?.disabled) {
        focusAndSelect(cursor);
        return;
      }
    }
  }

  function onKeyDown(
    event: JSX.TargetedKeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        moveFocus(index, 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        moveFocus(index, -1);
        break;
      case "Home":
        event.preventDefault();
        if (enabled.length > 0) focusAndSelect(enabled[0]);
        break;
      case "End":
        event.preventDefault();
        if (enabled.length > 0) focusAndSelect(enabled[enabled.length - 1]);
        break;
    }
  }

  const classes = ["segmented", `segmented-${size}`, className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div class={classes} role="radiogroup" aria-label={groupLabel}>
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              buttonRefs.current[index] = el;
            }}
            type="button"
            role="radio"
            class={`segmented-option${checked ? " segmented-option-active" : ""}`}
            aria-checked={checked}
            aria-label={option.icon ? option.label : undefined}
            title={option.icon ? option.label : undefined}
            disabled={option.disabled}
            tabIndex={index === tabStopIndex ? 0 : -1}
            onClick={() => focusAndSelect(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {option.icon ? (
              <Icon name={option.icon} size={size === "md" ? 20 : 16} />
            ) : (
              option.label
            )}
          </button>
        );
      })}
    </div>
  );
}
