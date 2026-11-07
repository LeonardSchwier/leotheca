/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("mermaid", () => ({
  default: { initialize: vi.fn(), render: vi.fn() },
}));

import mermaid from "mermaid";
import {
  getAppMermaidTheme,
  mermaidErrorHtml,
  renderMermaidToSvg,
  watchAppMermaidTheme,
} from "./mermaid";

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="1" height="1"/></svg>';

beforeEach(() => {
  vi.mocked(mermaid.initialize).mockClear();
  vi.mocked(mermaid.render).mockReset();
  document.documentElement.removeAttribute("data-theme");
});
afterEach(() => {
  document.documentElement.removeAttribute("data-theme");
});

describe("app theme", () => {
  it("follows an explicit data-theme", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    expect(getAppMermaidTheme()).toBe("dark");
    document.documentElement.setAttribute("data-theme", "light");
    expect(getAppMermaidTheme()).toBe("light");
  });

  it("notifies when data-theme flips and stops after unsubscribe", async () => {
    const seen: string[] = [];
    const stop = watchAppMermaidTheme((t) => seen.push(t));
    document.documentElement.setAttribute("data-theme", "dark");
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toEqual(["dark"]);
    stop();
    document.documentElement.setAttribute("data-theme", "light");
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toEqual(["dark"]);
  });
});

describe("renderMermaidToSvg theming", () => {
  // Regression: the renderer used to be initialized once with no theme, so
  // every diagram stayed light on a dark app.
  it("draws with the dark mermaid theme in a dark app and re-initializes on a flip", async () => {
    vi.mocked(mermaid.render).mockResolvedValue({ svg: SVG } as never);
    await renderMermaidToSvg("graph TD; A-->B", "dark");
    expect(mermaid.initialize).toHaveBeenLastCalledWith(
      expect.objectContaining({ theme: "dark", securityLevel: "strict" }),
    );
    await renderMermaidToSvg("graph TD; A-->B", "light");
    expect(mermaid.initialize).toHaveBeenLastCalledWith(
      expect.objectContaining({ theme: "default", securityLevel: "strict" }),
    );
  });

  it("does not re-initialize while the theme is unchanged", async () => {
    vi.mocked(mermaid.render).mockResolvedValue({ svg: SVG } as never);
    await renderMermaidToSvg("graph TD; A-->B", "dark");
    vi.mocked(mermaid.initialize).mockClear();
    await renderMermaidToSvg("graph TD; B-->C", "dark");
    expect(mermaid.initialize).not.toHaveBeenCalled();
  });

  it("defaults to the app theme", async () => {
    vi.mocked(mermaid.render).mockResolvedValue({ svg: SVG } as never);
    document.documentElement.setAttribute("data-theme", "light");
    await renderMermaidToSvg("graph TD; A-->B");
    document.documentElement.setAttribute("data-theme", "dark");
    await renderMermaidToSvg("graph TD; A-->B");
    expect(mermaid.initialize).toHaveBeenLastCalledWith(
      expect.objectContaining({ theme: "dark" }),
    );
  });
});

describe("error display", () => {
  it("shows the reason and the escaped source, and never throws", async () => {
    vi.mocked(mermaid.render).mockRejectedValue(
      new Error("Parse error on line 2"),
    );
    const out = await renderMermaidToSvg(
      "graph TD\n<script>x</script>",
      "light",
    );
    expect(out).toContain("could not be rendered");
    expect(out).toContain("Parse error on line 2");
    expect(out).toContain("&lt;script&gt;");
    expect(out).not.toContain("<script>");
  });

  it("removes mermaid's scratch element after a failed render", async () => {
    vi.mocked(mermaid.render).mockImplementation(async (id: string) => {
      const d = document.createElement("div");
      d.id = `d${id}`;
      document.body.append(d);
      throw new Error("boom");
    });
    await renderMermaidToSvg("bad", "light");
    expect(document.querySelector('[id^="dmermaid-render-"]')).toBeNull();
  });

  it("escapes a hostile error message", () => {
    const out = mermaidErrorHtml(
      "x",
      new Error("<img src=x onerror=alert(1)>"),
    );
    expect(out).not.toContain("<img");
  });

  it("falls back when initialize itself throws", async () => {
    vi.mocked(mermaid.initialize).mockImplementationOnce(() => {
      throw new Error("init failed");
    });
    const out = await renderMermaidToSvg("graph TD; A-->B", "dark");
    expect(out).toContain("mermaid-error");
  });
});
