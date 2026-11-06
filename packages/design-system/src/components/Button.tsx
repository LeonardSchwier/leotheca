import type { ComponentChildren, JSX } from "preact";
import { Spinner } from "./Spinner";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends Omit<
  JSX.ButtonHTMLAttributes<HTMLButtonElement>,
  "size" | "loading"
> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and blocks activation. The label stays in the DOM so the
   * accessible name does not change while busy. */
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
  return (
    <button
      {...rest}
      type={type}
      class={cx(
        "ds-btn",
        `ds-btn-${variant}`,
        `ds-btn-${size}`,
        className as string | undefined,
      )}
      disabled={Boolean(disabled) || loading}
      aria-busy={loading || undefined}
    >
      {loading && (
        <span class="ds-btn-spinner">
          <Spinner size={16} />
        </span>
      )}
      {children}
    </button>
  );
}
