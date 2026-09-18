/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { Menu, type MenuItem } from "./Menu";

const INITIAL_INNER_WIDTH = window.innerWidth;
const INITIAL_INNER_HEIGHT = window.innerHeight;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: INITIAL_INNER_WIDTH,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: INITIAL_INNER_HEIGHT,
  });
});

function rect({
  left = 0,
  top = 0,
  width = 0,
  height = 0,
}: Partial<DOMRect> = {}): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  };
}

function items(overrides: Partial<MenuItem>[] = []): MenuItem[] {
  return [
    { id: "rename", label: "Rename", onSelect: vi.fn(), ...overrides[0] },
    { id: "copy", label: "Copy path", onSelect: vi.fn(), ...overrides[1] },
    { id: "delete", label: "Delete", onSelect: vi.fn(), ...overrides[2] },
  ];
}

function TestMenu({
  menuItems = items(),
  disabled = false,
}: {
  menuItems?: MenuItem[];
  disabled?: boolean;
}) {
  return (
    <Menu
      label="More actions"
      title="More actions"
      trigger={<span aria-hidden="true">•••</span>}
      items={menuItems}
      disabled={disabled}
    />
  );
}

describe("Menu", () => {
  it("renders a labeled disclosure that is closed by default", () => {
    const { getByLabelText, queryByRole } = render(<TestMenu />);
    const trigger = getByLabelText("More actions");
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("title")).toBe("More actions");
    expect(queryByRole("menu")).toBeNull();
  });

  it("opens on click, links the popup, and focuses the first enabled item", () => {
    const { getByLabelText, getByRole } = render(<TestMenu />);
    const trigger = getByLabelText("More actions");
    fireEvent.click(trigger);

    const menu = getByRole("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.getAttribute("aria-controls")).toBe(menu.id);
    expect(document.activeElement).toBe(
      getByRole("menuitem", { name: "Rename" }),
    );
  });

  it("skips disabled items when choosing initial focus", () => {
    const menuItems = items([{ disabled: true }, {}, {}]);
    const { getByLabelText, getByRole } = render(
      <TestMenu menuItems={menuItems} />,
    );
    fireEvent.click(getByLabelText("More actions"));
    expect(document.activeElement).toBe(
      getByRole("menuitem", { name: "Copy path" }),
    );
  });

  it("opens with ArrowDown on the first enabled item and ArrowUp on the last", () => {
    const { getByLabelText, getByRole, queryByRole } = render(<TestMenu />);
    const trigger = getByLabelText("More actions");

    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(document.activeElement).toBe(
      getByRole("menuitem", { name: "Rename" }),
    );
    fireEvent.keyDown(getByRole("menu"), { key: "Escape" });
    expect(queryByRole("menu")).toBeNull();

    fireEvent.keyDown(trigger, { key: "ArrowUp" });
    expect(document.activeElement).toBe(
      getByRole("menuitem", { name: "Delete" }),
    );
  });

  it("moves with arrows, wraps, and skips disabled items", () => {
    const menuItems = items([{}, { disabled: true }, {}]);
    const { getByLabelText, getByRole } = render(
      <TestMenu menuItems={menuItems} />,
    );
    fireEvent.click(getByLabelText("More actions"));
    const menu = getByRole("menu");

    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(
      getByRole("menuitem", { name: "Delete" }),
    );
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(
      getByRole("menuitem", { name: "Rename" }),
    );
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(document.activeElement).toBe(
      getByRole("menuitem", { name: "Delete" }),
    );
  });

  it("supports Home and End navigation", () => {
    const { getByLabelText, getByRole } = render(<TestMenu />);
    fireEvent.click(getByLabelText("More actions"));
    const menu = getByRole("menu");

    fireEvent.keyDown(menu, { key: "End" });
    expect(document.activeElement).toBe(
      getByRole("menuitem", { name: "Delete" }),
    );
    fireEvent.keyDown(menu, { key: "Home" });
    expect(document.activeElement).toBe(
      getByRole("menuitem", { name: "Rename" }),
    );
  });

  it("closes on Escape and restores focus to the trigger", async () => {
    const { getByLabelText, getByRole, queryByRole } = render(<TestMenu />);
    const trigger = getByLabelText("More actions");
    fireEvent.click(trigger);
    fireEvent.keyDown(getByRole("menu"), { key: "Escape" });
    await Promise.resolve();

    expect(queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on Tab without overriding the browser's next focus target", () => {
    const { getByLabelText, getByRole, queryByRole } = render(<TestMenu />);
    fireEvent.click(getByLabelText("More actions"));
    fireEvent.keyDown(getByRole("menu"), { key: "Tab" });
    expect(queryByRole("menu")).toBeNull();
  });

  it("closes on an outside pointer interaction", () => {
    const { getByLabelText, queryByRole } = render(
      <div>
        <TestMenu />
        <button type="button">Outside</button>
      </div>,
    );
    fireEvent.click(getByLabelText("More actions"));
    expect(queryByRole("menu")).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(queryByRole("menu")).toBeNull();
  });

  it("selects an enabled action, closes, and restores trigger focus", async () => {
    const menuItems = items();
    const { getByLabelText, getByRole, queryByRole } = render(
      <TestMenu menuItems={menuItems} />,
    );
    const trigger = getByLabelText("More actions");
    fireEvent.click(trigger);
    fireEvent.click(getByRole("menuitem", { name: "Copy path" }));
    await Promise.resolve();

    expect(menuItems[1]?.onSelect).toHaveBeenCalledTimes(1);
    expect(queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("does not invoke a disabled action and exposes its explanation", () => {
    const menuItems = items([
      {},
      { disabled: true, disabledReason: "Nothing has been saved yet" },
      {},
    ]);
    const { getByLabelText, getByRole, getByText } = render(
      <TestMenu menuItems={menuItems} />,
    );
    fireEvent.click(getByLabelText("More actions"));
    const copy = getByRole("menuitem", { name: /Copy path/ });

    expect(copy).toHaveProperty("disabled", true);
    expect(copy.getAttribute("aria-describedby")).toBe(
      getByText("Nothing has been saved yet").id,
    );
    fireEvent.click(copy);
    expect(menuItems[1]?.onSelect).not.toHaveBeenCalled();
  });

  it("applies optional icons and semantic danger styling", () => {
    const menuItems = items([
      {},
      {},
      { icon: "warningTriangle", variant: "danger" },
    ]);
    const { getByLabelText, getByRole } = render(
      <TestMenu menuItems={menuItems} />,
    );
    fireEvent.click(getByLabelText("More actions"));
    const danger = getByRole("menuitem", { name: "Delete" });
    expect(danger.className).toContain("menu-item-danger");
    expect(danger.querySelector("svg")).toBeTruthy();
  });

  it("renders actions as native buttons for Enter and Space activation", () => {
    const { getByLabelText, getByRole } = render(<TestMenu />);
    fireEvent.click(getByLabelText("More actions"));
    expect(getByRole("menuitem", { name: "Rename" }).tagName).toBe("BUTTON");
  });

  it("does not open when disabled or when it has no actions", () => {
    const { getByLabelText, queryByRole, rerender } = render(
      <TestMenu disabled />,
    );
    const disabledTrigger = getByLabelText("More actions") as HTMLButtonElement;
    expect(disabledTrigger.disabled).toBe(true);
    fireEvent.click(disabledTrigger);
    expect(queryByRole("menu")).toBeNull();

    rerender(<TestMenu menuItems={[]} />);
    fireEvent.click(getByLabelText("More actions"));
    expect(queryByRole("menu")).toBeNull();
  });

  it("clamps an end-aligned popup inside the right and bottom viewport edges", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 320,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 240,
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        if (this.getAttribute("role") === "menu")
          return rect({ width: 180, height: 120 });
        if (this.getAttribute("aria-haspopup") === "menu") {
          return rect({ left: 290, top: 210, width: 24, height: 24 });
        }
        return rect();
      },
    );

    const { getByLabelText, getByRole } = render(<TestMenu />);
    fireEvent.click(getByLabelText("More actions"));
    const menu = getByRole("menu") as HTMLElement;
    expect(menu.style.left).toBe("132px");
    expect(menu.style.top).toBe("86px");
    expect(menu.style.maxHeight).toBe("224px");
  });

  it("clamps a popup inside the left and top viewport edges", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 320,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 240,
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        if (this.getAttribute("role") === "menu") {
          return rect({ width: 180, height: 120 });
        }
        if (this.getAttribute("aria-haspopup") === "menu") {
          return rect({ left: -20, top: -12, width: 24, height: 24 });
        }
        return rect();
      },
    );

    const { getByLabelText, getByRole } = render(<TestMenu />);
    fireEvent.click(getByLabelText("More actions"));
    const menu = getByRole("menu") as HTMLElement;
    expect(menu.style.left).toBe("8px");
    expect(menu.style.top).toBe("16px");
  });

  it("removes global dismissal listeners when unmounted while open", () => {
    const removeDocument = vi.spyOn(document, "removeEventListener");
    const removeWindow = vi.spyOn(window, "removeEventListener");
    const { getByLabelText, unmount } = render(<TestMenu />);
    fireEvent.click(getByLabelText("More actions"));
    unmount();
    expect(removeDocument).toHaveBeenCalledWith(
      "pointerdown",
      expect.any(Function),
    );
    expect(removeWindow).toHaveBeenCalledWith("blur", expect.any(Function));
  });
});
