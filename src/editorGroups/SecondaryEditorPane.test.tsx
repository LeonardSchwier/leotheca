/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import type { OpenTab } from "../workspace/types";
import type { SaveCoordinator } from "../workspace/saveCoordinator";

afterEach(() => {
  cleanup();
});

vi.mock("../editor/MarkdownEditor", () => ({
  MarkdownEditor: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea data-testid="mock-editor" value={value} onInput={(e) => onChange((e.target as HTMLTextAreaElement).value)} />
  ),
}));

// SecondaryEditorPane pulls in MarkdownPreview, which pulls in
// settings/store, whose module-load side effects read window.matchMedia
// (system-theme detection); jsdom doesn't implement it. A static top-level
// `import` is hoisted ahead of any plain statement in this file regardless
// of source order, so SecondaryEditorPane is loaded dynamically, after the
// stub is in place -- the same pattern TaskHubPanel.test.tsx/
// BookmarksPanel.test.tsx already use for the same reason.
window.matchMedia = vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
})) as unknown as typeof window.matchMedia;

const { SecondaryEditorPane } = await import("./SecondaryEditorPane");

function tab(overrides: Partial<OpenTab> = {}): OpenTab {
  return { path: "/a.md", name: "a.md", content: "hello", kind: "text", dirty: false, saving: false, saveError: null, ...overrides };
}

const noop = () => {};
const noSave: SaveCoordinator = {
  change: vi.fn(),
  flush: vi.fn(async () => {}),
  waitForInflight: vi.fn(async () => {}),
  prepareForTransition: vi.fn(async () => {}),
  resetForSession: vi.fn(),
  retry: vi.fn(async () => {}),
  getError: vi.fn(() => null),
  hasUnsavedWork: vi.fn(() => false),
  entryCount: vi.fn(() => 0),
  debugEntries: vi.fn(() => []),
};

function baseProps(overrides: Partial<Parameters<typeof SecondaryEditorPane>[0]> = {}) {
  return {
    tabs: [],
    pinnedPaths: [],
    activePath: null,
    current: undefined,
    viewMode: "split" as const,
    onViewModeChange: noop,
    session: null,
    save: noSave,
    workspaceRoot: "/vault",
    attachmentsFolder: "attachments",
    pasteImagesEnabled: true,
    snippetsEnabled: false,
    snippets: "",
    noteReadOnlyLockEnabled: false,
    onSelect: noop,
    onClose: noop,
    onCloseOthers: noop,
    onCloseAll: noop,
    onPin: noop,
    onUnpin: noop,
    onUnpinAndClose: noop,
    onRename: noop,
    onChange: noop,
    onOpenFile: noop,
    onMoveActiveTabHere: noop,
    onClosePane: noop,
    hasPrimaryActiveTab: false,
    onReorder: noop,
    onMoveLeft: noop,
    onMoveRight: noop,
    ...overrides,
  };
}

describe("SecondaryEditorPane", () => {
  it("shows an empty state with a disabled 'Move current tab here' button when primary has no active tab", () => {
    const { getByText } = render(<SecondaryEditorPane {...baseProps()} />);
    expect(getByText("No note open in this group.")).toBeTruthy();
    expect((getByText("Move current tab here") as HTMLButtonElement).disabled).toBe(true);
  });

  it("enables 'Move current tab here' once primary has an active tab, and it calls onMoveActiveTabHere", () => {
    const onMoveActiveTabHere = vi.fn();
    const { getByText } = render(
      <SecondaryEditorPane {...baseProps({ hasPrimaryActiveTab: true, onMoveActiveTabHere })} />,
    );
    const button = getByText("Move current tab here") as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(onMoveActiveTabHere).toHaveBeenCalledTimes(1);
  });

  it("'Close group' in the empty state calls onClosePane", () => {
    const onClosePane = vi.fn();
    const { getByText } = render(<SecondaryEditorPane {...baseProps({ onClosePane })} />);
    fireEvent.click(getByText("Close group"));
    expect(onClosePane).toHaveBeenCalledTimes(1);
  });

  it("renders the tab bar and the editor for a text note, split mode showing both panes", () => {
    const t = tab();
    const { container, getByTestId } = render(
      <SecondaryEditorPane {...baseProps({ tabs: [t], activePath: t.path, current: t, viewMode: "split" })} />,
    );
    expect(container.querySelector(".tab-bar")).toBeTruthy();
    expect(getByTestId("mock-editor")).toBeTruthy();
    expect(container.querySelector(".markdown-preview")).toBeTruthy();
  });

  it("source mode hides the preview, preview mode hides the editor", () => {
    const t = tab();
    const source = render(
      <SecondaryEditorPane {...baseProps({ tabs: [t], activePath: t.path, current: t, viewMode: "source" })} />,
    );
    expect(source.queryByTestId("mock-editor")).toBeTruthy();
    expect(source.container.querySelector(".markdown-preview")).toBeNull();
    cleanup();

    const preview = render(
      <SecondaryEditorPane {...baseProps({ tabs: [t], activePath: t.path, current: t, viewMode: "preview" })} />,
    );
    expect(preview.queryByTestId("mock-editor")).toBeNull();
    expect(preview.container.querySelector(".markdown-preview")).toBeTruthy();
  });

  it("clicking a view-mode button calls onViewModeChange with that mode", () => {
    const t = tab();
    const onViewModeChange = vi.fn();
    const { getByTitle } = render(
      <SecondaryEditorPane {...baseProps({ tabs: [t], activePath: t.path, current: t, viewMode: "split", onViewModeChange })} />,
    );
    fireEvent.click(getByTitle("Preview"));
    expect(onViewModeChange).toHaveBeenCalledWith("preview");
  });

  it("shows a disclosed 'not supported' message with a move-to-primary action for a canvas note", () => {
    const t = tab({ kind: "canvas" });
    const onMoveActiveTabHere = vi.fn();
    const { getByText } = render(
      <SecondaryEditorPane {...baseProps({ tabs: [t], activePath: t.path, current: t, onMoveActiveTabHere })} />,
    );
    expect(getByText(/Canvas notes aren't supported/)).toBeTruthy();
    fireEvent.click(getByText("Move to primary group"));
    expect(onMoveActiveTabHere).toHaveBeenCalledTimes(1);
  });

  it("shows the save-error bar and calls save.retry", () => {
    const t = tab({ saveError: "disk full" });
    const retry = vi.fn(async () => {});
    const { getByText } = render(
      <SecondaryEditorPane
        {...baseProps({ tabs: [t], activePath: t.path, current: t, save: { ...noSave, retry } })}
      />,
    );
    expect(getByText(/Couldn't save "a.md": disk full/)).toBeTruthy();
    fireEvent.click(getByText("Retry"));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("the note-lock bar toggles read-only via onChange", () => {
    const t = tab({ content: "---\nleotheca-read-only: true\n---\nhello" });
    const onChange = vi.fn();
    const { getByText } = render(
      <SecondaryEditorPane
        {...baseProps({ tabs: [t], activePath: t.path, current: t, noteReadOnlyLockEnabled: true, onChange })}
      />,
    );
    expect(getByText("This note is locked.")).toBeTruthy();
    fireEvent.click(getByText("Unlock note"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toBe(t.path);
  });
});
