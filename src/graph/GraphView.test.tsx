/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signal } from "@preact/signals";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { linkIndex } from "../linking/store";
import type { GraphColorGroup, WorkspaceSettings } from "../settings/workspaceSettings";

// vi.mock factories run lazily, after this file's own top-level imports and
// consts are initialized (see workspace/Sidebar.test.tsx's identical note),
// so plain module-scope consts closed over below are safe.
const mockWorkspaceSettings = signal<Partial<WorkspaceSettings>>({ graphColorGroups: [] });
const mockUpdateWorkspaceSettings = vi.fn(async (patch: Partial<WorkspaceSettings>) => {
  mockWorkspaceSettings.value = { ...mockWorkspaceSettings.value, ...patch };
});

vi.mock("../settings/store", () => ({
  workspaceSettings: mockWorkspaceSettings,
  updateWorkspaceSettings: mockUpdateWorkspaceSettings,
}));

// GraphView's layout effect needs two things jsdom doesn't provide: a
// ResizeObserver constructor at all, and non-zero clientWidth/clientHeight
// on the container div (jsdom always reports 0, which layoutAndDraw treats
// as "not laid out yet" and bails on). HTMLCanvasElement.getContext("2d")
// returning null (confirmed separately: jsdom logs a warning but doesn't
// throw) is already handled gracefully by draw()'s own `if (!ctx) return`,
// so no canvas mocking library is needed at all.
class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, value: 400 });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, value: 400 });
  // jsdom doesn't implement the Pointer Capture APIs either.
  HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
  HTMLCanvasElement.prototype.releasePointerCapture = vi.fn();
  HTMLCanvasElement.prototype.hasPointerCapture = vi.fn(() => false);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  if (originalClientWidth) Object.defineProperty(HTMLElement.prototype, "clientWidth", originalClientWidth);
  if (originalClientHeight) Object.defineProperty(HTMLElement.prototype, "clientHeight", originalClientHeight);
  linkIndex.value = {
    backlinksByPath: new Map(),
    pathsByNoteName: new Map(),
    pathsByAlias: new Map(),
    aliasesByPath: new Map(),
  };
  mockWorkspaceSettings.value = { graphColorGroups: [] };
  mockUpdateWorkspaceSettings.mockClear();
});

// A deterministic layout, one node at a known screen position, regardless
// of the real force-directed layout's output — this test is about
// GraphView's own interaction logic (double-tap, drag start), not the
// layout math itself (see layout.test.ts for that).
vi.mock("./layout", () => ({
  computeLayout: () => new Map([["/vault/a.md", { x: 100, y: 100 }]]),
}));

const {
  GraphView,
  computeConnectedPaths,
  computeLocalGraph,
  filterGraphByQuery,
  colorForPath,
  computeVisibleGraph,
} = await import("./GraphView");

// /vault/a.md has an incoming link from /vault/b.md, so both count as
// "connected" and remain visible under the new hide-isolated-notes default
// — this helper backs the interaction tests below, which are about click/
// tap handling, not the filtering feature itself (see the dedicated
// "hides unconnected notes by default" tests further down for that).
function withOneNode() {
  linkIndex.value = {
    backlinksByPath: new Map([
      ["/vault/a.md", ["/vault/b.md"]],
      ["/vault/b.md", []],
    ]),
    pathsByNoteName: new Map(),
    pathsByAlias: new Map(),
    aliasesByPath: new Map(),
  };
}

describe("GraphView", () => {
  it("shows a placeholder instead of a canvas when there's nothing to graph", () => {
    const { getByText, container } = render(<GraphView onOpenFile={vi.fn()} onClose={vi.fn()} />);
    expect(getByText("No notes to graph yet.")).toBeTruthy();
    expect(container.querySelector("canvas")).toBeNull();
  });

  it("renders a canvas once there are notes to graph", () => {
    withOneNode();
    const { container } = render(<GraphView onOpenFile={vi.fn()} onClose={vi.fn()} />);
    expect(container.querySelector("canvas")).toBeTruthy();
  });

  it("the close button calls onClose", () => {
    const onClose = vi.fn();
    const { getByLabelText } = render(<GraphView onOpenFile={vi.fn()} onClose={onClose} />);
    fireEvent.click(getByLabelText("Close graph"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("double-tapping a node within the double-tap window opens it", () => {
    withOneNode();
    const onOpenFile = vi.fn();
    const { container } = render(<GraphView onOpenFile={onOpenFile} onClose={vi.fn()} />);
    const canvas = container.querySelector("canvas")!;

    // The mocked layout puts the node at world (100, 100); with the
    // default identity transform (offset 0, scale 1) and jsdom's default
    // zero-origin getBoundingClientRect, screen (100, 100) lands on it.
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 100, clientY: 100 });

    expect(onOpenFile).toHaveBeenCalledWith("/vault/a.md", "a.md");
  });

  it("a single tap on a node does not open it", () => {
    withOneNode();
    const onOpenFile = vi.fn();
    const { container } = render(<GraphView onOpenFile={onOpenFile} onClose={vi.fn()} />);
    const canvas = container.querySelector("canvas")!;

    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 100, clientY: 100 });

    expect(onOpenFile).not.toHaveBeenCalled();
  });

  it("tapping empty space (no node nearby) does not open anything", () => {
    withOneNode();
    const onOpenFile = vi.fn();
    const { container } = render(<GraphView onOpenFile={onOpenFile} onClose={vi.fn()} />);
    const canvas = container.querySelector("canvas")!;

    // Far from the mocked node at (100, 100).
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 350, clientY: 350 });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 350, clientY: 350 });
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 350, clientY: 350 });

    expect(onOpenFile).not.toHaveBeenCalled();
  });

  it("two taps on the same node spaced beyond the double-tap window don't open it", () => {
    withOneNode();
    const onOpenFile = vi.fn();
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValue(1_000_000);
    const { container } = render(<GraphView onOpenFile={onOpenFile} onClose={vi.fn()} />);
    const canvas = container.querySelector("canvas")!;

    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 100, clientY: 100 });

    nowSpy.mockReturnValue(1_000_000 + 500); // past DOUBLE_TAP_MS (400ms)
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 100, clientY: 100 });

    expect(onOpenFile).not.toHaveBeenCalled();
    nowSpy.mockRestore();
  });
});

describe("computeConnectedPaths", () => {
  it("includes a note with an incoming link and the note linking to it", () => {
    const connected = computeConnectedPaths(
      new Map([
        ["/vault/a.md", ["/vault/b.md"]],
        ["/vault/b.md", []],
      ]),
    );
    expect(connected).toEqual(new Set(["/vault/a.md", "/vault/b.md"]));
  });

  it("excludes a note with no incoming or outgoing links", () => {
    const connected = computeConnectedPaths(
      new Map([
        ["/vault/a.md", ["/vault/b.md"]],
        ["/vault/b.md", []],
        ["/vault/isolated.md", []],
      ]),
    );
    expect(connected.has("/vault/isolated.md")).toBe(false);
  });

  it("returns an empty set when nothing links to anything", () => {
    const connected = computeConnectedPaths(
      new Map([
        ["/vault/a.md", []],
        ["/vault/b.md", []],
      ]),
    );
    expect(connected.size).toBe(0);
  });
});

describe("GraphView: hides unconnected notes by default", () => {
  function withMixedNodes() {
    linkIndex.value = {
      backlinksByPath: new Map([
        ["/vault/a.md", ["/vault/b.md"]],
        ["/vault/b.md", []],
        ["/vault/lonely-1.md", []],
        ["/vault/lonely-2.md", []],
      ]),
      pathsByNoteName: new Map(),
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
    };
  }

  it("shows the connected-only placeholder, not the generic empty-vault one, when every note is isolated", () => {
    linkIndex.value = {
      backlinksByPath: new Map([
        ["/vault/lonely-1.md", []],
        ["/vault/lonely-2.md", []],
      ]),
      pathsByNoteName: new Map(),
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
    };
    const { getByText, container } = render(<GraphView onOpenFile={vi.fn()} onClose={vi.fn()} />);
    expect(getByText(/No connected notes yet/)).toBeTruthy();
    expect(container.querySelector("canvas")).toBeNull();
  });

  it("renders the canvas by default when at least one note is connected, even with isolated notes present", () => {
    withMixedNodes();
    const { container } = render(<GraphView onOpenFile={vi.fn()} onClose={vi.fn()} />);
    expect(container.querySelector("canvas")).toBeTruthy();
  });

  it("the Show all notes checkbox starts unchecked", () => {
    withMixedNodes();
    const { getByLabelText } = render(<GraphView onOpenFile={vi.fn()} onClose={vi.fn()} />);
    expect((getByLabelText("Show all notes") as HTMLInputElement).checked).toBe(false);
  });

  it("checking Show all notes reveals the canvas even when every note is isolated", () => {
    linkIndex.value = {
      backlinksByPath: new Map([
        ["/vault/lonely-1.md", []],
        ["/vault/lonely-2.md", []],
      ]),
      pathsByNoteName: new Map(),
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
    };
    const { getByLabelText, container, queryByText } = render(
      <GraphView onOpenFile={vi.fn()} onClose={vi.fn()} />,
    );
    expect(container.querySelector("canvas")).toBeNull();

    fireEvent.click(getByLabelText("Show all notes"));

    expect(container.querySelector("canvas")).toBeTruthy();
    expect(queryByText(/No connected notes yet/)).toBeNull();
  });
});

describe("computeLocalGraph", () => {
  it("always includes the focus note itself, even with zero connections", () => {
    const local = computeLocalGraph("/vault/lonely.md", new Map([["/vault/lonely.md", []]]));
    expect(local.nodes).toEqual(new Set(["/vault/lonely.md"]));
    expect(local.edges).toEqual([]);
  });

  it("includes a note that links to the focus note (incoming)", () => {
    const local = computeLocalGraph(
      "/vault/b.md",
      new Map([
        ["/vault/b.md", ["/vault/a.md"]],
        ["/vault/a.md", []],
      ]),
    );
    expect(local.nodes).toEqual(new Set(["/vault/b.md", "/vault/a.md"]));
    expect(local.edges).toEqual([["/vault/a.md", "/vault/b.md"]]);
  });

  it("includes a note the focus note links to (outgoing)", () => {
    const local = computeLocalGraph(
      "/vault/a.md",
      new Map([
        ["/vault/a.md", []],
        ["/vault/b.md", ["/vault/a.md"]],
      ]),
    );
    expect(local.nodes).toEqual(new Set(["/vault/a.md", "/vault/b.md"]));
    expect(local.edges).toEqual([["/vault/a.md", "/vault/b.md"]]);
  });

  it("does not include a note two hops away", () => {
    const local = computeLocalGraph(
      "/vault/a.md",
      new Map([
        ["/vault/a.md", []],
        ["/vault/b.md", ["/vault/a.md"]],
        ["/vault/c.md", ["/vault/b.md"]],
      ]),
    );
    expect(local.nodes.has("/vault/c.md")).toBe(false);
  });

  it("combines incoming and outgoing neighbors without duplicating the focus note", () => {
    const local = computeLocalGraph(
      "/vault/hub.md",
      new Map([
        ["/vault/hub.md", ["/vault/in.md"]],
        ["/vault/in.md", []],
        ["/vault/out.md", ["/vault/hub.md"]],
      ]),
    );
    expect(local.nodes).toEqual(new Set(["/vault/hub.md", "/vault/in.md", "/vault/out.md"]));
    expect(local.edges).toEqual([
      ["/vault/in.md", "/vault/hub.md"],
      ["/vault/hub.md", "/vault/out.md"],
    ]);
  });
});

describe("GraphView: local (per-note) graph mode", () => {
  function withThreeNotes() {
    linkIndex.value = {
      backlinksByPath: new Map([
        ["/vault/b.md", ["/vault/a.md"]],
        ["/vault/a.md", []],
        ["/vault/c.md", []],
      ]),
      pathsByNoteName: new Map(),
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
    };
  }

  it("does not show the mode switch when no note is open", () => {
    withThreeNotes();
    const { queryByText } = render(<GraphView onOpenFile={vi.fn()} onClose={vi.fn()} />);
    expect(queryByText("This note")).toBeNull();
  });

  it("shows the mode switch, defaulted to Workspace, when a note is open", () => {
    withThreeNotes();
    const { getByText } = render(
      <GraphView onOpenFile={vi.fn()} onClose={vi.fn()} focusPath="/vault/a.md" />,
    );
    expect(getByText("Workspace").className).toContain("active");
    expect(getByText("This note").className).not.toContain("active");
  });

  it("switching to This note updates the title and hides the Show all notes toggle", () => {
    withThreeNotes();
    const { getByText, queryByLabelText } = render(
      <GraphView onOpenFile={vi.fn()} onClose={vi.fn()} focusPath="/vault/a.md" />,
    );

    fireEvent.click(getByText("This note"));

    expect(getByText("Local graph: a")).toBeTruthy();
    expect(queryByLabelText("Show all notes")).toBeNull();
  });

  it("switching back to Workspace restores the whole-graph title", () => {
    withThreeNotes();
    const { getByText } = render(
      <GraphView onOpenFile={vi.fn()} onClose={vi.fn()} focusPath="/vault/a.md" />,
    );

    fireEvent.click(getByText("This note"));
    fireEvent.click(getByText("Workspace"));

    expect(getByText("Graph")).toBeTruthy();
  });

  it("renders the canvas in local mode even when the focus note is otherwise isolated (Show all notes would be needed in Workspace mode)", () => {
    withThreeNotes();
    const { getByText, container } = render(
      <GraphView onOpenFile={vi.fn()} onClose={vi.fn()} focusPath="/vault/c.md" />,
    );

    fireEvent.click(getByText("This note"));

    expect(container.querySelector("canvas")).toBeTruthy();
  });
});

describe("filterGraphByQuery", () => {
  const edges: [string, string][] = [
    ["/vault/a.md", "/vault/b.md"],
    ["/vault/b.md", "/vault/c.md"],
  ];
  const nodes = ["/vault/a.md", "/vault/b.md", "/vault/c.md"];

  it("returns everything unchanged for a blank query", () => {
    expect(filterGraphByQuery(nodes, edges, "")).toEqual({ nodes, edges });
    expect(filterGraphByQuery(nodes, edges, "   ")).toEqual({ nodes, edges });
  });

  it("matches by display name, case-insensitively, substring", () => {
    const result = filterGraphByQuery(nodes, edges, "B");
    expect(result.nodes).toEqual(["/vault/b.md"]);
  });

  it("keeps only edges whose both endpoints survive the filter", () => {
    const result = filterGraphByQuery(nodes, edges, "a");
    expect(result.nodes).toEqual(["/vault/a.md"]);
    expect(result.edges).toEqual([]);
  });

  it("keeps an edge when both endpoints match", () => {
    // Both display names ("apple", "application") contain "app", unlike
    // the "keeps only edges..." case above where only one endpoint matches.
    const wideNodes = ["/vault/apple.md", "/vault/application.md"];
    const wideEdges: [string, string][] = [["/vault/apple.md", "/vault/application.md"]];
    const result = filterGraphByQuery(wideNodes, wideEdges, "app");
    expect(result.nodes).toEqual(wideNodes);
    expect(result.edges).toEqual(wideEdges);
  });

  it("returns no nodes when nothing matches", () => {
    expect(filterGraphByQuery(nodes, edges, "nonexistent")).toEqual({ nodes: [], edges: [] });
  });
});

describe("colorForPath", () => {
  const FALLBACK = "#6f5b3e";

  it("returns the fallback color when there are no groups", () => {
    expect(colorForPath("/vault/project-plan.md", [], FALLBACK)).toBe(FALLBACK);
  });

  it("returns a matching group's color, matched case-insensitively", () => {
    const groups: GraphColorGroup[] = [{ id: "1", query: "PROJECT", color: "#123456" }];
    expect(colorForPath("/vault/project-plan.md", groups, FALLBACK)).toBe("#123456");
  });

  it("returns the fallback when no group matches", () => {
    const groups: GraphColorGroup[] = [{ id: "1", query: "journal", color: "#123456" }];
    expect(colorForPath("/vault/project-plan.md", groups, FALLBACK)).toBe(FALLBACK);
  });

  it("a group with a blank query never matches", () => {
    const groups: GraphColorGroup[] = [{ id: "1", query: "   ", color: "#123456" }];
    expect(colorForPath("/vault/anything.md", groups, FALLBACK)).toBe(FALLBACK);
  });

  it("the first matching group wins when more than one matches", () => {
    const groups: GraphColorGroup[] = [
      { id: "1", query: "project", color: "#111111" },
      { id: "2", query: "plan", color: "#222222" },
    ];
    expect(colorForPath("/vault/project-plan.md", groups, FALLBACK)).toBe("#111111");
  });
});

describe("computeVisibleGraph", () => {
  const backlinksByPath = new Map([
    ["/vault/a.md", ["/vault/b.md"]],
    ["/vault/b.md", []],
    ["/vault/lonely.md", []],
  ]);

  it("workspace mode, showAll off, hides unconnected notes (existing default behavior)", () => {
    const result = computeVisibleGraph(backlinksByPath, {
      isLocal: false,
      showAll: false,
      filterQuery: "",
    });
    expect(new Set(result.nodes)).toEqual(new Set(["/vault/a.md", "/vault/b.md"]));
  });

  it("workspace mode, showAll on, includes unconnected notes", () => {
    const result = computeVisibleGraph(backlinksByPath, {
      isLocal: false,
      showAll: true,
      filterQuery: "",
    });
    expect(new Set(result.nodes)).toEqual(new Set(["/vault/a.md", "/vault/b.md", "/vault/lonely.md"]));
  });

  it("local mode uses computeLocalGraph instead of the workspace/showAll logic", () => {
    const result = computeVisibleGraph(backlinksByPath, {
      isLocal: true,
      focusPath: "/vault/lonely.md",
      showAll: false,
      filterQuery: "",
    });
    expect(result.nodes).toEqual(["/vault/lonely.md"]);
  });

  it("applies the filter query on top of whichever mode is selected", () => {
    const result = computeVisibleGraph(backlinksByPath, {
      isLocal: false,
      showAll: true,
      filterQuery: "lonely",
    });
    expect(result.nodes).toEqual(["/vault/lonely.md"]);
  });
});

describe("GraphView: filtering", () => {
  function withThreeNodes() {
    linkIndex.value = {
      backlinksByPath: new Map([
        ["/vault/project.md", ["/vault/journal.md"]],
        ["/vault/journal.md", []],
        ["/vault/journal-2.md", ["/vault/project.md"]],
      ]),
      pathsByNoteName: new Map(),
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
    };
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not filter until the debounce elapses", () => {
    withThreeNodes();
    const { getByLabelText, container } = render(<GraphView onOpenFile={vi.fn()} onClose={vi.fn()} />);
    fireEvent.input(getByLabelText("Filter graph notes"), { target: { value: "project" } });

    // Still showing the unfiltered graph (3 connected notes), not yet
    // narrowed down, since the 200ms debounce hasn't elapsed.
    expect(container.querySelector("canvas")).toBeTruthy();
    expect(container.querySelector(".empty-hint")).toBeNull();
  });

  it("filters nodes by name after the debounce elapses", async () => {
    withThreeNodes();
    const { getByLabelText, container } = render(<GraphView onOpenFile={vi.fn()} onClose={vi.fn()} />);
    fireEvent.input(getByLabelText("Filter graph notes"), { target: { value: "nonexistent-note" } });

    // advanceTimersByTimeAsync (not the sync advanceTimersByTime) also
    // flushes the microtask Preact schedules its re-render on, so the
    // resulting setFilterQuery state update is actually reflected in the
    // DOM by the time this resolves.
    await vi.advanceTimersByTimeAsync(200);

    expect(container.querySelector("canvas")).toBeNull();
  });

  it("shows a filter-specific empty message, not the generic connected-notes one", async () => {
    withThreeNodes();
    const { getByLabelText, getByText } = render(<GraphView onOpenFile={vi.fn()} onClose={vi.fn()} />);
    fireEvent.input(getByLabelText("Filter graph notes"), { target: { value: "nonexistent-note" } });

    await vi.advanceTimersByTimeAsync(200);

    expect(getByText("No notes match your filter.")).toBeTruthy();
  });

  it("clearing the filter restores the full graph", async () => {
    withThreeNodes();
    const { getByLabelText, container } = render(<GraphView onOpenFile={vi.fn()} onClose={vi.fn()} />);
    const input = getByLabelText("Filter graph notes");

    fireEvent.input(input, { target: { value: "nonexistent-note" } });
    await vi.advanceTimersByTimeAsync(200);
    expect(container.querySelector("canvas")).toBeNull();

    fireEvent.input(input, { target: { value: "" } });
    await vi.advanceTimersByTimeAsync(200);
    expect(container.querySelector("canvas")).toBeTruthy();
  });
});

describe("GraphView: color groups panel", () => {
  function withOneConnectedNode() {
    linkIndex.value = {
      backlinksByPath: new Map([
        ["/vault/a.md", ["/vault/b.md"]],
        ["/vault/b.md", []],
      ]),
      pathsByNoteName: new Map(),
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
    };
  }

  it("the panel is closed by default", () => {
    withOneConnectedNode();
    const { queryByText } = render(<GraphView onOpenFile={vi.fn()} onClose={vi.fn()} />);
    expect(queryByText("+ Add color group")).toBeNull();
  });

  it("the Colors button opens and closes the panel", () => {
    withOneConnectedNode();
    const { getByLabelText, queryByText } = render(<GraphView onOpenFile={vi.fn()} onClose={vi.fn()} />);

    fireEvent.click(getByLabelText("Color groups"));
    expect(queryByText("+ Add color group")).toBeTruthy();

    fireEvent.click(getByLabelText("Color groups"));
    expect(queryByText("+ Add color group")).toBeNull();
  });

  it("adding a group persists it via updateWorkspaceSettings with an empty query", () => {
    withOneConnectedNode();
    const { getByLabelText, getByText } = render(<GraphView onOpenFile={vi.fn()} onClose={vi.fn()} />);

    fireEvent.click(getByLabelText("Color groups"));
    fireEvent.click(getByText("+ Add color group"));

    expect(mockUpdateWorkspaceSettings).toHaveBeenCalledTimes(1);
    const patch = mockUpdateWorkspaceSettings.mock.calls[0][0];
    expect(patch.graphColorGroups).toHaveLength(1);
    expect(patch.graphColorGroups![0]).toMatchObject({ query: "" });
  });

  it("renders an existing group's query and color, editable", () => {
    withOneConnectedNode();
    mockWorkspaceSettings.value = {
      graphColorGroups: [{ id: "g1", query: "journal", color: "#123456" }],
    };
    const { getByLabelText, getByDisplayValue } = render(
      <GraphView onOpenFile={vi.fn()} onClose={vi.fn()} />,
    );

    fireEvent.click(getByLabelText("Color groups"));
    expect(getByDisplayValue("journal")).toBeTruthy();

    fireEvent.input(getByDisplayValue("journal"), { target: { value: "meeting" } });

    const patch = mockUpdateWorkspaceSettings.mock.calls.at(-1)![0];
    expect(patch.graphColorGroups![0]).toMatchObject({ id: "g1", query: "meeting", color: "#123456" });
  });

  it("removing a group drops it from the persisted list", () => {
    withOneConnectedNode();
    mockWorkspaceSettings.value = {
      graphColorGroups: [{ id: "g1", query: "journal", color: "#123456" }],
    };
    const { getByLabelText } = render(<GraphView onOpenFile={vi.fn()} onClose={vi.fn()} />);

    fireEvent.click(getByLabelText("Color groups"));
    fireEvent.click(getByLabelText("Remove color group"));

    const patch = mockUpdateWorkspaceSettings.mock.calls.at(-1)![0];
    expect(patch.graphColorGroups).toEqual([]);
  });
});
