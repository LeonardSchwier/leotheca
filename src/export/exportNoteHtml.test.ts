import { describe, expect, it, vi } from "vitest";
import { buildExportDocument, inlineLocalImages } from "./exportNoteHtml";

function fakeImageResponse(bytes: number[], type = "image/png"): Response {
  return {
    ok: true,
    blob: async () => new Blob([new Uint8Array(bytes)], { type }),
  } as unknown as Response;
}

describe("inlineLocalImages", () => {
  it("replaces a non-data src with a data: URI fetched from that src", async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      expect(String(url)).toBe("asset://localhost/workspace/attachments/pic.png");
      return fakeImageResponse([1, 2, 3]);
    });

    const out = await inlineLocalImages(
      '<p><img src="asset://localhost/workspace/attachments/pic.png" alt="pic"></p>',
      { fetchImpl },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(out).toContain('alt="pic"');
    expect(out).toMatch(/<img[^>]+src="data:image\/png;base64,/);
    expect(out).not.toContain("asset://");
  });

  it("leaves an already-data: image untouched and never fetches it", async () => {
    const fetchImpl = vi.fn();
    const html = '<img src="data:image/png;base64,AAAA">';

    const out = await inlineLocalImages(html, { fetchImpl });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(out).toContain('src="data:image/png;base64,AAAA"');
  });

  it("leaves the original src in place when the fetch fails, rather than dropping the image or throwing", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network-ish failure");
    });

    const out = await inlineLocalImages('<img src="asset://localhost/missing.png">', { fetchImpl });

    expect(out).toContain('src="asset://localhost/missing.png"');
  });

  it("leaves the original src in place when the fetch resolves but is not ok", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, blob: vi.fn() }) as unknown as Response);

    const out = await inlineLocalImages('<img src="asset://localhost/missing.png">', { fetchImpl });

    expect(out).toContain('src="asset://localhost/missing.png"');
  });

  it("resolves every image independently, so one failure doesn't block the others", async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes("bad")) throw new Error("fail");
      return fakeImageResponse([9]);
    });

    const out = await inlineLocalImages(
      '<img src="asset://good1.png"><img src="asset://bad.png"><img src="asset://good2.png">',
      { fetchImpl },
    );

    expect(out).toContain('src="asset://bad.png"');
    expect((out.match(/data:image\/png;base64,/g) ?? []).length).toBe(2);
  });

  it("returns unchanged HTML when there are no images", async () => {
    const fetchImpl = vi.fn();
    const out = await inlineLocalImages("<p>Just text, no images.</p>", { fetchImpl });
    expect(out).toBe("<p>Just text, no images.</p>");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("inlineLocalImages — faithful fragment pass-through (regression)", () => {
  // These use the REAL DOMParser (provided by the jsdom test environment), not
  // the non-mutating `new DOMParser()` that the tests above inject. A
  // spec-conformant HTML parser restructures fragments that are not body-legal
  // (tables, divs inside p, unclosed tags), so this is the environment where
  // the old `return parsed.body.innerHTML` implementation corrupted every
  // non-image note it was asked to pass through.
  function realDeps() {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      calls.push(String(url));
      return fakeImageResponse([1, 2, 3]);
    });
    return { deps: { fetchImpl, parser: new DOMParser() }, calls };
  }

  it("does not restructure a table (no image present)", async () => {
    const { deps } = realDeps();
    const html = "<table><tr><td>a</td><td>b</td></tr></table>";
    const out = await inlineLocalImages(html, deps);
    expect(out).toBe(html);
  });

  it("does not restructure a div nested in a paragraph (no image present)", async () => {
    const { deps } = realDeps();
    const html = "<p>hello<div>world</div></p>";
    const out = await inlineLocalImages(html, deps);
    expect(out).toBe(html);
  });

  it("does not repair unclosed tags (no image present)", async () => {
    const { deps } = realDeps();
    const html = "<p><strong>bold</p>";
    const out = await inlineLocalImages(html, deps);
    expect(out).toBe(html);
  });

  it("still inlines images while leaving the surrounding fragment byte-for-byte", async () => {
    const { deps } = realDeps();
    const html = '<table><tr><td><img src="asset://image/1"></td></tr></table><p>after</p>';
    const out = await inlineLocalImages(html, deps);
    // The img src is inlined to the data URI; the table/p structure is preserved
    // exactly as it was (no <tbody> injection, no reordering, no empty <p> insert).
    expect(out).toBe(
      '<table><tr><td><img src="data:image/png;base64,AQID"></td></tr></table><p>after</p>'
    );
  });

  it("inlines a single image and leaves all other attributes and tags untouched", async () => {
    const { deps } = realDeps();
    const html = '<img src="asset://image/2" alt="x" class="y">';
    const out = await inlineLocalImages(html, deps);
    expect(out).toBe('<img src="data:image/png;base64,AQID" alt="x" class="y">');
  });

  it("keeps data: src untouched and does not mutate surrounding markup", async () => {
    const { deps, calls } = realDeps();
    const html = '<p>text <img src="data:image/png;base64,AQID"></p>';
    const out = await inlineLocalImages(html, deps);
    expect(out).toBe(html);
    expect(calls).toHaveLength(0);
  });

  it("does not corrupt another attribute whose value contains the substring 'src='", async () => {
    const { deps } = realDeps();
    // The `alt` value contains the literal substring `src=`. A naive `\bsrc=`
    // match would treat that as the image source and corrupt the alt text.
    const html = '<img alt="use src= for details" src="asset://image/9">';
    const out = await inlineLocalImages(html, deps);
    // Only the real src attribute is inlined; alt is preserved verbatim.
    expect(out).toBe('<img alt="use src= for details" src="data:image/png;base64,AQID">');
  });

  it("preserves single-quoted src values when inlining", async () => {
    const { deps } = realDeps();
    const html = "<img src='asset://image/10' alt='x'>";
    const out = await inlineLocalImages(html, deps);
    expect(out).toBe("<img src='data:image/png;base64,AQID' alt='x'>");
  });
});

describe("buildExportDocument", () => {
  it("produces the same standalone document shape printNote's builder does", () => {
    const doc = buildExportDocument("My Note", "<p>hello</p>");
    expect(doc).toContain("<!DOCTYPE html>");
    expect(doc).toContain("<title>My Note</title>");
    expect(doc).toContain("<p>hello</p>");
  });
});
