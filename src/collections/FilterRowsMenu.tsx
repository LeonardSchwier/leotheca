/**
 * F09 Phase 2: filter rows menu.
 *
 * A compact panel that shows the current filter rows (split by scope:
 * "All views" and "This view") with add / remove / reorder controls.
 *
 * Design:
 * - Each row shows the clause summary (field + operator + value).
 * - A scope toggle lets the user move a row between "All views" and
 *   "This view".
 * - Reorder via up/down arrow buttons (simple, keyboard-accessible,
 *   no drag-and-drop dependency).
 * - "Add filter" button at the bottom of each scope section.
 */
import {
  addFilterRow,
  getFilterRowsState,
  moveFilterRowScope,
  removeFilterRow,
  reorderFilterRow,
} from "./filterRows";
import type { QueryClauseV1, SmartCollectionV1 } from "./collectionTypes";
import type { FilterScope } from "./filterRows";

export interface FilterRowsMenuProps {
  collection: SmartCollectionV1;
  onChange: (collection: SmartCollectionV1) => void;
}

/** Summarize a clause for display: "Name contains hello" */
function clauseLabel(clause: QueryClauseV1): string {
  const field =
    clause.field.kind === "system"
      ? (clause.field.field[0]?.toUpperCase() ?? "?")
      : clause.field.key;
  const op = clause.operator[0]?.toUpperCase() ?? "";
  const val = clause.value
    ? clause.value.type === "string"
      ? `"${clause.value.value}"`
      : clause.value.type === "number"
        ? String(clause.value.value)
        : clause.value.type === "boolean"
          ? clause.value.value
            ? "yes"
            : "no"
          : clause.value.type === "date"
            ? clause.value.value
            : "…"
    : "…";
  return `${field} ${op} ${val}`;
}

function ScopeSection({
  title,
  scope,
  clauses,
  collection,
  onChange,
}: {
  title: string;
  scope: FilterScope;
  clauses: QueryClauseV1[];
  collection: SmartCollectionV1;
  onChange: (c: SmartCollectionV1) => void;
}) {
  const handleRemove = (index: number) => {
    onChange(removeFilterRow(collection, scope, index));
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    onChange(reorderFilterRow(collection, scope, index, index - 1));
  };

  const handleMoveDown = (index: number) => {
    if (index >= clauses.length - 1) return;
    onChange(reorderFilterRow(collection, scope, index, index + 1));
  };

  const handleToggleScope = (index: number) => {
    const toScope: FilterScope = scope === "all" ? "this" : "all";
    onChange(moveFilterRowScope(collection, scope, index, toScope));
  };

  const handleAdd = () => {
    // Default new clause: name contains ""
    const newClause: QueryClauseV1 = {
      type: "clause",
      field: { kind: "system", field: "name" },
      operator: "contains",
      value: { type: "string", value: "" },
    };
    onChange(addFilterRow(collection, newClause, scope));
  };

  return (
    <div class="filter-rows-section" data-scope={scope}>
      <div class="filter-rows-section-header">
        <span class="filter-rows-section-title">{title}</span>
        <button
          class="filter-rows-add"
          onClick={handleAdd}
          aria-label={`Add filter to ${title}`}
        >
          + Add
        </button>
      </div>

      {clauses.length === 0 ? (
        <p class="filter-rows-empty">No filters</p>
      ) : (
        <ol class="filter-rows-list" role="list">
          {clauses.map((clause, i) => (
            <li class="filter-rows-item" key={`${scope}-${i}`}>
              <span class="filter-rows-label" title={clauseLabel(clause)}>
                {clauseLabel(clause)}
              </span>
              <span class="filter-rows-controls">
                <button
                  class="filter-rows-btn"
                  onClick={() => handleMoveUp(i)}
                  disabled={i === 0}
                  aria-label={`Move ${clauseLabel(clause)} up`}
                >
                  ↑
                </button>
                <button
                  class="filter-rows-btn"
                  onClick={() => handleMoveDown(i)}
                  disabled={i === clauses.length - 1}
                  aria-label={`Move ${clauseLabel(clause)} down`}
                >
                  ↓
                </button>
                <button
                  class="filter-rows-btn"
                  onClick={() => handleToggleScope(i)}
                  aria-label={`Move ${clauseLabel(clause)} to ${scope === "all" ? "This view" : "All views"}`}
                >
                  {scope === "all" ? "→ This view" : "→ All views"}
                </button>
                <button
                  class="filter-rows-btn filter-rows-btn-remove"
                  onClick={() => handleRemove(i)}
                  aria-label={`Remove ${clauseLabel(clause)}`}
                >
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function FilterRowsMenu({ collection, onChange }: FilterRowsMenuProps) {
  const state = getFilterRowsState(collection);

  return (
    <div class="filter-rows-menu" role="region" aria-label="Filter rows">
      <ScopeSection
        title="All views"
        scope="all"
        clauses={state.all}
        collection={collection}
        onChange={onChange}
      />
      <ScopeSection
        title="This view"
        scope="this"
        clauses={state.thisView}
        collection={collection}
        onChange={onChange}
      />
    </div>
  );
}
