import type { ComponentChildren, JSX } from "preact";
import { useRef } from "preact/hooks";
import { cx } from "./cx";

let fieldCounter = 0;

function useFieldId(explicit: string | undefined): string {
  const ref = useRef<string | undefined>(undefined);
  if (!ref.current) {
    fieldCounter += 1;
    ref.current = `ds-field-${fieldCounter}`;
  }
  return explicit ?? ref.current;
}

interface FieldProps {
  /** Visible label, associated with the control through `for`. */
  label: string;
  hint?: ComponentChildren;
  /** Marks the control invalid and connects this text as its description. */
  error?: ComponentChildren;
}

interface FieldIds {
  id: string;
  describedBy: string | undefined;
  hintId: string;
  errorId: string;
}

function fieldIds(
  id: string,
  { hint, error }: Pick<FieldProps, "hint" | "error">,
  extra: unknown,
): FieldIds {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = cx(
    typeof extra === "string" && extra,
    hint ? hintId : undefined,
    error ? errorId : undefined,
  );
  return { id, describedBy: describedBy || undefined, hintId, errorId };
}

function Field({
  label,
  hint,
  error,
  ids,
  children,
}: FieldProps & { ids: FieldIds; children: ComponentChildren }): JSX.Element {
  return (
    <div class="ds-field">
      <label class="ds-field-label" for={ids.id}>
        {label}
      </label>
      {children}
      {hint && (
        <span id={ids.hintId} class="ds-field-hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={ids.errorId} class="ds-field-error">
          {error}
        </span>
      )}
    </div>
  );
}

export type InputProps = FieldProps & JSX.InputHTMLAttributes<HTMLInputElement>;

export function Input({
  label,
  hint,
  error,
  id,
  className,
  "aria-describedby": describedBy,
  ...rest
}: InputProps): JSX.Element {
  const resolved = useFieldId(id as string | undefined);
  const ids = fieldIds(resolved, { hint, error }, describedBy);
  return (
    <Field label={label} hint={hint} error={error} ids={ids}>
      <input
        {...rest}
        id={ids.id}
        class={cx("ds-input", className as string | undefined)}
        aria-describedby={ids.describedBy}
        aria-invalid={error ? true : undefined}
      />
    </Field>
  );
}

export type TextareaProps = FieldProps &
  JSX.TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({
  label,
  hint,
  error,
  id,
  className,
  "aria-describedby": describedBy,
  ...rest
}: TextareaProps): JSX.Element {
  const resolved = useFieldId(id as string | undefined);
  const ids = fieldIds(resolved, { hint, error }, describedBy);
  return (
    <Field label={label} hint={hint} error={error} ids={ids}>
      <textarea
        {...rest}
        id={ids.id}
        class={cx("ds-textarea", className as string | undefined)}
        aria-describedby={ids.describedBy}
        aria-invalid={error ? true : undefined}
      />
    </Field>
  );
}

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export type SelectProps = FieldProps &
  Omit<JSX.SelectHTMLAttributes<HTMLSelectElement>, "children"> & {
    options: readonly SelectOption[];
  };

/** A native select: the platform's picker is the accessible one on every
 * target, including touch. */
export function Select({
  label,
  hint,
  error,
  id,
  className,
  options,
  "aria-describedby": describedBy,
  ...rest
}: SelectProps): JSX.Element {
  const resolved = useFieldId(id as string | undefined);
  const ids = fieldIds(resolved, { hint, error }, describedBy);
  return (
    <Field label={label} hint={hint} error={error} ids={ids}>
      <select
        {...rest}
        id={ids.id}
        class={cx("ds-select", className as string | undefined)}
        aria-describedby={ids.describedBy}
        aria-invalid={error ? true : undefined}
      >
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export type CheckboxProps = Omit<
  JSX.InputHTMLAttributes<HTMLInputElement>,
  "type" | "label"
> & { label: ComponentChildren };

export function Checkbox({ label, className, ...rest }: CheckboxProps): JSX.Element {
  return (
    <label class={cx("ds-check", className as string | undefined)}>
      <input {...rest} type="checkbox" class="ds-checkbox-input" />
      <span>{label}</span>
    </label>
  );
}

export type SwitchProps = CheckboxProps;

/** A checkbox input with `role="switch"`: keeps native Space handling, form
 * participation, and label association while announcing on and off. */
export function Switch({ label, className, ...rest }: SwitchProps): JSX.Element {
  return (
    <label class={cx("ds-check", className as string | undefined)}>
      <input {...rest} type="checkbox" role="switch" class="ds-switch-input" />
      <span>{label}</span>
    </label>
  );
}
