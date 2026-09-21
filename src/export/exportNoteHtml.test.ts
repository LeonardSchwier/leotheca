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

describe("buildExportDocument", () => {
  it("produces the same standalone document shape printNote's builder does", () => {
    const doc = buildExportDocument("My Note", "<p>hello</p>");
    expect(doc).toContain("<!DOCTYPE html>");
    expect(doc).toContain("<title>My Note</title>");
    expect(doc).toContain("<p>hello</p>");
  });
});
