/** UX-01 spec section 20 "UI primitives" (Phase 1: "Button, IconButton,
 * SegmentedControl, Tooltip, Menu, Dialog, and status primitives needed
 * by the current shell"). This is the first slice of that list; see
 * IconButton.tsx alongside it and ROADMAP.md's UX-01 entry for the
 * remaining primitives (SegmentedControl, Dialog, Menu, ...), which stay
 * open follow-up work.
 *
 * A plain `<button>` under the hood, so native keyboard behavior (Enter
 * and Space activate it, it participates in Tab order, `disabled` removes
 * it from that order) and the app-wide `*:focus-visible` ring
 * (theme.css) both apply for free, with nothing here to override or
 * duplicate.
 */
import type { ComponentChildren, JSX } from "preact";
import { Icon } from "./icons";
import "./primitives.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends Omit<
  JSX.ButtonHTMLAttributes<HTMLButtonElement>,
  "size" | "loading"
> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and blocks activation, without hiding the label
   * (spec 20: "loading ... behavior"; keeping the label in the DOM keeps
   * the button's accessible name stable while busy). */
  loading?: boolean;
  children: ComponentChildren;
}

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  disabled = false,
  type = "button",
  className,
  children,
  ...rest
}: ButtonProps): JSX.Element {
  const classes = [
    "btn",
    `btn-${variant}`,
    `btn-${size}`,
    loading ? "btn-loading" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      {...rest}
      type={type}
      class={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading && (
        <span class="btn-spinner">
          <Icon name="spinner" size={16} spin />
        </span>
      )}
      {children}
    </button>
  );
}
