import { useState } from "preact/hooks";
import {
  applyFrontmatterFields,
  parseFrontmatterFields,
  type FrontmatterField,
} from "../linking/frontmatter";
import "./frontmatterProperties.css";

export interface FrontmatterPropertiesPanelProps {
  source: string;
  onChange: (newSource: string) => void;
  /** WorkspaceSettings.frontmatterPropertiesEnabled; when false, renders
   * nothing, the note's frontmatter is edited as raw text same as before
   * this feature existed. */
  enabled: boolean;
}

// Matches frontmatter.ts's own TOP_LEVEL_KEY grammar, so a key typed here
// is always one parseFrontmatterFields can read back correctly.
const INVALID_KEY_CHARS = /[^A-Za-z0-9_.-]/g;

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * A generic "Properties" panel above the editor: every scalar or flat-
 * list frontmatter field (see linking/frontmatter.ts) as a plain label
 * plus a single free-text value input, with add/remove. Deliberately not
 * a type-specific editor (no date picker, no checkbox, no per-type
 * dropdown the way the wider note-taking ecosystem's own Properties view
 * has) and not a full YAML editor: every value is a string or a flat,
 * comma-joined list of strings, matching exactly what
 * parseFrontmatterFields can safely parse back. Frontmatter content the
 * parser doesn't understand (a nested map, a comment) is never shown
 * here, but is preserved untouched on disk, see applyFrontmatterFields.
 */
export function FrontmatterPropertiesPanel({
  source,
  onChange,
  enabled,
}: FrontmatterPropertiesPanelProps) {
  const [newKey, setNewKey] = useState("");
  const [adding, setAdding] = useState(false);

  if (!enabled) return null;

  const { fields, rawLines } = parseFrontmatterFields(source);

  const commit = (nextFields: FrontmatterField[]) => {
    onChange(applyFrontmatterFields(source, nextFields, rawLines));
  };

  const updateValue = (index: number, raw: string) => {
    const field = fields[index];
    const next = [...fields];
    next[index] =
      field.kind === "list" ? { ...field, value: splitList(raw) } : { ...field, value: raw };
    commit(next);
  };

  const removeField = (index: number) => {
    commit(fields.filter((_, i) => i !== index));
  };

  const cancelAdd = () => {
    setNewKey("");
    setAdding(false);
  };

  const confirmAdd = () => {
    const key = newKey.trim().replace(INVALID_KEY_CHARS, "-");
    if (key && !fields.some((f) => f.key === key)) {
      commit([...fields, { kind: "scalar", key, value: "" }]);
    }
    cancelAdd();
  };

  if (fields.length === 0 && !adding) {
    return (
      <div class="frontmatter-properties frontmatter-properties-empty">
        <button class="frontmatter-add-button" onClick={() => setAdding(true)}>
          + Add property
        </button>
      </div>
    );
  }

  return (
    <div class="frontmatter-properties">
      {fields.map((field, index) => (
        <div class="frontmatter-row" key={field.key}>
          <span class="frontmatter-key">{field.key}</span>
          <input
            class="frontmatter-value"
            type="text"
            // A list value is edited as a single comma-joined string, and
            // re-split on every keystroke (see splitList above), which
            // can visibly renormalize spacing (e.g. "a,b" -> "a, b") mid-
            // typing. A known, minor rough edge, not a data-loss risk:
            // the underlying fields array is never corrupted by it.
            value={field.kind === "list" ? field.value.join(", ") : field.value}
            onInput={(e) => updateValue(index, (e.target as HTMLInputElement).value)}
          />
          <button
            class="frontmatter-remove"
            aria-label={`Remove ${field.key}`}
            onClick={() => removeField(index)}
          >
            ×
          </button>
        </div>
      ))}
      {adding ? (
        <div class="frontmatter-row">
          <input
            class="frontmatter-key-input"
            type="text"
            placeholder="Property name"
            value={newKey}
            onInput={(e) => setNewKey((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmAdd();
              if (e.key === "Escape") cancelAdd();
            }}
          />
          <button class="frontmatter-add-confirm" onClick={confirmAdd}>
            Add
          </button>
        </div>
      ) : (
        <button class="frontmatter-add-button" onClick={() => setAdding(true)}>
          + Add property
        </button>
      )}
    </div>
  );
}
