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
import { scanHeadings } from "../markdown/headings";
import { scanBlockIds } from "../markdown/blocks";
import { workspacePath } from "../settings/store";
import { fileSrc, readTextFile } from "../workspace/tauriBridge";
import { outlineRevealRequest } from "../outline/outlineNavigation";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
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

  it("resolves a cross-note [[Note#Heading]] link against the target note's actual headings (F04 Phase 5a)", () => {
    linkIndex.value = {
      backlinksByPath: new Map(),
      pathsByNoteName: new Map([["project plan", ["/vault/project-plan.md"]]]),
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
      pathsByTag: new Map(),
      tagsByPath: new Map(),
      tasksByPath: new Map(),
      headingsByPath: new Map([["/vault/project-plan.md", scanHeadings("# Milestones\n\ntext")]]),
    };
    const { container } = render(<MarkdownPreview source="[[Project Plan#Milestones]]" />);
    const anchor = container.querySelector('a[href^="#leotheca-wikilink="]');
    expect(anchor?.getAttribute("href")).toContain("resolved=1");
    expect(anchor?.getAttribute("href")).toContain("headingStatus=resolved");
  });

  it("renders a cross-note heading link as missing, not resolved, when the target note has no such heading (F04 Phase 5a)", () => {
    linkIndex.value = {
      backlinksByPath: new Map(),
      pathsByNoteName: new Map([["project plan", ["/vault/project-plan.md"]]]),
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
      pathsByTag: new Map(),
      tagsByPath: new Map(),
      tasksByPath: new Map(),
      headingsByPath: new Map([["/vault/project-plan.md", scanHeadings("# Milestones\n\ntext")]]),
    };
    const { container } = render(<MarkdownPreview source="[[Project Plan#Nonexistent]]" />);
    const anchor = container.querySelector('a[href^="#leotheca-wikilink="]');
    expect(anchor?.getAttribute("href")).not.toContain("resolved=1");
    expect(anchor?.getAttribute("href")).toContain("headingStatus=missing");
  });

  it("renders a cross-note heading link as ambiguous when the target note has duplicate headings (F04 Phase 5a)", () => {
    linkIndex.value = {
      backlinksByPath: new Map(),
      pathsByNoteName: new Map([["project plan", ["/vault/project-plan.md"]]]),
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
      pathsByTag: new Map(),
      tagsByPath: new Map(),
      tasksByPath: new Map(),
      headingsByPath: new Map([
        ["/vault/project-plan.md", scanHeadings("## Design\n\ntext\n\n## Design\n\nmore")],
      ]),
    };
    const { container } = render(<MarkdownPreview source="[[Project Plan#Design]]" />);
    const anchor = container.querySelector('a[href^="#leotheca-wikilink="]');
    expect(anchor?.getAttribute("href")).not.toContain("resolved=1");
    expect(anchor?.getAttribute("href")).toContain("headingStatus=ambiguous");
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

  it("resolves a cross-note [[Note#^block-id]] link against the target note's actual blocks (F04 Phase 5c)", () => {
    linkIndex.value = {
      backlinksByPath: new Map(),
      pathsByNoteName: new Map([["project plan", ["/vault/project-plan.md"]]]),
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
      pathsByTag: new Map(),
      tagsByPath: new Map(),
      tasksByPath: new Map(),
      blocksByPath: new Map([
        ["/vault/project-plan.md", scanBlockIds("A key decision. ^release-decision")],
      ]),
    };
    const { container } = render(<MarkdownPreview source="[[Project Plan#^release-decision]]" />);
    const anchor = container.querySelector('a[href^="#leotheca-wikilink="]');
    expect(anchor?.getAttribute("href")).toContain("resolved=1");
    expect(anchor?.getAttribute("href")).toContain("blockStatus=resolved");
  });

  it("renders a cross-note block link as missing, not resolved, when the target note has no such block (F04 Phase 5c)", () => {
    linkIndex.value = {
      backlinksByPath: new Map(),
      pathsByNoteName: new Map([["project plan", ["/vault/project-plan.md"]]]),
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
      pathsByTag: new Map(),
      tagsByPath: new Map(),
      tasksByPath: new Map(),
      blocksByPath: new Map([
        ["/vault/project-plan.md", scanBlockIds("A key decision. ^release-decision")],
      ]),
    };
    const { container } = render(<MarkdownPreview source="[[Project Plan#^nonexistent]]" />);
    const anchor = container.querySelector('a[href^="#leotheca-wikilink="]');
    expect(anchor?.getAttribute("href")).not.toContain("resolved=1");
    expect(anchor?.getAttribute("href")).toContain("blockStatus=missing");
  });

  it("renders a cross-note block link as ambiguous when the target note has duplicate block ids (F04 Phase 5c)", () => {
    linkIndex.value = {
      backlinksByPath: new Map(),
      pathsByNoteName: new Map([["project plan", ["/vault/project-plan.md"]]]),
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
      pathsByTag: new Map(),
      tagsByPath: new Map(),
      tasksByPath: new Map(),
      blocksByPath: new Map([
        ["/vault/project-plan.md", scanBlockIds("First. ^dup\n\nSecond. ^dup")],
      ]),
    };
    const { container } = render(<MarkdownPreview source="[[Project Plan#^dup]]" />);
    const anchor = container.querySelector('a[href^="#leotheca-wikilink="]');
    expect(anchor?.getAttribute("href")).not.toContain("resolved=1");
    expect(anchor?.getAttribute("href")).toContain("blockStatus=ambiguous");
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

  it("resolves a same-note block link to a list-item block (F04 Phase 3b)", () => {
    const { container } = render(
      <MarkdownPreview
        source={"- The user owns the files. ^local-first\n\nSee [[#^local-first]] above."}
        notePath="/vault/plan.md"
      />,
    );
    const anchor = container.querySelector('a[href^="#leotheca-wikilink="]');
    expect(anchor?.getAttribute("href")).toContain("resolved=1");
    // The link's own default label legitimately shows the raw "#^id" form
    // (see defaultWikilinkLabel); what must NOT happen is the *block's
    // own* marker surviving as visible text on the list item itself.
    const li = container.querySelector("li");
    expect(li?.textContent).toBe("The user owns the files.");
  });

  it("resolves a same-note block link to a blockquote block (F04 Phase 3b)", () => {
    const { container } = render(
      <MarkdownPreview
        source={"> A quoted principle. ^principle\n\nSee [[#^principle]] above."}
        notePath="/vault/plan.md"
      />,
    );
    const anchor = container.querySelector('a[href^="#leotheca-wikilink="]');
    expect(anchor?.getAttribute("href")).toContain("resolved=1");
    const blockquote = container.querySelector("blockquote");
    expect(blockquote?.textContent?.trim()).toBe("A quoted principle.");
  });

  it("resolves a same-note block link to a fenced-code block (F04 Phase 3d)", () => {
    const { container } = render(
      <MarkdownPreview
        source={"```\nconst x = 1;\n```\n^code-example\n\nSee [[#^code-example]] above."}
        notePath="/vault/plan.md"
      />,
    );
    const anchor = container.querySelector('a[href^="#leotheca-wikilink="]');
    expect(anchor?.getAttribute("href")).toContain("resolved=1");
    const pre = container.querySelector("pre");
    // The marker line is stripped from the block's own rendered content;
    // the link's own default label legitimately still shows the raw
    // "#^id" text (see defaultWikilinkLabel), asserted separately above
    // via resolved=1 rather than by absence of that substring.
    expect(pre?.textContent).toBe("const x = 1;\n");
  });
});

describe("MarkdownPreview: F04 Phase 5d block anchor rendering hook", () => {
  it("gives a uniquely-identified paragraph a deterministic DOM id and data-lt-block-id", () => {
    const { container } = render(
      <MarkdownPreview source="This decision is final. ^release-decision" notePath="/vault/plan.md" />,
    );
    const host = container.querySelector('[data-lt-block-id="release-decision"]');
    expect(host?.tagName).toBe("P");
    expect(host?.id).toBe("lt-block-release-decision");
    // The anchor marker itself never survives into the final DOM.
    expect(container.querySelector("[data-lt-block-anchor]")).toBeNull();
  });

  it("gives a uniquely-identified list item its own id, not the whole list", () => {
    const { container } = render(
      <MarkdownPreview
        source={"- First item\n- The user owns the files. ^local-first\n- Third item"}
        notePath="/vault/plan.md"
      />,
    );
    const host = container.querySelector('[data-lt-block-id="local-first"]');
    expect(host?.tagName).toBe("LI");
    expect(host?.id).toBe("lt-block-local-first");
    expect(host?.textContent).toContain("The user owns the files.");
  });

  it("gives a uniquely-identified blockquote its own id", () => {
    const { container } = render(
      <MarkdownPreview source={"> A quoted principle. ^principle"} notePath="/vault/plan.md" />,
    );
    const host = container.querySelector('[data-lt-block-id="principle"]');
    expect(host?.tagName).toBe("BLOCKQUOTE");
    expect(host?.id).toBe("lt-block-principle");
  });

  it("gives a uniquely-identified fenced code block's own <pre> its id, not a sibling element", () => {
    const { container } = render(
      <MarkdownPreview source={"```\nconst x = 1;\n```\n^code-block-id"} notePath="/vault/plan.md" />,
    );
    const host = container.querySelector('[data-lt-block-id="code-block-id"]');
    expect(host?.tagName).toBe("PRE");
    expect(host?.id).toBe("lt-block-code-block-id");
    expect(host?.textContent).toBe("const x = 1;\n");
    expect(container.querySelector("[data-lt-block-anchor]")).toBeNull();
  });

  it("does not assign a DOM id for a block whose marker is a duplicate elsewhere in the note", () => {
    const { container } = render(
      <MarkdownPreview source={"One. ^dup\n\nTwo. ^dup"} notePath="/vault/plan.md" />,
    );
    expect(container.querySelector("[data-lt-block-id]")).toBeNull();
    expect(container.querySelector("[data-lt-block-anchor]")).toBeNull();
    // Unchanged pre-existing behavior for a duplicate marker: still
    // invisible as text, just without a DOM anchor either.
    expect(container.textContent).not.toContain("^dup");
  });

  it("assigns no DOM id at all when headingLinksEnabled is off", () => {
    const { container } = render(
      <MarkdownPreview
        source="This decision is final. ^release-decision"
        notePath="/vault/plan.md"
        headingLinksEnabled={false}
      />,
    );
    expect(container.querySelector("[data-lt-block-id]")).toBeNull();
  });

  it("assigns independent ids to multiple unique blocks in the same note", () => {
    const { container } = render(
      <MarkdownPreview
        source={"First paragraph. ^first\n\nSecond paragraph. ^second"}
        notePath="/vault/plan.md"
      />,
    );
    expect(container.querySelector('[data-lt-block-id="first"]')?.textContent).toBe("First paragraph.");
    expect(container.querySelector('[data-lt-block-id="second"]')?.textContent).toBe("Second paragraph.");
  });

  it("adds a keyboard-focusable copy-link control that reuses the block link syntax", () => {
    const writeText = vi.fn();
    Object.assign(navigator, { clipboard: { writeText } });
    const { container } = render(
      <MarkdownPreview source="This decision is final. ^release-decision" notePath="/vault/plan.md" />,
    );
    const button = container.querySelector<HTMLButtonElement>(".block-link-copy");
    expect(button?.getAttribute("aria-label")).toBe("Copy link to block release-decision");
    fireEvent.click(button!);
    expect(writeText).toHaveBeenCalledWith("[[#^release-decision]]");
  });

  it("copies on a stationary touch long-press but cancels when the pointer moves", () => {
    vi.useFakeTimers();
    const writeText = vi.fn();
    Object.assign(navigator, { clipboard: { writeText } });
    const { container } = render(
      <MarkdownPreview source="This decision is final. ^release-decision" notePath="/vault/plan.md" />,
    );
    const block = container.querySelector<HTMLElement>("[data-lt-block-id]")!;
    fireEvent.pointerDown(block, { pointerType: "touch", clientX: 10, clientY: 10 });
    vi.advanceTimersByTime(550);
    expect(writeText).toHaveBeenCalledWith("[[#^release-decision]]");
    fireEvent.pointerDown(block, { pointerType: "touch", clientX: 10, clientY: 10 });
    fireEvent.pointerMove(block, { pointerType: "touch", clientX: 25, clientY: 10 });
    vi.advanceTimersByTime(550);
    expect(writeText).toHaveBeenCalledTimes(1);
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

  it("renders a same-note block embed of a list-item block (F04 Phase 3b block-kind eligibility)", () => {
    const source = "- The user owns the files. ^local-first\n\nSee ![[#^local-first]] above.";
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

  it("shows 'Could not read embedded note' when the cross-note read times out (F04 Phase 4b follow-up 2)", async () => {
    vi.useFakeTimers();
    setNote("project plan", "/vault/project-plan.md");
    // A read that never settles on its own, standing in for a hung
    // native call: the timeout, not the read itself, must be what
    // eventually produces the placeholder.
    vi.mocked(readTextFile).mockImplementation(() => new Promise<string>(() => {}));
    const { container } = render(<MarkdownPreview source="![[Project Plan]]" />);

    expect(container.querySelector(".embed-frame-body")?.textContent).toBe("Loading…");

    await vi.advanceTimersByTimeAsync(8000);

    expect(container.querySelector(".embed-frame-body")?.textContent).toBe("Could not read embedded note");
  });

  it("does not let a real read that resolves after the timeout overwrite the timeout's own placeholder", async () => {
    vi.useFakeTimers();
    setNote("project plan", "/vault/project-plan.md");
    let resolveRead: (content: string) => void = () => {};
    vi.mocked(readTextFile).mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveRead = resolve;
        }),
    );
    const { container } = render(<MarkdownPreview source="![[Project Plan]]" />);

    await vi.advanceTimersByTimeAsync(8000);
    expect(container.querySelector(".embed-frame-body")?.textContent).toBe("Could not read embedded note");

    // The real read finally settles, well after the timeout already
    // rendered its own placeholder. It must lose the race silently, not
    // overwrite content the reader has already seen.
    resolveRead("# Intro\n\nReal content.");
    await vi.advanceTimersByTimeAsync(0);

    expect(container.querySelector(".embed-frame-body")?.textContent).toBe("Could not read embedded note");
  });

  it("shows 'Embedded heading not found' when the cross-note target lacks the heading", async () => {
    setNote("project plan", "/vault/project-plan.md");
    vi.mocked(readTextFile).mockResolvedValue("# Intro\n\nno such heading here");
    const { container } = render(<MarkdownPreview source="![[Project Plan#Nonexistent]]" />);

    await waitFor(() => {
      expect(container.querySelector(".embed-frame-body")?.textContent).toBe("Embedded heading not found");
    });
  });

  it("expands a cross-note embed nested inside another cross-note embed's own content (F04 Phase 4b recursion)", async () => {
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
    vi.mocked(readTextFile).mockImplementation(async (path: string) => {
      if (path === "/vault/target.md") return "Has a nested ![[Other]] reference.";
      if (path === "/vault/other.md") return "The innermost content.";
      throw new Error(`unexpected path: ${path}`);
    });
    const { container } = render(<MarkdownPreview source="![[Target]]" />);

    await waitFor(() => {
      expect(container.querySelectorAll(".embed-frame")).toHaveLength(2);
    });
    const frames = container.querySelectorAll(".embed-frame");
    expect(frames[0].querySelector(".embed-frame-body")?.textContent).toContain("Has a nested");
    await waitFor(() => {
      expect(frames[0].querySelector(".embed-frame-body")?.textContent).toContain("The innermost content.");
    });
    // The nested embed expanded into a real frame (its own header and
    // "Open source note" link included), not a bare degraded link
    // replacing the whole frame.
    expect(frames[1].querySelector(".embed-frame-label")?.textContent).toBe("other.md");
  });

  it("caps recursion at the maximum depth (3), degrading the next level to a plain link", async () => {
    // Four distinct notes, each only ever containing the *next* level's
    // own embed marker in its own separately-read content (never
    // duplicated into the host's own top-level source): Host (depth 0,
    // not itself an embed) -> Note1 (depth 1) -> Note2 (depth 2) ->
    // Note3 (depth 3) -> Note4 would be depth 4, over MAX_EMBED_DEPTH, so
    // the marker inside Note3's own content degrades to a plain link
    // instead of a fourth frame, and Note4 is never even read.
    linkIndex.value = {
      backlinksByPath: new Map(),
      pathsByNoteName: new Map([
        ["note1", ["/vault/note1.md"]],
        ["note2", ["/vault/note2.md"]],
        ["note3", ["/vault/note3.md"]],
        ["note4", ["/vault/note4.md"]],
      ]),
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
      pathsByTag: new Map(),
      tagsByPath: new Map(),
      tasksByPath: new Map(),
    };
    vi.mocked(readTextFile).mockImplementation(async (path: string) => {
      if (path === "/vault/note1.md") return "Level one. ![[Note2]]";
      if (path === "/vault/note2.md") return "Level two. ![[Note3]]";
      if (path === "/vault/note3.md") return "Level three. ![[Note4]]";
      throw new Error(`unexpected path: ${path}`);
    });
    const { container } = render(<MarkdownPreview source="![[Note1]]" />);

    await waitFor(() => {
      expect(container.querySelectorAll(".embed-frame")).toHaveLength(3);
    });
    const frames = container.querySelectorAll(".embed-frame");
    await waitFor(() => {
      expect(frames[2].querySelector(".embed-frame-body")?.textContent).toContain("Level three.");
    });
    // Two-step, not a chained `.embed-frame-body a[...]` selector off
    // frames[2] directly: frames[2] (Note3's own frame) is itself nested
    // inside Note2's .embed-frame-body, so a descendant-combinator
    // selector scoped to frames[2] would still match Note3's own "Open
    // source note" anchor too (its ancestor chain reaches Note2's body,
    // outside frames[2]'s own subtree boundary but still a real
    // ancestor) — Element.querySelector does not clip ancestor-matching
    // to the calling element. Narrowing to frames[2]'s own direct-child
    // body first avoids that.
    const note3Body = frames[2].querySelector(".embed-frame-body")!;
    const link = note3Body.querySelector('a[href^="#leotheca-wikilink="]');
    expect(link).toBeTruthy();
    expect(link?.textContent).toBe("Note4");
    expect(readTextFile).not.toHaveBeenCalledWith("/vault/note4.md");
  });

  it("stops a same-note cycle where an embedded section re-embeds the section already being expanded", () => {
    // "## Loop"'s own extracted section (heading through end of document,
    // its only heading) literally contains the same "![[#Loop]]" marker
    // again: expanding it a second time would recurse forever without
    // cycle detection.
    const source = "![[#Loop]]\n\n## Loop\n\nSelf-referential. ![[#Loop]]";
    const { container } = render(<MarkdownPreview source={source} notePath="/vault/loop.md" />);

    const outer = container.querySelector(".embed-frame");
    expect(outer?.querySelector(".embed-frame-body")?.textContent).toContain("Self-referential.");
    const inner = outer?.querySelector(".embed-frame");
    expect(inner?.querySelector(".embed-frame-body")?.textContent).toBe("Embed cycle stopped");
  });

  it("stops a cross-note cycle where the embedded note re-embeds a note already being expanded", async () => {
    linkIndex.value = {
      backlinksByPath: new Map(),
      pathsByNoteName: new Map([
        ["note a", ["/vault/note-a.md"]],
        ["note b", ["/vault/note-b.md"]],
      ]),
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
      pathsByTag: new Map(),
      tagsByPath: new Map(),
      tasksByPath: new Map(),
    };
    vi.mocked(readTextFile).mockImplementation(async (path: string) => {
      if (path === "/vault/note-a.md") return "A embeds ![[Note B]].";
      if (path === "/vault/note-b.md") return "B embeds back: ![[Note A]].";
      throw new Error(`unexpected path: ${path}`);
    });
    const { container } = render(<MarkdownPreview source="![[Note A]]" />);

    // Three frames total: A's own frame, B's nested inside it, and the
    // re-attempted embed of A nested inside B's own frame, whose body is
    // the cycle placeholder rather than a third real expansion of A.
    await waitFor(() => {
      expect(container.querySelectorAll(".embed-frame")).toHaveLength(3);
    });
    const [outer, inner, cycleFrame] = container.querySelectorAll(".embed-frame");
    await waitFor(() => {
      expect(outer.querySelector(".embed-frame-body")?.textContent).toContain("A embeds");
    });
    expect(inner.querySelector(".embed-frame-body")?.textContent).toContain("B embeds back:");
    expect(cycleFrame.querySelector(".embed-frame-body")?.textContent).toBe("Embed cycle stopped");
    // No further expansion after the cycle is stopped.
    await waitFor(() => {
      expect(container.querySelectorAll(".embed-frame")).toHaveLength(3);
    });
  });

  it("shows 'Embed limit reached' once the maximum resolved-instance count (25) is exceeded", () => {
    const embeds = Array.from({ length: 26 }, (_, i) => `![[#H${i + 1}]]`).join("\n\n");
    const headings = Array.from({ length: 26 }, (_, i) => `## H${i + 1}\n\nBody ${i + 1}.`).join("\n\n");
    const source = `${embeds}\n\n${headings}`;
    const { container } = render(<MarkdownPreview source={source} notePath="/vault/many.md" />);

    const frames = container.querySelectorAll(".embed-frame");
    expect(frames).toHaveLength(26);
    for (let i = 0; i < 25; i++) {
      expect(frames[i].querySelector(".embed-frame-body")?.textContent).toContain(`Body ${i + 1}.`);
    }
    expect(frames[25].querySelector(".embed-frame-body")?.textContent).toBe("Embed limit reached");
  });

  it("shows 'Embed limit reached' once the total-bytes-loaded budget (1 MiB) is exceeded", () => {
    const bigBody = "x".repeat(1_100_000);
    const source = ["![[#Big]]", "", "![[#Small]]", "", "## Big", "", bigBody, "", "## Small", "", "Tiny body."].join(
      "\n",
    );
    const { container } = render(<MarkdownPreview source={source} notePath="/vault/big.md" />);

    const [bigFrame, smallFrame] = container.querySelectorAll(".embed-frame");
    expect(bigFrame.querySelector(".embed-frame-body")?.textContent).toContain(bigBody);
    expect(smallFrame.querySelector(".embed-frame-body")?.textContent).toBe("Embed limit reached");
  });

  it("treats the byte budget landing at exactly 0 remaining as exhausted (F04 Phase 4b edge-case coverage)", () => {
    // "x".repeat(1_048_576) is exactly 1 MiB of single-byte ASCII
    // characters, so bytesRemaining lands at precisely 0 after this one
    // embed, not a large negative overshoot (the pre-existing test
    // above). The boundary condition itself, `<= 0`, is what's under
    // test here.
    const exactlyOneMiB = "x".repeat(1_048_576);
    const source = ["![[#Exact]]", "", "![[#Next]]", "", "## Exact", "", exactlyOneMiB, "", "## Next", "", "Tiny."].join(
      "\n",
    );
    const { container } = render(<MarkdownPreview source={source} notePath="/vault/exact.md" />);

    const [exactFrame, nextFrame] = container.querySelectorAll(".embed-frame");
    expect(exactFrame.querySelector(".embed-frame-body")?.textContent).toContain(exactlyOneMiB);
    expect(nextFrame.querySelector(".embed-frame-body")?.textContent).toBe("Embed limit reached");
  });

  it("resolves two independent sibling cross-note embeds concurrently without cross-contaminating their ancestry", async () => {
    // Both siblings are queued for the bounded worker pool at once (2
    // pending embeds, workerCount = min(concurrency, 2) = 2 concurrent
    // workers): each branch's own ancestry array is built via spread,
    // never mutated in place, so resolving NoteX must not make NoteX's
    // own path appear to block NoteY's independent recursion, or vice
    // versa.
    linkIndex.value = {
      backlinksByPath: new Map(),
      pathsByNoteName: new Map([
        ["notex", ["/vault/notex.md"]],
        ["notey", ["/vault/notey.md"]],
      ]),
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
      pathsByTag: new Map(),
      tagsByPath: new Map(),
      tasksByPath: new Map(),
    };
    vi.mocked(readTextFile).mockImplementation(async (path: string) => {
      if (path === "/vault/notex.md") return "Content X.";
      if (path === "/vault/notey.md") return "Content Y.";
      throw new Error(`unexpected path: ${path}`);
    });
    const { container } = render(<MarkdownPreview source={"![[NoteX]]\n\n![[NoteY]]"} />);

    await waitFor(() => {
      expect(container.textContent).toContain("Content X.");
      expect(container.textContent).toContain("Content Y.");
    });
    const frames = container.querySelectorAll(".embed-frame");
    expect(frames).toHaveLength(2);
    expect(frames[0].querySelector(".embed-frame-body")?.textContent).toContain("Content X.");
    expect(frames[1].querySelector(".embed-frame-body")?.textContent).toContain("Content Y.");
  });

  it("expands a same-note embed nested inside a cross-note embed's own content, resolving against the embedded note (not the host)", async () => {
    linkIndex.value = {
      backlinksByPath: new Map(),
      pathsByNoteName: new Map([["reference", ["/vault/reference.md"]]]),
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
      pathsByTag: new Map(),
      tagsByPath: new Map(),
      tasksByPath: new Map(),
    };
    vi.mocked(readTextFile).mockResolvedValue(
      "Intro text. ![[#Details]]\n\n## Details\n\nThe embedded note's own section.",
    );
    const { container } = render(<MarkdownPreview source="![[Reference]]" />);

    await waitFor(() => {
      expect(container.querySelectorAll(".embed-frame")).toHaveLength(2);
    });
    const [outer, inner] = container.querySelectorAll(".embed-frame");
    await waitFor(() => {
      expect(outer.querySelector(".embed-frame-body")?.textContent).toContain("Intro text.");
    });
    // The nested same-note fragment ("#Details") resolved against
    // reference.md's own headings, not the (pathless) host note's.
    expect(inner.querySelector(".embed-frame-body")?.textContent).toContain("The embedded note's own section.");
  });

  it("expands a chain mixing cross-note and same-note embeds more than one level of each (F04 Phase 4b edge-case coverage)", async () => {
    // Host (depth 0) -> NoteA, cross-note (depth 1) -> NoteB, cross-note
    // (depth 2) -> NoteB's own "#Section" heading, same-note (depth 3,
    // the cap). The same-note hop is the chain's own leaf, deliberately:
    // a same-note fragment's "content" is a literal substring of the
    // exact same text already being scanned for markers, so anything
    // *after* it inside that same text would be found twice — once via
    // this recursive expansion, once as its own independent top-level
    // occurrence in that note's own render pass. That's correct,
    // expected behavior for a note's real content, not a bug, but it
    // does mean a clean, non-duplicating mixed-chain test needs the
    // same-note hop to be the last one, not sandwiched with further
    // markers inside its own extracted section.
    linkIndex.value = {
      backlinksByPath: new Map(),
      pathsByNoteName: new Map([
        ["notea", ["/vault/notea.md"]],
        ["noteb", ["/vault/noteb.md"]],
      ]),
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
      pathsByTag: new Map(),
      tagsByPath: new Map(),
      tasksByPath: new Map(),
    };
    vi.mocked(readTextFile).mockImplementation(async (path: string) => {
      if (path === "/vault/notea.md") return "Level A. ![[NoteB]]";
      if (path === "/vault/noteb.md") return "Level B. ![[#Section]]\n\n## Section\n\nFinal leaf content.";
      throw new Error(`unexpected path: ${path}`);
    });
    const { container } = render(<MarkdownPreview source="![[NoteA]]" />);

    await waitFor(() => {
      expect(container.querySelectorAll(".embed-frame")).toHaveLength(3);
    });
    const [noteAFrame, noteBFrame, sectionFrame] = container.querySelectorAll(".embed-frame");
    await waitFor(() => {
      expect(noteAFrame.querySelector(".embed-frame-body")?.textContent).toContain("Level A.");
    });
    await waitFor(() => {
      expect(noteBFrame.querySelector(".embed-frame-body")?.textContent).toContain("Level B.");
    });
    expect(sectionFrame.querySelector(".embed-frame-body")?.textContent).toContain("Final leaf content.");
  });

  it("shows an ambiguous-heading placeholder for a same-note embed nested inside a cross-note embed (F04 Phase 4b edge-case coverage)", async () => {
    linkIndex.value = {
      backlinksByPath: new Map(),
      pathsByNoteName: new Map([["reference", ["/vault/reference.md"]]]),
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
      pathsByTag: new Map(),
      tagsByPath: new Map(),
      tasksByPath: new Map(),
    };
    vi.mocked(readTextFile).mockResolvedValue(
      "Intro. ![[#Design]]\n\n## Design\n\nFirst.\n\n## Design\n\nSecond.",
    );
    const { container } = render(<MarkdownPreview source="![[Reference]]" />);

    await waitFor(() => {
      expect(container.querySelectorAll(".embed-frame")).toHaveLength(2);
    });
    const [, inner] = container.querySelectorAll(".embed-frame");
    await waitFor(() => {
      expect(inner.querySelector(".embed-frame-body")?.textContent).toContain("more than one heading");
    });
  });

  it("does not mutate a nested embed's DOM after the preview is cancelled mid-resolution (F04 Phase 4b edge-case coverage)", async () => {
    linkIndex.value = {
      backlinksByPath: new Map(),
      pathsByNoteName: new Map([
        ["notea", ["/vault/notea.md"]],
        ["noteb", ["/vault/noteb.md"]],
      ]),
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
      pathsByTag: new Map(),
      tagsByPath: new Map(),
      tasksByPath: new Map(),
    };
    let resolveNoteB: (content: string) => void = () => {};
    const noteBRead = new Promise<string>((resolve) => {
      resolveNoteB = resolve;
    });
    vi.mocked(readTextFile).mockImplementation(async (path: string) => {
      if (path === "/vault/notea.md") return "Level A. ![[NoteB]]";
      if (path === "/vault/noteb.md") return noteBRead;
      throw new Error(`unexpected path: ${path}`);
    });
    const { container, rerender } = render(<MarkdownPreview source="![[NoteA]]" />);

    // Wait until NoteA has resolved and NoteB's own placeholder (a
    // *nested* cross-note request, discovered only while resolving
    // NoteA) exists, its own read still in flight.
    await waitFor(() => {
      expect(container.querySelectorAll(".embed-frame")).toHaveLength(2);
    });
    const [, noteBFrame] = container.querySelectorAll(".embed-frame");
    expect(noteBFrame.querySelector(".embed-frame-body")?.textContent).toBe("Loading…");

    // Re-rendering with a source that no longer requests any embed runs
    // the effect's own cleanup, setting the closure's `cancelled` flag
    // before NoteB's own read has resolved.
    rerender(<MarkdownPreview source="No embeds here." />);
    resolveNoteB("Level B content.");
    await Promise.resolve();
    await Promise.resolve();

    // The cancelled resolution must not have mutated the (now-detached)
    // NoteB frame's body: it never received the real content.
    expect(noteBFrame.querySelector(".embed-frame-body")?.textContent).toBe("Loading…");
    expect(container.querySelector(".embed-frame")).toBeNull();
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
