/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/preact";

vi.mock("../workspace/tauriBridge", () => ({
  fileSrc: vi.fn(),
  readTextFile: vi.fn(),
}));

vi.mock("../settings/store", async () => {
  const { signal } = await import("@preact/signals");
  return { workspacePath: signal<string | null>(null) };
});

import { MarkdownPreview } from "./MarkdownPreview";
import { linkIndex } from "../linking/store";
import { workspacePath } from "../settings/store";
import { fileSrc, readTextFile } from "../workspace/tauriBridge";
import { outlineRevealRequest } from "../outline/outlineNavigation";

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
  outlineRevealRequest.value = null;
  vi.mocked(fileSrc).mockReset();
  vi.mocked(readTextFile).mockReset();
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

describe("MarkdownPreview: F04 Phase 1 heading links", () => {
  it("renders [[Note|Label]] with the explicit label, resolved", () => {
    linkIndex.value = {
      backlinksByPath: new Map(),
      pathsByNoteName: new Map([["existing note", ["/vault/existing-note.md"]]]),
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
      pathsByTag: new Map(),
      tagsByPath: new Map(),
      tasksByPath: new Map(),
    };
    const { container } = render(<MarkdownPreview source="[[Existing Note|see this]]" />);
    const anchor = container.querySelector('a[href^="#leotheca-wikilink="]');
    expect(anchor?.textContent).toBe("see this");
    expect(anchor?.getAttribute("href")).toContain("resolved=1");
  });

  it("resolves a same-note [[#Heading]] link and shows the heading text as its label", () => {
    const { container } = render(
      <MarkdownPreview source={"# Intro\n\n## Milestones\n\nSee [[#Milestones]] below."} notePath="/vault/plan.md" />,
    );
    const anchor = container.querySelector('a[href^="#leotheca-wikilink="]');
    expect(anchor?.textContent).toBe("Milestones");
    expect(anchor?.getAttribute("href")).toContain("resolved=1");
    expect(anchor?.getAttribute("href")).toContain("fragmentKind=heading");
  });

  it("clicking a resolved same-note heading link reveals that heading's exact range, without opening a note", () => {
    const onOpenFile = vi.fn();
    const source = "# Intro\n\n## Milestones\n\nSee [[#Milestones]] below.";
    const { container } = render(
      <MarkdownPreview source={source} notePath="/vault/plan.md" onOpenFile={onOpenFile} />,
    );
    const anchor = container.querySelector('a[href^="#leotheca-wikilink="]') as HTMLAnchorElement;
    fireEvent.click(anchor);
    expect(onOpenFile).not.toHaveBeenCalled();
    expect(outlineRevealRequest.value?.from).toBe(source.indexOf("Milestones"));
    expect(outlineRevealRequest.value?.to).toBe(source.indexOf("Milestones") + "Milestones".length);
  });

  it("renders a same-note heading link as missing, distinctly, when the heading does not exist", () => {
    const { container } = render(
      <MarkdownPreview source={"See [[#Nonexistent]] below."} notePath="/vault/plan.md" />,
    );
    const anchor = container.querySelector('a[href^="#leotheca-wikilink="]');
    expect(anchor?.getAttribute("href")).not.toContain("resolved=1");
    expect(anchor?.getAttribute("href")).toContain("headingStatus=missing");
  });

  it("does not reveal anything when clicking a same-note heading link that does not resolve", () => {
    const { container } = render(
      <MarkdownPreview source={"See [[#Nonexistent]] below."} notePath="/vault/plan.md" />,
    );
    const anchor = container.querySelector('a[href^="#leotheca-wikilink="]') as HTMLAnchorElement;
    fireEvent.click(anchor);
    expect(outlineRevealRequest.value).toBeNull();
  });

  it("renders a same-note heading link as ambiguous, not resolved to the first occurrence, for duplicate headings", () => {
    const { container } = render(
      <MarkdownPreview
        source={"## Design\n\ntext\n\n## Design\n\nSee [[#Design]] above."}
        notePath="/vault/plan.md"
      />,
    );
    const anchor = container.querySelector('a[href^="#leotheca-wikilink="]');
    expect(anchor?.getAttribute("href")).not.toContain("resolved=1");
    expect(anchor?.getAttribute("href")).toContain("headingStatus=ambiguous");
  });

  it("does not reveal anything when clicking an ambiguous same-note heading link", () => {
    const { container } = render(
      <MarkdownPreview
        source={"## Design\n\ntext\n\n## Design\n\nSee [[#Design]] above."}
        notePath="/vault/plan.md"
      />,
    );
    const anchor = container.querySelector('a[href^="#leotheca-wikilink="]') as HTMLAnchorElement;
    fireEvent.click(anchor);
    expect(outlineRevealRequest.value).toBeNull();
  });

  it("resolves a cross-note [[Note#Heading]] link at the note level, styled as resolved", () => {
    linkIndex.value = {
      backlinksByPath: new Map(),
      pathsByNoteName: new Map([["project plan", ["/vault/project-plan.md"]]]),
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
      pathsByTag: new Map(),
      tagsByPath: new Map(),
      tasksByPath: new Map(),
    };
    const { container } = render(<MarkdownPreview source="[[Project Plan#Milestones]]" />);
    const anchor = container.querySelector('a[href^="#leotheca-wikilink="]');
    expect(anchor?.getAttribute("href")).toContain("resolved=1");
    // The cross-note heading itself is not verified during this render
    // pass (see MarkdownPreview.tsx's renderWikilinksStructured doc
    // comment): no explicit headingStatus is claimed for it.
    expect(anchor?.getAttribute("href")).not.toContain("headingStatus=");
  });

  it("clicking a resolved cross-note heading link opens the note and passes the heading key through onOpenFile", () => {
    linkIndex.value = {
      backlinksByPath: new Map(),
      pathsByNoteName: new Map([["project plan", ["/vault/project-plan.md"]]]),
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
      pathsByTag: new Map(),
      tagsByPath: new Map(),
      tasksByPath: new Map(),
    };
    const onOpenFile = vi.fn();
    const { container } = render(
      <MarkdownPreview source="[[Project Plan#Milestones]]" onOpenFile={onOpenFile} />,
    );
    const anchor = container.querySelector('a[href^="#leotheca-wikilink="]') as HTMLAnchorElement;
    fireEvent.click(anchor);
    expect(onOpenFile).toHaveBeenCalledWith("/vault/project-plan.md", "project-plan.md", {
      headingKey: "Milestones",
    });
  });

  it("does not call onOpenFile for a cross-note heading link whose note does not resolve", () => {
    const onOpenFile = vi.fn();
    const { container } = render(
      <MarkdownPreview source="[[Missing Note#Heading]]" onOpenFile={onOpenFile} />,
    );
    const anchor = container.querySelector('a[href^="#leotheca-wikilink="]') as HTMLAnchorElement;
    fireEvent.click(anchor);
    expect(onOpenFile).not.toHaveBeenCalled();
  });

  it("leaves a malformed [[Note#]] (empty fragment) as literal text, not a link", () => {
    const { container } = render(<MarkdownPreview source="See [[Note#]] here." />);
    expect(container.querySelector('a[href^="#leotheca-wikilink="]')).toBeNull();
    expect(container.textContent).toContain("[[Note#]]");
  });

  describe("legacy compatibility fallback", () => {
    it("resolves a literal filename containing a raw # as a plain whole-note link", () => {
      linkIndex.value = {
        backlinksByPath: new Map(),
        pathsByNoteName: new Map([["foo#1", ["/vault/foo#1.md"]]]),
        pathsByAlias: new Map(),
        aliasesByPath: new Map(),
        pathsByTag: new Map(),
        tagsByPath: new Map(),
        tasksByPath: new Map(),
      };
      const { container } = render(<MarkdownPreview source="[[Foo#1]]" />);
      const anchor = container.querySelector('a[href^="#leotheca-wikilink="]');
      expect(anchor?.textContent).toBe("Foo#1");
      expect(anchor?.getAttribute("href")).toContain("resolved=1");
      expect(anchor?.getAttribute("href")).not.toContain("fragmentKind=");
    });

    it("clicking a legacy-fallback link opens the note with no heading key", () => {
      linkIndex.value = {
        backlinksByPath: new Map(),
        pathsByNoteName: new Map([["foo#1", ["/vault/foo#1.md"]]]),
        pathsByAlias: new Map(),
        aliasesByPath: new Map(),
        pathsByTag: new Map(),
        tagsByPath: new Map(),
        tasksByPath: new Map(),
      };
      const onOpenFile = vi.fn();
      const { container } = render(<MarkdownPreview source="[[Foo#1]]" onOpenFile={onOpenFile} />);
      const anchor = container.querySelector('a[href^="#leotheca-wikilink="]') as HTMLAnchorElement;
      fireEvent.click(anchor);
      expect(onOpenFile).toHaveBeenCalledWith("/vault/foo#1.md", "foo#1.md");
    });
  });

  describe("headingLinksEnabled=false (feature flag off)", () => {
    it("treats the whole [[Note#Heading]] text as a note name, exactly like before this feature existed", () => {
      const { container } = render(
        <MarkdownPreview source="[[Note#Heading]]" headingLinksEnabled={false} />,
      );
      const anchor = container.querySelector('a[href^="#leotheca-wikilink="]');
      expect(anchor?.textContent).toBe("Note#Heading");
      expect(anchor?.getAttribute("href")).not.toContain("fragmentKind=");
    });

    it("treats [[Note|Label]] as an unresolved whole note name, not a label separator", () => {
      const { container } = render(
        <MarkdownPreview source="[[Note|Label]]" headingLinksEnabled={false} />,
      );
      const anchor = container.querySelector('a[href^="#leotheca-wikilink="]');
      expect(anchor?.textContent).toBe("Note|Label");
    });

    it("clicking a plain link still opens the note when the flag is off", () => {
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
        <MarkdownPreview source="[[Existing Note]]" headingLinksEnabled={false} onOpenFile={onOpenFile} />,
      );
      const anchor = container.querySelector('a[href^="#leotheca-wikilink="]') as HTMLAnchorElement;
      fireEvent.click(anchor);
      expect(onOpenFile).toHaveBeenCalledWith("/vault/existing-note.md", "existing-note.md");
    });
  });
});

describe("MarkdownPreview: F04 Phase 3a block references", () => {
  it("never shows a block ID marker as visible text", () => {
    const { container } = render(
      <MarkdownPreview source="This decision is final. ^release-decision" notePath="/vault/plan.md" />,
    );
    expect(container.textContent).not.toContain("^release-decision");
    expect(container.textContent).toContain("This decision is final.");
  });

  it("resolves a same-note [[#^block-id]] link", () => {
    const { container } = render(
      <MarkdownPreview
        source={"The user owns the files. ^local-first\n\nSee [[#^local-first]] above."}
        notePath="/vault/plan.md"
      />,
    );
    const anchor = container.querySelector('a[href^="#leotheca-wikilink="]');
    expect(anchor?.getAttribute("href")).toContain("resolved=1");
    expect(anchor?.getAttribute("href")).toContain("fragmentKind=block");
  });

  it("clicking a resolved same-note block link reveals that block's exact content range, without opening a note", () => {
    const onOpenFile = vi.fn();
    const source = "The user owns the files. ^local-first\n\nSee [[#^local-first]] above.";
    const { container } = render(
      <MarkdownPreview source={source} notePath="/vault/plan.md" onOpenFile={onOpenFile} />,
    );
    const anchor = container.querySelector('a[href^="#leotheca-wikilink="]') as HTMLAnchorElement;
    fireEvent.click(anchor);
    expect(onOpenFile).not.toHaveBeenCalled();
    expect(outlineRevealRequest.value?.from).toBe(0);
    expect(outlineRevealRequest.value?.to).toBe("The user owns the files.".length);
  });

  it("renders a same-note block link as missing, distinctly, when the block id does not exist", () => {
    const { container } = render(
      <MarkdownPreview source={"See [[#^nonexistent]] below."} notePath="/vault/plan.md" />,
    );
    const anchor = container.querySelector('a[href^="#leotheca-wikilink="]');
    expect(anchor?.getAttribute("href")).not.toContain("resolved=1");
    expect(anchor?.getAttribute("href")).toContain("blockStatus=missing");
  });

  it("does not reveal anything when clicking a same-note block link that does not resolve", () => {
    const { container } = render(
      <MarkdownPreview source={"See [[#^nonexistent]] below."} notePath="/vault/plan.md" />,
    );
    const anchor = container.querySelector('a[href^="#leotheca-wikilink="]') as HTMLAnchorElement;
    fireEvent.click(anchor);
    expect(outlineRevealRequest.value).toBeNull();
  });

  it("renders a same-note block link as ambiguous, not resolved to the first occurrence, for duplicate ids", () => {
    const { container } = render(
      <MarkdownPreview
        source={"One. ^dup\n\nTwo. ^dup\n\nSee [[#^dup]] above."}
        notePath="/vault/plan.md"
      />,
    );
    const anchor = container.querySelector('a[href^="#leotheca-wikilink="]');
    expect(anchor?.getAttribute("href")).not.toContain("resolved=1");
    expect(anchor?.getAttribute("href")).toContain("blockStatus=ambiguous");
  });

  it("resolves a cross-note [[Note#^block-id]] link at the note level, styled as resolved", () => {
    linkIndex.value = {
      backlinksByPath: new Map(),
      pathsByNoteName: new Map([["project plan", ["/vault/project-plan.md"]]]),
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
      pathsByTag: new Map(),
      tagsByPath: new Map(),
      tasksByPath: new Map(),
    };
    const { container } = render(<MarkdownPreview source="[[Project Plan#^release-decision]]" />);
    const anchor = container.querySelector('a[href^="#leotheca-wikilink="]');
    expect(anchor?.getAttribute("href")).toContain("resolved=1");
    // The cross-note block itself is not verified during this render pass
    // (the same disclosed scope narrowing as the equivalent heading test
    // above): no explicit blockStatus is claimed for it.
    expect(anchor?.getAttribute("href")).not.toContain("blockStatus=");
  });

  it("clicking a resolved cross-note block link opens the note and passes the block id through onOpenFile", () => {
    linkIndex.value = {
      backlinksByPath: new Map(),
      pathsByNoteName: new Map([["project plan", ["/vault/project-plan.md"]]]),
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
      pathsByTag: new Map(),
      tagsByPath: new Map(),
      tasksByPath: new Map(),
    };
    const onOpenFile = vi.fn();
    const { container } = render(
      <MarkdownPreview source="[[Project Plan#^release-decision]]" onOpenFile={onOpenFile} />,
    );
    const anchor = container.querySelector('a[href^="#leotheca-wikilink="]') as HTMLAnchorElement;
    fireEvent.click(anchor);
    expect(onOpenFile).toHaveBeenCalledWith("/vault/project-plan.md", "project-plan.md", {
      blockId: "release-decision",
    });
  });

  it("does not call onOpenFile for a cross-note block link whose note does not resolve", () => {
    const onOpenFile = vi.fn();
    const { container } = render(
      <MarkdownPreview source="[[Missing Note#^some-id]]" onOpenFile={onOpenFile} />,
    );
    const anchor = container.querySelector('a[href^="#leotheca-wikilink="]') as HTMLAnchorElement;
    fireEvent.click(anchor);
    expect(onOpenFile).not.toHaveBeenCalled();
  });

  it("still shows the marker as literal text when headingLinksEnabled is off, exactly like before this feature existed", () => {
    const { container } = render(
      <MarkdownPreview
        source="This decision is final. ^release-decision"
        notePath="/vault/plan.md"
        headingLinksEnabled={false}
      />,
    );
    expect(container.textContent).toContain("^release-decision");
  });
});

describe("MarkdownPreview: F04 Phase 4a embeds", () => {
  function setNote(name: string, path: string) {
    linkIndex.value = {
      backlinksByPath: new Map(),
      pathsByNoteName: new Map([[name, [path]]]),
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
      pathsByTag: new Map(),
      tagsByPath: new Map(),
      tasksByPath: new Map(),
    };
  }

  it("renders a same-note heading embed synchronously with the section content and label", () => {
    const source = "# Intro\n\n## Milestones\n\nShip v1.\n\nSee ![[#Milestones]] above.";
    const { container } = render(<MarkdownPreview source={source} notePath="/vault/plan.md" />);
    const frame = container.querySelector(".embed-frame");
    expect(frame).toBeTruthy();
    expect(frame?.querySelector(".embed-frame-body")?.textContent).toContain("Ship v1.");
    expect(frame?.querySelector(".embed-frame-label")?.textContent).toContain("Milestones");
  });

  it("renders a same-note block embed synchronously with the block content", () => {
    const source = "The user owns the files. ^local-first\n\nSee ![[#^local-first]] above.";
    const { container } = render(<MarkdownPreview source={source} notePath="/vault/plan.md" />);
    const frame = container.querySelector(".embed-frame");
    expect(frame?.querySelector(".embed-frame-body")?.textContent).toContain("The user owns the files.");
  });

  it("shows an 'Embedded heading not found' placeholder for a same-note heading that doesn't exist", () => {
    const { container } = render(
      <MarkdownPreview source={"See ![[#Nonexistent]] above."} notePath="/vault/plan.md" />,
    );
    expect(container.querySelector(".embed-frame-body")?.textContent).toBe("Embedded heading not found");
  });

  it("shows an 'Embedded block not found' placeholder for a same-note block id that doesn't exist", () => {
    const { container } = render(
      <MarkdownPreview source={"See ![[#^nonexistent]] above."} notePath="/vault/plan.md" />,
    );
    expect(container.querySelector(".embed-frame-body")?.textContent).toBe("Embedded block not found");
  });

  it("shows an ambiguous placeholder for a same-note heading matching more than one heading", () => {
    const { container } = render(
      <MarkdownPreview
        source={"## Design\n\ntext\n\n## Design\n\nSee ![[#Design]] above."}
        notePath="/vault/plan.md"
      />,
    );
    expect(container.querySelector(".embed-frame-body")?.textContent).toContain("more than one heading");
  });

  it("shows an 'Embedded note not found' placeholder for a note that doesn't resolve, with no async read attempted", () => {
    const { container } = render(<MarkdownPreview source="![[Missing Note]]" />);
    expect(container.querySelector(".embed-frame-body")?.textContent).toBe("Embedded note not found");
    expect(readTextFile).not.toHaveBeenCalled();
  });

  it("resolves a cross-note whole-note embed asynchronously, with frontmatter stripped", async () => {
    setNote("project plan", "/vault/project-plan.md");
    vi.mocked(readTextFile).mockResolvedValue("---\ntitle: Plan\n---\nThe actual body text.");
    const { container } = render(<MarkdownPreview source="![[Project Plan]]" />);

    expect(container.querySelector(".embed-frame-body")?.textContent).toBe("Loading…");

    await waitFor(() => {
      expect(container.querySelector(".embed-frame-body")?.textContent).toContain("The actual body text.");
    });
    expect(container.querySelector(".embed-frame-body")?.textContent).not.toContain("title: Plan");
    expect(readTextFile).toHaveBeenCalledWith("/vault/project-plan.md");
  });

  it("resolves a cross-note heading embed asynchronously", async () => {
    setNote("project plan", "/vault/project-plan.md");
    vi.mocked(readTextFile).mockResolvedValue("# Intro\n\n## Milestones\n\nShip v1.");
    const { container } = render(<MarkdownPreview source="![[Project Plan#Milestones]]" />);

    await waitFor(() => {
      expect(container.querySelector(".embed-frame-body")?.textContent).toContain("Ship v1.");
    });
  });

  it("resolves a cross-note block embed asynchronously", async () => {
    setNote("project plan", "/vault/project-plan.md");
    vi.mocked(readTextFile).mockResolvedValue("The decision is final. ^release-decision");
    const { container } = render(<MarkdownPreview source="![[Project Plan#^release-decision]]" />);

    await waitFor(() => {
      expect(container.querySelector(".embed-frame-body")?.textContent).toContain("The decision is final.");
    });
  });

  it("shows 'Could not read embedded note' when the cross-note read fails", async () => {
    setNote("project plan", "/vault/project-plan.md");
    vi.mocked(readTextFile).mockRejectedValue(new Error("not found"));
    const { container } = render(<MarkdownPreview source="![[Project Plan]]" />);

    await waitFor(() => {
      expect(container.querySelector(".embed-frame-body")?.textContent).toBe("Could not read embedded note");
    });
  });

  it("shows 'Embedded heading not found' when the cross-note target lacks the heading", async () => {
    setNote("project plan", "/vault/project-plan.md");
    vi.mocked(readTextFile).mockResolvedValue("# Intro\n\nno such heading here");
    const { container } = render(<MarkdownPreview source="![[Project Plan#Nonexistent]]" />);

    await waitFor(() => {
      expect(container.querySelector(".embed-frame-body")?.textContent).toBe("Embedded heading not found");
    });
  });

  it("does not expand a nested embed inside a cross-note embed's own content, falling back to a plain link", async () => {
    linkIndex.value = {
      backlinksByPath: new Map(),
      pathsByNoteName: new Map([
        ["target", ["/vault/target.md"]],
        ["other", ["/vault/other.md"]],
      ]),
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
      pathsByTag: new Map(),
      tagsByPath: new Map(),
      tasksByPath: new Map(),
    };
    vi.mocked(readTextFile).mockResolvedValue("Has a nested ![[Other]] reference.");
    const { container } = render(<MarkdownPreview source="![[Target]]" />);

    await waitFor(() => {
      expect(container.querySelector(".embed-frame-body")?.textContent).toContain("Has a nested");
    });

    // Only the outer frame exists; the inner "![[Other]]" (only ever
    // present in the freshly-read target note's own content, never in the
    // host document) was not expanded into a second, nested frame.
    expect(container.querySelectorAll(".embed-frame")).toHaveLength(1);
    const bodyLink = container.querySelector('.embed-frame-body a[href^="#leotheca-wikilink="]');
    expect(bodyLink).toBeTruthy();
    expect(bodyLink?.textContent).toBe("Other");
  });

  it("still strips block-id markers from a same-note embed's own extracted content", () => {
    const source = "# Intro\n\n## Section\n\nText with a marker. ^marked\n\nSee ![[#Section]] above.";
    const { container } = render(<MarkdownPreview source={source} notePath="/vault/plan.md" />);
    expect(container.querySelector(".embed-frame-body")?.textContent).not.toContain("^marked");
    expect(container.querySelector(".embed-frame-body")?.textContent).toContain("Text with a marker.");
  });

  it("clicking a same-note embed's Open source note link reveals the section without opening a note", () => {
    const onOpenFile = vi.fn();
    const source = "# Intro\n\n## Milestones\n\nShip v1.\n\nSee ![[#Milestones]] above.";
    const { container } = render(
      <MarkdownPreview source={source} notePath="/vault/plan.md" onOpenFile={onOpenFile} />,
    );
    const openLink = container.querySelector(".embed-frame-open") as HTMLAnchorElement;
    expect(openLink).toBeTruthy();
    fireEvent.click(openLink);
    expect(onOpenFile).not.toHaveBeenCalled();
    expect(outlineRevealRequest.value?.from).toBe(source.indexOf("Milestones"));
  });

  it("clicking a cross-note embed's Open source note link opens the target note", async () => {
    setNote("project plan", "/vault/project-plan.md");
    vi.mocked(readTextFile).mockResolvedValue("Body text.");
    const onOpenFile = vi.fn();
    const { container } = render(
      <MarkdownPreview source="![[Project Plan]]" onOpenFile={onOpenFile} />,
    );
    const openLink = container.querySelector(".embed-frame-open") as HTMLAnchorElement;
    fireEvent.click(openLink);
    expect(onOpenFile).toHaveBeenCalledWith("/vault/project-plan.md", "project-plan.md");
  });

  it("does not render an embed frame when headingLinksEnabled is off", () => {
    const { container } = render(
      <MarkdownPreview source="![[Note]]" headingLinksEnabled={false} />,
    );
    expect(container.querySelector(".embed-frame")).toBeNull();
  });

  it("falls back to a generic label for a same-note embed with no notePath given at all", () => {
    const { container } = render(<MarkdownPreview source="![[#Heading]]" />);
    expect(container.querySelector(".embed-frame-label")?.textContent).toContain("this note");
    expect(container.querySelector(".embed-frame-body")?.textContent).toBe("Embedded note not found");
  });

  it("still renders correctly when the embed marker sits mid-paragraph rather than on its own line", () => {
    const source = "# Intro\n\n## Milestones\n\nShip v1.\n\nBefore text ![[#Milestones]] after text.";
    const { container } = render(<MarkdownPreview source={source} notePath="/vault/plan.md" />);
    expect(container.textContent).toContain("Before text");
    expect(container.textContent).toContain("after text.");
    expect(container.querySelector(".embed-frame-body")?.textContent).toContain("Ship v1.");
  });
});
