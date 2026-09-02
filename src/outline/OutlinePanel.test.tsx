/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/preact";
import { computeDuplicateFlags, computeVisibleIndexes, OutlinePanel } from "./OutlinePanel";
import { scanHeadings } from "../markdown/headings";
import { outlineInsertRequest, outlineRevealRequest } from "./outlineNavigation";

afterEach(() => {
  cleanup();
  outlineRevealRequest.value = null;
  outlineInsertRequest.value = null;
});

// Every fixture below scans as a text note; noteTitle only matters to the
// Copy link action's own tests, which set it explicitly.
const noteTitle = "Note";

describe("OutlinePanel", () => {
  it("shows a placeholder when the note has no headings", () => {
    const { getByText } = render(<OutlinePanel content="Just a paragraph." noteTitle={noteTitle} />);
    expect(getByText("This note has no headings.")).toBeTruthy();
  });

  it("renders headings in hierarchical, indented order", () => {
    const content = "# Product\n### Constraints\n## Delivery\n#### Android\n";
    const { getByText } = render(<OutlinePanel content={content} noteTitle={noteTitle} />);
    expect(getByText("Product")).toBeTruthy();
    expect(getByText("Constraints")).toBeTruthy();
    expect(getByText("Delivery")).toBeTruthy();
    expect(getByText("Android")).toBeTruthy();
    // Android is indented deeper than Delivery, its parent.
    const deliveryRow = getByText("Delivery").closest(".outline-row") as HTMLElement;
    const androidRow = getByText("Android").closest(".outline-row") as HTMLElement;
    const deliveryIndent = parseInt(deliveryRow.style.paddingLeft, 10);
    const androidIndent = parseInt(androidRow.style.paddingLeft, 10);
    expect(androidIndent).toBeGreaterThan(deliveryIndent);
  });

  it("shows an untitled placeholder for an empty heading", () => {
    const { getByText } = render(<OutlinePanel content={"#\nBody"} noteTitle={noteTitle} />);
    expect(getByText("(Untitled heading)")).toBeTruthy();
  });

  it("requests a reveal of the heading's content range and calls onNavigated when a row is clicked", () => {
    const content = "Intro\n\n## Section one\n\nBody.";
    const onNavigated = vi.fn();
    const { getByText } = render(
      <OutlinePanel content={content} noteTitle={noteTitle} onNavigated={onNavigated} />,
    );
    fireEvent.click(getByText("Section one"));

    const expected = scanHeadings(content)[0];
    expect(outlineRevealRequest.value).not.toBeNull();
    expect(outlineRevealRequest.value?.from).toBe(expected.contentFrom);
    expect(outlineRevealRequest.value?.to).toBe(expected.contentTo);
    expect(onNavigated).toHaveBeenCalledTimes(1);
  });

  it("does not show a filter field under the heading-count threshold", () => {
    const { queryByLabelText } = render(<OutlinePanel content={"# One\n## Two\n"} noteTitle={noteTitle} />);
    expect(queryByLabelText("Filter headings")).toBeNull();
  });

  it("shows and applies a filter field once the note has more than 20 headings", () => {
    const lines: string[] = [];
    for (let i = 0; i < 25; i++) lines.push(`## Heading ${i}`);
    const { getByLabelText, getByText, queryByText } = render(
      <OutlinePanel content={lines.join("\n")} noteTitle={noteTitle} />,
    );
    const filter = getByLabelText("Filter headings") as HTMLInputElement;
    fireEvent.input(filter, { target: { value: "Heading 3" } });
    // "Heading 3" only literally matches the row itself here since none of
    // these headings are nested (no ancestor chain to also keep visible).
    expect(getByText("Heading 3")).toBeTruthy();
    expect(queryByText("Heading 0")).toBeNull();
  });

  it("shows a no-match state with a working clear-filter action", () => {
    const lines: string[] = [];
    for (let i = 0; i < 25; i++) lines.push(`## Heading ${i}`);
    const { getByLabelText, getByText, queryByText } = render(
      <OutlinePanel content={lines.join("\n")} noteTitle={noteTitle} />,
    );
    const filter = getByLabelText("Filter headings") as HTMLInputElement;
    fireEvent.input(filter, { target: { value: "nothing matches this" } });
    expect(getByText("No headings match.")).toBeTruthy();
    fireEvent.click(getByText("Clear filter"));
    expect(queryByText("No headings match.")).toBeNull();
    expect(getByText("Heading 0")).toBeTruthy();
  });

  it("collapsing a node hides only its descendant rows", () => {
    const content = "# Parent\n## Child\n";
    const { getByText, queryByText, getByLabelText } = render(
      <OutlinePanel content={content} noteTitle={noteTitle} />,
    );
    expect(getByText("Child")).toBeTruthy();
    fireEvent.click(getByLabelText("Collapse Parent"));
    expect(queryByText("Child")).toBeNull();
    expect(getByText("Parent")).toBeTruthy();
    fireEvent.click(getByLabelText("Expand Parent"));
    expect(getByText("Child")).toBeTruthy();
  });

  it("Expand all and Collapse all affect every collapsible node", () => {
    const content = "# A\n## A1\n# B\n## B1\n";
    const { getByText, queryByText } = render(<OutlinePanel content={content} noteTitle={noteTitle} />);
    fireEvent.click(getByText("Collapse all"));
    expect(queryByText("A1")).toBeNull();
    expect(queryByText("B1")).toBeNull();
    fireEvent.click(getByText("Expand all"));
    expect(getByText("A1")).toBeTruthy();
    expect(getByText("B1")).toBeTruthy();
  });

  it("marks every occurrence of a duplicated heading, including the first", () => {
    const content = "# Overview\n## Overview\n# Unique\n";
    const { getAllByLabelText, queryAllByLabelText } = render(
      <OutlinePanel content={content} noteTitle={noteTitle} />,
    );
    expect(getAllByLabelText("Duplicate heading text")).toHaveLength(2);
    expect(queryAllByLabelText("Duplicate heading text")).toHaveLength(2);
  });
});

describe("OutlinePanel: copy and insert heading-link actions (F06 Phase 3)", () => {
  function setClipboard() {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    return writeText;
  }

  it("copies the note-qualified F04 link text for a unique heading", async () => {
    const writeText = setClipboard();
    const content = "## Section one\nBody.";
    const { getByRole } = render(
      <OutlinePanel content={content} noteTitle="My Note" />,
    );
    await act(async () => {
      fireEvent.click(getByRole("button", { name: "Copy link to Section one" }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith("[[My Note#Section one]]");
  });

  it("shows a local confirmation after copying, then reverts", async () => {
    vi.useFakeTimers();
    setClipboard();
    const content = "## Section one\nBody.";
    const { getByRole, getByText, queryByText } = render(
      <OutlinePanel content={content} noteTitle="My Note" />,
    );
    await act(async () => {
      fireEvent.click(getByRole("button", { name: "Copy link to Section one" }));
      // Two microtask hops: one for copyHeadingLink's own await on
      // navigator.clipboard.writeText, one for handleCopy awaiting
      // copyHeadingLink's returned promise in turn.
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(getByText("Copied")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(queryByText("Copied")).toBeNull();
    vi.useRealTimers();
  });

  it("requests inserting the same-note F04 link text through outlineNavigation", () => {
    const content = "## Section one\nBody.";
    const { getByRole } = render(
      <OutlinePanel content={content} noteTitle="My Note" />,
    );
    fireEvent.click(getByRole("button", { name: "Insert link to Section one at the cursor" }));
    expect(outlineInsertRequest.value?.text).toBe("[[#Section one]]");
  });

  it("calls onNavigated after a successful insert, same as selecting a row", () => {
    const content = "## Section one\nBody.";
    const onNavigated = vi.fn();
    const { getByRole } = render(
      <OutlinePanel content={content} noteTitle="My Note" onNavigated={onNavigated} />,
    );
    fireEvent.click(getByRole("button", { name: "Insert link to Section one at the cursor" }));
    expect(onNavigated).toHaveBeenCalledTimes(1);
  });

  it("disables both actions for a duplicate heading rather than copying an ambiguous link", () => {
    const content = "# Overview\n## Overview\n";
    const { getAllByLabelText } = render(<OutlinePanel content={content} noteTitle="My Note" />);
    // Both Copy link and Insert link share the disabled-reason text as
    // their accessible name while disabled; two duplicate headings times
    // two actions each is four matching buttons.
    const disabledButtons = getAllByLabelText(
      "This heading's text repeats elsewhere in the note, so a link to it would be ambiguous.",
    );
    expect(disabledButtons).toHaveLength(4);
    for (const button of disabledButtons) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("disables both actions for an untitled (empty) heading", () => {
    const { getAllByLabelText } = render(<OutlinePanel content={"#\nBody"} noteTitle="My Note" />);
    const disabledButtons = getAllByLabelText("This heading has no text to link to.");
    expect(disabledButtons).toHaveLength(2);
    for (const button of disabledButtons) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("disables Insert link but not Copy link when canInsertLink is false", () => {
    setClipboard();
    const content = "## Section one\nBody.";
    const { getByRole } = render(
      <OutlinePanel content={content} noteTitle="My Note" canInsertLink={false} />,
    );
    expect(
      (getByRole("button", { name: "Copy link to Section one" }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(
      (getByRole("button", { name: /Insert link to Section one/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

describe("OutlinePanel content updates", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("rescans after the debounce when content changes, and a newer change supersedes an older pending scan", () => {
    const { rerender, getByText, queryByText } = render(
      <OutlinePanel content={"# One\n"} noteTitle={noteTitle} />,
    );
    expect(getByText("One")).toBeTruthy();

    act(() => rerender(<OutlinePanel content={"# One\n## Two\n"} noteTitle={noteTitle} />));
    act(() => {
      vi.advanceTimersByTime(50);
    });
    act(() => rerender(<OutlinePanel content={"# One\n## Three\n"} noteTitle={noteTitle} />));
    act(() => {
      vi.advanceTimersByTime(50);
    });
    // The first pending scan (74ms after its own schedule) never got to
    // run since the second edit's effect cleanup cancelled its timer.
    expect(queryByText("Two")).toBeNull();
    expect(queryByText("Three")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(getByText("Three")).toBeTruthy();
    expect(queryByText("Two")).toBeNull();
  });
});

describe("computeDuplicateFlags", () => {
  it("flags every heading sharing a normalized key", () => {
    const headings = scanHeadings("# One\n## one\n# Two\n");
    expect(computeDuplicateFlags(headings)).toEqual([true, true, false]);
  });
});

describe("computeVisibleIndexes", () => {
  it("includes a match's whole ancestor chain", () => {
    const headings = scanHeadings("# Grandparent\n## Parent\n### Match\n### Unrelated\n# Other\n");
    const visible = computeVisibleIndexes(headings, "match");
    const byText = new Map(headings.map((h, i) => [h.displayText, i]));
    expect(visible.has(byText.get("Match")!)).toBe(true);
    expect(visible.has(byText.get("Parent")!)).toBe(true);
    expect(visible.has(byText.get("Grandparent")!)).toBe(true);
    expect(visible.has(byText.get("Unrelated")!)).toBe(false);
    expect(visible.has(byText.get("Other")!)).toBe(false);
  });
});
