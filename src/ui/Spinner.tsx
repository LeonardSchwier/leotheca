/** UX-01 spec sections 18.2 and 20: a truthful, local loading glyph.
 * Callers keep explanatory text visible beside it; a standalone spinner
 * must provide a label so assistive technology hears what is loading.
 */
import type { JSX } from "preact";
import { Icon } from "./icons";
import "./primitives.css";

export interface SpinnerProps {
  size?: 16 | 20 | 24;
  label?: string;
  className?: string;
}

export function Spinner({ size = 16, label, className }: SpinnerProps): JSX.Element {
  return (
    <span
      class={["spinner", className].filter(Boolean).join(" ")}
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : "true"}
    >
      <Icon name="spinner" size={size} spin />
    </span>
  );
}
