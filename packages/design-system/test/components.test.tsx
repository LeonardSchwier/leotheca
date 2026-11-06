import { act, fireEvent, render } from "@testing-library/preact";
import { useState } from "preact/hooks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Dialog,
  dismissTopOverlay,
  EmptyState,
  IconButton,
  Input,
  Menu,
  onOverlayPush,
  resetOverlayStackForTests,
  SegmentedControl,
  Select,
  Spinner,
  Switch,
  Tabs,
  Textarea,
  ToastRegion,
  Tooltip,
} from "../src";
import { expectNoAxeViolations } from "./axeCheck";

const icon = <svg aria-hidden="true" width="16" height="16" />;

describe("Button", () => {
  it("defaults to a non-submitting secondary button", () => {
    const { getByRole } = render(<Button>Save</Button>);
    const button = getByRole("button", { name: "Save" });
    expect(button.getAttribute("type")).toBe("button");
    expect(button.className).toContain("ds-btn-secondary");
  });

  it("blocks activation while loading and keeps its accessible name", () => {
    const onClick = vi.fn();
    const { getByRole } = render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );
    const button = getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    // Native click(): jsdom's dispatchEvent still delivers a synthetic click to
    // a disabled button, while a real click (HTMLElement.click) is dropped, as in
    // a browser.
    button.click();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("has no axe violations in any variant", async () => {
    const { container } = render(
      <div>
        <Button variant="primary">A</Button>
        <Button variant="ghost">B</Button>
        <Button variant="danger" size="sm">
          C
        </Button>
      </div>,
    );
    await expectNoAxeViolations(container);
  });
});

describe("IconButton", () => {
  it("names itself from the label and exposes the toggle state", () => {
    const { getByRole } = render(<IconButton icon={icon} label="Bold" active />);
    const button = getByRole("button", { name: "Bold" });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.getAttribute("title")).toBe("Bold");
  });

  it("replaces the glyph with a spinner while loading", () => {
    const { getByRole, container } = render(
      <IconButton icon={icon} label="Sync" loading />,
    );
    expect((getByRole("button") as HTMLButtonElement).disabled).toBe(true);
    expect(container.querySelector(".ds-spinner")).not.toBeNull();
  });

  it("has no axe violations", async () => {
    const { container } = render(<IconButton icon={icon} label="Bold" />);
    await expectNoAxeViolations(container);
  });
});

describe("Spinner", () => {
  it("is decorative without a label and a status with one", () => {
    const first = render(<Spinner />);
    expect(first.queryByRole("status")).toBeNull();
    const second = render(<Spinner label="Loading notes" />);
    expect(second.getByRole("status", { name: "Loading notes" })).toBeTruthy();
  });
});

describe("form fields", () => {
  it("associates Input with its label and describes it with hint and error", () => {
    const { getByLabelText, getByText } = render(
      <Input label="Title" hint="Shown in the tab" error="Required" />,
    );
    const input = getByLabelText("Title");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const described = input.getAttribute("aria-describedby")!.split(" ");
    expect(described).toContain(getByText("Shown in the tab").id);
    expect(described).toContain(getByText("Required").id);
  });

  it("gives two unnamed fields different ids", () => {
    const { getByLabelText } = render(
      <div>
        <Input label="A" />
        <Input label="B" />
      </div>,
    );
    expect(getByLabelText("A").id).not.toBe(getByLabelText("B").id);
  });

  it("keeps a caller's aria-describedby", () => {
    const { getByLabelText } = render(
      <Input label="A" aria-describedby="other" hint="Hint" />,
    );
    expect(getByLabelText("A").getAttribute("aria-describedby")).toContain("other");
  });

  it("renders Select options and reports changes", () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <Select
        label="Font"
        value="b"
        onChange={onChange}
        options={[
          { value: "a", label: "Sans" },
          { value: "b", label: "Serif" },
          { value: "c", label: "Mono", disabled: true },
        ]}
      />,
    );
    const select = getByLabelText("Font") as HTMLSelectElement;
    expect(select.value).toBe("b");
    expect((select.options[2] as HTMLOptionElement).disabled).toBe(true);
    fireEvent.change(select, { target: { value: "a" } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("names Checkbox and Switch from their labels, with the right roles", () => {
    const { getByRole } = render(
      <div>
        <Checkbox label="Wrap lines" />
        <Switch label="Spellcheck" defaultChecked />
      </div>,
    );
    expect(getByRole("checkbox", { name: "Wrap lines" })).toBeTruthy();
    const toggle = getByRole("switch", { name: "Spellcheck" }) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    fireEvent.click(toggle);
    expect(toggle.checked).toBe(false);
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <form>
        <Input label="Title" hint="Hint" error="Error" />
        <Textarea label="Body" />
        <Select label="Font" options={[{ value: "a", label: "Sans" }]} />
        <Checkbox label="Wrap" />
        <Switch label="Spell" />
      </form>,
    );
    await expectNoAxeViolations(container);
  });
});

function TabsHarness({ onChange }: { onChange?: (id: string) => void }) {
  const [value, setValue] = useState("a");
  return (
    <Tabs
      label="Sections"
      value={value}
      onChange={(id) => {
        setValue(id);
        onChange?.(id);
      }}
      items={[
        { id: "a", label: "One", panel: "Panel one" },
        { id: "b", label: "Two", panel: "Panel two", disabled: true },
        { id: "c", label: "Three", panel: "Panel three" },
      ]}
    />
  );
}

describe("Tabs", () => {
  it("wires tab, panel, and a single tab stop", () => {
    const { getAllByRole, getByRole } = render(<TabsHarness />);
    const tabs = getAllByRole("tab");
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
    const panel = getByRole("tabpanel");
    expect(tabs[0]!.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.getAttribute("aria-labelledby")).toBe(tabs[0]!.id);
  });

  it("moves with arrows, skips disabled tabs, wraps, and honors Home and End", () => {
    const { getByRole, getByText } = render(<TabsHarness />);
    const one = getByRole("tab", { name: "One" });
    one.focus();
    fireEvent.keyDown(one, { key: "ArrowRight" });
    expect(getByText("Panel three")).toBeTruthy();
    expect(document.activeElement).toBe(getByRole("tab", { name: "Three" }));

    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(getByText("Panel one")).toBeTruthy();

    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    expect(getByText("Panel three")).toBeTruthy();

    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(getByText("Panel one")).toBeTruthy();

    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(getByText("Panel three")).toBeTruthy();
  });

  it("ignores keys that do not move", () => {
    const onChange = vi.fn();
    const { getByRole } = render(<TabsHarness onChange={onChange} />);
    fireEvent.keyDown(getByRole("tab", { name: "One" }), { key: "a" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("has no axe violations", async () => {
    const { container } = render(<TabsHarness />);
    await expectNoAxeViolations(container);
  });
});

function SegmentedHarness() {
  const [value, setValue] = useState<"s" | "l" | "d">("s");
  return (
    <SegmentedControl
      label="Mode"
      value={value}
      onChange={setValue}
      options={[
        { value: "s", label: "System" },
        { value: "l", label: "Light" },
        { value: "d", label: "Dark" },
      ]}
    />
  );
}

describe("SegmentedControl", () => {
  it("is a radio group whose arrow keys move selection and focus", () => {
    const { getByRole } = render(<SegmentedHarness />);
    expect(getByRole("radiogroup", { name: "Mode" })).toBeTruthy();
    const system = getByRole("radio", { name: "System" });
    expect(system.getAttribute("aria-checked")).toBe("true");
    system.focus();
    fireEvent.keyDown(system, { key: "ArrowRight" });
    const light = getByRole("radio", { name: "Light" });
    expect(light.getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(light);
    expect(system.tabIndex).toBe(-1);
  });

  it("has no axe violations", async () => {
    const { container } = render(<SegmentedHarness />);
    await expectNoAxeViolations(container);
  });
});

describe("Tooltip", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows at once on focus and connects through aria-describedby", () => {
    const { getByRole } = render(
      <Tooltip content="Saves the note">
        <button>Save</button>
      </Tooltip>,
    );
    const button = getByRole("button");
    fireEvent.focus(button);
    const tip = getByRole("tooltip");
    expect(tip.textContent).toBe("Saves the note");
    expect(button.getAttribute("aria-describedby")).toBe(tip.id);
    fireEvent.blur(button);
    expect(button.getAttribute("aria-describedby")).toBeNull();
  });

  it("waits for the delay on hover and cancels if the pointer leaves", () => {
    const { getByRole, queryByRole } = render(
      <Tooltip content="Tip" delay={300}>
        <button>Save</button>
      </Tooltip>,
    );
    const button = getByRole("button");
    fireEvent.mouseEnter(button);
    vi.advanceTimersByTime(299);
    expect(queryByRole("tooltip")).toBeNull();
    fireEvent.mouseLeave(button);
    vi.advanceTimersByTime(1000);
    expect(queryByRole("tooltip")).toBeNull();
  });

  it("dismisses on Escape", () => {
    const { getByRole, queryByRole } = render(
      <Tooltip content="Tip">
        <button>Save</button>
      </Tooltip>,
    );
    fireEvent.focus(getByRole("button"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(queryByRole("tooltip")).toBeNull();
  });

  it("keeps the trigger's own handlers and renders nothing extra when disabled", () => {
    const onFocus = vi.fn();
    const { getByRole, queryByRole } = render(
      <Tooltip content="Tip" disabled>
        <button onFocus={onFocus}>Save</button>
      </Tooltip>,
    );
    fireEvent.focus(getByRole("button"));
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(queryByRole("tooltip")).toBeNull();
  });

  it("clears a pending timer on unmount", () => {
    const { getByRole, unmount } = render(
      <Tooltip content="Tip">
        <button>Save</button>
      </Tooltip>,
    );
    fireEvent.mouseEnter(getByRole("button"));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

function MenuHarness({ onDelete }: { onDelete?: () => void }) {
  return (
    <Menu
      label="Note actions"
      trigger="More"
      items={[
        { id: "rename", label: "Rename", onSelect: () => undefined },
        {
          id: "move",
          label: "Move",
          onSelect: () => undefined,
          disabled: true,
          disabledReason: "No other folder",
        },
        {
          id: "delete",
          label: "Delete",
          onSelect: onDelete ?? (() => undefined),
          variant: "danger",
        },
      ]}
    />
  );
}

describe("Menu", () => {
  it("opens from the trigger and focuses the first enabled item", () => {
    const { getByRole } = render(<MenuHarness />);
    const trigger = getByRole("button", { name: "Note actions" });
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(getByRole("menuitem", { name: "Rename" }));
  });

  it("opens on ArrowUp at the last enabled item", () => {
    const { getByRole } = render(<MenuHarness />);
    fireEvent.keyDown(getByRole("button"), { key: "ArrowUp" });
    expect(document.activeElement).toBe(getByRole("menuitem", { name: "Delete" }));
  });

  it("arrows skip disabled items and wrap; Home and End jump", () => {
    const { getByRole } = render(<MenuHarness />);
    fireEvent.click(getByRole("button"));
    const menu = getByRole("menu");
    const rename = getByRole("menuitem", { name: "Rename" });
    const del = getByRole("menuitem", { name: "Delete" });
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(del);
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(rename);
    fireEvent.keyDown(menu, { key: "End" });
    expect(document.activeElement).toBe(del);
    fireEvent.keyDown(menu, { key: "Home" });
    expect(document.activeElement).toBe(rename);
  });

  it("Escape closes and returns focus to the trigger", () => {
    const { getByRole, queryByRole } = render(<MenuHarness />);
    const trigger = getByRole("button");
    fireEvent.click(trigger);
    fireEvent.keyDown(getByRole("menu"), { key: "Escape" });
    expect(queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("selects, closes, and connects a disabled item's reason", () => {
    const onDelete = vi.fn();
    const { getByRole, getByText, queryByRole } = render(
      <MenuHarness onDelete={onDelete} />,
    );
    fireEvent.click(getByRole("button"));
    const move = getByRole("menuitem", { name: /Move/ });
    expect(move.getAttribute("aria-describedby")).toBe(
      getByText("No other folder").id,
    );
    fireEvent.click(getByRole("menuitem", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(queryByRole("menu")).toBeNull();
  });

  it("closes on an outside pointer press without stealing focus back", async () => {
    const { getByRole, queryByRole } = render(<MenuHarness />);
    // act flushes the effect that installs the outside listener.
    await act(async () => {
      fireEvent.click(getByRole("button"));
    });
    await act(async () => {
      // jsdom has no PointerEvent, so fireEvent.pointerDown dispatches nothing.
      fireEvent(document.body, new Event("pointerdown", { bubbles: true }));
    });
    expect(queryByRole("menu")).toBeNull();
    expect(document.activeElement).not.toBe(getByRole("button"));
  });

  it("does not open with no items", () => {
    const { getByRole } = render(<Menu label="Empty" trigger="More" items={[]} />);
    expect((getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("has no axe violations while open", async () => {
    const { getByRole, container } = render(<MenuHarness />);
    fireEvent.click(getByRole("button"));
    await expectNoAxeViolations(container);
  });
});

describe("Dialog", () => {
  afterEach(() => resetOverlayStackForTests());

  it("is modal, named, described, and takes focus", () => {
    const { getByRole } = render(
      <Dialog
        title="Delete note"
        description="This cannot be undone."
        onDismiss={() => undefined}
        actions={<Button>Cancel</Button>}
      />,
    );
    const dialog = getByRole("dialog", { name: "Delete note" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
    expect(document.activeElement).toBe(getByRole("button", { name: "Cancel" }));
  });

  it("traps Tab in both directions", () => {
    const { getByRole } = render(
      <Dialog
        title="T"
        onDismiss={() => undefined}
        actions={
          <>
            <Button>First</Button>
            <Button>Last</Button>
          </>
        }
      />,
    );
    const first = getByRole("button", { name: "First" });
    const last = getByRole("button", { name: "Last" });
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("focuses the surface itself when nothing inside can take focus", () => {
    const { getByRole } = render(<Dialog title="T" onDismiss={() => undefined} />);
    expect(document.activeElement).toBe(getByRole("dialog"));
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(getByRole("dialog"));
  });

  it("restores focus on unmount and releases the scroll lock", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const { unmount } = render(<Dialog title="T" onDismiss={() => undefined} />);
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe("");
  });

  it("reports Escape and backdrop, and honors both opt-outs", () => {
    const onDismiss = vi.fn();
    const { rerender, container } = render(
      <Dialog title="T" onDismiss={onDismiss} />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).toHaveBeenLastCalledWith("escape");
    const backdrop = container.querySelector(".ds-dialog-backdrop")!;
    fireEvent.mouseDown(backdrop);
    expect(onDismiss).toHaveBeenLastCalledWith("backdrop");

    onDismiss.mockClear();
    rerender(
      <Dialog
        title="T"
        onDismiss={onDismiss}
        closeOnEscape={false}
        closeOnBackdrop={false}
      />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.mouseDown(backdrop);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("dismisses only the topmost of two stacked dialogs", () => {
    const lower = vi.fn();
    const upper = vi.fn();
    render(
      <div>
        <Dialog title="Lower" onDismiss={lower} />
        <Dialog title="Upper" onDismiss={upper} />
      </div>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(upper).toHaveBeenCalledWith("escape");
    expect(lower).not.toHaveBeenCalled();
  });

  it("lets a host's back gesture reach the top overlay through the stack", () => {
    const pushed = vi.fn();
    onOverlayPush(pushed);
    const onDismiss = vi.fn();
    expect(dismissTopOverlay("backbutton")).toBe(false);
    render(<Dialog title="T" onDismiss={onDismiss} />);
    expect(pushed).toHaveBeenCalledTimes(1);
    expect(dismissTopOverlay("backbutton")).toBe(true);
    expect(onDismiss).toHaveBeenCalledWith("backbutton");
  });

  it("supports alertdialog", () => {
    const { getByRole } = render(
      <Dialog title="T" role="alertdialog" onDismiss={() => undefined} />,
    );
    expect(getByRole("alertdialog", { name: "T" })).toBeTruthy();
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <Dialog title="Title" description="Desc" onDismiss={() => undefined}>
        <Input label="Name" />
      </Dialog>,
    );
    await expectNoAxeViolations(container);
  });
});

describe("ToastRegion", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("announces errors as alerts and the rest as status", () => {
    const { getByRole } = render(
      <ToastRegion
        onDismiss={() => undefined}
        toasts={[
          { id: "a", message: "Saved", tone: "success" },
          { id: "b", message: "Write failed", tone: "danger" },
        ]}
      />,
    );
    expect(getByRole("status").textContent).toContain("Saved");
    expect(getByRole("alert").textContent).toContain("Write failed");
  });

  it("dismisses after its duration, and not before", () => {
    const onDismiss = vi.fn();
    render(
      <ToastRegion
        onDismiss={onDismiss}
        toasts={[{ id: "a", message: "Saved", duration: 1000 }]}
      />,
    );
    vi.advanceTimersByTime(999);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDismiss).toHaveBeenCalledWith("a");
  });

  it("stays without a duration, and the button closes it", () => {
    const onDismiss = vi.fn();
    const { getByRole } = render(
      <ToastRegion onDismiss={onDismiss} toasts={[{ id: "a", message: "Hi" }]} />,
    );
    vi.advanceTimersByTime(100000);
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.click(getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledWith("a");
  });

  it("pauses the timer while hovered", () => {
    const onDismiss = vi.fn();
    const { getByRole } = render(
      <ToastRegion
        onDismiss={onDismiss}
        toasts={[{ id: "a", message: "Saved", duration: 1000 }]}
      />,
    );
    fireEvent.mouseEnter(getByRole("status"));
    vi.advanceTimersByTime(5000);
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.mouseLeave(getByRole("status"));
    vi.advanceTimersByTime(1000);
    expect(onDismiss).toHaveBeenCalledWith("a");
  });

  it("keeps the region mounted while empty, so later toasts are announced", () => {
    const { getByRole } = render(<ToastRegion onDismiss={() => undefined} toasts={[]} />);
    expect(getByRole("region", { name: "Notifications" })).toBeTruthy();
  });
});

describe("Badge, Card, EmptyState", () => {
  it("render their content", () => {
    const { getByText, getByRole } = render(
      <div>
        <Badge tone="success">Synced</Badge>
        <Card title="Recent" raised>
          Body
        </Card>
        <EmptyState title="No notes" description="Create one" />
      </div>,
    );
    expect(getByText("Synced").className).toContain("ds-badge-success");
    expect(getByRole("heading", { name: "Recent" })).toBeTruthy();
    expect(getByText("No notes")).toBeTruthy();
  });

  it("have no axe violations", async () => {
    const { container } = render(
      <main>
        <Badge>One</Badge>
        <Card title="Recent">Body</Card>
        <EmptyState title="None" />
      </main>,
    );
    await expectNoAxeViolations(container);
  });
});
