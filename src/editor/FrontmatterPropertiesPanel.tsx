import { useState } from "preact/hooks";
import {
  addFrontmatterProperty,
  parseFrontmatterProperties,
  removeFrontmatterProperty,
  updateFrontmatterProperty,
  type EditableListProperty,
  type EditableScalarProperty,
} from "./frontmatterEdits";
import "./frontmatterProperties.css";

export interface FrontmatterPropertiesPanelProps {
  source: string;
  onChange: (newSource: string) => void;
  /** WorkspaceSettings.frontmatterPropertiesEnabled; when false, renders
   * nothing and the note's frontmatter is edited as raw text. */
  enabled: boolean;
  readOnly?: boolean;
}

const INVALID_KEY_CHARS = /[^A-Za-z0-9_.-]/g;

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * A deliberately small Properties view for safe top-level frontmatter.
 * Simple scalar and list values are editable. Structures the lightweight
 * parser cannot edit without risking a lossy rewrite stay visible but
 * read-only. Every edit is applied to that property's original source
 * range, so unrelated comments, ordering, quoting, line endings, and
 * unsupported YAML remain byte-for-byte unchanged.
 */
export function FrontmatterPropertiesPanel({
  source,
  onChange,
  enabled,
  readOnly = false,
}: FrontmatterPropertiesPanelProps) {
  const [newKey, setNewKey] = useState("");
  const [adding, setAdding] = useState(false);

  if (!enabled) return null;

  const { properties } = parseFrontmatterProperties(source);

  const updateValue = (
    property: EditableScalarProperty | EditableListProperty,
    raw: string,
  ) => {
    const value = property.kind === "list" ? splitList(raw) : raw;
    onChange(updateFrontmatterProperty(source, property, value));
  };

  const removeField = (index: number) => {
    onChange(removeFrontmatterProperty(source, properties[index]));
  };

  const cancelAdd = () => {
    setNewKey("");
    setAdding(false);
  };

  const confirmAdd = () => {
    const key = newKey.trim().replace(INVALID_KEY_CHARS, "-");
    if (key && !properties.some((property) => property.key === key)) {
      onChange(addFrontmatterProperty(source, key));
    }
    cancelAdd();
  };

  if (properties.length === 0 && !adding) {
    return (
      <div class="frontmatter-properties frontmatter-properties-empty">
        <button class="frontmatter-add-button" disabled={readOnly} onClick={() => setAdding(true)}>
          + Add property
        </button>
      </div>
    );
  }

  return (
    <div class="frontmatter-properties">
      {properties.map((property, index) => (
        <div class="frontmatter-row" key={`${property.key}-${index}`}>
          <span class="frontmatter-key">{property.key}</span>
          {property.editable ? (
            <input
              class="frontmatter-value"
              type="text"
              value={property.kind === "list" ? property.value.join(", ") : property.value}
              onInput={(event) =>
                updateValue(property, (event.target as HTMLInputElement).value)
              }
              disabled={readOnly}
            />
          ) : (
            <input
              class="frontmatter-value"
              type="text"
              value={property.value}
              readOnly
              aria-label={`${property.key} read only`}
              title="This property is preserved as raw frontmatter and can be edited in Source view."
            />
          )}
          {property.editable ? (
            <button
              class="frontmatter-remove"
              aria-label={`Remove ${property.key}`}
              onClick={() => removeField(index)}
              disabled={readOnly}
            >
              ×
            </button>
          ) : null}
        </div>
      ))}
      {adding ? (
        <div class="frontmatter-row">
          <input
            class="frontmatter-key-input"
            type="text"
            placeholder="Property name"
            value={newKey}
            onInput={(event) => setNewKey((event.target as HTMLInputElement).value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") confirmAdd();
              if (event.key === "Escape") cancelAdd();
            }}
            disabled={readOnly}
          />
          <button class="frontmatter-add-confirm" onClick={confirmAdd} disabled={readOnly}>
            Add
          </button>
        </div>
      ) : (
        <button class="frontmatter-add-button" onClick={() => setAdding(true)} disabled={readOnly}>
          + Add property
        </button>
      )}
    </div>
  );
}
