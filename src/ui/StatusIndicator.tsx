/** UX-01 spec sections 13.6, 18, and 20: compact, truthful operational
 * status. Variants always retain visible text; icons and color reinforce
 * the state without becoming its only signal.
 */
import type { ComponentChildren, JSX } from "preact";
import { Icon, type IconName } from "./icons";
import { Spinner } from "./Spinner";
import "./primitives.css";

export type StatusIndicatorVariant = "neutral" | "progress" | "success" | "warning" | "danger";
export type StatusIndicatorSize = "sm" | "md";
export type StatusIndicatorLive = "off" | "polite" | "assertive";

const DEFAULT_ICONS: Partial<Record<StatusIndicatorVariant, IconName>> = {
  success: "check",
  warning: "warningTriangle",
  danger: "alertCircle",
};

export interface StatusIndicatorProps {
  children: ComponentChildren;
  variant?: StatusIndicatorVariant;
  size?: StatusIndicatorSize;
  live?: StatusIndicatorLive;
  icon?: IconName | false;
  ariaLabel?: string;
  title?: string;
  className?: string;
}

export function StatusIndicator({
  children,
  variant = "neutral",
  size = "md",
  live = "off",
  icon,
  ariaLabel,
  title,
  className,
}: StatusIndicatorProps): JSX.Element {
  const resolvedIcon = icon === false ? undefined : (icon ?? DEFAULT_ICONS[variant]);
  const role = live === "assertive" ? "alert" : live === "polite" ? "status" : undefined;

  return (
    <span
      class={[
        "status-indicator",
        `status-indicator-${variant}`,
        `status-indicator-${size}`,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      role={role}
      aria-live={live === "off" ? undefined : live}
      aria-atomic={live === "off" ? undefined : "true"}
      aria-busy={variant === "progress" ? "true" : undefined}
      aria-label={ariaLabel}
      title={title}
    >
      {variant === "progress" ? (
        <Spinner size={size === "sm" ? 16 : 20} />
      ) : (
        resolvedIcon && <Icon name={resolvedIcon} size={size === "sm" ? 16 : 20} />
      )}
      <span class="status-indicator-label">{children}</span>
    </span>
  );
}
