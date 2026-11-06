import type { ComponentChildren, JSX } from "preact";
import { cx } from "./cx";

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger";

export interface BadgeProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  children: ComponentChildren;
}

export function Badge({
  tone = "neutral",
  className,
  children,
  ...rest
}: BadgeProps): JSX.Element {
  return (
    <span
      {...rest}
      class={cx("ds-badge", `ds-badge-${tone}`, className as string | undefined)}
    >
      {children}
    </span>
  );
}

export interface CardProps extends Omit<JSX.HTMLAttributes<HTMLElement>, "title"> {
  title?: ComponentChildren;
  /** Adds the low shadow. Off by default: a border is enough for most cards. */
  raised?: boolean;
  children?: ComponentChildren;
}

export function Card({
  title,
  raised = false,
  className,
  children,
  ...rest
}: CardProps): JSX.Element {
  return (
    <article
      {...rest}
      class={cx(
        "ds-card",
        raised && "ds-card-raised",
        className as string | undefined,
      )}
    >
      {title && <h3 class="ds-card-title">{title}</h3>}
      {children}
    </article>
  );
}

export interface EmptyStateProps {
  title: ComponentChildren;
  description?: ComponentChildren;
  icon?: ComponentChildren;
  actions?: ComponentChildren;
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon,
  actions,
  className,
}: EmptyStateProps): JSX.Element {
  return (
    <div class={cx("ds-empty", className)}>
      {icon && <span aria-hidden="true">{icon}</span>}
      <p class="ds-empty-title">{title}</p>
      {description && <p class="ds-empty-description">{description}</p>}
      {actions}
    </div>
  );
}
