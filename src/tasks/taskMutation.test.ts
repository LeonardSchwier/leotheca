/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { readTextFile, writeTextFile } = vi.hoisted(() => ({
  readTextFile: vi.fn<(path: string) => Promise<string>>(),
  writeTextFile: vi.fn<(path: string, content: string) => Promise<void>>(),
}));

// A partial mock: taskMutation.ts only needs readTextFile/writeTextFile
// overridden, but this module transitively pulls in settings/store.ts,
// whose own top-level effects call other real tauriBridge exports
// (setStatusBarAppearance, etc.) that must stay real, not become
// `undefined`, or module import itself throws. The save coordinator's
// capability-aware writer is mapped to the same spy because this suite
// tests task mutation ordering, while tauriBridge.test.ts owns containment.
vi.mock("../workspace/tauriBridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../workspace/tauriBridge")>();
  return {
    ...actual,
    readTextFile,
    writeTextFile,
    writeActiveWorkspaceTextFile: writeTextFile,
  };
});

// taskMutation.ts imports settings/store.ts (for workspaceSession), whose
// own top-level effects read window.matchMedia/document at module load
// time; jsdom provides document but not matchMedia, and it must be stubbed
// before that module chain is ever imported. A static top-level `import`
// is hoisted ahead of any plain statement in this file regardless of
// source order, so the module under test is loaded dynamically, after the
// stub is in place, the same pattern src/bookmarks/store.test.ts already
// uses for the same reason.
window.matchMedia = vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
})) as unknown as typeof window.matchMedia;

const { toggleTaskCompletion } = await import("./taskMutation");
const { createSaveCoordinator } = await import("../workspace/saveCoordinator");
const { closeAllTabs, openOrFocusTab, openTabs, updateTabContent } = await import("../workspace/store");
const { linkIndex } = await import("../linking/store");
const { workspaceSession } = await import("../settings/store");
const { scanTasks } = await import("../markdown/tasks");

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

function openDocument(path: string, content: string) {
  openOrFocusTab(path, path.split("/").pop() ?? path, content, "text");
  updateTabContent(path, content);
}

beforeEach(() => {
  readTextFile.mockReset();
  writeTextFile.mockReset();
  writeTextFile.mockResolvedValue();
  closeAllTabs();
  linkIndex.value = emptyLinkIndex();
  workspaceSession.value = 0;
});

afterEach(() => {
  closeAllTabs();
  linkIndex.value = emptyLinkIndex();
  workspaceSession.value = 0;
});

describe("toggleTaskCompletion: open (in-tab) note", () => {
  it("flips the marker in the tab content, leaving the rest of the file byte-identical, and calls the save coordinator", async () => {
    const content = "Intro text\n- [ ] Call the dentist\nTrailing text\n";
    openDocument("/vault/a.md", content);
    const save = createSaveCoordinator();
    const task = scanTasks(content)[0];

    const result = await toggleTaskCompletion("/vault/a.md", task, { save });

    expect(result).toEqual({ status: "ok" });
    const expected = "Intro text\n- [x] Call the dentist\nTrailing text\n";
    expect(openTabs.value[0].content).toBe(expected);
    expect(writeTextFile).toHaveBeenCalledWith("/vault/a.md", expected);
    // Only the one marker character actually differs from the original.
    const diffIndices = [...content].reduce<number[]>((acc, ch, i) => {
      if (ch !== expected[i]) acc.push(i);
      return acc;
    }, []);
    expect(diffIndices).toEqual([task.markerFrom]);
  });

  it("writes lowercase x when completing, and a plain space (never preserving case) when reopening", async () => {
    const openContent = "- [ ] Task\n";
    openDocument("/vault/a.md", openContent);
    const save = createSaveCoordinator();
    await toggleTaskCompletion("/vault/a.md", scanTasks(openContent)[0], { save });
    expect(openTabs.value[0].content).toBe("- [x] Task\n");

    const doneContent = "- [X] Task\n";
    closeAllTabs();
    openDocument("/vault/a.md", doneContent);
    await toggleTaskCompletion("/vault/a.md", scanTasks(doneContent)[0], { save });
    expect(openTabs.value[0].content).toBe("- [ ] Task\n");
  });

  it("incrementally replaces only this note's tasks in the shared index on success", async () => {
    const content = "- [ ] One\n- [ ] Two\n";
    openDocument("/vault/a.md", content);
    linkIndex.value = { ...emptyLinkIndex(), tasksByPath: new Map([["/vault/a.md", scanTasks(content)]]) };
    const save = createSaveCoordinator();

    await toggleTaskCompletion("/vault/a.md", scanTasks(content)[0], { save });

    const updated = linkIndex.value.tasksByPath.get("/vault/a.md");
    expect(updated?.map((t) => t.checked)).toEqual([true, false]);
  });

  it("fails closed when the note's in-memory content no longer contains the recorded task", async () => {
    const original = "- [ ] Call the dentist\n";
    const task = scanTasks(original)[0];
    // The note changed underneath the Task Hub's last render (task text edited).
    openDocument("/vault/a.md", "- [ ] Call the vet instead\n");
    const save = createSaveCoordinator();

    const result = await toggleTaskCompletion("/vault/a.md", task, { save });

    expect(result).toEqual({ status: "stale" });
    expect(writeTextFile).not.toHaveBeenCalled();
    expect(openTabs.value[0].content).toBe("- [ ] Call the vet instead\n");
  });

  it("reports a save error without touching the index when the write fails", async () => {
    const content = "- [ ] Task\n";
    openDocument("/vault/a.md", content);
    linkIndex.value = { ...emptyLinkIndex(), tasksByPath: new Map([["/vault/a.md", scanTasks(content)]]) };
    writeTextFile.mockRejectedValue(new Error("disk full"));
    const save = createSaveCoordinator();

    const result = await toggleTaskCompletion("/vault/a.md", scanTasks(content)[0], { save });

    expect(result).toEqual({ status: "error", message: "disk full" });
    // The index still reflects the old (unsaved) state, not the failed edit.
    expect(linkIndex.value.tasksByPath.get("/vault/a.md")?.[0].checked).toBe(false);
  });

  it("fails closed and skips the index update when the workspace session changes mid-write", async () => {
    const content = "- [ ] Task\n";
    openDocument("/vault/a.md", content);
    linkIndex.value = { ...emptyLinkIndex(), tasksByPath: new Map([["/vault/a.md", scanTasks(content)]]) };
    writeTextFile.mockImplementation(async () => {
      workspaceSession.value = 1;
    });
    const save = createSaveCoordinator();

    const result = await toggleTaskCompletion("/vault/a.md", scanTasks(content)[0], { save });

    expect(result).toEqual({ status: "stale" });
    expect(linkIndex.value.tasksByPath.get("/vault/a.md")?.[0].checked).toBe(false);
  });
});

describe("toggleTaskCompletion: closed note", () => {
  it("reads the file, flips only the marker, and writes the result back", async () => {
    const content = "- [ ] Call the dentist\n";
    readTextFile.mockResolvedValue(content);
    const save = createSaveCoordinator();

    const result = await toggleTaskCompletion("/vault/a.md", scanTasks(content)[0], { save });

    expect(result).toEqual({ status: "ok" });
    expect(readTextFile).toHaveBeenCalledWith("/vault/a.md");
    expect(writeTextFile).toHaveBeenCalledWith("/vault/a.md", "- [x] Call the dentist\n");
  });

  it("fails closed with no write when the file changed on disk since the task was indexed", async () => {
    const original = "- [ ] Call the dentist\n";
    const task = scanTasks(original)[0];
    // The note changed on disk (a different tool, or an external edit)
    // between the Task Hub's last index read and this toggle.
    readTextFile.mockResolvedValue("- [ ] Call the dentist urgently\n");
    const save = createSaveCoordinator();

    const result = await toggleTaskCompletion("/vault/a.md", task, { save });

    expect(result).toEqual({ status: "stale" });
    expect(writeTextFile).not.toHaveBeenCalled();
  });

  it("reports a read error", async () => {
    readTextFile.mockRejectedValue(new Error("permission denied"));
    const save = createSaveCoordinator();

    const result = await toggleTaskCompletion(
      "/vault/a.md",
      scanTasks("- [ ] Task\n")[0],
      { save },
    );

    expect(result).toEqual({ status: "error", message: "permission denied" });
    expect(writeTextFile).not.toHaveBeenCalled();
  });

  it("reports a write error", async () => {
    readTextFile.mockResolvedValue("- [ ] Task\n");
    writeTextFile.mockRejectedValue(new Error("disk full"));
    const save = createSaveCoordinator();

    const result = await toggleTaskCompletion(
      "/vault/a.md",
      scanTasks("- [ ] Task\n")[0],
      { save },
    );

    expect(result).toEqual({ status: "error", message: "disk full" });
  });

  it("serializes two rapid toggles of different tasks in the same closed note", async () => {
    const initial = "- [ ] One\n- [ ] Two\n";
    let disk = initial;
    readTextFile.mockImplementation(async () => disk);
    writeTextFile.mockImplementation(async (_path: string, content: string) => {
      disk = content;
    });
    const save = createSaveCoordinator();
    const [taskOne, taskTwo] = scanTasks(initial);

    const [resultOne, resultTwo] = await Promise.all([
      toggleTaskCompletion("/vault/a.md", taskOne, { save }),
      toggleTaskCompletion("/vault/a.md", taskTwo, { save }),
    ]);

    expect(resultOne).toEqual({ status: "ok" });
    expect(resultTwo).toEqual({ status: "ok" });
    expect(disk).toBe("- [x] One\n- [x] Two\n");
  });

  it("fails closed when the workspace session changes before the write is issued", async () => {
    readTextFile.mockImplementation(async () => {
      workspaceSession.value = 1;
      return "- [ ] Task\n";
    });
    const save = createSaveCoordinator();

    const result = await toggleTaskCompletion(
      "/vault/a.md",
      scanTasks("- [ ] Task\n")[0],
      { save },
    );

    expect(result).toEqual({ status: "stale" });
    expect(writeTextFile).not.toHaveBeenCalled();
  });
});
