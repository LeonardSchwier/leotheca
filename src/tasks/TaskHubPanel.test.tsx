/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { flattenTasks, TaskHubPanel } from "./TaskHubPanel";
import { linkIndex } from "../linking/store";
import { outlineRevealRequest } from "../outline/outlineNavigation";
import { scanTasks, type TaskRecord } from "../markdown/tasks";

function setTasksByPath(tasksByPath: Map<string, TaskRecord[]>) {
  linkIndex.value = {
    backlinksByPath: new Map(),
    pathsByNoteName: new Map(),
    pathsByAlias: new Map(),
    aliasesByPath: new Map(),
    pathsByTag: new Map(),
    tagsByPath: new Map(),
    tasksByPath,
  };
}

afterEach(() => {
  cleanup();
  setTasksByPath(new Map());
  outlineRevealRequest.value = null;
});

describe("TaskHubPanel", () => {
  it("shows a placeholder when the workspace has no tasks", () => {
    const { getByText } = render(<TaskHubPanel onOpenFile={vi.fn()} />);
    expect(getByText("No tasks found in this workspace.")).toBeTruthy();
  });

  it("lists every found task with its checked state and note title", () => {
    setTasksByPath(
      new Map([
        ["/vault/a.md", scanTasks("- [ ] Open one\n- [x] Done one\n")],
      ]),
    );
    const { getByText, getByLabelText } = render(<TaskHubPanel onOpenFile={vi.fn()} />);
    expect(getByText("Open one")).toBeTruthy();
    expect(getByText("Done one")).toBeTruthy();
    expect(getByLabelText(/^Open task: Open one, in a$/)).toBeTruthy();
    expect(getByLabelText(/^Completed task: Done one, in a$/)).toBeTruthy();
    // Note title shown twice, once per task row from the same note.
    expect(document.querySelectorAll(".task-hub-note")).toHaveLength(2);
  });

  it("shows the total task count in the header", () => {
    setTasksByPath(
      new Map([
        ["/vault/a.md", scanTasks("- [ ] One\n")],
        ["/vault/b.md", scanTasks("- [ ] Two\n- [ ] Three\n")],
      ]),
    );
    const { getByText } = render(<TaskHubPanel onOpenFile={vi.fn()} />);
    expect(getByText("3")).toBeTruthy();
  });

  it("reflects a completed task's checkbox as checked and an open task's as unchecked", () => {
    setTasksByPath(new Map([["/vault/a.md", scanTasks("- [ ] Open\n- [x] Done\n")]]));
    const { getByLabelText } = render(<TaskHubPanel onOpenFile={vi.fn()} />);
    const openCheckbox = getByLabelText(/^Open task: Open/) as HTMLInputElement;
    const doneCheckbox = getByLabelText(/^Completed task: Done/) as HTMLInputElement;
    expect(openCheckbox.checked).toBe(false);
    expect(doneCheckbox.checked).toBe(true);
  });

  it("renders every task checkbox as disabled, since this phase is read-only", () => {
    setTasksByPath(new Map([["/vault/a.md", scanTasks("- [ ] Open\n")]]));
    const { getByLabelText } = render(<TaskHubPanel onOpenFile={vi.fn()} />);
    const checkbox = getByLabelText(/^Open task: Open/) as HTMLInputElement;
    expect(checkbox.disabled).toBe(true);
  });

  it("shows a placeholder task label when the task has no text", () => {
    setTasksByPath(new Map([["/vault/a.md", scanTasks("- [ ]\n")]]));
    const { getByText } = render(<TaskHubPanel onOpenFile={vi.fn()} />);
    expect(getByText("(Empty task)")).toBeTruthy();
  });

  it("clicking a task row opens its note with the note's title (not the raw file name)", async () => {
    setTasksByPath(new Map([["/vault/sub/My Note.md", scanTasks("- [ ] Do it\n")]]));
    const onOpenFile = vi.fn();
    const { getByText } = render(<TaskHubPanel onOpenFile={onOpenFile} />);
    fireEvent.click(getByText("Do it"));
    await Promise.resolve();
    expect(onOpenFile).toHaveBeenCalledWith("/vault/sub/My Note.md", "My Note");
  });

  it("clicking a task row requests a reveal of its exact text range and calls onNavigated", async () => {
    const content = "- [ ] Call the dentist\n";
    setTasksByPath(new Map([["/vault/a.md", scanTasks(content)]]));
    const onNavigated = vi.fn();
    const { getByText } = render(
      <TaskHubPanel onOpenFile={vi.fn()} onNavigated={onNavigated} />,
    );
    fireEvent.click(getByText("Call the dentist"));
    await Promise.resolve();

    const expected = scanTasks(content)[0];
    expect(outlineRevealRequest.value).not.toBeNull();
    expect(outlineRevealRequest.value?.from).toBe(expected.textFrom);
    expect(outlineRevealRequest.value?.to).toBe(expected.textTo);
    expect(onNavigated).toHaveBeenCalledTimes(1);
  });

  it("waits for an async onOpenFile to resolve before requesting the reveal", async () => {
    setTasksByPath(new Map([["/vault/a.md", scanTasks("- [ ] Task\n")]]));
    let resolveOpen: () => void = () => {};
    const onOpenFile = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveOpen = resolve;
        }),
    );
    const { getByText } = render(<TaskHubPanel onOpenFile={onOpenFile} />);
    fireEvent.click(getByText("Task"));

    await Promise.resolve();
    expect(outlineRevealRequest.value).toBeNull();

    resolveOpen();
    await Promise.resolve();
    await Promise.resolve();
    expect(outlineRevealRequest.value).not.toBeNull();
  });

  it("lists tasks from multiple notes in a stable, path-sorted order", () => {
    setTasksByPath(
      new Map([
        ["/vault/Zeta.md", scanTasks("- [ ] Zeta task\n")],
        ["/vault/Alpha.md", scanTasks("- [ ] Alpha task\n")],
      ]),
    );
    const { getAllByText } = render(<TaskHubPanel onOpenFile={vi.fn()} />);
    const notes = getAllByText(/^(Alpha|Zeta)$/).map((el) => el.textContent);
    expect(notes).toEqual(["Alpha", "Zeta"]);
  });

  it("indents a nested task deeper than its parent", () => {
    setTasksByPath(
      new Map([["/vault/a.md", scanTasks("- [ ] Parent\n  - [ ] Child\n")]]),
    );
    const { getByText } = render(<TaskHubPanel onOpenFile={vi.fn()} />);
    const parentRow = getByText("Parent").closest(".task-hub-row") as HTMLElement;
    const childRow = getByText("Child").closest(".task-hub-row") as HTMLElement;
    const parentIndent = parseInt(parentRow.style.paddingLeft, 10);
    const childIndent = parseInt(childRow.style.paddingLeft, 10);
    expect(childIndent).toBeGreaterThan(parentIndent);
  });
});

describe("flattenTasks", () => {
  it("returns an empty array for an empty index", () => {
    expect(flattenTasks(new Map())).toEqual([]);
  });

  it("orders entries by sorted path, then by each note's own source order", () => {
    const entries = flattenTasks(
      new Map([
        ["/vault/b.md", scanTasks("- [ ] B1\n- [ ] B2\n")],
        ["/vault/a.md", scanTasks("- [ ] A1\n")],
      ]),
    );
    expect(entries.map((e) => [e.path, e.task.text])).toEqual([
      ["/vault/a.md", "A1"],
      ["/vault/b.md", "B1"],
      ["/vault/b.md", "B2"],
    ]);
  });

  it("derives a note title from the file name without its extension", () => {
    const entries = flattenTasks(new Map([["/vault/sub/My Note.md", scanTasks("- [ ] X\n")]]));
    expect(entries[0].noteTitle).toBe("My Note");
  });
});
