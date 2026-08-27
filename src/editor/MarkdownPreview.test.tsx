/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { MarkdownPreview } from "./MarkdownPreview";
import { linkIndex } from "../linking/store";

afterEach(() => {
  cleanup();
  linkIndex.value = { backlinksByPath: new Map(), pathsByNoteName: new Map() };
});

describe("MarkdownPreview", () => {
  it("renders standard markdown to HTML", () => {
    const { container } = render(<MarkdownPreview source={"# Title\n\n**bold** and *italic*"} />);
    expect(container.querySelector("h1")?.textContent).toBe("Title");
    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect(container.querySelector("em")?.textContent).toBe("italic");
  });

  it("sanitizes raw HTML so a script tag can't execute", () => {
    const { container } = render(<MarkdownPreview source={'<script>window.pwned = true</script>'} />);
    expect(container.querySelector("script")).toBeNull();
  });

  it("sanitizes an attribute-based XSS attempt (onerror on an <img>)", () => {
    const { container } = render(<MarkdownPreview source={'<img src="x" onerror="window.pwned=true">'} />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("onerror")).toBeNull();
  });

  it("renders a resolved wikilink as a solid, resolved-styled link", () => {
    linkIndex.value = {
      backlinksByPath: new Map(),
      pathsByNoteName: new Map([["existing note", ["/vault/existing-note.md"]]]),
    };
    const { container } = render(<MarkdownPreview source="See [[Existing Note]] for details." />);
    const anchor = container.querySelector('a[href^="#leotheca-wikilink="]');
    expect(anchor).toBeTruthy();
    expect(anchor?.getAttribute("href")).toContain("&resolved=1");
    expect(anchor?.textContent).toBe("Existing Note");
  });

  it("renders an unresolved wikilink without the resolved marker", () => {
    const { container } = render(<MarkdownPreview source="See [[Missing Note]] for details." />);
    const anchor = container.querySelector('a[href^="#leotheca-wikilink="]');
    expect(anchor).toBeTruthy();
    expect(anchor?.getAttribute("href")).not.toContain("&resolved=1");
  });

  it("leaves an empty [[]] wikilink untouched rather than turning it into a link", () => {
    const { container } = render(<MarkdownPreview source="Just [[]] brackets." />);
    expect(container.querySelector('a[href^="#leotheca-wikilink="]')).toBeNull();
    expect(container.textContent).toContain("[[]]");
  });

  it("clicking a resolved wikilink opens the target file and prevents navigation", () => {
    linkIndex.value = {
      backlinksByPath: new Map(),
      pathsByNoteName: new Map([["existing note", ["/vault/existing-note.md"]]]),
    };
    const onOpenFile = vi.fn();
    const { container } = render(
      <MarkdownPreview source="See [[Existing Note]] for details." onOpenFile={onOpenFile} />,
    );
    const anchor = container.querySelector('a[href^="#leotheca-wikilink="]') as HTMLAnchorElement;
    fireEvent.click(anchor);
    expect(onOpenFile).toHaveBeenCalledWith("/vault/existing-note.md", "existing-note.md");
  });

  it("clicking an unresolved wikilink does not call onOpenFile", () => {
    const onOpenFile = vi.fn();
    const { container } = render(
      <MarkdownPreview source="See [[Missing Note]] for details." onOpenFile={onOpenFile} />,
    );
    const anchor = container.querySelector('a[href^="#leotheca-wikilink="]') as HTMLAnchorElement;
    fireEvent.click(anchor);
    expect(onOpenFile).not.toHaveBeenCalled();
  });

  it("clicking a regular markdown link does not call onOpenFile", () => {
    const onOpenFile = vi.fn();
    const { container } = render(
      <MarkdownPreview source="[a normal link](https://example.com)" onOpenFile={onOpenFile} />,
    );
    const anchor = container.querySelector("a") as HTMLAnchorElement;
    fireEvent.click(anchor);
    expect(onOpenFile).not.toHaveBeenCalled();
  });
});
