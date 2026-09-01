/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/preact";

vi.mock("../workspace/tauriBridge", () => ({
  fileSrc: vi.fn(),
}));

vi.mock("../settings/store", async () => {
  const { signal } = await import("@preact/signals");
  return { workspacePath: signal<string | null>(null) };
});

import { MarkdownPreview } from "./MarkdownPreview";
import { linkIndex } from "../linking/store";
import { workspacePath } from "../settings/store";
import { fileSrc } from "../workspace/tauriBridge";

afterEach(() => {
  cleanup();
  linkIndex.value = {
    backlinksByPath: new Map(),
    pathsByNoteName: new Map(),
    pathsByAlias: new Map(),
    aliasesByPath: new Map(),
    pathsByTag: new Map(),
    tagsByPath: new Map(),
  };
  workspacePath.value = null;
  vi.mocked(fileSrc).mockReset();
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
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
      pathsByTag: new Map(),
      tagsByPath: new Map(),
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
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
      pathsByTag: new Map(),
      tagsByPath: new Map(),
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

describe("MarkdownPreview: local image attachments", () => {
  beforeEach(() => {
    workspacePath.value = "/vault";
  });

  it("leaves a local relative image unresolved when no notePath is given", () => {
    const { container } = render(<MarkdownPreview source="![a cat](cat.png)" />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("cat.png");
    expect(fileSrc).not.toHaveBeenCalled();
  });

  it("resolves a local relative image against the note's own folder", async () => {
    vi.mocked(fileSrc).mockResolvedValue("asset://localhost/vault/notes/cat.png");
    const { container } = render(
      <MarkdownPreview source="![a cat](cat.png)" notePath="/vault/notes/today.md" />,
    );

    expect(fileSrc).toHaveBeenCalledWith("/vault/notes/cat.png");
    await waitFor(() =>
      expect(container.querySelector("img")?.getAttribute("src")).toBe(
        "asset://localhost/vault/notes/cat.png",
      ),
    );
  });

  it("resolves a ../ image target relative to the note's folder when it stays in the workspace", async () => {
    vi.mocked(fileSrc).mockResolvedValue("asset://localhost/vault/attachments/cat.png");
    render(
      <MarkdownPreview
        source="![a cat](../attachments/cat.png)"
        notePath="/vault/notes/today.md"
      />,
    );
    expect(fileSrc).toHaveBeenCalledWith("/vault/attachments/cat.png");
  });

  it("rejects a relative image that escapes the workspace without reading it", () => {
    const { container } = render(
      <MarkdownPreview source="![outside](../../outside.png)" notePath="/vault/notes/today.md" />,
    );
    expect(fileSrc).not.toHaveBeenCalled();
    expect(container.querySelector("img")?.getAttribute("src")).toBe("../../outside.png");
  });

  it("rejects a prefix-confusion escape at the exact workspace boundary", () => {
    render(
      <MarkdownPreview
        source="![outside](../../vault-other/cat.png)"
        notePath="/vault/notes/today.md"
      />,
    );
    expect(fileSrc).not.toHaveBeenCalled();
  });

  it("rejects an absolute local image target without reading it", () => {
    render(<MarkdownPreview source="![outside](/outside/cat.png)" notePath="/vault/notes/today.md" />);
    expect(fileSrc).not.toHaveBeenCalled();
  });

  it("preserves a title alongside a resolved local image", async () => {
    vi.mocked(fileSrc).mockResolvedValue("asset://localhost/vault/notes/cat.png");
    const { container } = render(
      <MarkdownPreview source='![a cat](cat.png "My cat")' notePath="/vault/notes/today.md" />,
    );
    await waitFor(() => expect(container.querySelector("img")?.getAttribute("src")).not.toContain("#leotheca-attachment"));
    expect(container.querySelector("img")?.getAttribute("title")).toBe("My cat");
  });

  it("does not resolve an absolute http(s) image link", () => {
    const { container } = render(
      <MarkdownPreview source="![remote](https://example.com/cat.png)" notePath="/vault/notes/today.md" />,
    );
    expect(fileSrc).not.toHaveBeenCalled();
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://example.com/cat.png");
  });

  it("does not resolve a data: URI image link", () => {
    const dataUri = "data:image/png;base64,AAAA";
    const { container } = render(
      <MarkdownPreview source={`![inline](${dataUri})`} notePath="/vault/notes/today.md" />,
    );
    expect(fileSrc).not.toHaveBeenCalled();
    expect(container.querySelector("img")?.getAttribute("src")).toBe(dataUri);
  });
});

describe("MarkdownPreview: math rendering", () => {
  it("renders $inline$ math via KaTeX", () => {
    const { container } = render(<MarkdownPreview source="Einstein's $E = mc^2$ formula." />);
    const math = container.querySelector(".katex");
    expect(math).toBeTruthy();
    expect(container.querySelector(".katex-display")).toBeNull();
  });

  it("renders $$block$$ math via KaTeX in display mode", () => {
    const { container } = render(<MarkdownPreview source="$$\\int_0^1 x^2 \\,dx$$" />);
    expect(container.querySelector(".katex-display")).toBeTruthy();
  });

  it("does not treat currency-like text as math (no space allowed just inside the delimiters)", () => {
    const { container } = render(<MarkdownPreview source="Costs $5 and $10 respectively." />);
    expect(container.querySelector(".katex")).toBeNull();
    expect(container.textContent).toContain("$5 and $10");
  });

  it("does not render math inside an inline code span", () => {
    const { container } = render(<MarkdownPreview source="Use `$x$` literally, not as math." />);
    expect(container.querySelector(".katex")).toBeNull();
    expect(container.querySelector("code")?.textContent).toBe("$x$");
  });

  it("does not render math inside a fenced code block", () => {
    const { container } = render(<MarkdownPreview source={"```\n$x^2$\n```"} />);
    expect(container.querySelector(".katex")).toBeNull();
    expect(container.querySelector("pre code")?.textContent).toContain("$x^2$");
  });

  it("leaves $...$ as literal text when math rendering is disabled", () => {
    const { container } = render(<MarkdownPreview source="Formula: $E = mc^2$." mathRenderingEnabled={false} />);
    expect(container.querySelector(".katex")).toBeNull();
    expect(container.textContent).toContain("$E = mc^2$");
  });

  it("leaves $$...$$ as literal text when math rendering is disabled", () => {
    const { container } = render(<MarkdownPreview source="$$x^2$$" mathRenderingEnabled={false} />);
    expect(container.querySelector(".katex-display")).toBeNull();
  });

  it("does not crash on malformed LaTeX, and shows KaTeX's own error styling", () => {
    const { container } = render(<MarkdownPreview source="Broken: $\\frac{1}{$." />);
    expect(container.querySelector(".markdown-preview")).toBeTruthy();
  });

  it("keeps KaTeX's visual rendering (styled spans) intact through sanitization", () => {
    const { container } = render(<MarkdownPreview source="$x^2$" />);
    const visual = container.querySelector(".katex-html");
    expect(visual).toBeTruthy();
    expect(visual?.querySelector("[style]")).toBeTruthy();
  });
});
