import { linkIndex, fileNameFromPath } from "../linking/store";
import { requestOutlineReveal } from "../outline/outlineNavigation";
import type { TaskRecord } from "../markdown/tasks";
import "./tasks.css";

interface TaskHubPanelProps {
  onOpenFile: (path: string, name: string) => void | Promise<void>;
  /** Called right after a task row is selected and a reveal has been
   * requested, mirroring OutlinePanel's own prop of the same name: a host
   * that needs to make the editor visible (e.g. switching out of a
   * preview-only view mode) can do so here. */
  onNavigated?: () => void;
}

interface TaskEntry {
  path: string;
  noteTitle: string;
  task: TaskRecord;
}

function noteTitleFromPath(path: string): string {
  return fileNameFromPath(path).replace(/\.md$/i, "");
}

/** Every indexed task across the workspace, in a stable, deterministic
 * order: grouped by note path (sorted, so the list doesn't reshuffle
 * between renders as Map insertion order shifts), then in each note's own
 * source order. Exported for testing. Deliberately not grouped or sorted
 * any other way in this Phase 1 slice: filtering, grouping, and sort
 * controls are F02 Phase 2 scope (spec section 6.3), not this one. */
export function flattenTasks(tasksByPath: Map<string, TaskRecord[]>): TaskEntry[] {
  const entries: TaskEntry[] = [];
  for (const path of Array.from(tasksByPath.keys()).sort()) {
    const noteTitle = noteTitleFromPath(path);
    for (const task of tasksByPath.get(path) ?? []) {
      entries.push({ path, noteTitle, task });
    }
  }
  return entries;
}

/**
 * F02 Phase 1 (spec/f02-workspace-task-hub.md, narrowed to a first slice
 * per the roadmap entry's own scope note): a read-only sidebar panel
 * listing every GitHub-Flavored-Markdown task-list item found across the
 * workspace, a projection of the shared workspace metadata index
 * (linkIndex.value.tasksByPath, populated by linking/store.ts's
 * rebuildLinkIndex using markdown/tasks.ts's scanTasks in the same note
 * read already used for wikilinks/aliases/tags), not a second task
 * database. Selecting a row opens its note and reveals the task's exact
 * source location, reusing the same MarkdownEditor `reveal` prop
 * mechanism OutlinePanel already uses (outline/outlineNavigation.ts),
 * rather than inventing a second navigation mechanism.
 *
 * Explicitly deferred to F02 Phase 2: toggling a checkbox from this panel
 * (the checkbox here is a read-only, disabled visual indicator of the
 * marker already in the note, not an editable control), filtering,
 * grouping, and sorting. Follows TagsPanel's structural conventions
 * (a plain list, click-to-open rows, an empty-state hint) since both
 * panels aggregate something across the whole workspace and navigate to
 * a note from it.
 */
export function TaskHubPanel({ onOpenFile, onNavigated }: TaskHubPanelProps) {
  const entries = flattenTasks(linkIndex.value.tasksByPath);

  async function handleSelect(entry: TaskEntry) {
    await onOpenFile(entry.path, entry.noteTitle);
    requestOutlineReveal(entry.task.textFrom, entry.task.textTo);
    onNavigated?.();
  }

  return (
    <section class="task-hub-panel" aria-label="Task Hub">
      <div class="task-hub-header">
        <h2 class="task-hub-heading">Tasks</h2>
        <span class="task-hub-count">{entries.length}</span>
      </div>
      {entries.length === 0 ? (
        <p class="empty-hint">No tasks found in this workspace.</p>
      ) : (
        <ul class="task-hub-list" aria-label="Workspace tasks">
          {entries.map((entry, index) => {
            const label = entry.task.displayText || "(Empty task)";
            const stateLabel = entry.task.checked ? "Completed" : "Open";
            return (
              <li key={`${entry.path}:${entry.task.sourceFrom}:${index}`} class="task-hub-item">
                <div
                  class="task-hub-row"
                  style={{ paddingLeft: `${entry.task.nestingDepth * 16}px` }}
                >
                  <input
                    type="checkbox"
                    class="task-hub-checkbox"
                    checked={entry.task.checked}
                    disabled
                    aria-label={`${stateLabel} task: ${label}, in ${entry.noteTitle}`}
                  />
                  <button class="task-hub-label" onClick={() => void handleSelect(entry)}>
                    <span class="task-hub-text">{label}</span>
                    <span class="task-hub-note">{entry.noteTitle}</span>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
