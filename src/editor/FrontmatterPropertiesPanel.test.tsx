/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { FrontmatterPropertiesPanel } from "./FrontmatterPropertiesPanel";

afterEach(() => {
  cleanup();
});

describe("FrontmatterPropertiesPanel", () => {
  it("renders nothing when disabled", () => {
    const { container } = render(
      <FrontmatterPropertiesPanel source={'---\ntitle: Foo\n---\n'} onChange={vi.fn()} enabled={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows only an Add-property affordance when there is no frontmatter", () => {
    const { getByText, queryByRole } = render(
      <FrontmatterPropertiesPanel source="Just a note, no frontmatter." onChange={vi.fn()} enabled />,
    );
    expect(getByText("+ Add property")).toBeTruthy();
    expect(queryByRole("textbox")).toBeNull();
  });

  it("renders an existing scalar field with its value", () => {
    const { getByText, getByDisplayValue } = render(
      <FrontmatterPropertiesPanel source={'---\ntitle: "Foo"\n---\n'} onChange={vi.fn()} enabled />,
    );
    expect(getByText("title")).toBeTruthy();
    expect(getByDisplayValue("Foo")).toBeTruthy();
  });

  it("renders an existing list field as a comma-joined value", () => {
    const { getByDisplayValue } = render(
      <FrontmatterPropertiesPanel source={"---\ntags: [one, two]\n---\n"} onChange={vi.fn()} enabled />,
    );
    expect(getByDisplayValue("one, two")).toBeTruthy();
  });

  it("editing a scalar field's value calls onChange with the field updated, body untouched", () => {
    const onChange = vi.fn();
    const source = '---\ntitle: "Old"\n---\n\nBody text.';
    const { getByDisplayValue } = render(
      <FrontmatterPropertiesPanel source={source} onChange={onChange} enabled />,
    );
    fireEvent.input(getByDisplayValue("Old"), { target: { value: "New" } });
    expect(onChange).toHaveBeenCalledWith('---\ntitle: "New"\n---\n\nBody text.');
  });

  it("editing a list field's value re-splits it on comma", () => {
    const onChange = vi.fn();
    const source = "---\ntags: [one]\n---\n";
    const { getByDisplayValue } = render(
      <FrontmatterPropertiesPanel source={source} onChange={onChange} enabled />,
    );
    fireEvent.input(getByDisplayValue("one"), { target: { value: "one, two, three" } });
    expect(onChange).toHaveBeenCalledWith('---\ntags: ["one", "two", "three"]\n---\n');
  });

  it("removing a field calls onChange without it", () => {
    const onChange = vi.fn();
    const source = '---\ntitle: "Foo"\nauthor: "Bar"\n---\n';
    const { getByLabelText } = render(
      <FrontmatterPropertiesPanel source={source} onChange={onChange} enabled />,
    );
    fireEvent.click(getByLabelText("Remove title"));
    expect(onChange).toHaveBeenCalledWith('---\nauthor: "Bar"\n---\n');
  });

  it("removing the last remaining field drops the frontmatter block entirely", () => {
    const onChange = vi.fn();
    const source = '---\ntitle: "Foo"\n---\n\nBody.';
    const { getByLabelText } = render(
      <FrontmatterPropertiesPanel source={source} onChange={onChange} enabled />,
    );
    fireEvent.click(getByLabelText("Remove title"));
    expect(onChange).toHaveBeenCalledWith("\nBody.");
  });

  it("adds a new field via the Add-property flow", () => {
    const onChange = vi.fn();
    const { getByText, getByPlaceholderText } = render(
      <FrontmatterPropertiesPanel source="No frontmatter yet." onChange={onChange} enabled />,
    );
    fireEvent.click(getByText("+ Add property"));
    const keyInput = getByPlaceholderText("Property name");
    fireEvent.input(keyInput, { target: { value: "status" } });
    fireEvent.click(getByText("Add"));
    expect(onChange).toHaveBeenCalledWith('---\nstatus: ""\n---\nNo frontmatter yet.');
  });

  it("adds a new field on pressing Enter in the key input", () => {
    const onChange = vi.fn();
    const { getByText, getByPlaceholderText } = render(
      <FrontmatterPropertiesPanel source="No frontmatter yet." onChange={onChange} enabled />,
    );
    fireEvent.click(getByText("+ Add property"));
    const keyInput = getByPlaceholderText("Property name");
    fireEvent.input(keyInput, { target: { value: "status" } });
    fireEvent.keyDown(keyInput, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith('---\nstatus: ""\n---\nNo frontmatter yet.');
  });

  it("does nothing when confirming an empty key", () => {
    const onChange = vi.fn();
    const { getByText } = render(
      <FrontmatterPropertiesPanel source="No frontmatter yet." onChange={onChange} enabled />,
    );
    fireEvent.click(getByText("+ Add property"));
    fireEvent.click(getByText("Add"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not add a field whose key already exists", () => {
    const onChange = vi.fn();
    const source = '---\ntitle: "Foo"\n---\n';
    const { getByText, getByPlaceholderText } = render(
      <FrontmatterPropertiesPanel source={source} onChange={onChange} enabled />,
    );
    fireEvent.click(getByText("+ Add property"));
    fireEvent.input(getByPlaceholderText("Property name"), { target: { value: "title" } });
    fireEvent.click(getByText("Add"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("sanitizes characters a key can't safely contain", () => {
    const onChange = vi.fn();
    const { getByText, getByPlaceholderText } = render(
      <FrontmatterPropertiesPanel source="No frontmatter yet." onChange={onChange} enabled />,
    );
    fireEvent.click(getByText("+ Add property"));
    fireEvent.input(getByPlaceholderText("Property name"), { target: { value: "my key:here" } });
    fireEvent.click(getByText("Add"));
    expect(onChange).toHaveBeenCalledWith('---\nmy-key-here: ""\n---\nNo frontmatter yet.');
  });

  it("cancels adding a field on Escape without calling onChange", () => {
    const onChange = vi.fn();
    const { getByText, getByPlaceholderText, queryByPlaceholderText } = render(
      <FrontmatterPropertiesPanel source="No frontmatter yet." onChange={onChange} enabled />,
    );
    fireEvent.click(getByText("+ Add property"));
    const keyInput = getByPlaceholderText("Property name");
    fireEvent.input(keyInput, { target: { value: "status" } });
    fireEvent.keyDown(keyInput, { key: "Escape" });
    expect(onChange).not.toHaveBeenCalled();
    expect(queryByPlaceholderText("Property name")).toBeNull();
  });

  it("editing a field leaves unsupported content in its original position", () => {
    const onChange = vi.fn();
    const source = '---\ncustom:\n  nested: value\ntitle: "Old"\n---\n\nBody.';
    const { getByDisplayValue } = render(
      <FrontmatterPropertiesPanel source={source} onChange={onChange} enabled />,
    );
    fireEvent.input(getByDisplayValue("Old"), { target: { value: "New" } });
    expect(onChange).toHaveBeenCalledWith(
      '---\ncustom:\n  nested: value\ntitle: "New"\n---\n\nBody.',
    );
  });

  it("renders complex valid values read-only instead of normalizing them", () => {
    const source = '---\naliases: ["Last, First", Simple]\nsummary: |\n  first\n  second\n---\n';
    const { getByLabelText, queryByLabelText } = render(
      <FrontmatterPropertiesPanel source={source} onChange={vi.fn()} enabled />,
    );
    expect((getByLabelText("aliases read only") as HTMLInputElement).readOnly).toBe(true);
    expect((getByLabelText("summary read only") as HTMLInputElement).readOnly).toBe(true);
    expect(queryByLabelText("Remove aliases")).toBeNull();
    expect(queryByLabelText("Remove summary")).toBeNull();
  });
});
