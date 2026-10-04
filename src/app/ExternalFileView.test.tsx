/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";

// MarkdownPreview (transitively imported by ExternalFileView) reads
// window.matchMedia at module load time; jsdom doesn't provide it.
// Must be set before any dynamic imports of the modules under test.
window.matchMedia = vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
})) as unknown as typeof window.matchMedia;

const { ExternalFileView } = await import("./ExternalFileView");
const { linkIndex } = await import("../linking/store");
import type { LinkIndex } from "../linking/store";

function emptyLinkIndex(): LinkIndex {
  return {
    backlinksByPath: new Map<string, string[]>(),
    pathsByNoteName: new Map<string, string[]>(),
    pathsByAlias: new Map<string, string[]>(),
    aliasesByPath: new Map<string, string[]>(),
    pathsByTag: new Map<string, string[]>(),
    tagsByPath: new Map<string, string[]>(),
    tasksByPath: new Map<string, never[]>(),
  } as LinkIndex;
}

afterEach(() => {
  cleanup();
  linkIndex.value = emptyLinkIndex();
});

const baseProps = {
  path: "/outside/vault/my-note.md",
  name: "my-note.md",
  opening: false,
  error: null,
  onClose: vi.fn(),
  onOpenAsWorkspace: vi.fn(),
};

const externalPath = "/outside/vault/my-note.md";
const content = "# My External Note\n\nSome body text.\n\n## Subsection\n\nMore text.";

function renderView(overrides: Record<string, unknown> = {}) {
  return render(
    <ExternalFileView
      {...baseProps}
      path={externalPath}
      name="my-note.md"
      content={content}
      {...(overrides as object)}
    />,
  );
}

async function clickToggle(ariaLabel: string) {
  const button = screen.getByRole("button", { name: ariaLabel });
  await fireEvent.click(button);
}

describe("ExternalFileView", () => {
  it("shows the note title and body when opened", () => {
    renderView();
    expect(screen.getByText(/My External Note/)).toBeTruthy();
    expect(screen.getByText(/Some body text/)).toBeTruthy();
  });

  it("has outline and backlinks toggle buttons", () => {
    renderView();
    expect(screen.getByRole("button", { name: "Show note outline" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show backlinks" })).toBeTruthy();
  });

  it("shows an Outline panel with headings when toggled open", async () => {
    renderView();
    await clickToggle("Show note outline");
    expect(screen.getByText("Outline")).toBeTruthy();
    // "Subsection" only appears in the outline (the <h2> in the body is also
    // matched, but "Subsection" is unique enough — use getAllByText for
    // headings that also appear in the body markdown).
    expect(screen.getAllByText("Subsection").length).toBeGreaterThanOrEqual(1);
    // "My External Note" appears in both the <h1> body heading and the
    // outline row — verify at least two matches.
    expect(screen.getAllByText("My External Note").length).toBeGreaterThanOrEqual(2);
  });

  it("shows 'No headings' placeholder in Outline when the file has no headings", async () => {
    renderView({ content: "Just a paragraph with no headings." });
    await clickToggle("Show note outline");
    expect(screen.getByText("This note has no headings.")).toBeTruthy();
  });

  it("shows the Backlinks panel (empty state) when toggled open", async () => {
    renderView();
    await clickToggle("Show backlinks");
    expect(screen.getByText("Backlinks")).toBeTruthy();
    expect(screen.getByText("No notes link here.")).toBeTruthy();
  });

  it("shows backlinks for an external file when other vault notes link to it", async () => {
    linkIndex.value = {
      ...emptyLinkIndex(),
      backlinksByPath: new Map([
        [externalPath, ["/vault/linked-note.md"]],
      ]),
    } as LinkIndex;
    renderView();
    await clickToggle("Show backlinks");
    expect(screen.getByText("Backlinks")).toBeTruthy();
    expect(screen.getByText("linked-note.md")).toBeTruthy();
  });

  it("shows the Open-containing-folder button", () => {
    renderView();
    expect(screen.getByText(/Open containing folder as a workspace/i)).toBeTruthy();
  });
});
