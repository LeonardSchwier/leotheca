import { describe, expect, it } from "vitest";
import { buildNoteTimeline } from "./noteTimeline";

describe("buildNoteTimeline", () => {
  it("orders dated notes newest-first, then uses a stable path tie-breaker", () => {
    const timeline = buildNoteTimeline(
      new Map([["/vault/a.md", []], ["/vault/b.md", []], ["/vault/c.md", []]]),
      new Map([["/vault/a.md", 100], ["/vault/b.md", 200], ["/vault/c.md", 100]]),
    );
    expect(timeline.notes.map(({ path }) => path)).toEqual(["/vault/b.md", "/vault/a.md", "/vault/c.md"]);
  });

  it("keeps missing and invalid mtimes in a deterministic undated section", () => {
    const timeline = buildNoteTimeline(
      new Map([["/vault/z.md", []], ["/vault/a.md", []], ["/vault/dated.md", []]]),
      new Map([["/vault/z.md", Number.NaN], ["/vault/dated.md", 0]]),
    );
    expect(timeline.notes.map(({ path, day }) => [path, day])).toEqual([
      ["/vault/dated.md", "1970-01-01"],
      ["/vault/a.md", null],
      ["/vault/z.md", null],
    ]);
  });

  it("uses stable folder lanes and keeps isolated notes", () => {
    const timeline = buildNoteTimeline(new Map([
      ["/vault/notes/a.md", []],
      ["/vault/projects/b.md", []],
      ["/vault/root.md", []],
    ]));
    expect(timeline.laneKeys).toEqual(["/vault", "/vault/notes", "/vault/projects"]);
    expect(timeline.notes.map(({ path, lane }) => [path, lane])).toEqual([
      ["/vault/notes/a.md", 1],
      ["/vault/projects/b.md", 2],
      ["/vault/root.md", 0],
    ]);
  });

  it("keeps directed edges only when both endpoints are indexed and counts incoming links", () => {
    const timeline = buildNoteTimeline(new Map([
      ["/vault/a.md", ["/vault/b.md", "/outside.md"]],
      ["/vault/b.md", ["/vault/a.md"]],
    ]));
    expect(timeline.edges).toEqual([
      { source: "/vault/a.md", target: "/vault/b.md" },
      { source: "/vault/b.md", target: "/vault/a.md" },
    ]);
    expect(timeline.notes.map(({ path, incomingLinkCount }) => [path, incomingLinkCount])).toEqual([
      ["/vault/a.md", 1],
      ["/vault/b.md", 1],
    ]);
  });
});
