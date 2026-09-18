/** UX-01 spec sections 18.3 and 20: shared guidance when a surface has
 * no content. The API deliberately allows only one primary and one
 * secondary action, matching the spec's bounded action hierarchy.
 */
import type { ComponentChildren, JSX } from "preact";
import { useRef } from "preact/hooks";
import { Icon, type IconName } from "./icons";
import "./primitives.css";

export type EmptyStateSize = "sm" | "md";

export interface EmptyStateProps {
  title: string;
  description?: ComponentChildren;
  icon?: IconName;
  primaryAction?: ComponentChildren;
  secondaryAction?: ComponentChildren;
  size?: EmptyStateSize;
  className?: string;
}

let emptyStateId = 0;

export function EmptyState({
  title,
  description,
  icon,
  primaryAction,
  secondaryAction,
  size = "md",
  className,
}: EmptyStateProps): JSX.Element {
  const idRef = useRef<string | undefined>(undefined);
  if (!idRef.current) {
    emptyStateId += 1;
    idRef.current = `empty-state-${emptyStateId}`;
  }
  const titleId = `${idRef.current}-title`;
  const descriptionId = description ? `${idRef.current}-description` : undefined;

  return (
    <section
      class={["empty-state", `empty-state-${size}`, className].filter(Boolean).join(" ")}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      {icon && (
        <span class="empty-state-icon">
          <Icon name={icon} size={size === "sm" ? 20 : 24} />
        </span>
      )}
      <p id={titleId} class="empty-state-title">
        {title}
      </p>
      {description && (
        <p id={descriptionId} class="empty-state-description">
          {description}
        </p>
      )}
      {(primaryAction || secondaryAction) && (
        <div class="empty-state-actions">
          {primaryAction}
          {secondaryAction}
        </div>
      )}
    </section>
  );
}
