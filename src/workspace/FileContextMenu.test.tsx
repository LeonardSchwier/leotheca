/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";

// fileTreeStore.ts pulls in ../settings/store for workspaceSettings, whose
// module-load side effects (window.matchMedia, CSS variable syncing) don't
// apply here and jsdom doesn't implement matchMedia. Mocking it out lets the
// rest of fileTreeStore (the real contextMenuTarget/contextMenuPos signals
// this test drives directly) load and run for real.
vi.mock("../settings/store", () => ({
  workspaceSettings: { value: {} },
  updateWorkspaceSettings: vi.fn(),
}));

import { FileContextMenu } from "./FileContextMenu";
import { closeContextMenu, contextMenuPos, contextMenuTarget } from "./fileTreeStore";
import type { FsEntry } from "./types";

const file: FsEntry = { name: "note.md", path: "/vault/notes/note.md", isDir: false };
const dir: FsEntry = { name: "notes", path: "/vault/notes", isDir: true };

afterEach(() => {
  cleanup();
  closeContextMenu();
  contextMenuPos.value = { x: 0, y: 0 };
});

function noop() {}

describe("FileContextMenu", () => {
  it("renders nothing when no entry is targeted", () => {
    const { container } = render(
      <FileContextMenu rootPath="/vault" onNewNote={noop} onNewFolder={noop} onRename={noop} onDelete={noop} />,
    );
    expect(container.querySelector(".context-menu")).toBeNull();
  });

  it("positions the menu at the target's stored coordinates", () => {
    contextMenuTarget.value = file;
    contextMenuPos.value = { x: 42, y: 99 };
    const { container } = render(
      <FileContextMenu rootPath="/vault" onNewNote={noop} onNewFolder={noop} onRename={noop} onDelete={noop} />,
    );
    const menu = container.querySelector(".context-menu") as HTMLElement;
    expect(menu.style.left).toBe("42px");
    expect(menu.style.top).toBe("99px");
  });

  it("only offers New Note / New Folder for a directory target", () => {
    contextMenuTarget.value = file;
    const { queryByText } = render(
      <FileContextMenu rootPath="/vault" onNewNote={noop} onNewFolder={noop} onRename={noop} onDelete={noop} />,
    );
    expect(queryByText("New Note")).toBeNull();
    expect(queryByText("New Folder")).toBeNull();
  });

  it("New Note targets the right directory and closes the menu", () => {
    contextMenuTarget.value = dir;
    const onNewNote = vi.fn();
    const { getByText } = render(
      <FileContextMenu rootPath="/vault" onNewNote={onNewNote} onNewFolder={noop} onRename={noop} onDelete={noop} />,
    );
    fireEvent.click(getByText("New Note"));
    expect(onNewNote).toHaveBeenCalledWith("/vault/notes");
    expect(contextMenuTarget.value).toBeNull();
  });

  it("New Folder targets the right directory and closes the menu", () => {
    contextMenuTarget.value = dir;
    const onNewFolder = vi.fn();
    const { getByText } = render(
      <FileContextMenu rootPath="/vault" onNewNote={noop} onNewFolder={onNewFolder} onRename={noop} onDelete={noop} />,
    );
    fireEvent.click(getByText("New Folder"));
    expect(onNewFolder).toHaveBeenCalledWith("/vault/notes");
    expect(contextMenuTarget.value).toBeNull();
  });

  it("Rename targets the right entry and closes the menu", () => {
    contextMenuTarget.value = file;
    const onRename = vi.fn();
    const { getByText } = render(
      <FileContextMenu rootPath="/vault" onNewNote={noop} onNewFolder={noop} onRename={onRename} onDelete={noop} />,
    );
    fireEvent.click(getByText("Rename"));
    expect(onRename).toHaveBeenCalledWith(file);
    expect(contextMenuTarget.value).toBeNull();
  });

  it("Delete targets the right entry and closes the menu", () => {
    contextMenuTarget.value = file;
    const onDelete = vi.fn();
    const { getByText } = render(
      <FileContextMenu rootPath="/vault" onNewNote={noop} onNewFolder={noop} onRename={noop} onDelete={onDelete} />,
    );
    fireEvent.click(getByText("Delete"));
    expect(onDelete).toHaveBeenCalledWith(file);
    expect(contextMenuTarget.value).toBeNull();
  });

  it("Copy Relative Path copies the path relative to the workspace root and closes the menu", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    contextMenuTarget.value = file;
    const { getByText } = render(
      <FileContextMenu rootPath="/vault" onNewNote={noop} onNewFolder={noop} onRename={noop} onDelete={noop} />,
    );
    fireEvent.click(getByText("Copy Relative Path"));
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith("notes/note.md");
    expect(contextMenuTarget.value).toBeNull();
  });

  it("clicking elsewhere in the window dismisses the menu without triggering an action", () => {
    contextMenuTarget.value = file;
    const onDelete = vi.fn();
    const { queryByText } = render(
      <FileContextMenu rootPath="/vault" onNewNote={noop} onNewFolder={noop} onRename={noop} onDelete={onDelete} />,
    );
    expect(queryByText("Delete")).toBeTruthy();

    fireEvent.click(window);
    expect(contextMenuTarget.value).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();
  });
});
