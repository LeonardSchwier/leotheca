import { describe, expect, it } from "vitest";
import {
  CANVAS_VERSION,
  decodeCanvas,
  resolveCanvasFileReference,
  serializeCanvas,
} from "./canvasDocument";

describe("decodeCanvas", () => {
  it("keeps valid local file cards and connections", () => {
    const decoded = decodeCanvas(
      JSON.stringify({
        nodes: [
          { id: "a", text: "A", x: 1, y: 2, filePath: "A.md" },
          { id: "b", text: "B", x: 3, y: 4 },
        ],
        edges: [{ from: "a", to: "b" }],
      }),
    );
    expect(decoded?.document).toEqual({
      nodes: [
        { id: "a", text: "A", x: 1, y: 2, filePath: "A.md" },
        { id: "b", text: "B", x: 3, y: 4 },
      ],
      edges: [{ from: "a", to: "b" }],
    });
    expect(decoded?.unknownNodes).toEqual([]);
    expect(decoded?.unknownEdges).toEqual([]);
  });

  it("rejects invalid JSON", () => {
    expect(decodeCanvas("not json")).toBeNull();
  });

  it("rejects a non-object top level", () => {
    expect(decodeCanvas(JSON.stringify([1, 2, 3]))).toBeNull();
    expect(decodeCanvas(JSON.stringify("a string"))).toBeNull();
    expect(decodeCanvas(JSON.stringify(null))).toBeNull();
  });

  it("rejects a present but wrong-typed nodes or edges field", () => {
    expect(decodeCanvas(JSON.stringify({ nodes: "oops", edges: [] }))).toBeNull();
    expect(decodeCanvas(JSON.stringify({ nodes: [], edges: "oops" }))).toBeNull();
  });

  it("treats a missing nodes or edges field as empty, not corrupt", () => {
    expect(decodeCanvas(JSON.stringify({}))?.document).toEqual({ nodes: [], edges: [] });
    expect(decodeCanvas(JSON.stringify({ edges: [] }))?.document).toEqual({ nodes: [], edges: [] });
    expect(decodeCanvas(JSON.stringify({ nodes: [] }))?.document).toEqual({ nodes: [], edges: [] });
  });

  it("drops a self-referential edge", () => {
    const decoded = decodeCanvas(
      JSON.stringify({
        nodes: [{ id: "a", text: "A", x: 1, y: 2 }],
        edges: [{ from: "a", to: "a" }],
      }),
    );
    expect(decoded?.document.edges).toEqual([]);
  });

  it("drops an edge referencing a genuinely nonexistent node id", () => {
    const decoded = decodeCanvas(
      JSON.stringify({
        nodes: [{ id: "a", text: "A", x: 1, y: 2 }],
        edges: [{ from: "a", to: "missing" }],
      }),
    );
    expect(decoded?.document.edges).toEqual([]);
    expect(decoded?.unknownEdges).toEqual([]);
  });

  it("retains a malformed node record instead of discarding it", () => {
    const malformed = { id: "b", note: "future field this build doesn't know about" };
    const decoded = decodeCanvas(
      JSON.stringify({
        nodes: [{ id: "a", text: "A", x: 1, y: 2 }, malformed],
        edges: [],
      }),
    );
    expect(decoded?.document.nodes).toEqual([{ id: "a", text: "A", x: 1, y: 2 }]);
    expect(decoded?.unknownNodes).toEqual([malformed]);
  });

  it("keeps an edge referencing a retained-but-malformed node's id", () => {
    const malformed = { id: "b", note: "not a real card yet" };
    const decoded = decodeCanvas(
      JSON.stringify({
        nodes: [{ id: "a", text: "A", x: 1, y: 2 }, malformed],
        edges: [{ from: "a", to: "b" }],
      }),
    );
    expect(decoded?.document.edges).toEqual([{ from: "a", to: "b" }]);
  });

  it("retains a malformed edge record instead of discarding it", () => {
    const malformed = { note: "not a real edge, but still an object" };
    const decoded = decodeCanvas(
      JSON.stringify({
        nodes: [{ id: "a", text: "A", x: 1, y: 2 }],
        edges: [malformed],
      }),
    );
    expect(decoded?.document.edges).toEqual([]);
    expect(decoded?.unknownEdges).toEqual([malformed]);
  });

  it("drops a non-object node or edge entry (nothing recoverable in it)", () => {
    const decoded = decodeCanvas(
      JSON.stringify({
        nodes: [{ id: "a", text: "A", x: 1, y: 2 }, "garbage", null, 42, ["nested", "array"]],
        edges: ["garbage", null],
      }),
    );
    expect(decoded?.document.nodes).toEqual([{ id: "a", text: "A", x: 1, y: 2 }]);
    expect(decoded?.unknownNodes).toEqual([]);
    expect(decoded?.unknownEdges).toEqual([]);
  });

  it("preserves an unrecognized top-level field", () => {
    const decoded = decodeCanvas(
      JSON.stringify({ nodes: [], edges: [], background: "grid", futureFeature: { enabled: true } }),
    );
    expect(decoded?.extraFields.background).toBe("grid");
    expect(decoded?.extraFields.futureFeature).toEqual({ enabled: true });
  });

  it("round-trips cards referencing mixed resource kinds unchanged", () => {
    const source = JSON.stringify({
      nodes: [
        { id: "note", text: "A note", x: 0, y: 0, filePath: "note.md" },
        { id: "image", text: "An image", x: 10, y: 10, filePath: "photo.png" },
        { id: "doc", text: "A document", x: 20, y: 20, filePath: "report.pdf" },
        { id: "plain", text: "No link", x: 30, y: 30 },
      ],
      edges: [{ from: "note", to: "image" }],
    });
    const decoded = decodeCanvas(source);
    expect(decoded?.document.nodes.map((n) => n.filePath)).toEqual([
      "note.md",
      "photo.png",
      "report.pdf",
      undefined,
    ]);
    const reserialized = JSON.parse(serializeCanvas(decoded!)) as { nodes: unknown[]; edges: unknown[] };
    expect(reserialized.nodes).toEqual(decoded!.document.nodes);
    expect(reserialized.edges).toEqual(decoded!.document.edges);
  });
});

describe("serializeCanvas", () => {
  it("round-trips valid nodes and edges and stamps the current version", () => {
    const decoded = decodeCanvas(
      JSON.stringify({ nodes: [{ id: "a", text: "A", x: 1, y: 2 }], edges: [] }),
    );
    const serialized = JSON.parse(serializeCanvas(decoded!)) as Record<string, unknown>;
    expect(serialized.version).toBe(CANVAS_VERSION);
    expect(serialized.nodes).toEqual([{ id: "a", text: "A", x: 1, y: 2 }]);
  });

  it("re-emits unknown node and edge records and unrecognized top-level fields unchanged", () => {
    const malformedNode = { id: "b", note: "future field" };
    const malformedEdge = { note: "future edge shape" };
    const source = JSON.stringify({
      nodes: [{ id: "a", text: "A", x: 1, y: 2 }, malformedNode],
      edges: [malformedEdge],
      background: "grid",
    });
    const decoded = decodeCanvas(source)!;
    // A known-card edit: rename "a"'s text, nothing else.
    const edited = {
      ...decoded,
      document: {
        ...decoded.document,
        nodes: decoded.document.nodes.map((n) => (n.id === "a" ? { ...n, text: "Renamed" } : n)),
      },
    };
    const reserialized = JSON.parse(serializeCanvas(edited)) as Record<string, unknown>;
    expect(reserialized.background).toBe("grid");
    expect(reserialized.nodes).toEqual([{ id: "a", text: "Renamed", x: 1, y: 2 }, malformedNode]);
    expect(reserialized.edges).toEqual([malformedEdge]);
  });

  it("does not downgrade an already-present, newer version marker", () => {
    const decoded = decodeCanvas(JSON.stringify({ version: 7, nodes: [], edges: [] }))!;
    const reserialized = JSON.parse(serializeCanvas(decoded)) as Record<string, unknown>;
    expect(reserialized.version).toBe(7);
  });
});

describe("resolveCanvasFileReference", () => {
  const workspaceRoot = "/workspace";
  const canvasPath = "/workspace/boards/plan.canvas";

  it("resolves a relative path against the canvas file's own directory", () => {
    expect(resolveCanvasFileReference(workspaceRoot, canvasPath, "note.md")).toBe(
      "/workspace/boards/note.md",
    );
    expect(resolveCanvasFileReference(workspaceRoot, canvasPath, "../attachments/image.png")).toBe(
      "/workspace/attachments/image.png",
    );
  });

  it("rejects a relative path that escapes the workspace", () => {
    expect(resolveCanvasFileReference(workspaceRoot, canvasPath, "../../../../etc/passwd")).toBeNull();
  });

  it("accepts a legacy absolute in-workspace path", () => {
    expect(resolveCanvasFileReference(workspaceRoot, canvasPath, "/workspace/note.md")).toBe(
      "/workspace/note.md",
    );
  });

  it("rejects an absolute path outside the workspace", () => {
    expect(resolveCanvasFileReference(workspaceRoot, canvasPath, "/etc/passwd")).toBeNull();
    expect(resolveCanvasFileReference(workspaceRoot, canvasPath, "/workspace-evil/note.md")).toBeNull();
  });

  it("rejects an empty file path", () => {
    expect(resolveCanvasFileReference(workspaceRoot, canvasPath, "")).toBeNull();
  });
});
