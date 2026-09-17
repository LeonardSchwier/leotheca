/** UX-01 spec section 20 "UI primitives" (Phase 1). See Button.tsx's own
 * header comment for the shared rationale; this is that same slice's
 * icon-only sibling.
 *
 * Spec 19.7: "every icon-only control has an accessible label and
 * tooltip on pointer layouts" -- `label` is a required prop, not
 * optional, so a caller cannot construct an IconButton without one. It
 * doubles as the native `title` tooltip and the `aria-label`, the same
 * pattern DocumentHeader.tsx's existing hand-written icon buttons already
 * use.
 */
import type { JSX } from "preact";
import { Icon, type IconName } from "./icons";
import "./primitives.css";

export type IconButtonSize = "sm" | "md";

export interface IconButtonProps extends Omit<
  JSX.ButtonHTMLAttributes<HTMLButtonElement>,
  "size" | "label" | "aria-label" | "title" | "loading"
> {
  icon: IconName;
  /** Accessible name and pointer tooltip (spec 19.7). Required: an
   * icon-only control must never ship without one. */
  label: string;
  size?: IconButtonSize;
  /** Reflects a toggled/pressed state, e.g. "Inspector is open" (spec
   * 13.5's "Inspector action reflects whether the Inspector is open").
   * Sets both the visual active style and `aria-pressed`. */
  active?: boolean;
  loading?: boolean;
}

export function IconButton({
  icon,
  label,
  size = "sm",
  active = false,
  loading = false,
  disabled = false,
  type = "button",
  className,
  ...rest
}: IconButtonProps): JSX.Element {
  const classes = [
    "icon-btn",
    `icon-btn-${size}`,
    active ? "icon-btn-active" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      {...rest}
      type={type}
      class={classes}
      aria-label={label}
      title={label}
      aria-pressed={active}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
    >
      <Icon
        name={loading ? "spinner" : icon}
        size={size === "md" ? 20 : 16}
        spin={loading}
      />
    </button>
  );
}
