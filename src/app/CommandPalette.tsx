import { useEffect, useMemo, useRef, useState } from "preact/hooks";

export interface Command {
  id: string;
  label: string;
  run: () => void;
}

interface CommandPaletteProps {
  commands: Command[];
  onClose: () => void;
}

export function CommandPalette({ commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q));
  }, [commands, query]);

  const runAndClose = (command: Command) => {
    command.run();
    onClose();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const command = filtered[selected];
      if (command) runAndClose(command);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div class="modal-overlay command-palette-overlay" onClick={onClose}>
      <div class="modal command-palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          class="command-palette-input"
          type="text"
          placeholder="Type a command..."
          value={query}
          onInput={(e) => {
            setQuery((e.target as HTMLInputElement).value);
            setSelected(0);
          }}
          onKeyDown={onKeyDown}
        />
        <ul class="command-palette-list">
          {filtered.length === 0 && <li class="empty-hint">No matching commands.</li>}
          {filtered.map((command, index) => (
            <li key={command.id}>
              <button
                class={index === selected ? "active" : ""}
                onMouseEnter={() => setSelected(index)}
                onClick={() => runAndClose(command)}
              >
                {command.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
