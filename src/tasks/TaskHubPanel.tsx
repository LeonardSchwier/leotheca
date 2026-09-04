import { useMemo, useState } from "preact/hooks";
import { linkIndex } from "../linking/store";
import { requestOutlineReveal } from "../outline/outlineNavigation";
import { toggleTaskCompletion } from "./taskMutation";
import {
  DEFAULT_TASK_HUB_QUERY,
  queryTasks,
  totalTaskCount,
  type TaskEntry,
  type TaskHubGroupBy,
  type TaskHubQuery,
  type TaskHubSortBy,
  type TaskHubStatus,
} from "./taskQuery";
import type { SaveCoordinator } from "../workspace/saveCoordinator";
import "./tasks.css";

// Re-exported so existing callers (this module's own component tests)
// keep working unchanged now that the pure query pipeline lives in
// taskQuery.ts, the module layout spec/f02-workspace-task-hub.md section
// 8.1 recommends: this panel owns rendering and the toggle/navigation
// wiring, taskQuery.ts owns filter/group/sort, taskMutation.ts owns the
// conflict-checked write.
export { flattenTasks } from "./taskQuery";

interface TaskHubPanelProps {
  onOpenFile: (path: string, name: string) => void | Promise<void>;
  /** Called right after a task row is selected and a reveal has been
   * requested, mirroring OutlinePanel's own prop of the same name: a host
   * that needs to make the editor visible (e.g. switching out of a
   * preview-only view mode) can do so here. */
  onNavigated?: () => void;
  /** The app's single SaveCoordinator instance, the same one App.tsx's
   * own handleChange uses, so a toggle-complete edit and a normal editor
   * autosave for the same path are never two independent writers (spec
   * section 8.4). */
  save: SaveCoordinator;
}

type RowStatus =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "stale" }
  | { kind: "locked" }
  | { kind: "error"; message: string };

function rowKey(entry: TaskEntry): string {
  return `${entry.path}:${entry.task.sourceFrom}:${entry.task.markerFrom}`;
}

function parseTagsOrPaths(raw: string): string[] {
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * F02 Phase 2 (spec/f02-workspace-task-hub.md): the sidebar panel listing
 * every GitHub-Flavored-Markdown task-list item found across the
 * workspace, a projection of the shared workspace metadata index
 * (`linkIndex.value.tasksByPath`/`tagsByPath`), not a second task
 * database. Selecting a row's label opens its note and reveals the task's
 * exact source location (unchanged from Phase 1); the checkbox is now a
 * real, conflict-checked toggle (`taskMutation.ts`) rather than a
 * read-only visual indicator.
 *
 * Implements the spec's Status, Path, Tags, and Text filters (section
 * 6.3) and Note/Folder/None grouping, plus Note-order and Text sorting.
 * Explicitly not implemented, disclosed in `taskQuery.ts`'s own header
 * comment and the F02 Phase 2 ROADMAP.md entry: due-state filtering,
 * grouping, and sorting (needs due-date extraction Phase 1 never added to
 * `scanTasks`), "recently modified note" sorting (needs a per-note
 * modification time `LinkIndex` does not expose), and persisted
 * `TaskHubSettingsV1` query state (session-only here, the spec's own safe
 * default for the fields it says must be session-only, extended in this
 * phase to every field rather than mixing persisted and session-only
 * state for a small first cut).
 */
export function TaskHubPanel({ onOpenFile, onNavigated, save }: TaskHubPanelProps) {
  const [query, setQuery] = useState<TaskHubQuery>(DEFAULT_TASK_HUB_QUERY);
  const [pathInput, setPathInput] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [rowStatus, setRowStatus] = useState<Map<string, RowStatus>>(new Map());
  const [filtersOpen, setFiltersOpen] = useState(false);

  const tasksByPath = linkIndex.value.tasksByPath;
  const tagsByPath = linkIndex.value.tagsByPath;
  const total = totalTaskCount(tasksByPath);
  const groups = useMemo(
    () => queryTasks(tasksByPath, tagsByPath, query),
    [tasksByPath, tagsByPath, query],
  );
  const filteredCount = groups.reduce((sum, group) => sum + group.entries.length, 0);

  function setRowStatusFor(key: string, status: RowStatus) {
    setRowStatus((current) => {
      const next = new Map(current);
      if (status.kind === "idle") next.delete(key);
      else next.set(key, status);
      return next;
    });
  }

  async function handleSelect(entry: TaskEntry) {
    await onOpenFile(entry.path, entry.noteTitle);
    requestOutlineReveal(entry.task.textFrom, entry.task.textTo);
    onNavigated?.();
  }

  async function handleToggle(entry: TaskEntry) {
    const key = rowKey(entry);
    if (rowStatus.get(key)?.kind === "pending") return;
    setRowStatusFor(key, { kind: "pending" });

    const result = await toggleTaskCompletion(entry.path, entry.task, { save });

    if (result.status === "ok") {
      setRowStatusFor(key, { kind: "idle" });
    } else if (result.status === "stale") {
      setRowStatusFor(key, { kind: "stale" });
    } else if (result.status === "locked") {
      setRowStatusFor(key, { kind: "locked" });
    } else {
      setRowStatusFor(key, { kind: "error", message: result.message });
    }
  }

  function applyPathInput() {
    setQuery((current) => ({ ...current, pathPrefixes: parseTagsOrPaths(pathInput) }));
  }

  function applyTagsInput() {
    setQuery((current) => ({ ...current, tags: parseTagsOrPaths(tagsInput) }));
  }

  function clearFilters() {
    setQuery(DEFAULT_TASK_HUB_QUERY);
    setPathInput("");
    setTagsInput("");
  }

  const filtersActive =
    query.status !== DEFAULT_TASK_HUB_QUERY.status ||
    query.pathPrefixes.length > 0 ||
    query.tags.length > 0 ||
    query.text.trim() !== "";

  // Spec section 6.6 asks for two distinct empty-filtered states, not one:
  // "No open tasks" (with a one-click way to reveal completed ones) at the
  // exact default query, and a generic "No tasks match these filters"
  // (with Clear filters) once the user has actually applied a filter of
  // their own. Without this split, "Clear filters" on a workspace with
  // only completed tasks would reset back to the very default query that
  // produced the empty result in the first place, an unfixable dead end.
  const isDefaultQuery = !filtersActive;

  return (
    <section class="task-hub-panel" aria-label="Task Hub">
      <div class="task-hub-header">
        <h2 class="task-hub-heading">Tasks</h2>
        <span class="task-hub-count">{total}</span>
      </div>

      <div class="task-hub-search">
        <input
          type="text"
          placeholder="Search tasks..."
          aria-label="Search tasks"
          value={query.text}
          onInput={(event) =>
            setQuery((current) => ({ ...current, text: (event.target as HTMLInputElement).value }))
          }
        />
      </div>

      <div class="task-hub-toolbar">
        <div class="task-hub-status-group" role="radiogroup" aria-label="Task status">
          {(["open", "completed", "all"] as TaskHubStatus[]).map((status) => (
            <button
              key={status}
              type="button"
              role="radio"
              aria-checked={query.status === status}
              class={`task-hub-status-button${query.status === status ? " active" : ""}`}
              onClick={() => setQuery((current) => ({ ...current, status }))}
            >
              {status === "open" ? "Open" : status === "completed" ? "Completed" : "All"}
            </button>
          ))}
        </div>

        <button
          type="button"
          class="task-hub-filters-toggle"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((open) => !open)}
        >
          Filters{filtersActive && !filtersOpen ? " •" : ""}
        </button>
      </div>

      {filtersOpen && (
        <div class="task-hub-filter-sheet">
          <label class="task-hub-filter-field">
            <span>Path contains</span>
            <input
              type="text"
              placeholder="folder/subfolder, other-folder"
              value={pathInput}
              onInput={(event) => setPathInput((event.target as HTMLInputElement).value)}
              onBlur={applyPathInput}
              onKeyDown={(event) => {
                if (event.key === "Enter") applyPathInput();
              }}
            />
          </label>
          <label class="task-hub-filter-field">
            <span>Tags (all of)</span>
            <input
              type="text"
              placeholder="project, urgent"
              value={tagsInput}
              onInput={(event) => setTagsInput((event.target as HTMLInputElement).value)}
              onBlur={applyTagsInput}
              onKeyDown={(event) => {
                if (event.key === "Enter") applyTagsInput();
              }}
            />
          </label>
          <label class="task-hub-filter-field">
            <span>Group by</span>
            <select
              value={query.groupBy}
              onChange={(event) =>
                setQuery((current) => ({
                  ...current,
                  groupBy: (event.target as HTMLSelectElement).value as TaskHubGroupBy,
                }))
              }
            >
              <option value="none">None</option>
              <option value="note">Note</option>
              <option value="folder">Folder</option>
            </select>
          </label>
          <label class="task-hub-filter-field">
            <span>Sort by</span>
            <select
              value={query.sortBy}
              onChange={(event) =>
                setQuery((current) => ({
                  ...current,
                  sortBy: (event.target as HTMLSelectElement).value as TaskHubSortBy,
                }))
              }
            >
              <option value="note">Note order</option>
              <option value="text">Task text</option>
            </select>
          </label>
          <button type="button" class="task-hub-clear-filters" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      )}

      {total === 0 ? (
        <p class="empty-hint">No tasks found in this workspace.</p>
      ) : filteredCount === 0 && isDefaultQuery ? (
        <div class="task-hub-empty">
          <p class="empty-hint">No open tasks.</p>
          <button
            type="button"
            class="task-hub-clear-filters"
            onClick={() => setQuery((current) => ({ ...current, status: "all" }))}
          >
            Show completed tasks
          </button>
        </div>
      ) : filteredCount === 0 ? (
        <div class="task-hub-empty">
          <p class="empty-hint">No tasks match these filters.</p>
          <button type="button" class="task-hub-clear-filters" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      ) : (
        <div class="task-hub-groups">
          {groups.map((group) => (
            <div class="task-hub-group" key={group.key || "__ungrouped__"}>
              {group.label && <h3 class="task-hub-group-heading">{group.label}</h3>}
              <ul class="task-hub-list" aria-label={group.label || "Workspace tasks"}>
                {group.entries.map((entry) => {
                  const key = rowKey(entry);
                  const status = rowStatus.get(key) ?? { kind: "idle" as const };
                  const label = entry.task.displayText || "(Empty task)";
                  const stateLabel = entry.task.checked ? "Completed" : "Open";
                  return (
                    <li key={key} class="task-hub-item">
                      <div
                        class="task-hub-row"
                        style={{ paddingLeft: `${entry.task.nestingDepth * 16}px` }}
                      >
                        <input
                          type="checkbox"
                          class="task-hub-checkbox"
                          checked={entry.task.checked}
                          disabled={status.kind === "pending"}
                          aria-label={`${stateLabel} task: ${label}, in ${entry.noteTitle}`}
                          onChange={() => void handleToggle(entry)}
                        />
                        <button class="task-hub-label" onClick={() => void handleSelect(entry)}>
                          <span class="task-hub-text">{label}</span>
                          <span class="task-hub-note">{entry.noteTitle}</span>
                        </button>
                      </div>
                      {status.kind === "stale" && (
                        <p class="task-hub-row-error" role="alert">
                          Task changed. Refresh the Task Hub and try again.
                        </p>
                      )}
                      {status.kind === "locked" && (
                        <p class="task-hub-row-error" role="alert">
                          This note is locked. Unlock it before changing tasks.
                        </p>
                      )}
                      {status.kind === "error" && (
                        <p class="task-hub-row-error" role="alert">
                          Could not save task.{" "}
                          <button
                            type="button"
                            class="task-hub-retry"
                            onClick={() => void handleToggle(entry)}
                          >
                            Retry
                          </button>{" "}
                          <button
                            type="button"
                            class="task-hub-retry"
                            onClick={() => void handleSelect(entry)}
                          >
                            Open note
                          </button>
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
