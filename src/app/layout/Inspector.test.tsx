/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { Inspector } from "./Inspector";
import { linkIndex } from "../../linking/store";

afterEach(() => {
  cleanup();
  linkIndex.value = {
    backlinksByPath: new Map(),
    pathsByNoteName: new Map(),
    pathsByAlias: new Map(),
    aliasesByPath: new Map(),
    pathsByTag: new Map(),
    tagsByPath: new Map(),
    tasksByPath: new Map(),
  };
});

const BASE_PROPS = {
  activeTab: "properties" as const,
  onSetActiveTab: vi.fn(),
  onClose: vi.fn(),
  properties: {
    source: "---\ntitle: Hello\n---\nBody",
    onChange: vi.fn(),
    enabled: true,
  },
  path: "/vault/note.md",
  onOpenFile: vi.fn(),
};

describe("Inspector", () => {
  it("shows both tabs when Properties is enabled, Properties active by default", () => {
    const { getByRole } = render(<Inspector {...BASE_PROPS} />);
    expect(getByRole("tab", { name: "Properties" }).getAttribute("aria-selected")).toBe("true");
    expect(getByRole("tab", { name: "Backlinks" }).getAttribute("aria-selected")).toBe("false");
  });

  it("renders FrontmatterPropertiesPanel content on the Properties tab", () => {
    const { getByText } = render(<Inspector {...BASE_PROPS} />);
    expect(getByText("title")).toBeTruthy();
  });

  it("renders BacklinksPanel content on the Backlinks tab", () => {
    const { getByRole, getByText } = render(<Inspector {...BASE_PROPS} activeTab="backlinks" />);
    expect(getByRole("tab", { name: "Backlinks" }).getAttribute("aria-selected")).toBe("true");
    expect(getByText("No notes link here.")).toBeTruthy();
  });

  it("invokes onSetActiveTab when a tab is clicked", () => {
    const onSetActiveTab = vi.fn();
    const { getByRole } = render(<Inspector {...BASE_PROPS} onSetActiveTab={onSetActiveTab} />);
    fireEvent.click(getByRole("tab", { name: "Backlinks" }));
    expect(onSetActiveTab).toHaveBeenCalledWith("backlinks");
  });

  it("invokes onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    const { getByLabelText } = render(<Inspector {...BASE_PROPS} onClose={onClose} />);
    fireEvent.click(getByLabelText("Close Inspector"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("hides the Properties tab and falls back to Backlinks when Properties is disabled", () => {
    const { queryByRole, getByText } = render(
      <Inspector {...BASE_PROPS} properties={{ ...BASE_PROPS.properties, enabled: false }} />,
    );
    expect(queryByRole("tab", { name: "Properties" })).toBeNull();
    expect(getByText("No notes link here.")).toBeTruthy();
  });
});
