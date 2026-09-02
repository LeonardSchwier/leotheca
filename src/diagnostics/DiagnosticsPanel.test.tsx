/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import { linkIndex, type LinkIndex } from "../linking/store";
import { outlineRevealRequest } from "../outline/outlineNavigation";
import { parseWikiLinks } from "../linking/wikiSyntax";
import { scanHeadings } from "../markdown/headings";

function setWorkspace(notes: Record<string, string>) {
  const wikiLinksByPath = new Map<string, ReturnType<typeof parseWikiLinks>>();
  const headingsByPath = new Map<string, ReturnType<typeof scanHeadings>>();
  const pathsByNoteName = new Map<string, string[]>();
  for (const [path, content] of Object.entries(notes)) {
    const links = parseWikiLinks(content);
    if (links.length > 0) wikiLinksByPath.set(path, links);
    const headings = scanHeadings(content);
    if (headings.length > 0) headingsByPath.set(path, headings);
    const name = (path.split("/").pop() ?? path).replace(/\.md$/i, "").toLocaleLowerCase();
    const existing = pathsByNoteName.get(name) ?? [];
    existing.push(path);
    pathsByNoteName.set(name, existing);
  }
  const index: LinkIndex = {
    backlinksByPath: new Map(),
    pathsByNoteName,
    pathsByAlias: new Map(),
    aliasesByPath: new Map(),
    pathsByTag: new Map(),
    tagsByPath: new Map(),
    tasksByPath: new Map(),
    wikiLinksByPath,
    headingsByPath,
  };
  linkIndex.value = index;
}

afterEach(() => {
  cleanup();
  setWorkspace({});
  outlineRevealRequest.value = null;
});

describe("DiagnosticsPanel", () => {
  it("shows a placeholder when the workspace has no link findings", () => {
    setWorkspace({ "/vault/A.md": "[[B]]", "/vault/B.md": "content" });
    const { getByText } = render(<DiagnosticsPanel onOpenFile={vi.fn()} />);
    expect(getByText("No broken or ambiguous links found in this workspace.")).toBeTruthy();
  });

  it("lists a broken link with its status and source note", () => {
    setWorkspace({ "/vault/A.md": "[[Missing]]" });
    const { getByText, getByLabelText } = render(<DiagnosticsPanel onOpenFile={vi.fn()} />);
    expect(getByText("[[Missing]]")).toBeTruthy();
    expect(getByLabelText(/^Broken link: \[\[Missing\]\], in A$/)).toBeTruthy();
  });

  it("lists a missing-heading finding distinctly from a broken link", () => {
    setWorkspace({
      "/vault/A.md": "[[B#Nope]]",
      "/vault/B.md": "# Intro\ntext",
    });
    const { getByLabelText } = render(<DiagnosticsPanel onOpenFile={vi.fn()} />);
    expect(getByLabelText(/^Missing heading: \[\[B#Nope\]\], in A$/)).toBeTruthy();
  });

  it("lists an ambiguous-heading finding with its candidate count", () => {
    setWorkspace({
      "/vault/A.md": "[[B#Design]]",
      "/vault/B.md": "# Design\ntext\n\n# Design\nmore",
    });
    const { getByText } = render(<DiagnosticsPanel onOpenFile={vi.fn()} />);
    expect(getByText(/Ambiguous heading.*2 candidates/)).toBeTruthy();
  });

  it("shows the total finding count in the header", () => {
    setWorkspace({ "/vault/A.md": "[[Missing1]] [[Missing2]]" });
    const { getByText } = render(<DiagnosticsPanel onOpenFile={vi.fn()} />);
    expect(getByText("2")).toBeTruthy();
  });

  it("does not list a cleanly resolved link", () => {
    setWorkspace({ "/vault/A.md": "[[B]]", "/vault/B.md": "content" });
    const { queryByText } = render(<DiagnosticsPanel onOpenFile={vi.fn()} />);
    expect(queryByText("[[B]]")).toBeNull();
  });

  it("clicking a finding opens its source note with the note's title", async () => {
    setWorkspace({ "/vault/sub/My Note.md": "[[Missing]]" });
    const onOpenFile = vi.fn();
    const { getByText } = render(<DiagnosticsPanel onOpenFile={onOpenFile} />);
    fireEvent.click(getByText("[[Missing]]"));
    await Promise.resolve();
    expect(onOpenFile).toHaveBeenCalledWith("/vault/sub/My Note.md", "My Note");
  });

  it("clicking a finding requests a reveal of the link's exact source range and calls onNavigated", async () => {
    const content = "prefix [[Missing]] suffix";
    setWorkspace({ "/vault/A.md": content });
    const onNavigated = vi.fn();
    const { getByText } = render(
      <DiagnosticsPanel onOpenFile={vi.fn()} onNavigated={onNavigated} />,
    );
    fireEvent.click(getByText("[[Missing]]"));
    await Promise.resolve();

    const from = content.indexOf("[[Missing]]");
    expect(outlineRevealRequest.value).not.toBeNull();
    expect(outlineRevealRequest.value?.from).toBe(from);
    expect(outlineRevealRequest.value?.to).toBe(from + "[[Missing]]".length);
    expect(onNavigated).toHaveBeenCalledTimes(1);
  });

  it("waits for an async onOpenFile to resolve before requesting the reveal", async () => {
    setWorkspace({ "/vault/A.md": "[[Missing]]" });
    let resolveOpen: () => void = () => {};
    const onOpenFile = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveOpen = resolve;
        }),
    );
    const { getByText } = render(<DiagnosticsPanel onOpenFile={onOpenFile} />);
    fireEvent.click(getByText("[[Missing]]"));

    await Promise.resolve();
    expect(outlineRevealRequest.value).toBeNull();

    resolveOpen();
    await Promise.resolve();
    await Promise.resolve();
    expect(outlineRevealRequest.value).not.toBeNull();
  });

  it("lists findings from multiple notes in stable, source-path-sorted order", () => {
    setWorkspace({
      "/vault/Zeta.md": "[[Nope1]]",
      "/vault/Alpha.md": "[[Nope2]]",
    });
    const { getAllByText } = render(<DiagnosticsPanel onOpenFile={vi.fn()} />);
    const notes = getAllByText(/^(Alpha|Zeta)$/).map((el) => el.textContent);
    expect(notes).toEqual(["Alpha", "Zeta"]);
  });
});
