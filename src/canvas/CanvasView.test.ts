import { describe, expect, it } from "vitest";
import { parseCanvas } from "./CanvasView";

describe("parseCanvas", () => {
  it("keeps valid local file cards and connections", () => {
    expect(parseCanvas(JSON.stringify({ nodes: [{ id: "a", text: "A", x: 1, y: 2, filePath: "/workspace/A.md" }, { id: "b", text: "B", x: 3, y: 4 }], edges: [{ from: "a", to: "b" }] }))).toEqual({ nodes: [{ id: "a", text: "A", x: 1, y: 2, filePath: "/workspace/A.md" }, { id: "b", text: "B", x: 3, y: 4 }], edges: [{ from: "a", to: "b" }] });
  });

  it("rejects malformed documents and drops dangling or self-referential edges", () => {
    expect(parseCanvas("not json")).toBeNull();
    expect(parseCanvas(JSON.stringify({ nodes: [{ id: "a", text: "A", x: 1, y: 2 }], edges: [{ from: "a", to: "a" }, { from: "a", to: "missing" }] }))).toEqual({ nodes: [{ id: "a", text: "A", x: 1, y: 2 }], edges: [] });
  });
});
