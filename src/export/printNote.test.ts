import { describe, expect, it, vi } from "vitest";
import { buildPrintDocument, printNoteHtml } from "./printNote";

describe("buildPrintDocument", () => {
  it("embeds the given body HTML verbatim inside the document", () => {
    const doc = buildPrintDocument("My Note", "<h1>Hello</h1><p>World</p>");
    expect(doc).toContain("<h1>Hello</h1><p>World</p>");
    expect(doc.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(doc).toContain('<meta charset="UTF-8">');
  });

  it("escapes an unsafe title so it cannot break out of <title> or inject markup", () => {
    const doc = buildPrintDocument('A & B <script>alert(1)</script>', "<p>body</p>");
    expect(doc).not.toContain("<script>alert(1)</script>");
    expect(doc).toContain("A &amp; B &lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("still includes a print stylesheet so the exported document is not bare unstyled markup", () => {
    const doc = buildPrintDocument("Title", "<p>x</p>");
    expect(doc).toContain("<style>");
    expect(doc).toContain("@media print");
  });
});

describe("printNoteHtml", () => {
  it("writes the note into a throwaway iframe, triggers print on its window, then removes the iframe", () => {
    vi.useFakeTimers();
    try {
      const triggerPrint = vi.fn();
      const bodyBefore = document.querySelectorAll("iframe").length;

      printNoteHtml("My Note", "<h1>Hello</h1>", { triggerPrint, cleanupDelayMs: 500 });

      const iframes = document.querySelectorAll("iframe");
      expect(iframes.length).toBe(bodyBefore + 1);
      const iframe = iframes[iframes.length - 1] as HTMLIFrameElement;

      // The iframe's own document actually received the built print
      // document, not just an empty/blank frame.
      expect(iframe.contentDocument?.title).toBe("My Note");
      expect(iframe.contentDocument?.body.innerHTML).toContain("<h1>Hello</h1>");

      // print() is called on the iframe's own window, not the host
      // window: printing only this content, never the whole app chrome.
      expect(triggerPrint).toHaveBeenCalledTimes(1);
      expect(triggerPrint).toHaveBeenCalledWith(iframe.contentWindow);

      // Not removed immediately: some webviews read the document
      // asynchronously after print() returns.
      expect(document.contains(iframe)).toBe(true);

      vi.advanceTimersByTime(500);
      expect(document.contains(iframe)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cleans up without calling print when the iframe exposes no contentWindow/contentDocument", () => {
    const fakeIframe = {
      style: {},
      setAttribute: vi.fn(),
      contentDocument: null,
      contentWindow: null,
      remove: vi.fn(),
    };
    const fakeDoc = {
      createElement: vi.fn(() => fakeIframe),
      body: { appendChild: vi.fn() },
    } as unknown as Document;
    const triggerPrint = vi.fn();

    printNoteHtml("My Note", "<p>x</p>", { doc: fakeDoc, triggerPrint });

    expect(triggerPrint).not.toHaveBeenCalled();
    expect(fakeIframe.remove).toHaveBeenCalledTimes(1);
  });

  it("calls window.print() directly when no triggerPrint override is given", () => {
    vi.useFakeTimers();
    try {
      const printSpy = vi.fn();
      const fakeWin = { print: printSpy, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as Window;
      const fakeIframeDoc = { open: vi.fn(), write: vi.fn(), close: vi.fn() } as unknown as Document;
      const fakeIframe = {
        style: {},
        setAttribute: vi.fn(),
        contentDocument: fakeIframeDoc,
        contentWindow: fakeWin,
        remove: vi.fn(),
      };
      const fakeDoc = {
        createElement: vi.fn(() => fakeIframe),
        body: { appendChild: vi.fn() },
      } as unknown as Document;

      printNoteHtml("Title", "<p>x</p>", { doc: fakeDoc });

      expect(printSpy).toHaveBeenCalledTimes(1);
      expect(fakeIframeDoc.write).toHaveBeenCalledWith(expect.stringContaining("<p>x</p>"));

      vi.advanceTimersByTime(1000);
      expect(fakeIframe.remove).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cleans up as soon as the iframe window fires afterprint, without waiting for the fallback timeout", () => {
    vi.useFakeTimers();
    try {
      const listeners: Record<string, () => void> = {};
      const fakeWin = {
        print: vi.fn(),
        addEventListener: vi.fn((event: string, handler: () => void) => {
          listeners[event] = handler;
        }),
        removeEventListener: vi.fn(),
      } as unknown as Window;
      const fakeIframeDoc = { open: vi.fn(), write: vi.fn(), close: vi.fn() } as unknown as Document;
      const fakeIframe = {
        style: {},
        setAttribute: vi.fn(),
        contentDocument: fakeIframeDoc,
        contentWindow: fakeWin,
        remove: vi.fn(),
      };
      const fakeDoc = {
        createElement: vi.fn(() => fakeIframe),
        body: { appendChild: vi.fn() },
      } as unknown as Document;

      printNoteHtml("Title", "<p>x</p>", { doc: fakeDoc, cleanupDelayMs: 60_000 });

      expect(fakeIframe.remove).not.toHaveBeenCalled();
      listeners["afterprint"]();
      expect(fakeIframe.remove).toHaveBeenCalledTimes(1);

      // The fallback timeout firing afterward must not remove it a
      // second time (or throw), now that afterprint already cleaned up.
      vi.advanceTimersByTime(60_000);
      expect(fakeIframe.remove).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
