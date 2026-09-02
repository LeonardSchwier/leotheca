import { describe, expect, it } from "vitest";
import { scanTasks } from "./tasks";

describe("scanTasks", () => {
  it("returns an empty array for a note with no task items", () => {
    expect(scanTasks("Just a paragraph.\n\n- A plain bullet, not a task.")).toEqual([]);
  });

  it("recognizes an unchecked task", () => {
    const [task] = scanTasks("- [ ] Buy milk");
    expect(task.checked).toBe(false);
    expect(task.marker).toBe(" ");
    expect(task.text).toBe("Buy milk");
    expect(task.displayText).toBe("Buy milk");
  });

  it("recognizes lowercase and uppercase completed markers as checked", () => {
    const [lower, upper] = scanTasks("- [x] Done lower\n- [X] Done upper\n");
    expect(lower.checked).toBe(true);
    expect(lower.marker).toBe("x");
    expect(upper.checked).toBe(true);
    expect(upper.marker).toBe("X");
  });

  it("supports -, *, and + unordered bullet markers", () => {
    const tasks = scanTasks("- [ ] Dash\n* [ ] Star\n+ [ ] Plus\n");
    expect(tasks.map((t) => t.text)).toEqual(["Dash", "Star", "Plus"]);
  });

  it("reports the exact source line and text ranges", () => {
    const source = "Intro\n\n- [ ] Call the dentist\n\nBody.";
    const [task] = scanTasks(source);
    expect(source.slice(task.sourceFrom, task.sourceTo)).toBe("- [ ] Call the dentist");
    expect(source.slice(task.textFrom, task.textTo)).toBe("Call the dentist");
    expect(task.line).toBe(3);
    expect(task.column).toBe(1);
  });

  it("reports the exact marker range as the single bracketed character", () => {
    const source = "- [x] Done";
    const [task] = scanTasks(source);
    expect(source.slice(task.markerFrom, task.markerTo)).toBe("x");
  });

  it("trims trailing whitespace from the text range", () => {
    const source = "- [ ] Trailing space   \nafter";
    const [task] = scanTasks(source);
    expect(task.text).toBe("Trailing space");
    expect(source.slice(task.textFrom, task.textTo)).toBe("Trailing space");
  });

  it("handles a task with no text after the checkbox", () => {
    const [task] = scanTasks("- [ ]\nafter");
    expect(task.text).toBe("");
    expect(task.textFrom).toBe(task.textTo);
  });

  it("strips inline Markdown formatting for displayText but keeps it in text", () => {
    const [task] = scanTasks("- [ ] **Call** the *dentist*");
    expect(task.text).toBe("**Call** the *dentist*");
    expect(task.displayText).toBe("Call the dentist");
  });

  it("does not treat a missing space before the bracket as a task", () => {
    expect(scanTasks("-[ ] Missing space")).toEqual([]);
  });

  it("does not treat an empty bracket as a task", () => {
    expect(scanTasks("- [] Empty bracket")).toEqual([]);
  });

  it("does not treat an unsupported marker character as a task", () => {
    expect(scanTasks("- [~] Unsupported marker")).toEqual([]);
  });

  it("does not treat an ordered list item as a task", () => {
    expect(scanTasks("1. [ ] Ordered list task")).toEqual([]);
  });

  it("ignores a task-like line inside a fenced code block", () => {
    const source = "```\n- [ ] Not a real task\n```\n- [ ] Real task";
    const tasks = scanTasks(source);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].text).toBe("Real task");
  });

  it("ignores a task-like line inside a tilde-fenced code block", () => {
    const source = "~~~\n- [ ] Not a real task\n~~~\n- [ ] Real task";
    const tasks = scanTasks(source);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].text).toBe("Real task");
  });

  it("ignores a task-like line inside a single-line HTML comment", () => {
    expect(scanTasks("<!-- - [ ] Not a real task -->")).toEqual([]);
  });

  it("ignores a task-like line inside a multi-line HTML comment", () => {
    const source = "<!--\n- [ ] Not a real task\n-->\n- [ ] Real task";
    const tasks = scanTasks(source);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].text).toBe("Real task");
  });

  it("ignores a task-like line that reads as a top-level indented code block", () => {
    // Four leading spaces with no shallower open task above it: no list
    // context to nest under, so this reads as an indented code block per
    // the spec's own exclusion, not a deeply nested task.
    const source = "Paragraph.\n\n    - [ ] Looks like a task but is code\n";
    expect(scanTasks(source)).toEqual([]);
  });

  it("produces the same tasks for LF and CRLF variants of the same document", () => {
    const lf = "- [ ] One\n  - [x] Two\n- [ ] Three\n";
    const crlf = lf.replace(/\n/g, "\r\n");
    const lfTasks = scanTasks(lf);
    const crlfTasks = scanTasks(crlf);
    expect(crlfTasks.map((t) => t.text)).toEqual(lfTasks.map((t) => t.text));
    expect(crlfTasks.map((t) => t.checked)).toEqual(lfTasks.map((t) => t.checked));
    expect(crlfTasks.map((t) => t.nestingDepth)).toEqual(lfTasks.map((t) => t.nestingDepth));
    crlfTasks.forEach((task, index) => {
      expect(crlf.slice(task.sourceFrom, task.sourceTo)).toBe(
        lf.slice(lfTasks[index].sourceFrom, lfTasks[index].sourceTo),
      );
    });
  });

  describe("nesting depth", () => {
    it("assigns depth 0 to every unindented top-level task", () => {
      const tasks = scanTasks("- [ ] One\n- [ ] Two\n- [ ] Three\n");
      expect(tasks.map((t) => t.nestingDepth)).toEqual([0, 0, 0]);
    });

    it("assigns increasing depth to consistently indented nested tasks", () => {
      const source = "- [ ] Parent\n  - [ ] Child\n    - [ ] Grandchild\n";
      const tasks = scanTasks(source);
      expect(tasks.map((t) => t.nestingDepth)).toEqual([0, 1, 2]);
      expect(tasks.map((t) => t.indentationColumns)).toEqual([0, 2, 4]);
    });

    it("returns to a shallower depth after a nested run ends", () => {
      const source = "- [ ] Parent\n  - [ ] Child\n- [ ] Sibling of parent\n";
      const tasks = scanTasks(source);
      expect(tasks.map((t) => t.nestingDepth)).toEqual([0, 1, 0]);
    });

    it("keeps a nested task's depth across an intervening blank line (a loose list)", () => {
      const source = "- [ ] Parent\n\n  - [ ] Child\n";
      const tasks = scanTasks(source);
      expect(tasks.map((t) => t.nestingDepth)).toEqual([0, 1]);
    });

    it("treats a sibling at the same indentation as the same depth, not deeper", () => {
      const source = "- [ ] One\n  - [ ] Nested A\n  - [ ] Nested B\n";
      const tasks = scanTasks(source);
      expect(tasks.map((t) => t.nestingDepth)).toEqual([0, 1, 1]);
    });
  });
});
