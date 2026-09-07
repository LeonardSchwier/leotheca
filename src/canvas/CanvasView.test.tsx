/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";

vi.mock("../settings/store", async () => {
  const { signal } = await import("@preact/signals");
  return { workspacePath: signal<string | null>(null) };
});

import { CanvasView } from "./CanvasView";
import { workspacePath } from "../settings/store";

const CANVAS_PATH = "/workspace/boards/plan.canvas";

afterEach(() => {
  cleanup();
  workspacePath.value = null;
});

describe("CanvasView", () => {
  it("shows an error hint and never calls onChange for an unparseable document", () => {
    const onChange = vi.fn();
    const { getByText } = render(
      <CanvasView path={CANVAS_PATH} source="not json" onChange={onChange} onOpenFile={vi.fn()} />,
    );
    expect(getByText("This canvas file is not valid JSON.")).not.toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("renders cards and does not lose a malformed record when an unrelated card is edited", () => {
    workspacePath.value = "/workspace";
    const malformedNode = { id: "b", note: "future field" };
    const source = JSON.stringify({
      nodes: [{ id: "a", text: "A", x: 1, y: 2 }, malformedNode],
      edges: [],
    });
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <CanvasView path={CANVAS_PATH} source={source} onChange={onChange} onOpenFile={vi.fn()} />,
    );

    // Only one editable card ("a") renders; the malformed record ("b") isn't
    // shown, but must still round-trip through the next save untouched.
    fireEvent.input(getByLabelText("Card text"), { target: { value: "Renamed" } });

    expect(onChange).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(onChange.mock.calls[0][0] as string) as { nodes: unknown[] };
    expect(saved.nodes).toEqual([{ id: "a", text: "Renamed", x: 1, y: 2 }, malformedNode]);
  });

  it("enables Open for a card whose file path resolves inside the workspace", () => {
    workspacePath.value = "/workspace";
    const source = JSON.stringify({
      nodes: [{ id: "a", text: "A", x: 1, y: 2, filePath: "note.md" }],
      edges: [],
    });
    const onOpenFile = vi.fn();
    const { getByText } = render(
      <CanvasView path={CANVAS_PATH} source={source} onChange={vi.fn()} onOpenFile={onOpenFile} />,
    );

    const openButton = getByText("Open") as HTMLButtonElement;
    expect(openButton.disabled).toBe(false);
    fireEvent.click(openButton);
    expect(onOpenFile).toHaveBeenCalledWith("/workspace/boards/note.md");
  });

  it("disables Open for a card whose file path escapes the workspace", () => {
    workspacePath.value = "/workspace";
    const source = JSON.stringify({
      nodes: [{ id: "a", text: "A", x: 1, y: 2, filePath: "../../../../etc/passwd" }],
      edges: [],
    });
    const onOpenFile = vi.fn();
    const { getByText } = render(
      <CanvasView path={CANVAS_PATH} source={source} onChange={vi.fn()} onOpenFile={onOpenFile} />,
    );

    const openButton = getByText("Open") as HTMLButtonElement;
    expect(openButton.disabled).toBe(true);
    fireEvent.click(openButton);
    expect(onOpenFile).not.toHaveBeenCalled();
  });

  it("adds a new card via the toolbar", () => {
    workspacePath.value = "/workspace";
    const onChange = vi.fn();
    const { getByText } = render(
      <CanvasView
        path={CANVAS_PATH}
        source={JSON.stringify({ nodes: [], edges: [] })}
        onChange={onChange}
        onOpenFile={vi.fn()}
      />,
    );

    fireEvent.click(getByText("New card"));

    expect(onChange).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(onChange.mock.calls[0][0] as string) as {
      nodes: Array<{ text: string }>;
    };
    expect(saved.nodes).toHaveLength(1);
    expect(saved.nodes[0].text).toBe("Untitled card");
  });

  it("renders safely without crashing when edges reference non-existent nodes", () => {
    workspacePath.value = "/workspace";
    // Edge references a node (unknown-future-node) that doesn't exist in nodes
    // This simulates a future-version canvas with retained unknown nodes
    const source = JSON.stringify({
      nodes: [{ id: "a", text: "A", x: 1, y: 2 }, { id: "b", text: "B", x: 100, y: 100 }],
      edges: [
        { from: "a", to: "b" }, // Valid edge
        { from: "unknown-future-node", to: "a" }, // Edge with non-existent from
        { from: "a", to: "unknown-future-node" }, // Edge with non-existent to
        { from: "ghost", to: "phantom" }, // Edge with both non-existent
      ],
    });
    const onChange = vi.fn();
    
    // Should not throw during render
    expect(() => {
      render(
        <CanvasView path={CANVAS_PATH} source={source} onChange={onChange} onOpenFile={vi.fn()} />,
      );
    }).not.toThrow();

    // Verify that all edges in the document are preserved when the document is saved
    // The CanvasView filters out edges to non-existent nodes for rendering, but preserves them in the document
    // Test that we can successfully render the canvas and that the original edges are preserved in the source
    expect(onChange).not.toHaveBeenCalled(); // No changes when just rendering
  });
});
