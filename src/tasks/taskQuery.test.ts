import { describe, expect, it } from "vitest";
import { scanTasks } from "../markdown/tasks";
import {
  DEFAULT_TASK_HUB_QUERY,
  flattenTasks,
  groupTaskEntries,
  matchesTaskQuery,
  queryTasks,
  sortTaskEntries,
  totalTaskCount,
  type TaskHubQuery,
} from "./taskQuery";

function tasksByPathOf(entries: Array<[string, string]>): Map<string, ReturnType<typeof scanTasks>> {
  return new Map(entries.map(([path, content]) => [path, scanTasks(content)]));
}

describe("flattenTasks", () => {
  it("returns an empty array for an empty index", () => {
    expect(flattenTasks(new Map())).toEqual([]);
  });

  it("orders entries by sorted path, then by each note's own source order", () => {
    const entries = flattenTasks(
      tasksByPathOf([
        ["/vault/b.md", "- [ ] B1\n- [ ] B2\n"],
        ["/vault/a.md", "- [ ] A1\n"],
      ]),
    );
    expect(entries.map((e) => [e.path, e.task.text])).toEqual([
      ["/vault/a.md", "A1"],
      ["/vault/b.md", "B1"],
      ["/vault/b.md", "B2"],
    ]);
  });

  it("derives a note title from the file name without its extension", () => {
    const entries = flattenTasks(tasksByPathOf([["/vault/sub/My Note.md", "- [ ] X\n"]]));
    expect(entries[0].noteTitle).toBe("My Note");
  });
});

describe("totalTaskCount", () => {
  it("counts every task across every note", () => {
    const tasksByPath = tasksByPathOf([
      ["/vault/a.md", "- [ ] One\n"],
      ["/vault/b.md", "- [ ] Two\n- [x] Three\n"],
    ]);
    expect(totalTaskCount(tasksByPath)).toBe(3);
  });

  it("returns 0 for an empty index", () => {
    expect(totalTaskCount(new Map())).toBe(0);
  });
});

describe("matchesTaskQuery: status", () => {
  const tasksByPath = tasksByPathOf([["/vault/a.md", "- [ ] Open\n- [x] Done\n"]]);
  const [openEntry, doneEntry] = flattenTasks(tasksByPath);

  it("defaults to open only", () => {
    expect(matchesTaskQuery(openEntry, DEFAULT_TASK_HUB_QUERY, new Map())).toBe(true);
    expect(matchesTaskQuery(doneEntry, DEFAULT_TASK_HUB_QUERY, new Map())).toBe(false);
  });

  it("completed shows only checked tasks", () => {
    const query: TaskHubQuery = { ...DEFAULT_TASK_HUB_QUERY, status: "completed" };
    expect(matchesTaskQuery(openEntry, query, new Map())).toBe(false);
    expect(matchesTaskQuery(doneEntry, query, new Map())).toBe(true);
  });

  it("all shows both", () => {
    const query: TaskHubQuery = { ...DEFAULT_TASK_HUB_QUERY, status: "all" };
    expect(matchesTaskQuery(openEntry, query, new Map())).toBe(true);
    expect(matchesTaskQuery(doneEntry, query, new Map())).toBe(true);
  });
});

describe("matchesTaskQuery: path prefixes", () => {
  const tasksByPath = tasksByPathOf([
    ["/vault/projects/a.md", "- [ ] In projects\n"],
    ["/vault/projects-archive/b.md", "- [ ] In archive\n"],
    ["/vault/journal.md", "- [ ] Journal task\n"],
  ]);
  const entries = flattenTasks(tasksByPath);

  it("matches a note under the given prefix, not a note that merely starts with the same text", () => {
    const query: TaskHubQuery = { ...DEFAULT_TASK_HUB_QUERY, status: "all", pathPrefixes: ["/vault/projects"] };
    const matched = entries.filter((e) => matchesTaskQuery(e, query, new Map()));
    expect(matched.map((e) => e.path)).toEqual(["/vault/projects/a.md"]);
  });

  it("matches any of several prefixes", () => {
    const query: TaskHubQuery = {
      ...DEFAULT_TASK_HUB_QUERY,
      status: "all",
      pathPrefixes: ["/vault/projects", "/vault/journal.md"],
    };
    const matched = entries.filter((e) => matchesTaskQuery(e, query, new Map()));
    expect(matched.map((e) => e.path).sort()).toEqual(["/vault/journal.md", "/vault/projects/a.md"]);
  });

  it("empty prefixes means no restriction", () => {
    const query: TaskHubQuery = { ...DEFAULT_TASK_HUB_QUERY, status: "all" };
    expect(entries.every((e) => matchesTaskQuery(e, query, new Map()))).toBe(true);
  });
});

describe("matchesTaskQuery: tags (AND across the selected set)", () => {
  const tasksByPath = tasksByPathOf([
    ["/vault/a.md", "- [ ] Has both\n"],
    ["/vault/b.md", "- [ ] Has one\n"],
    ["/vault/c.md", "- [ ] Has none\n"],
  ]);
  const tagsByPath = new Map([
    ["/vault/a.md", ["work", "urgent"]],
    ["/vault/b.md", ["work"]],
  ]);
  const entries = flattenTasks(tasksByPath);

  it("requires every listed tag on the note", () => {
    const query: TaskHubQuery = { ...DEFAULT_TASK_HUB_QUERY, status: "all", tags: ["work", "urgent"] };
    const matched = entries.filter((e) => matchesTaskQuery(e, query, tagsByPath));
    expect(matched.map((e) => e.path)).toEqual(["/vault/a.md"]);
  });

  it("is case-insensitive", () => {
    const query: TaskHubQuery = { ...DEFAULT_TASK_HUB_QUERY, status: "all", tags: ["WORK"] };
    const matched = entries.filter((e) => matchesTaskQuery(e, query, tagsByPath));
    expect(matched.map((e) => e.path).sort()).toEqual(["/vault/a.md", "/vault/b.md"]);
  });
});

describe("matchesTaskQuery: text", () => {
  const tasksByPath = tasksByPathOf([["/vault/sub/Meeting Notes.md", "- [ ] Call the dentist\n"]]);
  const entries = flattenTasks(tasksByPath);

  it("matches task text case-insensitively", () => {
    const query: TaskHubQuery = { ...DEFAULT_TASK_HUB_QUERY, status: "all", text: "DENTIST" };
    expect(matchesTaskQuery(entries[0], query, new Map())).toBe(true);
  });

  it("matches note title", () => {
    const query: TaskHubQuery = { ...DEFAULT_TASK_HUB_QUERY, status: "all", text: "meeting" };
    expect(matchesTaskQuery(entries[0], query, new Map())).toBe(true);
  });

  it("matches path", () => {
    const query: TaskHubQuery = { ...DEFAULT_TASK_HUB_QUERY, status: "all", text: "/sub/" };
    expect(matchesTaskQuery(entries[0], query, new Map())).toBe(true);
  });

  it("excludes a non-matching term", () => {
    const query: TaskHubQuery = { ...DEFAULT_TASK_HUB_QUERY, status: "all", text: "grocery" };
    expect(matchesTaskQuery(entries[0], query, new Map())).toBe(false);
  });
});

describe("sortTaskEntries", () => {
  const tasksByPath = tasksByPathOf([
    ["/vault/b.md", "- [ ] Zebra task\n"],
    ["/vault/a.md", "- [ ] Apple task\n"],
  ]);
  const entries = flattenTasks(tasksByPath);

  it("note order is a no-op (already path + source order)", () => {
    expect(sortTaskEntries(entries, "note")).toBe(entries);
  });

  it("text order sorts case-insensitively by task text", () => {
    const sorted = sortTaskEntries(entries, "text");
    expect(sorted.map((e) => e.task.text)).toEqual(["Apple task", "Zebra task"]);
  });

  it("text order breaks ties by path and source order", () => {
    const tied = flattenTasks(
      tasksByPathOf([
        ["/vault/b.md", "- [ ] Same\n"],
        ["/vault/a.md", "- [ ] Same\n"],
      ]),
    );
    const sorted = sortTaskEntries(tied, "text");
    expect(sorted.map((e) => e.path)).toEqual(["/vault/a.md", "/vault/b.md"]);
  });
});

describe("groupTaskEntries", () => {
  const tasksByPath = tasksByPathOf([
    ["/vault/projects/a.md", "- [ ] A1\n- [ ] A2\n"],
    ["/vault/journal.md", "- [ ] J1\n"],
  ]);
  const entries = flattenTasks(tasksByPath);

  it("groupBy none returns a single group with every entry", () => {
    const groups = groupTaskEntries(entries, "none");
    expect(groups).toHaveLength(1);
    expect(groups[0].entries).toHaveLength(3);
  });

  it("groupBy none returns no groups for an empty entry list", () => {
    expect(groupTaskEntries([], "none")).toEqual([]);
  });

  it("groupBy note produces one group per note, sorted by path", () => {
    const groups = groupTaskEntries(entries, "note");
    expect(groups.map((g) => g.key)).toEqual(["/vault/journal.md", "/vault/projects/a.md"]);
    expect(groups.find((g) => g.key === "/vault/projects/a.md")?.entries).toHaveLength(2);
  });

  it("groupBy folder groups notes in the same folder together", () => {
    const groups = groupTaskEntries(entries, "folder");
    const projectsGroup = groups.find((g) => g.key === "/vault/projects");
    expect(projectsGroup?.entries).toHaveLength(2);
    const rootGroup = groups.find((g) => g.key === "/vault");
    expect(rootGroup?.entries).toHaveLength(1);
  });

  it("preserves incoming order within each group", () => {
    const groups = groupTaskEntries(entries, "note");
    const projectsGroup = groups.find((g) => g.key === "/vault/projects/a.md");
    expect(projectsGroup?.entries.map((e) => e.task.text)).toEqual(["A1", "A2"]);
  });
});

describe("queryTasks (full pipeline)", () => {
  it("filters, sorts, then groups", () => {
    const tasksByPath = tasksByPathOf([
      ["/vault/b.md", "- [ ] Zebra\n- [x] Done in b\n"],
      ["/vault/a.md", "- [ ] Apple\n"],
    ]);
    const query: TaskHubQuery = { ...DEFAULT_TASK_HUB_QUERY, status: "open", sortBy: "text", groupBy: "note" };
    const groups = queryTasks(tasksByPath, new Map(), query);

    // Completed task in b.md is excluded by the open-status filter.
    const allEntries = groups.flatMap((g) => g.entries);
    expect(allEntries).toHaveLength(2);
    // Sorted by text before grouping, so groups themselves appear... but
    // groupBy: "note" sorts groups by path key regardless of sort order;
    // what sortBy governs is each group's own internal order.
    expect(groups.map((g) => g.key)).toEqual(["/vault/a.md", "/vault/b.md"]);
    expect(allEntries.map((e) => e.task.text)).toEqual(["Apple", "Zebra"]);
  });
});
