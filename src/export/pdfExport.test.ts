import { describe, expect, it, vi } from "vitest";
import {
  buildPdfDocument,
  exportNotePdf,
  pdfFileName,
  waitForPrintAssets,
} from "./pdfExport";

describe("pdfFileName", () => {
  it("keeps an ordinary note name", () => {
    expect(pdfFileName("Trip plan 2026")).toBe("Trip plan 2026");
  });

  it("strips path separators, reserved characters and control characters", () => {
    expect(pdfFileName('a/b\\c:d*e?f"g<h>i|j\u0000k\nl')).toBe(
      "a b c d e f g h i j k l",
    );
  });

  it("never returns an empty name or a dot-only name", () => {
    expect(pdfFileName("")).toBe("note");
    expect(pdfFileName("   ")).toBe("note");
    expect(pdfFileName("..")).toBe("note");
    expect(pdfFileName("///")).toBe("note");
  });

  it("limits very long names", () => {
    expect(pdfFileName("x".repeat(500)).length).toBeLessThanOrEqual(120);
  });
});

describe("buildPdfDocument", () => {
  const doc = buildPdfDocument(
    "My: Note",
    "<h1>Hi</h1><pre><code>x</code></pre>",
  );

  it("uses the safe file name as the document title and embeds the body", () => {
    expect(doc).toContain("<title>My  Note</title>".replace("  ", " "));
    expect(doc).toContain("<h1>Hi</h1><pre><code>x</code></pre>");
  });

  it("declares an A4 page with margins", () => {
    expect(doc).toMatch(/@page\s*\{[^}]*size:\s*A4/);
    expect(doc).toMatch(/@page\s*\{[^}]*margin:/);
  });

  it("keeps headings with the next block and avoids splitting code, rows, images and diagrams", () => {
    expect(doc).toMatch(/h1,\s*h2,[^{]*\{[^}]*break-after:\s*avoid/);
    expect(doc).toMatch(/pre[^{]*\{[^}]*break-inside:\s*avoid/);
    expect(doc).toMatch(/tr[^{]*\{[^}]*break-inside:\s*avoid/);
    expect(doc).toMatch(/img[^{]*\{[^}]*break-inside:\s*avoid/);
    expect(doc).toMatch(/thead\s*\{[^}]*display:\s*table-header-group/);
  });

  it("wraps long code lines instead of clipping them", () => {
    expect(doc).toMatch(/pre[^{]*\{[^}]*white-space:\s*pre-wrap/);
  });

  it("scales images and diagrams to the page and gives diagrams a white background", () => {
    expect(doc).toMatch(/svg[^{]*\{[^}]*max-width:\s*100%/);
    expect(doc).toMatch(/svg[^{]*\{[^}]*background:\s*#fff/);
    expect(doc).toMatch(/img[^{]*\{[^}]*max-height:/);
  });

  it("prints collapsed details open and hides preview-only controls", () => {
    expect(doc).toContain("details");
    expect(doc).toContain(".block-link-copy");
  });

  it("includes the KaTeX stylesheet so math prints as rendered", () => {
    expect(doc).toContain(".katex");
  });

  it("keeps the dark-theme background out of the printed page", () => {
    expect(doc).toContain("color-scheme: light");
    expect(doc).toMatch(/print-color-adjust:\s*exact/);
  });
});

describe("waitForPrintAssets", () => {
  function fakeWin(
    images: Array<{ complete: boolean }>,
    fonts?: { ready: Promise<unknown> },
  ) {
    const listeners: Array<{ img: unknown; type: string; fn: () => void }> = [];
    const imgs = images.map((i) => ({
      complete: i.complete,
      addEventListener: (type: string, fn: () => void) =>
        listeners.push({ img: i, type, fn }),
    }));
    const win = { document: { images: imgs, fonts } } as unknown as Window;
    return { win, imgs, listeners };
  }

  it("resolves at once when every image is complete and fonts are ready", async () => {
    const { win } = fakeWin([{ complete: true }], { ready: Promise.resolve() });
    await expect(waitForPrintAssets(win, 50)).resolves.toBeUndefined();
  });

  it("waits for a pending image to load", async () => {
    const { win, listeners } = fakeWin([{ complete: false }]);
    let done = false;
    const p = waitForPrintAssets(win, 5000).then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);
    listeners.find((l) => l.type === "load")!.fn();
    await p;
    expect(done).toBe(true);
  });

  it("treats an image error as finished", async () => {
    const { win, listeners } = fakeWin([{ complete: false }]);
    const p = waitForPrintAssets(win, 5000);
    listeners.find((l) => l.type === "error")!.fn();
    await expect(p).resolves.toBeUndefined();
  });

  it("gives up after the timeout when an image never finishes", async () => {
    vi.useFakeTimers();
    try {
      const { win } = fakeWin([{ complete: false }]);
      const p = waitForPrintAssets(win, 200);
      await vi.advanceTimersByTimeAsync(200);
      await expect(p).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not fail when the fonts API is missing or its promise rejects", async () => {
    await expect(
      waitForPrintAssets(fakeWin([]).win, 50),
    ).resolves.toBeUndefined();
    const rejecting = fakeWin([], {
      ready: Promise.reject(new Error("no fonts")),
    });
    await expect(
      waitForPrintAssets(rejecting.win, 50),
    ).resolves.toBeUndefined();
  });
});

describe("exportNotePdf", () => {
  it("inlines images, then prints the PDF document under the safe file name after waiting for assets", async () => {
    const order: string[] = [];
    const inline = vi.fn(async (html: string) => {
      order.push("inline");
      return html.replace("asset://a.png", "data:image/png;base64,AAAA");
    });
    const print = vi.fn(async () => {
      order.push("print");
    });
    await exportNotePdf("Plan/B", '<img src="asset://a.png">', {
      inline,
      print,
    });
    expect(order).toEqual(["inline", "print"]);
    const [title, body, deps] = print.mock.calls[0] as unknown as [
      string,
      string,
      {
        buildDocument: (t: string, b: string) => string;
        waitForAssets: unknown;
      },
    ];
    expect(title).toBe("Plan B");
    expect(body).toContain("data:image/png;base64,AAAA");
    expect(deps.waitForAssets).toBe(waitForPrintAssets);
    expect(deps.buildDocument("T", "<p>x</p>")).toContain("@page");
  });

  it("still prints the original HTML when image inlining throws", async () => {
    const inline = vi.fn(async () => {
      throw new Error("boom");
    });
    const print = vi.fn(async () => {});
    await exportNotePdf("N", "<p>x</p>", { inline, print });
    expect((print.mock.calls[0] as unknown[])[1]).toBe("<p>x</p>");
  });

  it("propagates a print failure so the caller can alert", async () => {
    const print = vi.fn(async () => {
      throw new Error("no print");
    });
    await expect(
      exportNotePdf("N", "<p>x</p>", { inline: async (h) => h, print }),
    ).rejects.toThrow("no print");
  });
});
