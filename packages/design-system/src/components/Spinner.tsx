import type { JSX } from "preact";

export interface SpinnerProps {
  size?: number;
  /** Announced text. Without it the spinner is decorative, for cases where a
   * surrounding control already says that it is busy. */
  label?: string;
  className?: string;
}

export function Spinner({ size = 16, label, className }: SpinnerProps): JSX.Element {
  return (
    <span
      class={["ds-spinner", className].filter(Boolean).join(" ")}
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <path d="M21 12a9 9 0 1 1-6.2-8.56" />
      </svg>
    </span>
  );
}
