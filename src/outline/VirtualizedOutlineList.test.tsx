/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { OutlinePanel } from "./OutlinePanel";
import { LARGE_OUTLINE_THRESHOLD, VIRTUAL_ROW_HEIGHT_PX } from "./outlineVirtualization";
import { outlineRevealRequest } from "./outlineNavigation";

// See GraphView.test.tsx's identical note: jsdom provides no ResizeObserver
// and always reports 0 for clientHeight/clientWidth, so both are stubbed to
// a real, deterministic value for the virtualized list's own measurement.
class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
const VIEWPORT_HEIGHT = 280;

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    value: VIEWPORT_HEIGHT,
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  if (originalClientHeight) {
    Object.defineProperty(HTMLElement.prototype, "clientHeight", originalClientHeight);
  }
  outlineRevealRequest.value = null;
});

function makeFlatOutline(count: number): string {
  const lines: string[] = [];
  for (let i = 0; i < count; i++) lines.push(`# Heading ${i}`);
  return lines.join("\n");
}

describe("OutlinePanel: large-outline virtualization threshold", () => {
  it("keeps the plain nested list for a note with exactly the threshold heading count", () => {
    const content = makeFlatOutline(LARGE_OUTLINE_THRESHOLD);
    const { container } = render(<OutlinePanel content={content} />);
    expect(container.querySelector(".outline-list--virtual")).toBeNull();
    expect(container.querySelectorAll(".outline-node").length).toBe(LARGE_OUTLINE_THRESHOLD);
  });

  it("switches to the virtualized list one heading past the threshold", () => {
    const content = makeFlatOutline(LARGE_OUTLINE_THRESHOLD + 1);
    const { container } = render(<OutlinePanel content={content} />);
    const virtualList = container.querySelector(".outline-list--virtual");
    expect(virtualList).not.toBeNull();
    // The whole point: far fewer DOM rows than headings exist.
    const renderedRows = container.querySelectorAll(".outline-node").length;
    expect(renderedRows).toBeGreaterThan(0);
    expect(renderedRows).toBeLessThan(LARGE_OUTLINE_THRESHOLD);
  });
});

describe("VirtualizedOutlineList (via OutlinePanel)", () => {
  it("does not render every heading up front for a very large note", () => {
    const content = makeFlatOutline(2000);
    const { container, getByText } = render(<OutlinePanel content={content} />);
    expect(getByText("Heading 0")).toBeTruthy();
    // Far-down headings are not mounted until scrolled into view.
    expect(container.querySelector("li.outline-node span.outline-text")).toBeTruthy();
    const texts = Array.from(container.querySelectorAll(".outline-text")).map((el) => el.textContent);
    expect(texts).not.toContain("Heading 1999");
  });

  it("renders a far-down heading after scrolling to it, and stops rendering an earlier one", () => {
    const content = makeFlatOutline(2000);
    const { container, getByText, queryByText } = render(<OutlinePanel content={content} />);
    expect(getByText("Heading 0")).toBeTruthy();

    const list = container.querySelector(".outline-list--virtual") as HTMLUListElement;
    expect(list).toBeTruthy();

    const targetIndex = 1500;
    list.scrollTop = targetIndex * VIRTUAL_ROW_HEIGHT_PX;
    fireEvent.scroll(list);

    expect(getByText(`Heading ${targetIndex}`)).toBeTruthy();
    expect(queryByText("Heading 0")).toBeNull();
  });

  it("selecting a scrolled-to row still requests the correct reveal range", () => {
    const content = makeFlatOutline(1000);
    const { container, getByText } = render(<OutlinePanel content={content} />);
    const list = container.querySelector(".outline-list--virtual") as HTMLUListElement;

    const targetIndex = 700;
    list.scrollTop = targetIndex * VIRTUAL_ROW_HEIGHT_PX;
    fireEvent.scroll(list);

    const row = getByText(`Heading ${targetIndex}`);
    fireEvent.click(row);

    const expectedFrom = content.indexOf(`# Heading ${targetIndex}`) + "# ".length;
    expect(outlineRevealRequest.value).not.toBeNull();
    expect(outlineRevealRequest.value?.from).toBe(expectedFrom);
  });

  it("collapsing an ancestor hides its descendants from the virtualized window", () => {
    const lines = ["# Root"];
    for (let i = 0; i < 600; i++) lines.push(`## Child ${i}`);
    const { container, getByLabelText, queryByText, getByText } = render(
      <OutlinePanel content={lines.join("\n")} />,
    );
    expect(getByText("Child 0")).toBeTruthy();

    fireEvent.click(getByLabelText("Collapse Root"));

    expect(queryByText("Child 0")).toBeNull();
    expect(container.querySelectorAll(".outline-node").length).toBe(1);
  });

  it("filtering a large outline shows only matches and their ancestors in the virtualized list", () => {
    const lines = ["# Section"];
    for (let i = 0; i < 600; i++) lines.push(`## Item ${i}`);
    const { container, getByLabelText, getByText, queryByText } = render(
      <OutlinePanel content={lines.join("\n")} />,
    );

    // "Item 599" is a substring match only of itself: every other label in
    // this 0-599 fixture range would need a nonexistent "Item 5990"-style
    // suffix to also match, unlike a shorter filter such as "Item 42",
    // which also matches "Item 420"-"Item 429".
    fireEvent.input(getByLabelText("Filter headings"), { target: { value: "Item 599" } });

    expect(getByText("Item 599")).toBeTruthy();
    expect(getByText("Section")).toBeTruthy(); // ancestor stays reachable
    expect(queryByText("Item 598")).toBeNull();
    expect(container.querySelectorAll(".outline-node").length).toBe(2);
  });

  it("recovers a visible, non-empty window after filtering shrinks the list out from under a deep scroll position", () => {
    // Regression guard for the windowing shortcut itself (see
    // CONSTITUTION.md's "performance shortcut" rule): scrolling deep into
    // a large list, then shrinking it (here, via the filter box, which
    // stays reachable regardless of scroll position since it sits above
    // the virtualized container) so the old scrollTop lands past the new,
    // much shorter content. If computeVirtualWindow's clamping were wrong,
    // this would render an empty or out-of-range slice instead of
    // recovering.
    const lines = ["# Section"];
    for (let i = 0; i < 600; i++) lines.push(`## Item ${i}`);
    const { container, getByLabelText, getByText, queryByText } = render(
      <OutlinePanel content={lines.join("\n")} />,
    );

    const list = container.querySelector(".outline-list--virtual") as HTMLUListElement;
    list.scrollTop = 580 * VIRTUAL_ROW_HEIGHT_PX;
    fireEvent.scroll(list);
    expect(getByText("Item 580")).toBeTruthy();

    fireEvent.input(getByLabelText("Filter headings"), { target: { value: "Item 599" } });

    expect(container.querySelectorAll(".outline-node").length).toBe(2);
    expect(getByText("Item 599")).toBeTruthy();
    expect(getByText("Section")).toBeTruthy();
    expect(queryByText("Item 580")).toBeNull();
  });
});
