/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { TabBar } from "./TabBar";
import type { OpenTab } from "./types";

afterEach(() => {
  cleanup();
});

function tab(path: string, name: string, dirty = false): OpenTab {
  return { path, name, content: "", kind: "text", dirty, saveError: null };
}

function noop() {}

describe("TabBar", () => {
  it("renders nothing when there are no open tabs", () => {
    const { container } = render(
      <TabBar
        tabs={[]}
        activePath={null}
        onSelect={noop}
        onClose={noop}
        onCloseOthers={noop}
        onCloseAll={noop}
        onRename={noop}
      />,
    );
    expect(container.querySelector(".tab-bar")).toBeNull();
  });

  it("marks the active tab and shows a dirty indicator for unsaved tabs", () => {
    const tabs = [tab("/a.md", "a.md"), tab("/b.md", "b.md", true)];
    const { container, getByText } = render(
      <TabBar
        tabs={tabs}
        activePath="/a.md"
        onSelect={noop}
        onClose={noop}
        onCloseOthers={noop}
        onCloseAll={noop}
        onRename={noop}
      />,
    );
    const tabEls = container.querySelectorAll(".tab");
    expect(tabEls[0].className).toContain("tab-active");
    expect(tabEls[1].className).not.toContain("tab-active");
    expect(getByText("b.md •")).toBeTruthy();
  });

  it("clicking a tab selects it", () => {
    const onSelect = vi.fn();
    const { getByText } = render(
      <TabBar
        tabs={[tab("/a.md", "a.md")]}
        activePath={null}
        onSelect={onSelect}
        onClose={noop}
        onCloseOthers={noop}
        onCloseAll={noop}
        onRename={noop}
      />,
    );
    fireEvent.click(getByText("a.md"));
    expect(onSelect).toHaveBeenCalledWith("/a.md");
  });

  it("clicking a tab's close button closes it without also selecting it", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const { getByLabelText } = render(
      <TabBar
        tabs={[tab("/a.md", "a.md")]}
        activePath={null}
        onSelect={onSelect}
        onClose={onClose}
        onCloseOthers={noop}
        onCloseAll={noop}
        onRename={noop}
      />,
    );
    fireEvent.click(getByLabelText("Close a.md"));
    expect(onClose).toHaveBeenCalledWith("/a.md");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("right-clicking a tab opens a context menu whose Rename targets that tab", () => {
    const onRename = vi.fn();
    const tabs = [tab("/a.md", "a.md"), tab("/b.md", "b.md")];
    const { getByText } = render(
      <TabBar
        tabs={tabs}
        activePath="/a.md"
        onSelect={noop}
        onClose={noop}
        onCloseOthers={noop}
        onCloseAll={noop}
        onRename={onRename}
      />,
    );
    fireEvent.contextMenu(getByText("b.md"));
    fireEvent.click(getByText("Rename"));
    expect(onRename).toHaveBeenCalledWith("/b.md", "b.md");
  });

  it("context menu Close closes the right-clicked tab, not necessarily the active one", () => {
    const onClose = vi.fn();
    const tabs = [tab("/a.md", "a.md"), tab("/b.md", "b.md")];
    const { getByText } = render(
      <TabBar
        tabs={tabs}
        activePath="/a.md"
        onSelect={noop}
        onClose={onClose}
        onCloseOthers={noop}
        onCloseAll={noop}
        onRename={noop}
      />,
    );
    fireEvent.contextMenu(getByText("b.md"));
    fireEvent.click(getByText("Close"));
    expect(onClose).toHaveBeenCalledWith("/b.md");
  });

  it("disables Close Others when there's only one tab open", () => {
    const { getByText } = render(
      <TabBar
        tabs={[tab("/a.md", "a.md")]}
        activePath="/a.md"
        onSelect={noop}
        onClose={noop}
        onCloseOthers={noop}
        onCloseAll={noop}
        onRename={noop}
      />,
    );
    fireEvent.contextMenu(getByText("a.md"));
    expect((getByText("Close Others") as HTMLButtonElement).disabled).toBe(true);
  });

  it("enables Close Others with more than one tab open, and wires it to the right-clicked path", () => {
    const onCloseOthers = vi.fn();
    const tabs = [tab("/a.md", "a.md"), tab("/b.md", "b.md")];
    const { getByText } = render(
      <TabBar
        tabs={tabs}
        activePath="/a.md"
        onSelect={noop}
        onClose={noop}
        onCloseOthers={onCloseOthers}
        onCloseAll={noop}
        onRename={noop}
      />,
    );
    fireEvent.contextMenu(getByText("b.md"));
    const closeOthers = getByText("Close Others") as HTMLButtonElement;
    expect(closeOthers.disabled).toBe(false);
    fireEvent.click(closeOthers);
    expect(onCloseOthers).toHaveBeenCalledWith("/b.md");
  });

  it("keeps a pinned tab out of ordinary close actions and exposes explicit unpin controls", () => {
    const onClose = vi.fn();
    const onUnpinAndClose = vi.fn();
    const { getByText, queryByLabelText } = render(
      <TabBar
        tabs={[tab("/a.md", "a.md"), tab("/b.md", "b.md")]}
        pinnedPaths={["/a.md"]}
        activePath="/a.md"
        onSelect={noop}
        onClose={onClose}
        onCloseOthers={noop}
        onCloseAll={noop}
        onRename={noop}
        onUnpinAndClose={onUnpinAndClose}
      />,
    );

    expect(queryByLabelText("Close a.md")).toBeNull();
    expect(getByText("Pinned")).toBeTruthy();
    fireEvent.contextMenu(getByText("a.md"));
    fireEvent.click(getByText("Unpin and close"));
    expect(onUnpinAndClose).toHaveBeenCalledWith("/a.md");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("clicking elsewhere in the window dismisses the open context menu", () => {
    const tabs = [tab("/a.md", "a.md")];
    const { getByText, queryByText } = render(
      <TabBar
        tabs={tabs}
        activePath="/a.md"
        onSelect={noop}
        onClose={noop}
        onCloseOthers={noop}
        onCloseAll={noop}
        onRename={noop}
      />,
    );
    fireEvent.contextMenu(getByText("a.md"));
    expect(queryByText("Rename")).toBeTruthy();

    fireEvent.click(window);
    expect(queryByText("Rename")).toBeNull();
  });
});
