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
    tasksByPath: new Map(),
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
      tasksByPath: new Map(),
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
      tasksByPath: new Map(),
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

  it("resolves the same repeated image path only once, applying the result to every occurrence", async () => {
    vi.mocked(fileSrc).mockResolvedValue("asset://localhost/vault/notes/cat.png");
    const { container } = render(
      <MarkdownPreview
        source={"![first](cat.png)\n\n![second](cat.png)"}
        notePath="/vault/notes/today.md"
      />,
    );

    await waitFor(() => {
      const imgs = Array.from(container.querySelectorAll("img"));
      expect(imgs).toHaveLength(2);
      for (const img of imgs) {
        expect(img.getAttribute("src")).toBe("asset://localhost/vault/notes/cat.png");
      }
    });
    expect(fileSrc).toHaveBeenCalledTimes(1);
    expect(fileSrc).toHaveBeenCalledWith("/vault/notes/cat.png");
  });

  it("resolves two different image paths independently", async () => {
    vi.mocked(fileSrc).mockImplementation(async (path: string) => `asset://localhost${path}`);
    const { container } = render(
      <MarkdownPreview
        source={"![a](a.png)\n\n![b](b.png)"}
        notePath="/vault/notes/today.md"
      />,
    );

    await waitFor(() => {
      const imgs = Array.from(container.querySelectorAll("img"));
      expect(imgs.map((img) => img.getAttribute("src")).sort()).toEqual([
        "asset://localhost/vault/notes/a.png",
        "asset://localhost/vault/notes/b.png",
      ]);
    });
    expect(fileSrc).toHaveBeenCalledTimes(2);
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

describe("MarkdownPreview: onActiveHeadingChange", () => {
  function setRect(el: Element, top: number, height = 20) {
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
      top,
      height,
      bottom: top + height,
      left: 0,
      right: 0,
      width: 0,
      x: 0,
      y: top,
      toJSON() {
        return this;
      },
    } as DOMRect);
  }

  it("reports undefined when the note has no headings", () => {
    const onActiveHeadingChange = vi.fn();
    render(
      <MarkdownPreview source="Just a paragraph." onActiveHeadingChange={onActiveHeadingChange} />,
    );
    expect(onActiveHeadingChange).toHaveBeenCalledWith(undefined);
  });

  it("reports undefined before any heading has crossed the reading threshold", () => {
    const onActiveHeadingChange = vi.fn();
    const { container } = render(
      <MarkdownPreview
        source={"# One\n\n## Two"}
        onActiveHeadingChange={onActiveHeadingChange}
      />,
    );
    const preview = container.querySelector(".markdown-preview")!;
    setRect(preview, 0, 400);
    const [h1, h2] = Array.from(preview.querySelectorAll("h1, h2"));
    setRect(h1, 300);
    setRect(h2, 350);
    fireEvent.scroll(preview);
    expect(onActiveHeadingChange).toHaveBeenLastCalledWith(undefined);
  });

  it("reports the last heading whose top has crossed the reading threshold", () => {
    const onActiveHeadingChange = vi.fn();
    const { container } = render(
      <MarkdownPreview
        source={"# One\n\n## Two\n\n### Three"}
        onActiveHeadingChange={onActiveHeadingChange}
      />,
    );
    const preview = container.querySelector(".markdown-preview")!;
    // threshold = top(0) + height(400) * 0.25 = 100
    setRect(preview, 0, 400);
    const [h1, h2, h3] = Array.from(preview.querySelectorAll("h1, h2, h3"));
    setRect(h1, -50);
    setRect(h2, 50);
    setRect(h3, 150);
    fireEvent.scroll(preview);
    expect(onActiveHeadingChange).toHaveBeenLastCalledWith(1);
  });

  it("updates the active heading again as the container scrolls further", () => {
    const onActiveHeadingChange = vi.fn();
    const { container } = render(
      <MarkdownPreview
        source={"# One\n\n## Two"}
        onActiveHeadingChange={onActiveHeadingChange}
      />,
    );
    const preview = container.querySelector(".markdown-preview")!;
    setRect(preview, 0, 400);
    const [h1, h2] = Array.from(preview.querySelectorAll("h1, h2"));
    setRect(h1, -50);
    setRect(h2, 500);
    fireEvent.scroll(preview);
    expect(onActiveHeadingChange).toHaveBeenLastCalledWith(0);

    setRect(h2, 50);
    fireEvent.scroll(preview);
    expect(onActiveHeadingChange).toHaveBeenLastCalledWith(1);
  });
});

describe("MarkdownPreview: onDirectInteraction", () => {
  it("does not fire for the initial mount recompute", () => {
    const onDirectInteraction = vi.fn();
    render(
      <MarkdownPreview source={"# One\n\n## Two"} onDirectInteraction={onDirectInteraction} />,
    );
    expect(onDirectInteraction).not.toHaveBeenCalled();
  });

  it("does not fire for a recompute triggered by a content change alone", () => {
    const onDirectInteraction = vi.fn();
    const { rerender } = render(
      <MarkdownPreview source={"# One"} onDirectInteraction={onDirectInteraction} />,
    );
    rerender(<MarkdownPreview source={"# One\n\n## Two"} onDirectInteraction={onDirectInteraction} />);
    expect(onDirectInteraction).not.toHaveBeenCalled();
  });

  it("fires on a real scroll event", () => {
    const onDirectInteraction = vi.fn();
    const { container } = render(
      <MarkdownPreview source={"# One\n\n## Two"} onDirectInteraction={onDirectInteraction} />,
    );
    const preview = container.querySelector(".markdown-preview")!;
    fireEvent.scroll(preview);
    expect(onDirectInteraction).toHaveBeenCalledTimes(1);
  });

  it("fires on a click anywhere inside the preview, not only on a wikilink", () => {
    const onDirectInteraction = vi.fn();
    const { container } = render(
      <MarkdownPreview source={"Just a paragraph."} onDirectInteraction={onDirectInteraction} />,
    );
    const preview = container.querySelector(".markdown-preview")!;
    fireEvent.click(preview);
    expect(onDirectInteraction).toHaveBeenCalledTimes(1);
  });

  it("fires on a keydown inside the preview", () => {
    const onDirectInteraction = vi.fn();
    const { container } = render(
      <MarkdownPreview source={"# One"} onDirectInteraction={onDirectInteraction} />,
    );
    const preview = container.querySelector(".markdown-preview")!;
    fireEvent.keyDown(preview, { key: "Tab" });
    expect(onDirectInteraction).toHaveBeenCalledTimes(1);
  });

  it("does not require onDirectInteraction to be supplied", () => {
    const { container } = render(<MarkdownPreview source={"# One"} />);
    const preview = container.querySelector(".markdown-preview")!;
    expect(() => fireEvent.scroll(preview)).not.toThrow();
    expect(() => fireEvent.click(preview)).not.toThrow();
  });
});
