import { useState } from "preact/hooks";
import {
  MAX_QUERY_CLAUSES,
  MAX_QUERY_DEPTH,
  OPERATOR_GROUPS,
  SYSTEM_FIELD_OPERATOR_FAMILIES,
  type QueryClauseV1,
  type QueryFieldV1,
  type QueryGroupV1,
  type QueryNodeV1,
  type QueryOperatorV1,
  type QueryValueV1,
  type SystemFieldName,
} from "./collectionTypes";
import { evaluateQueryNode, type NoteRecord } from "./collectionQuery";
import "./collections.css";

/**
 * F09 Phase 1's query builder. Implements the full nested AND/OR group
 * model (spec section 6.1) recursively, but deliberately narrower than
 * the spec's own section 8 builder experience: no property-key typeahead
 * beyond a plain `<datalist>`, no debounced live-preview sample notes, no
 * "estimated broad query" warning, and no sort-key configuration UI
 * (collections always sort by path ascending, see collectionQuery.ts).
 * All of that is explicitly Phase 2 scope in the spec's own section 22
 * rollout plan ("query builder polish", "sort configuration"), so this
 * phase's roadmap entry narrows the builder to it rather than the query
 * engine or schema, both of which already support everything Phase 2
 * will add UI for.
 */

const SYSTEM_FIELD_OPTIONS: { field: SystemFieldName; label: string }[] = [
  { field: "name", label: "Note name" },
  { field: "path", label: "Path" },
  { field: "folder", label: "Folder" },
  { field: "tag", label: "Tag" },
  { field: "modified", label: "Modified" },
  { field: "hasFrontmatter", label: "Has frontmatter" },
];

type FamilyKey = keyof typeof OPERATOR_GROUPS;

const FAMILY_LABELS: Record<FamilyKey, string> = {
  string: "Text",
  number: "Number",
  boolean: "Yes / No",
  date: "Date",
  list: "List",
  path: "Path",
};

const OPERATOR_LABELS: Record<QueryOperatorV1, string> = {
  is: "is",
  "is-not": "is not",
  contains: "contains",
  "does-not-contain": "does not contain",
  "starts-with": "starts with",
  "ends-with": "ends with",
  exists: "exists",
  "does-not-exist": "does not exist",
  equals: "equals",
  "does-not-equal": "does not equal",
  "greater-than": "greater than",
  "greater-than-or-equal": "greater than or equal",
  "less-than": "less than",
  "less-than-or-equal": "less than or equal",
  "is-true": "is true",
  "is-false": "is false",
  before: "before",
  "on-or-before": "on or before",
  after: "after",
  "on-or-after": "on or after",
  "contains-item": "contains item",
  "contains-all-items": "contains all items",
  "contains-any-item": "contains any item",
  "contains-no-item": "contains no item",
  "is-empty": "is empty",
  "is-not-empty": "is not empty",
  "is-under-folder": "is under folder",
  "is-not-under-folder": "is not under folder",
  "contains-segment": "contains segment",
};

const NO_VALUE_OPERATORS = new Set<QueryOperatorV1>([
  "exists",
  "does-not-exist",
  "is-true",
  "is-false",
  "is-empty",
  "is-not-empty",
]);

function inferClauseFamily(clause: QueryClauseV1): FamilyKey {
  if (clause.field.kind === "system") return SYSTEM_FIELD_OPERATOR_FAMILIES[clause.field.field];
  const { operator, value } = clause;
  if (operator === "is-true" || operator === "is-false") return "boolean";
  if (
    operator === "is-empty" ||
    operator === "is-not-empty" ||
    operator === "contains-item" ||
    operator === "contains-all-items" ||
    operator === "contains-any-item" ||
    operator === "contains-no-item"
  ) {
    return "list";
  }
  if (
    operator === "is-under-folder" ||
    operator === "is-not-under-folder" ||
    operator === "contains-segment"
  ) {
    return "path";
  }
  if (
    operator === "greater-than" ||
    operator === "greater-than-or-equal" ||
    operator === "less-than" ||
    operator === "less-than-or-equal" ||
    operator === "equals" ||
    operator === "does-not-equal"
  ) {
    return "number";
  }
  if (
    operator === "before" ||
    operator === "on-or-before" ||
    operator === "after" ||
    operator === "on-or-after"
  ) {
    return "date";
  }
  if (value?.type === "path") return "path";
  if (value?.type === "date" || value?.type === "datetime") return "date";
  if (value?.type === "number") return "number";
  if (value?.type === "string-list") return "list";
  return "string";
}

function defaultValueForFamily(family: FamilyKey): QueryValueV1 | undefined {
  switch (family) {
    case "string":
      return { type: "string", value: "" };
    case "path":
      return { type: "path", value: "" };
    case "number":
      return { type: "number", value: 0 };
    case "date":
      return { type: "date", value: "" };
    case "list":
      return { type: "string", value: "" };
    case "boolean":
      return undefined;
  }
}

export function isClauseValid(clause: QueryClauseV1): boolean {
  if (clause.field.kind === "property" && clause.field.key.trim() === "") return false;
  if (NO_VALUE_OPERATORS.has(clause.operator)) return true;
  const value = clause.value;
  if (!value) return false;
  switch (value.type) {
    case "string":
    case "path":
      return value.value.trim() !== "";
    case "number":
      return Number.isFinite(value.value);
    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(value.value);
    case "datetime":
      return !Number.isNaN(Date.parse(value.value));
    case "string-list":
      return value.value.length > 0;
    case "boolean":
      return true;
  }
}

export function isQueryValid(node: QueryNodeV1): boolean {
  if (node.type === "clause") return isClauseValid(node);
  return node.children.every(isQueryValid);
}

export function countClauses(node: QueryNodeV1): number {
  if (node.type === "clause") return 1;
  return node.children.reduce((sum, child) => sum + countClauses(child), 0);
}

function splitList(raw: string): string[] {
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

interface ValueEditorProps {
  family: FamilyKey;
  operator: QueryOperatorV1;
  value: QueryValueV1 | undefined;
  onChange: (value: QueryValueV1 | undefined) => void;
}

function ValueEditor({ family, operator, value, onChange }: ValueEditorProps) {
  if (NO_VALUE_OPERATORS.has(operator)) return null;

  if (family === "number") {
    const numeric = value?.type === "number" ? value.value : undefined;
    return (
      <input
        class="collections-value-input"
        type="number"
        value={numeric !== undefined && Number.isFinite(numeric) ? numeric : ""}
        onInput={(e) => {
          const raw = (e.target as HTMLInputElement).value;
          onChange({ type: "number", value: raw === "" ? NaN : Number(raw) });
        }}
      />
    );
  }

  if (family === "date") {
    const iso = value?.type === "date" ? value.value : "";
    return (
      <input
        class="collections-value-input"
        type="date"
        value={iso}
        onInput={(e) => onChange({ type: "date", value: (e.target as HTMLInputElement).value })}
      />
    );
  }

  if (family === "list" && (operator === "contains-all-items" || operator === "contains-any-item" || operator === "contains-no-item")) {
    const items = value?.type === "string-list" ? value.value : [];
    return (
      <input
        class="collections-value-input"
        type="text"
        placeholder="comma, separated, items"
        value={items.join(", ")}
        onInput={(e) => onChange({ type: "string-list", value: splitList((e.target as HTMLInputElement).value) })}
      />
    );
  }

  // "string" family, "path" family, and list's "contains-item" all edit a
  // single text value; only the QueryValueV1 tag differs.
  const valueType = family === "path" ? "path" : "string";
  const text = value?.type === "string" || value?.type === "path" ? value.value : "";
  return (
    <input
      class="collections-value-input"
      type="text"
      value={text}
      onInput={(e) => onChange({ type: valueType, value: (e.target as HTMLInputElement).value })}
    />
  );
}

interface QueryClauseRowProps {
  clause: QueryClauseV1;
  onChange: (clause: QueryClauseV1) => void;
  onRemove: () => void;
  propertyKeys: string[];
}

function QueryClauseRow({ clause, onChange, onRemove, propertyKeys }: QueryClauseRowProps) {
  const family = inferClauseFamily(clause);
  const isProperty = clause.field.kind === "property";

  function setField(next: QueryFieldV1) {
    const nextFamily = next.kind === "system" ? SYSTEM_FIELD_OPERATOR_FAMILIES[next.field] : "string";
    const operator = OPERATOR_GROUPS[nextFamily][0];
    onChange({ type: "clause", field: next, operator, value: defaultValueForFamily(nextFamily) });
  }

  function setFamily(nextFamily: FamilyKey) {
    const operator = OPERATOR_GROUPS[nextFamily][0];
    onChange({ ...clause, operator, value: defaultValueForFamily(nextFamily) });
  }

  function setOperator(operator: QueryOperatorV1) {
    onChange({
      ...clause,
      operator,
      value: NO_VALUE_OPERATORS.has(operator) ? undefined : (clause.value ?? defaultValueForFamily(family)),
    });
  }

  return (
    <div class={`collections-clause-row ${isClauseValid(clause) ? "" : "collections-row-invalid"}`}>
      <select
        class="collections-field-select"
        aria-label="Field"
        value={clause.field.kind === "system" ? clause.field.field : "property"}
        onChange={(e) => {
          const raw = (e.target as HTMLSelectElement).value;
          if (raw === "property") setField({ kind: "property", key: "" });
          else setField({ kind: "system", field: raw as SystemFieldName });
        }}
      >
        {SYSTEM_FIELD_OPTIONS.map((option) => (
          <option key={option.field} value={option.field}>
            {option.label}
          </option>
        ))}
        <option value="property">Property...</option>
      </select>

      {isProperty && (
        <>
          <input
            class="collections-property-key-input"
            type="text"
            list="collections-property-keys"
            placeholder="Property name"
            aria-label="Property name"
            value={clause.field.kind === "property" ? clause.field.key : ""}
            onInput={(e) =>
              onChange({
                ...clause,
                field: { kind: "property", key: (e.target as HTMLInputElement).value },
              })
            }
          />
          <select
            class="collections-family-select"
            aria-label="Compare as"
            value={family}
            onChange={(e) => setFamily((e.target as HTMLSelectElement).value as FamilyKey)}
          >
            {(Object.keys(OPERATOR_GROUPS) as FamilyKey[]).map((key) => (
              <option key={key} value={key}>
                {FAMILY_LABELS[key]}
              </option>
            ))}
          </select>
        </>
      )}

      <select
        class="collections-operator-select"
        aria-label="Operator"
        value={clause.operator}
        onChange={(e) => setOperator((e.target as HTMLSelectElement).value as QueryOperatorV1)}
      >
        {OPERATOR_GROUPS[family].map((operator) => (
          <option key={operator} value={operator}>
            {OPERATOR_LABELS[operator]}
          </option>
        ))}
      </select>

      <ValueEditor
        family={family}
        operator={clause.operator}
        value={clause.value}
        onChange={(value) => onChange({ ...clause, value })}
      />

      <button
        class="icon-button collections-remove-button"
        aria-label="Remove condition"
        title="Remove condition"
        onClick={onRemove}
      >
        ×
      </button>

      {isProperty && (
        <datalist id="collections-property-keys">
          {propertyKeys.map((key) => (
            <option key={key} value={key} />
          ))}
        </datalist>
      )}
    </div>
  );
}

interface QueryGroupEditorProps {
  group: QueryGroupV1;
  onChange: (group: QueryGroupV1) => void;
  onRemove?: () => void;
  depth: number;
  propertyKeys: string[];
}

function defaultClause(): QueryClauseV1 {
  return { type: "clause", field: { kind: "system", field: "name" }, operator: "contains", value: { type: "string", value: "" } };
}

function QueryGroupEditor({ group, onChange, onRemove, depth, propertyKeys }: QueryGroupEditorProps) {
  function updateChild(index: number, next: QueryNodeV1) {
    const children = group.children.slice();
    children[index] = next;
    onChange({ ...group, children });
  }

  function removeChild(index: number) {
    onChange({ ...group, children: group.children.filter((_, i) => i !== index) });
  }

  function addClause() {
    onChange({ ...group, children: [...group.children, defaultClause()] });
  }

  function addGroup() {
    onChange({
      ...group,
      children: [...group.children, { type: "group", operator: "and", children: [] }],
    });
  }

  return (
    <div class="collections-group" style={{ marginLeft: depth > 0 ? "var(--space-3)" : "0" }}>
      <div class="collections-group-header">
        <div class="collections-group-toggle" role="group" aria-label="Match">
          <button
            class={group.operator === "and" ? "active" : ""}
            onClick={() => onChange({ ...group, operator: "and" })}
            aria-pressed={group.operator === "and"}
          >
            All (AND)
          </button>
          <button
            class={group.operator === "or" ? "active" : ""}
            onClick={() => onChange({ ...group, operator: "or" })}
            aria-pressed={group.operator === "or"}
          >
            Any (OR)
          </button>
        </div>
        {onRemove && (
          <button class="icon-button collections-remove-button" aria-label="Remove group" onClick={onRemove}>
            ×
          </button>
        )}
      </div>

      {group.children.length === 0 && (
        <p class="empty-hint collections-group-empty">
          {group.operator === "and" ? "Matches every note." : "Matches no notes."}
        </p>
      )}

      <div class="collections-group-children">
        {group.children.map((child, index) =>
          child.type === "clause" ? (
            <QueryClauseRow
              key={index}
              clause={child}
              onChange={(next) => updateChild(index, next)}
              onRemove={() => removeChild(index)}
              propertyKeys={propertyKeys}
            />
          ) : (
            <QueryGroupEditor
              key={index}
              group={child}
              onChange={(next) => updateChild(index, next)}
              onRemove={() => removeChild(index)}
              depth={depth + 1}
              propertyKeys={propertyKeys}
            />
          ),
        )}
      </div>

      <div class="collections-group-actions">
        <button class="collections-add-button" onClick={addClause}>
          + Add condition
        </button>
        {depth < MAX_QUERY_DEPTH && (
          <button class="collections-add-button" onClick={addGroup}>
            + Add group
          </button>
        )}
      </div>
    </div>
  );
}

export interface CollectionBuilderProps {
  initialName: string;
  initialDescription: string;
  initialQuery: QueryGroupV1;
  /** For the live match count only (spec section 8.5, narrowed here to a
   * plain synchronous count with no debounce, see this file's own doc
   * comment). */
  notes: NoteRecord[];
  propertyKeys: string[];
  onSave: (input: { name: string; description: string; query: QueryGroupV1 }) => void;
  onCancel: () => void;
}

/** A minimal, controlled draft state holder: CollectionsPanel owns
 * whether the builder is open at all and remounts it (via a `key`) per
 * collection being edited, so this component can keep its own local
 * `useState` for the in-progress draft without a separate "dirty draft"
 * signal elsewhere. */
export function CollectionBuilder({
  initialName,
  initialDescription,
  initialQuery,
  notes,
  propertyKeys,
  onSave,
  onCancel,
}: CollectionBuilderProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [query, setQuery] = useState<QueryGroupV1>(initialQuery);

  const totalClauses = countClauses(query);
  const tooManyClauses = totalClauses > MAX_QUERY_CLAUSES;
  const nameValid = name.trim() !== "";
  const queryValid = isQueryValid(query) && !tooManyClauses;
  const canSave = nameValid && queryValid;
  const matchCount = queryValid ? notes.filter((note) => evaluateQueryNode(query, note)).length : 0;

  return (
    <div class="collections-builder" role="form" aria-label="Collection builder">
      <label class="collections-field">
        <span>Name</span>
        <input
          type="text"
          value={name}
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
          aria-invalid={!nameValid}
        />
      </label>
      <label class="collections-field">
        <span>Description</span>
        <input
          type="text"
          value={description}
          onInput={(e) => setDescription((e.target as HTMLInputElement).value)}
        />
      </label>

      <QueryGroupEditor group={query} onChange={setQuery} depth={0} propertyKeys={propertyKeys} />

      {tooManyClauses && (
        <p class="collections-builder-error">
          This query has {totalClauses} conditions; the limit is {MAX_QUERY_CLAUSES}.
        </p>
      )}

      <p class="collections-live-count">
        {queryValid ? `${matchCount} note${matchCount === 1 ? "" : "s"} match` : "Fix the highlighted condition to see results"}
      </p>

      <div class="collections-builder-actions">
        <button class="collections-cancel-button" onClick={onCancel}>
          Cancel
        </button>
        <button class="collections-save-button" disabled={!canSave} onClick={() => onSave({ name, description, query })}>
          Save
        </button>
      </div>
    </div>
  );
}
