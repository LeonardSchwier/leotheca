import { describe, it, expect } from "vitest";
import {
  SLASH_COMMANDS,
  filterCommands,
  slashCommandCompletions,
  SLASH_TRIGGER,
} from "./slashCommands";
import { EditorState } from "@codemirror/state";
import type { CompletionContext } from "@codemirror/autocomplete";

/**
 * Build a minimal CompletionContext-like object for testing
 * slashCommandCompletions. We use a real EditorState so doc.lineAt
 * works correctly.
 */
function makeContext(doc: string, pos: number): CompletionContext {
  const state = EditorState.create({ doc });
  return {
    state,
    pos,
    matchBefore: () => null, // slash commands don't use matchBefore
  } as unknown as CompletionContext;
}

describe("SLASH_TRIGGER", () => {
  it("matches / followed by a valid command name at start of line", () => {
    expect("/".match(SLASH_TRIGGER)).toBeNull(); // bare / with no name
    // Actually: the regex requires at least one letter after /
    expect(" /".match(SLASH_TRIGGER)).toBeNull(); // leading space
    expect("/table".match(SLASH_TRIGGER)?.[1]).toBe("table");
    expect("/t".match(SLASH_TRIGGER)?.[1]).toBe("t");
    expect("/task".match(SLASH_TRIGGER)?.[1]).toBe("task");
  });

  it("does not match mid-line /", () => {
    expect("word /table".match(SLASH_TRIGGER)).toBeNull();
  });

  it("does not match / with spaces after the name", () => {
    // The regex is anchored to end-of-string, so a trailing space means
    // the match fails (the space is not in [a-zA-Z0-9-]*).
    expect("/table ".match(SLASH_TRIGGER)).toBeNull();
  });

  it("does not match /123 (must start with a letter)", () => {
    expect("/123".match(SLASH_TRIGGER)).toBeNull();
  });
});

describe("filterCommands", () => {
  it("returns all commands for an empty query", () => {
    expect(filterCommands("")).toHaveLength(SLASH_COMMANDS.length);
  });

  it("filters by label prefix", () => {
    const results = filterCommands("ta");
    expect(results.map((c) => c.label)).toContain("table");
    expect(results.map((c) => c.label)).toContain("task");
  });

  it("filters by description substring", () => {
    const results = filterCommands("heading");
    expect(results.map((c) => c.label)).toContain("heading");
    expect(results.map((c) => c.label)).toContain("h1");
    expect(results.map((c) => c.label)).toContain("h2");
    expect(results.map((c) => c.label)).toContain("h3");
  });

  it("returns empty array when nothing matches", () => {
    expect(filterCommands("zzzzz")).toHaveLength(0);
  });

  it("is case-insensitive", () => {
    const results = filterCommands("TABLE");
    expect(results.map((c) => c.label)).toContain("table");
  });
});

describe("SLASH_COMMANDS", () => {
  it("has unique labels", () => {
    const labels = SLASH_COMMANDS.map((c) => c.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("every snippet is non-empty", () => {
    for (const cmd of SLASH_COMMANDS) {
      expect(cmd.snippet.length).toBeGreaterThan(0);
    }
  });

  it("table snippet has correct structure", () => {
    const table = SLASH_COMMANDS.find((c) => c.label === "table")!;
    // 5 lines: header, separator, 3 data rows
    const lines = table.snippet.trim().split("\n");
    expect(lines).toHaveLength(5);
    // Header has 3 columns
    expect(lines[0].split("|").filter(Boolean)).toHaveLength(3);
    // Separator has dashes
    expect(lines[1]).toMatch(/-{4,}/);
  });

  it("task snippet is a valid task-list item", () => {
    const task = SLASH_COMMANDS.find((c) => c.label === "task")!;
    expect(task.snippet).toMatch(/^- \[ \] /);
  });

  it("code snippet has matching fences", () => {
    const code = SLASH_COMMANDS.find((c) => c.label === "code")!;
    const fenceCount = (code.snippet.match(/```/g) || []).length;
    expect(fenceCount).toBe(2);
  });

  it("callout snippet uses Obsidian syntax", () => {
    const callout = SLASH_COMMANDS.find((c) => c.label === "callout")!;
    expect(callout.snippet).toContain("> [!note]");
  });
});

describe("slashCommandCompletions", () => {
  it("returns null when not at start of a /command", () => {
    const ctx = makeContext("hello world", 5);
    expect(slashCommandCompletions(ctx)).toBeNull();
  });

  it("returns null for / in the middle of a line", () => {
    const doc = "some text /table";
    const pos = doc.length;
    const ctx = makeContext(doc, pos);
    expect(slashCommandCompletions(ctx)).toBeNull();
  });

  it("returns null for a bare / with no command name", () => {
    const doc = "/";
    const pos = 1;
    const ctx = makeContext(doc, pos);
    // Bare / doesn't match SLASH_TRIGGER (needs at least one letter)
    expect(slashCommandCompletions(ctx)).toBeNull();
  });

  it("returns all commands for / followed by the first letter", () => {
    const doc = "/t";
    const pos = 2;
    const ctx = makeContext(doc, pos);
    const result = slashCommandCompletions(ctx);
    expect(result).not.toBeNull();
    // Should include 'table' and 'task'
    const labels = result!.options.map((o) => o.label);
    expect(labels).toContain("table");
    expect(labels).toContain("task");
  });

  it("narrows results as more letters are typed", () => {
    const doc = "/tab";
    const pos = 4;
    const ctx = makeContext(doc, pos);
    const result = slashCommandCompletions(ctx);
    expect(result).not.toBeNull();
    const labels = result!.options.map((o) => o.label);
    expect(labels).toContain("table");
    expect(labels).not.toContain("task"); // task doesn't contain "tab"
  });

  it("returns null when no command matches the query", () => {
    const doc = "/zzzz";
    const pos = 5;
    const ctx = makeContext(doc, pos);
    expect(slashCommandCompletions(ctx)).toBeNull();
  });

  it("from position is the start of the line", () => {
    const doc = "previous line\n/table";
    const pos = doc.length;
    const ctx = makeContext(doc, pos);
    const result = slashCommandCompletions(ctx);
    expect(result).not.toBeNull();
    // from should be the start of the second line (after the newline)
    expect(result!.from).toBe("previous line\n".length);
  });

  it("options include the snippet in apply", () => {
    const doc = "/tab";
    const pos = 4;
    const ctx = makeContext(doc, pos);
    const result = slashCommandCompletions(ctx);
    expect(result).not.toBeNull();
    const tableOption = result!.options.find((o) => o.label === "table");
    expect(tableOption).toBeDefined();
    expect(tableOption!.apply).toContain("| Column 1 |");
  });

  it("options include a description in detail", () => {
    const doc = "/tab";
    const pos = 4;
    const ctx = makeContext(doc, pos);
    const result = slashCommandCompletions(ctx);
    expect(result).not.toBeNull();
    const tableOption = result!.options.find((o) => o.label === "table");
    expect(tableOption!.detail).toMatch(/table/i);
  });
});
