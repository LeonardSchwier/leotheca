/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { linkIndex } from "../linking/store";

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
  linkIndex.value = { backlinksByPath: new Map(), pathsByNoteName: new Map() };
});

// A deterministic layout, one node at a known screen position, regardless
// of the real force-directed layout's output — this test is about
// GraphView's own interaction logic (double-tap, drag start), not the
// layout math itself (see layout.test.ts for that).
vi.mock("./layout", () => ({
  computeLayout: () => new Map([["/vault/a.md", { x: 100, y: 100 }]]),
}));

const { GraphView, computeConnectedPaths } = await import("./GraphView");

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
    };
  }

  it("shows the connected-only placeholder, not the generic empty-vault one, when every note is isolated", () => {
    linkIndex.value = {
      backlinksByPath: new Map([
        ["/vault/lonely-1.md", []],
        ["/vault/lonely-2.md", []],
      ]),
      pathsByNoteName: new Map(),
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
