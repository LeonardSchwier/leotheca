/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { act } from "preact/test-utils";
import { Tooltip } from "./Tooltip";

afterEach(cleanup);

describe("Tooltip", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the trigger with no tooltip bubble and no aria-describedby before any interaction", () => {
    const { getByRole, queryByRole } = render(
      <Tooltip content="Files">
        <button>File</button>
      </Tooltip>,
    );
    expect(queryByRole("tooltip")).toBeNull();
    expect(getByRole("button").getAttribute("aria-describedby")).toBeNull();
  });

  it("shows the tooltip after the hover delay elapses, not before", async () => {
    const { getByRole, queryByRole } = render(
      <Tooltip content="Files">
        <button>File</button>
      </Tooltip>,
    );
    fireEvent.mouseEnter(getByRole("button"));
    expect(queryByRole("tooltip")).toBeNull();

    await vi.advanceTimersByTimeAsync(399);
    expect(queryByRole("tooltip")).toBeNull();

    await vi.advanceTimersByTimeAsync(1);
    expect(getByRole("tooltip").textContent).toBe("Files");
  });

  it("links the trigger to the tooltip via aria-describedby once shown", async () => {
    const { getByRole } = render(
      <Tooltip content="Files">
        <button>File</button>
      </Tooltip>,
    );
    fireEvent.mouseEnter(getByRole("button"));
    await vi.advanceTimersByTimeAsync(400);
    const tooltip = getByRole("tooltip");
    const button = getByRole("button");
    expect(button.getAttribute("aria-describedby")).toBe(tooltip.id);
  });

  it("cancels a pending hover-open when the pointer leaves before the delay elapses", async () => {
    const { getByRole, queryByRole } = render(
      <Tooltip content="Files">
        <button>File</button>
      </Tooltip>,
    );
    fireEvent.mouseEnter(getByRole("button"));
    await vi.advanceTimersByTimeAsync(200);
    fireEvent.mouseLeave(getByRole("button"));
    await vi.advanceTimersByTimeAsync(400);
    expect(queryByRole("tooltip")).toBeNull();
  });

  it("hides immediately on mouse leave once shown", async () => {
    const { getByRole, queryByRole } = render(
      <Tooltip content="Files">
        <button>File</button>
      </Tooltip>,
    );
    fireEvent.mouseEnter(getByRole("button"));
    await vi.advanceTimersByTimeAsync(400);
    expect(queryByRole("tooltip")).not.toBeNull();

    fireEvent.mouseLeave(getByRole("button"));
    expect(queryByRole("tooltip")).toBeNull();
  });

  it("shows the tooltip immediately on keyboard focus, with no delay", () => {
    const { getByRole, queryByRole } = render(
      <Tooltip content="Files">
        <button>File</button>
      </Tooltip>,
    );
    fireEvent.focus(getByRole("button"));
    expect(getByRole("tooltip").textContent).toBe("Files");
    expect(queryByRole("tooltip")).not.toBeNull();
  });

  it("hides on blur", () => {
    const { getByRole, queryByRole } = render(
      <Tooltip content="Files">
        <button>File</button>
      </Tooltip>,
    );
    fireEvent.focus(getByRole("button"));
    expect(queryByRole("tooltip")).not.toBeNull();
    fireEvent.blur(getByRole("button"));
    expect(queryByRole("tooltip")).toBeNull();
  });

  it("dismisses an open, focus-shown tooltip on Escape without requiring focus to move", () => {
    const { getByRole, queryByRole } = render(
      <Tooltip content="Files">
        <button>File</button>
      </Tooltip>,
    );
    // Calling the real .focus() (not just dispatching a synthetic focus
    // event) so jsdom's document.activeElement actually reflects it, which
    // is what this test needs to check.
    const button = getByRole("button") as HTMLButtonElement;
    act(() => {
      button.focus();
    });
    expect(queryByRole("tooltip")).not.toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(queryByRole("tooltip")).toBeNull();
    // Escape dismisses the tooltip but is not expected to blur the trigger.
    expect(document.activeElement).toBe(button);
  });

  it("dismisses an open, hover-shown tooltip on Escape even though the trigger never received focus", async () => {
    const { getByRole, queryByRole } = render(
      <Tooltip content="Files">
        <button>File</button>
      </Tooltip>,
    );
    fireEvent.mouseEnter(getByRole("button"));
    await vi.advanceTimersByTimeAsync(400);
    expect(queryByRole("tooltip")).not.toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(queryByRole("tooltip")).toBeNull();
  });

  it("does nothing on a key other than Escape while open", () => {
    const { getByRole, queryByRole } = render(
      <Tooltip content="Files">
        <button>File</button>
      </Tooltip>,
    );
    fireEvent.focus(getByRole("button"));
    fireEvent.keyDown(document, { key: "Enter" });
    expect(queryByRole("tooltip")).not.toBeNull();
  });

  it("never shows when disabled, and never sets aria-describedby", async () => {
    const { getByRole, queryByRole } = render(
      <Tooltip content="Files" disabled>
        <button>File</button>
      </Tooltip>,
    );
    fireEvent.mouseEnter(getByRole("button"));
    await vi.advanceTimersByTimeAsync(1000);
    fireEvent.focus(getByRole("button"));
    expect(queryByRole("tooltip")).toBeNull();
    expect(getByRole("button").getAttribute("aria-describedby")).toBeNull();
  });

  it("never shows for empty content", () => {
    const { getByRole, queryByRole } = render(
      <Tooltip content="">
        <button>File</button>
      </Tooltip>,
    );
    fireEvent.focus(getByRole("button"));
    expect(queryByRole("tooltip")).toBeNull();
  });

  it("respects a custom delay", async () => {
    const { getByRole, queryByRole } = render(
      <Tooltip content="Files" delay={1000}>
        <button>File</button>
      </Tooltip>,
    );
    fireEvent.mouseEnter(getByRole("button"));
    await vi.advanceTimersByTimeAsync(400);
    expect(queryByRole("tooltip")).toBeNull();
    await vi.advanceTimersByTimeAsync(600);
    expect(queryByRole("tooltip")).not.toBeNull();
  });

  it("defaults to top placement and applies the placement class to anchor and bubble", () => {
    const { getByRole, container } = render(
      <Tooltip content="Files">
        <button>File</button>
      </Tooltip>,
    );
    fireEvent.focus(getByRole("button"));
    expect(container.querySelector(".tooltip-anchor-top")).not.toBeNull();
    expect(getByRole("tooltip").className).toContain("tooltip-bubble-top");
  });

  it("applies a requested placement to both anchor and bubble", () => {
    const { getByRole, container } = render(
      <Tooltip content="Files" placement="right">
        <button>File</button>
      </Tooltip>,
    );
    fireEvent.focus(getByRole("button"));
    expect(container.querySelector(".tooltip-anchor-right")).not.toBeNull();
    expect(getByRole("tooltip").className).toContain("tooltip-bubble-right");
  });

  it("preserves the trigger's own event handlers alongside its own", () => {
    const onMouseEnter = vi.fn();
    const onFocus = vi.fn();
    const { getByRole } = render(
      <Tooltip content="Files">
        <button onMouseEnter={onMouseEnter} onFocus={onFocus}>
          File
        </button>
      </Tooltip>,
    );
    fireEvent.mouseEnter(getByRole("button"));
    fireEvent.focus(getByRole("button"));
    expect(onMouseEnter).toHaveBeenCalledTimes(1);
    expect(onFocus).toHaveBeenCalledTimes(1);
  });

  it("does not clobber a trigger's own pre-existing aria-describedby", () => {
    const { getByRole } = render(
      <Tooltip content="Files">
        <button aria-describedby="external-desc">File</button>
      </Tooltip>,
    );
    fireEvent.focus(getByRole("button"));
    const describedBy =
      getByRole("button").getAttribute("aria-describedby") ?? "";
    expect(describedBy.split(" ")).toContain("external-desc");
    expect(describedBy.split(" ")).toContain(getByRole("tooltip").id);
  });

  it("removing the trigger from the DOM while a hover-open timer is pending does not throw", async () => {
    const { getByRole, unmount } = render(
      <Tooltip content="Files">
        <button>File</button>
      </Tooltip>,
    );
    fireEvent.mouseEnter(getByRole("button"));
    unmount();
    await expect(vi.advanceTimersByTimeAsync(1000)).resolves.not.toThrow();
  });

  it("works with a non-button focusable trigger such as a tabbable status span", () => {
    const { getByRole } = render(
      <Tooltip content="Loading">
        <span role="status" tabIndex={0}>
          ...
        </span>
      </Tooltip>,
    );
    fireEvent.focus(getByRole("status"));
    expect(getByRole("tooltip").textContent).toBe("Loading");
  });
});
