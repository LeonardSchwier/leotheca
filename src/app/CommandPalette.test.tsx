/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { CommandPalette, type Command } from "./CommandPalette";

afterEach(() => {
  cleanup();
});

function makeCommands(): Command[] {
  return [
    { id: "a", label: "New note", run: vi.fn() },
    { id: "b", label: "New folder", run: vi.fn() },
    { id: "c", label: "Open Settings", run: vi.fn() },
  ];
}

describe("CommandPalette", () => {
  it("lists every command with none typed", () => {
    const { getAllByRole } = render(<CommandPalette commands={makeCommands()} onClose={vi.fn()} />);
    expect(getAllByRole("listitem")).toHaveLength(3);
  });

  it("filters commands by substring, case-insensitively", () => {
    const { getByPlaceholderText, getAllByRole } = render(
      <CommandPalette commands={makeCommands()} onClose={vi.fn()} />,
    );
    fireEvent.input(getByPlaceholderText("Type a command..."), { target: { value: "NEW" } });
    expect(getAllByRole("listitem").map((li) => li.textContent)).toEqual(["New note", "New folder"]);
  });

  it("shows a no-matches hint instead of an empty list", () => {
    const { getByPlaceholderText, getByText } = render(
      <CommandPalette commands={makeCommands()} onClose={vi.fn()} />,
    );
    fireEvent.input(getByPlaceholderText("Type a command..."), { target: { value: "zzz" } });
    expect(getByText("No matching commands.")).toBeTruthy();
  });

  it("pressing Enter runs the first (default-selected) command and closes", () => {
    const commands = makeCommands();
    const onClose = vi.fn();
    const { getByPlaceholderText } = render(<CommandPalette commands={commands} onClose={onClose} />);
    fireEvent.keyDown(getByPlaceholderText("Type a command..."), { key: "Enter" });
    expect(commands[0].run).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ArrowDown moves the selection before Enter runs it", () => {
    const commands = makeCommands();
    const { getByPlaceholderText } = render(<CommandPalette commands={commands} onClose={vi.fn()} />);
    const input = getByPlaceholderText("Type a command...");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(commands[1].run).toHaveBeenCalledTimes(1);
    expect(commands[0].run).not.toHaveBeenCalled();
  });

  it("ArrowDown does not move past the last command", () => {
    const commands = makeCommands();
    const { getByPlaceholderText } = render(<CommandPalette commands={commands} onClose={vi.fn()} />);
    const input = getByPlaceholderText("Type a command...");
    for (let i = 0; i < 10; i++) fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(commands[2].run).toHaveBeenCalledTimes(1);
  });

  it("ArrowUp does not move before the first command", () => {
    const commands = makeCommands();
    const { getByPlaceholderText } = render(<CommandPalette commands={commands} onClose={vi.fn()} />);
    const input = getByPlaceholderText("Type a command...");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(commands[0].run).toHaveBeenCalledTimes(1);
  });

  it("typing resets the selection back to the top of the filtered list", () => {
    const commands = makeCommands();
    const { getByPlaceholderText } = render(<CommandPalette commands={commands} onClose={vi.fn()} />);
    const input = getByPlaceholderText("Type a command...");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" }); // selection now at index 2, "Open Settings"
    fireEvent.input(input, { target: { value: "new" } }); // filters to 2 items, should reset to index 0
    fireEvent.keyDown(input, { key: "Enter" });
    expect(commands[0].run).toHaveBeenCalledTimes(1); // "New note", not "New folder"
  });

  it("Escape closes without running anything", () => {
    const commands = makeCommands();
    const onClose = vi.fn();
    const { getByPlaceholderText } = render(<CommandPalette commands={commands} onClose={onClose} />);
    fireEvent.keyDown(getByPlaceholderText("Type a command..."), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    for (const c of commands) expect(c.run).not.toHaveBeenCalled();
  });

  it("clicking a command runs that one specifically, not whatever was keyboard-selected", () => {
    const commands = makeCommands();
    const onClose = vi.fn();
    const { getByText } = render(<CommandPalette commands={commands} onClose={onClose} />);
    fireEvent.click(getByText("Open Settings"));
    expect(commands[2].run).toHaveBeenCalledTimes(1);
    expect(commands[0].run).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("clicking the backdrop closes without running anything", () => {
    const commands = makeCommands();
    const onClose = vi.fn();
    const { container } = render(<CommandPalette commands={commands} onClose={onClose} />);
    fireEvent.click(container.querySelector(".command-palette-overlay")!);
    expect(onClose).toHaveBeenCalledTimes(1);
    for (const c of commands) expect(c.run).not.toHaveBeenCalled();
  });

  it("clicking inside the palette itself does not close it", () => {
    const commands = makeCommands();
    const onClose = vi.fn();
    const { container } = render(<CommandPalette commands={commands} onClose={onClose} />);
    fireEvent.click(container.querySelector(".command-palette")!);
    expect(onClose).not.toHaveBeenCalled();
  });
});
