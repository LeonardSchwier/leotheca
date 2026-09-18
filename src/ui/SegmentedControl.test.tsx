/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { SegmentedControl } from "./SegmentedControl";

afterEach(cleanup);

const MODE_OPTIONS = [
  { value: "source" as const, label: "Source", icon: "code" as const },
  { value: "split" as const, label: "Split", icon: "columns" as const },
  { value: "preview" as const, label: "Preview", icon: "eye" as const },
];

describe("SegmentedControl", () => {
  it("renders one radio per option under a labeled radiogroup", () => {
    const { getByRole, getAllByRole } = render(
      <SegmentedControl
        aria-label="View mode"
        options={MODE_OPTIONS}
        value="source"
        onChange={vi.fn()}
      />,
    );
    expect(getByRole("radiogroup", { name: "View mode" })).toBeTruthy();
    expect(getAllByRole("radio")).toHaveLength(3);
  });

  it("marks only the current value's option as checked", () => {
    const { getByRole } = render(
      <SegmentedControl
        aria-label="View mode"
        options={MODE_OPTIONS}
        value="split"
        onChange={vi.fn()}
      />,
    );
    expect(
      getByRole("radio", { name: "Source" }).getAttribute("aria-checked"),
    ).toBe("false");
    expect(
      getByRole("radio", { name: "Split" }).getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      getByRole("radio", { name: "Preview" }).getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("uses each icon option's label as both accessible name and pointer tooltip", () => {
    const { getByRole } = render(
      <SegmentedControl
        aria-label="View mode"
        options={MODE_OPTIONS}
        value="source"
        onChange={vi.fn()}
      />,
    );
    const btn = getByRole("radio", { name: "Source" });
    expect(btn.getAttribute("title")).toBe("Source");
  });

  it("renders a text-only option's label as visible text, with no title tooltip", () => {
    const { getByRole } = render(
      <SegmentedControl
        aria-label="Theme"
        options={[
          { value: "light" as const, label: "Light" },
          { value: "dark" as const, label: "Dark" },
        ]}
        value="light"
        onChange={vi.fn()}
      />,
    );
    const btn = getByRole("radio", { name: "Light" });
    expect(btn.textContent).toBe("Light");
    expect(btn.getAttribute("title")).toBeNull();
  });

  it("defaults to the md size", () => {
    const { getByRole } = render(
      <SegmentedControl
        aria-label="View mode"
        options={MODE_OPTIONS}
        value="source"
        onChange={vi.fn()}
      />,
    );
    expect(getByRole("radiogroup").className).toContain("segmented-md");
  });

  it("applies the sm size when requested", () => {
    const { getByRole } = render(
      <SegmentedControl
        aria-label="View mode"
        options={MODE_OPTIONS}
        value="source"
        onChange={vi.fn()}
        size="sm"
      />,
    );
    expect(getByRole("radiogroup").className).toContain("segmented-sm");
  });

  it("invokes onChange with the clicked option's value", () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      <SegmentedControl
        aria-label="View mode"
        options={MODE_OPTIONS}
        value="source"
        onChange={onChange}
      />,
    );
    fireEvent.click(getByRole("radio", { name: "Preview" }));
    expect(onChange).toHaveBeenCalledWith("preview");
  });

  it("only the checked option is in the Tab order (roving tabindex)", () => {
    const { getByRole } = render(
      <SegmentedControl
        aria-label="View mode"
        options={MODE_OPTIONS}
        value="split"
        onChange={vi.fn()}
      />,
    );
    expect(
      getByRole("radio", { name: "Source" }).getAttribute("tabindex"),
    ).toBe("-1");
    expect(getByRole("radio", { name: "Split" }).getAttribute("tabindex")).toBe(
      "0",
    );
    expect(
      getByRole("radio", { name: "Preview" }).getAttribute("tabindex"),
    ).toBe("-1");
  });

  it("ArrowRight moves focus and selection to the next option, wrapping past the end", () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      <SegmentedControl
        aria-label="View mode"
        options={MODE_OPTIONS}
        value="preview"
        onChange={onChange}
      />,
    );
    fireEvent.keyDown(getByRole("radio", { name: "Preview" }), {
      key: "ArrowRight",
    });
    expect(onChange).toHaveBeenCalledWith("source");
  });

  it("ArrowLeft moves focus and selection to the previous option, wrapping before the start", () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      <SegmentedControl
        aria-label="View mode"
        options={MODE_OPTIONS}
        value="source"
        onChange={onChange}
      />,
    );
    fireEvent.keyDown(getByRole("radio", { name: "Source" }), {
      key: "ArrowLeft",
    });
    expect(onChange).toHaveBeenCalledWith("preview");
  });

  it("Home selects the first enabled option and End selects the last", () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      <SegmentedControl
        aria-label="View mode"
        options={MODE_OPTIONS}
        value="split"
        onChange={onChange}
      />,
    );
    fireEvent.keyDown(getByRole("radio", { name: "Split" }), { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith("preview");
    fireEvent.keyDown(getByRole("radio", { name: "Split" }), { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith("source");
  });

  it("skips a disabled option when clicked and when navigated over with arrow keys", () => {
    const onChange = vi.fn();
    const options = [
      { value: "a" as const, label: "A" },
      { value: "b" as const, label: "B", disabled: true },
      { value: "c" as const, label: "C" },
    ];
    const { getByRole } = render(
      <SegmentedControl
        aria-label="Letters"
        options={options}
        value="a"
        onChange={onChange}
      />,
    );
    const disabledBtn = getByRole("radio", { name: "B" }) as HTMLButtonElement;
    expect(disabledBtn.disabled).toBe(true);
    fireEvent.click(disabledBtn);
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.keyDown(getByRole("radio", { name: "A" }), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("c");
  });

  it("sets the native disabled property, which is what actually blocks pointer/keyboard activation", () => {
    const options = [
      { value: "a" as const, label: "A" },
      { value: "b" as const, label: "B", disabled: true },
    ];
    const { getByRole } = render(
      <SegmentedControl
        aria-label="Letters"
        options={options}
        value="a"
        onChange={vi.fn()}
      />,
    );
    expect(
      (getByRole("radio", { name: "B" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("forwards an explicit className alongside its own classes", () => {
    const { getByRole } = render(
      <SegmentedControl
        aria-label="View mode"
        options={MODE_OPTIONS}
        value="source"
        onChange={vi.fn()}
        className="my-extra"
      />,
    );
    const group = getByRole("radiogroup");
    expect(group.className).toContain("my-extra");
    expect(group.className).toContain("segmented");
  });
});
