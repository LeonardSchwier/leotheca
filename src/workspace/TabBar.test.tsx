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

function fakeDataTransfer() {
  let stored = "";
  return {
    setData: (_type: string, value: string) => {
      stored = value;
    },
    getData: () => stored,
    effectAllowed: "",
  };
}

describe("TabBar: reordering (F07 Phase 3 follow-up)", () => {
  it("dragging a tab and dropping it on another calls onReorder(dragged, target)", () => {
    const onReorder = vi.fn();
    const tabs = [tab("/a.md", "a.md"), tab("/b.md", "b.md"), tab("/c.md", "c.md")];
    const { getByText } = render(
      <TabBar
        tabs={tabs}
        activePath="/a.md"
        onSelect={noop}
        onClose={noop}
        onCloseOthers={noop}
        onCloseAll={noop}
        onRename={noop}
        onReorder={onReorder}
      />,
    );
    const dataTransfer = fakeDataTransfer();
    fireEvent.dragStart(getByText("c.md"), { dataTransfer });
    fireEvent.drop(getByText("a.md"), { dataTransfer });

    expect(onReorder).toHaveBeenCalledWith("/c.md", "/a.md");
  });

  it("dropping on the tab bar's own empty space moves the dragged tab to the end (beforePath: null)", () => {
    const onReorder = vi.fn();
    const tabs = [tab("/a.md", "a.md"), tab("/b.md", "b.md")];
    const { getByText, container } = render(
      <TabBar
        tabs={tabs}
        activePath="/a.md"
        onSelect={noop}
        onClose={noop}
        onCloseOthers={noop}
        onCloseAll={noop}
        onRename={noop}
        onReorder={onReorder}
      />,
    );
    const dataTransfer = fakeDataTransfer();
    fireEvent.dragStart(getByText("a.md"), { dataTransfer });
    fireEvent.drop(container.querySelector(".tab-bar")!, { dataTransfer });

    expect(onReorder).toHaveBeenCalledWith("/a.md", null);
  });

  it("dropping on the same tab it was dragged from does not call onReorder (no-op self-drop)", () => {
    const onReorder = vi.fn();
    const tabs = [tab("/a.md", "a.md"), tab("/b.md", "b.md")];
    const { getByText } = render(
      <TabBar
        tabs={tabs}
        activePath="/a.md"
        onSelect={noop}
        onClose={noop}
        onCloseOthers={noop}
        onCloseAll={noop}
        onRename={noop}
        onReorder={onReorder}
      />,
    );
    const dataTransfer = fakeDataTransfer();
    fireEvent.dragStart(getByText("a.md"), { dataTransfer });
    fireEvent.drop(getByText("a.md"), { dataTransfer });

    expect(onReorder).not.toHaveBeenCalled();
  });

  it("tabs are not draggable, and no drag handlers attach, when onReorder is omitted", () => {
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
    expect(getByText("a.md").closest(".tab")?.getAttribute("draggable")).toBe("false");
  });

  it("the context menu's Move left/Move right call onMoveLeft/onMoveRight with the right-clicked path", () => {
    const onMoveLeft = vi.fn();
    const onMoveRight = vi.fn();
    const tabs = [tab("/a.md", "a.md"), tab("/b.md", "b.md")];
    const { getByText } = render(
      <TabBar
        tabs={tabs}
        activePath="/a.md"
        onSelect={noop}
        onClose={noop}
        onCloseOthers={noop}
        onCloseAll={noop}
        onRename={noop}
        onMoveLeft={onMoveLeft}
        onMoveRight={onMoveRight}
      />,
    );
    fireEvent.contextMenu(getByText("b.md"));
    fireEvent.click(getByText("Move left"));
    expect(onMoveLeft).toHaveBeenCalledWith("/b.md");

    fireEvent.contextMenu(getByText("b.md"));
    fireEvent.click(getByText("Move right"));
    expect(onMoveRight).toHaveBeenCalledWith("/b.md");
  });
});
