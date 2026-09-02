/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/preact";

const { readTextFile, writeTextFile } = vi.hoisted(() => ({
  readTextFile: vi.fn<(path: string) => Promise<string>>(),
  writeTextFile: vi.fn<(path: string, content: string) => Promise<void>>(),
}));

// A partial mock, preserving every other real tauriBridge export: this
// panel transitively pulls in settings/store.ts, whose own top-level
// effects call other real tauriBridge exports (setStatusBarAppearance,
// etc.) that must stay real, not become `undefined`, or module import
// itself throws.
vi.mock("../workspace/tauriBridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../workspace/tauriBridge")>();
  return { ...actual, readTextFile, writeTextFile };
});

import { scanTasks, type TaskRecord } from "../markdown/tasks";
import type { OpenTab } from "../workspace/types";

// This panel transitively imports settings/store.ts (via workspace/store.ts
// and its own createSaveCoordinator usage in tests below), whose top-level
// effects read window.matchMedia/document at module load time; jsdom
// provides document but not matchMedia, and it must be stubbed before that
// module chain is ever imported. A static top-level `import` is hoisted
// ahead of any plain statement in this file regardless of source order, so
// every module under test here is loaded dynamically, after the stub is in
// place, the same pattern src/bookmarks/BookmarksPanel.test.tsx already
// uses for the same reason.
window.matchMedia = vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
})) as unknown as typeof window.matchMedia;

const { flattenTasks, TaskHubPanel } = await import("./TaskHubPanel");
const { linkIndex } = await import("../linking/store");
const { outlineRevealRequest } = await import("../outline/outlineNavigation");
const { createSaveCoordinator } = await import("../workspace/saveCoordinator");
const { openTabs } = await import("../workspace/store");
const { workspaceSession } = await import("../settings/store");

function emptyLinkIndex() {
  return {
    backlinksByPath: new Map(),
    pathsByNoteName: new Map(),
    pathsByAlias: new Map(),
    aliasesByPath: new Map(),
    pathsByTag: new Map(),
    tagsByPath: new Map(),
    tasksByPath: new Map(),
  };
}

function setTasksByPath(tasksByPath: Map<string, TaskRecord[]>, tagsByPath?: Map<string, string[]>) {
  linkIndex.value = { ...emptyLinkIndex(), tasksByPath, tagsByPath: tagsByPath ?? new Map() };
}

function openTab(path: string, content: string): OpenTab {
  return { path, name: path.split("/").pop() ?? path, kind: "text", content, dirty: true, saveError: null };
}

beforeEach(() => {
  readTextFile.mockReset();
  writeTextFile.mockReset();
  writeTextFile.mockResolvedValue();
});

afterEach(() => {
  cleanup();
  setTasksByPath(new Map());
  outlineRevealRequest.value = null;
  openTabs.value = [];
  workspaceSession.value = 0;
});

function renderPanel(props: Partial<Parameters<typeof TaskHubPanel>[0]> = {}) {
  const save = props.save ?? createSaveCoordinator();
  return render(<TaskHubPanel onOpenFile={vi.fn()} {...props} save={save} />);
}

describe("TaskHubPanel", () => {
  it("shows a placeholder when the workspace has no tasks", () => {
    const { getByText } = renderPanel();
    expect(getByText("No tasks found in this workspace.")).toBeTruthy();
  });

  it("lists every found task with its checked state and note title", () => {
    setTasksByPath(new Map([["/vault/a.md", scanTasks("- [ ] Open one\n- [x] Done one\n")]]));
    const { getByText, getByLabelText } = renderPanel();
    // Default status filter is Open, so only the open task shows by default.
    expect(getByText("Open one")).toBeTruthy();
    expect(getByLabelText(/^Open task: Open one, in a$/)).toBeTruthy();
    fireEvent.click(getByText("All"));
    expect(getByText("Done one")).toBeTruthy();
    expect(getByLabelText(/^Completed task: Done one, in a$/)).toBeTruthy();
  });

  it("shows the workspace-wide task count in the header regardless of filters", () => {
    setTasksByPath(
      new Map([
        ["/vault/a.md", scanTasks("- [ ] One\n")],
        ["/vault/b.md", scanTasks("- [ ] Two\n- [x] Three\n")],
      ]),
    );
    const { getByText } = renderPanel();
    expect(getByText("3")).toBeTruthy();
  });

  it("reflects a completed task's checkbox as checked and an open task's as unchecked", () => {
    setTasksByPath(new Map([["/vault/a.md", scanTasks("- [ ] Open\n- [x] Done\n")]]));
    const { getByLabelText, getByText } = renderPanel();
    fireEvent.click(getByText("All"));
    const openCheckbox = getByLabelText(/^Open task: Open/) as HTMLInputElement;
    const doneCheckbox = getByLabelText(/^Completed task: Done/) as HTMLInputElement;
    expect(openCheckbox.checked).toBe(false);
    expect(doneCheckbox.checked).toBe(true);
  });

  it("shows a placeholder task label when the task has no text", () => {
    setTasksByPath(new Map([["/vault/a.md", scanTasks("- [ ]\n")]]));
    const { getByText } = renderPanel();
    expect(getByText("(Empty task)")).toBeTruthy();
  });

  it("clicking a task row's label opens its note with the note's title (not the raw file name)", async () => {
    setTasksByPath(new Map([["/vault/sub/My Note.md", scanTasks("- [ ] Do it\n")]]));
    const onOpenFile = vi.fn();
    const { getByText } = renderPanel({ onOpenFile });
    fireEvent.click(getByText("Do it"));
    await Promise.resolve();
    expect(onOpenFile).toHaveBeenCalledWith("/vault/sub/My Note.md", "My Note");
  });

  it("clicking a task row's label requests a reveal of its exact text range and calls onNavigated", async () => {
    const content = "- [ ] Call the dentist\n";
    setTasksByPath(new Map([["/vault/a.md", scanTasks(content)]]));
    const onNavigated = vi.fn();
    const { getByText } = renderPanel({ onNavigated });
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
    const { getByText } = renderPanel({ onOpenFile });
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
    const { getAllByText } = renderPanel();
    const notes = getAllByText(/^(Alpha|Zeta)$/).map((el) => el.textContent);
    expect(notes).toEqual(["Alpha", "Zeta"]);
  });

  it("indents a nested task deeper than its parent", () => {
    setTasksByPath(new Map([["/vault/a.md", scanTasks("- [ ] Parent\n  - [ ] Child\n")]]));
    const { getByText } = renderPanel();
    const parentRow = getByText("Parent").closest(".task-hub-row") as HTMLElement;
    const childRow = getByText("Child").closest(".task-hub-row") as HTMLElement;
    const parentIndent = parseInt(parentRow.style.paddingLeft, 10);
    const childIndent = parseInt(childRow.style.paddingLeft, 10);
    expect(childIndent).toBeGreaterThan(parentIndent);
  });
});

// The status/grouping/filters toolbar itself uses the words "Open" and
// "Completed"; every task fixture below uses a task text that could never
// collide with that toolbar copy (a plain getByText("Open") would
// otherwise also match the Open status button, not just an open task).
describe("TaskHubPanel: status filter", () => {
  it("defaults to Open, hiding completed tasks", () => {
    setTasksByPath(new Map([["/vault/a.md", scanTasks("- [ ] Buy milk\n- [x] Mow lawn\n")]]));
    const { queryByText } = renderPanel();
    expect(queryByText("Buy milk")).toBeTruthy();
    expect(queryByText("Mow lawn")).toBeNull();
  });

  it("Completed shows only completed tasks", () => {
    setTasksByPath(new Map([["/vault/a.md", scanTasks("- [ ] Buy milk\n- [x] Mow lawn\n")]]));
    const { getByRole, queryByText } = renderPanel();
    fireEvent.click(getByRole("radio", { name: "Completed" }));
    expect(queryByText("Buy milk")).toBeNull();
    expect(queryByText("Mow lawn")).toBeTruthy();
  });

  it("shows a distinct 'no open tasks' state, with a shortcut to show completed ones, at the default filter", () => {
    setTasksByPath(new Map([["/vault/a.md", scanTasks("- [x] Mow lawn\n")]]));
    const { getByText, queryByText } = renderPanel();
    expect(getByText("No open tasks.")).toBeTruthy();
    fireEvent.click(getByText("Show completed tasks"));
    expect(queryByText("Mow lawn")).toBeTruthy();
  });

  it("shows a generic no-match state, with Clear filters, when a non-default filter combination matches nothing", () => {
    setTasksByPath(new Map([["/vault/a.md", scanTasks("- [ ] Buy milk\n")]]));
    const { getByLabelText, getByText, queryByText } = renderPanel();
    fireEvent.input(getByLabelText("Search tasks"), { target: { value: "nonexistent" } });
    expect(getByText("No tasks match these filters.")).toBeTruthy();
    fireEvent.click(getByText("Clear filters"));
    expect(queryByText("Buy milk")).toBeTruthy();
  });
});

describe("TaskHubPanel: text filter", () => {
  it("filters by task text, note title, and path, case-insensitively", () => {
    setTasksByPath(
      new Map([
        ["/vault/a.md", scanTasks("- [ ] Call the dentist\n")],
        ["/vault/b.md", scanTasks("- [ ] Buy groceries\n")],
      ]),
    );
    const { getByLabelText, queryByText, getByRole } = renderPanel();
    fireEvent.click(getByRole("radio", { name: "All" }));
    fireEvent.input(getByLabelText("Search tasks"), { target: { value: "DENTIST" } });
    expect(queryByText("Call the dentist")).toBeTruthy();
    expect(queryByText("Buy groceries")).toBeNull();
  });
});

describe("TaskHubPanel: path and tags filters", () => {
  it("filters by a path prefix entered in the filter sheet", () => {
    setTasksByPath(
      new Map([
        ["/vault/projects/a.md", scanTasks("- [ ] In projects\n")],
        ["/vault/journal.md", scanTasks("- [ ] Journal task\n")],
      ]),
    );
    const { getByRole, getByPlaceholderText, queryByText } = renderPanel();
    fireEvent.click(getByRole("radio", { name: "All" }));
    fireEvent.click(getByRole("button", { name: /^Filters/ }));
    const pathInput = getByPlaceholderText("folder/subfolder, other-folder");
    fireEvent.input(pathInput, { target: { value: "/vault/projects" } });
    fireEvent.blur(pathInput);
    expect(queryByText("In projects")).toBeTruthy();
    expect(queryByText("Journal task")).toBeNull();
  });

  it("filters by tags, requiring every listed tag on the note", () => {
    setTasksByPath(
      new Map([
        ["/vault/a.md", scanTasks("- [ ] Has both tags\n")],
        ["/vault/b.md", scanTasks("- [ ] Has one tag\n")],
      ]),
      new Map([
        ["/vault/a.md", ["work", "urgent"]],
        ["/vault/b.md", ["work"]],
      ]),
    );
    const { getByRole, getByPlaceholderText, queryByText } = renderPanel();
    fireEvent.click(getByRole("radio", { name: "All" }));
    fireEvent.click(getByRole("button", { name: /^Filters/ }));
    const tagsInput = getByPlaceholderText("project, urgent");
    fireEvent.input(tagsInput, { target: { value: "work, urgent" } });
    fireEvent.blur(tagsInput);
    expect(queryByText("Has both tags")).toBeTruthy();
    expect(queryByText("Has one tag")).toBeNull();
  });
});

describe("TaskHubPanel: grouping", () => {
  it("groups by note, with each note's own heading", () => {
    setTasksByPath(
      new Map([
        ["/vault/a.md", scanTasks("- [ ] A task\n")],
        ["/vault/b.md", scanTasks("- [ ] B task\n")],
      ]),
    );
    const { container, getByRole, getByLabelText } = renderPanel();
    fireEvent.click(getByRole("radio", { name: "All" }));
    fireEvent.click(getByRole("button", { name: /^Filters/ }));
    fireEvent.change(getByLabelText("Group by"), { target: { value: "note" } });
    const headings = Array.from(container.querySelectorAll(".task-hub-group-heading")).map(
      (el) => el.textContent,
    );
    expect(headings).toEqual(["a", "b"]);
  });

  it("groups by folder", () => {
    setTasksByPath(
      new Map([
        ["/vault/projects/a.md", scanTasks("- [ ] A1\n")],
        ["/vault/projects/b.md", scanTasks("- [ ] B1\n")],
        ["/vault/journal.md", scanTasks("- [ ] J1\n")],
      ]),
    );
    const { getByRole, getByLabelText, getByText } = renderPanel();
    fireEvent.click(getByRole("radio", { name: "All" }));
    fireEvent.click(getByRole("button", { name: /^Filters/ }));
    fireEvent.change(getByLabelText("Group by"), { target: { value: "folder" } });
    expect(getByText("/vault/projects")).toBeTruthy();
    expect(getByText("/vault")).toBeTruthy();
  });
});

describe("TaskHubPanel: toggle completion", () => {
  it("toggling a closed note's task calls the platform bridge and, once saved, removes it from the default Open filter", async () => {
    const content = "- [ ] Call the dentist\n";
    setTasksByPath(new Map([["/vault/a.md", scanTasks(content)]]));
    readTextFile.mockResolvedValue(content);
    const { getByLabelText, queryByText, getByText } = renderPanel();
    fireEvent.click(getByLabelText(/^Open task: Call the dentist/));

    await waitFor(() => expect(writeTextFile).toHaveBeenCalledWith("/vault/a.md", "- [x] Call the dentist\n"));
    // The write flipped it to completed; the default Open filter re-evaluates
    // against the freshly indexed state and the row leaves the visible list
    // (the same effect a completed-from-Open row has anywhere else in the
    // spec, see section 11's focus-policy requirement this phase doesn't
    // itself implement, only the filter re-evaluation it depends on).
    await waitFor(() => expect(queryByText("Call the dentist")).toBeNull());

    fireEvent.click(getByText("All"));
    expect(getByLabelText(/^Completed task: Call the dentist/)).toBeTruthy();
  });

  it("disables the row's own checkbox while a toggle is pending, then re-enables it once saved", async () => {
    const content = "- [ ] Task\n";
    setTasksByPath(new Map([["/vault/a.md", scanTasks(content)]]));
    let resolveRead: (value: string) => void = () => {};
    readTextFile.mockReturnValue(new Promise((resolve) => (resolveRead = resolve)));
    const { getByRole, getByLabelText } = renderPanel();
    // Stay on the All filter so the row (about to become completed) is
    // still on screen to observe re-enabling, rather than leaving the
    // default Open filter, which would correctly remove it instead.
    fireEvent.click(getByRole("radio", { name: "All" }));
    const checkbox = getByLabelText(/^Open task: Task/) as HTMLInputElement;
    fireEvent.click(checkbox);
    await Promise.resolve();
    expect(checkbox.disabled).toBe(true);

    resolveRead(content);
    await waitFor(() => expect(checkbox.disabled).toBe(false));
    expect(checkbox.checked).toBe(true);
  });

  it("shows a stale-conflict message and does not write when the note changed underneath the row", async () => {
    const content = "- [ ] Call the dentist\n";
    setTasksByPath(new Map([["/vault/a.md", scanTasks(content)]]));
    readTextFile.mockResolvedValue("- [ ] Call the dentist urgently\n");
    const { getByLabelText, getByText } = renderPanel();
    fireEvent.click(getByLabelText(/^Open task: Call the dentist/));

    await waitFor(() => expect(getByText("Task changed. Refresh the Task Hub and try again.")).toBeTruthy());
    expect(writeTextFile).not.toHaveBeenCalled();
  });

  it("shows a save error with Retry and Open note actions when the write fails", async () => {
    const content = "- [ ] Task\n";
    setTasksByPath(new Map([["/vault/a.md", scanTasks(content)]]));
    readTextFile.mockResolvedValue(content);
    writeTextFile.mockRejectedValue(new Error("disk full"));
    const { getByLabelText, getByText } = renderPanel();
    fireEvent.click(getByLabelText(/^Open task: Task/));

    await waitFor(() => expect(getByText("Could not save task.")).toBeTruthy());
    expect(getByText("Retry")).toBeTruthy();
    expect(getByText("Open note")).toBeTruthy();
  });

  it("toggles an open (dirty) tab's in-memory content rather than reading the file", async () => {
    const content = "- [ ] Task\n";
    setTasksByPath(new Map([["/vault/a.md", scanTasks(content)]]));
    openTabs.value = [openTab("/vault/a.md", content)];
    const { getByLabelText } = renderPanel();
    fireEvent.click(getByLabelText(/^Open task: Task/));

    await waitFor(() => expect(writeTextFile).toHaveBeenCalledWith("/vault/a.md", "- [x] Task\n"));
    expect(readTextFile).not.toHaveBeenCalled();
    expect(openTabs.value[0].content).toBe("- [x] Task\n");
  });

  it("ignores a second activation of the same row while its toggle is still pending", async () => {
    const content = "- [ ] Task\n";
    setTasksByPath(new Map([["/vault/a.md", scanTasks(content)]]));
    let resolveRead: (value: string) => void = () => {};
    readTextFile.mockReturnValue(new Promise((resolve) => (resolveRead = resolve)));
    const { getByLabelText } = renderPanel();
    const checkbox = getByLabelText(/^Open task: Task/) as HTMLInputElement;
    fireEvent.click(checkbox);
    fireEvent.click(checkbox);
    await Promise.resolve();
    expect(readTextFile).toHaveBeenCalledTimes(1);

    resolveRead(content);
    await waitFor(() => expect(writeTextFile).toHaveBeenCalledTimes(1));
  });
});

describe("flattenTasks (re-exported from taskQuery)", () => {
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
