import { useEffect, useRef, useState } from "preact/hooks";

interface NamePromptProps {
  title: string;
  placeholder: string;
  initialValue?: string;
  /** Label for the submit button. Defaults to "Create": most uses of this
   * dialog are creating something, but a caller doing something else (e.g.
   * renaming) should say so, the button previously always said "Create"
   * even on the rename dialogs, which is exactly what this prop fixes. */
  submitLabel?: string;
  error: string | null;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

export function NamePrompt({
  title,
  placeholder,
  initialValue,
  submitLabel = "Create",
  error,
  onSubmit,
  onCancel,
}: NamePromptProps) {
  const [value, setValue] = useState(initialValue ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed) onSubmit(trimmed);
  };

  return (
    <div class="modal-overlay" onClick={onCancel}>
      <div class="modal name-prompt" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <input
          ref={inputRef}
          type="text"
          value={value}
          placeholder={placeholder}
          onInput={(e) => setValue((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") onCancel();
          }}
        />
        {error && <p class="name-prompt-error">{error}</p>}
        <div class="name-prompt-actions">
          <button onClick={onCancel}>Cancel</button>
          <button onClick={submit}>{submitLabel}</button>
        </div>
      </div>
    </div>
  );
}
