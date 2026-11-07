/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import {
  INITIAL_ZOOM,
  MAX_SCALE,
  MIN_SCALE,
  clampScale,
  mountMermaidFigure,
  zoomAt,
} from "./mermaidFigure";

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="1" height="1"/></svg>';

function mount(svg = SVG) {
  document.body.innerHTML =
    '<div id="host"><div class="mermaid-placeholder"></div></div>';
  const target = document.querySelector<HTMLElement>(".mermaid-placeholder")!;
  return mountMermaidFigure(target, svg, "graph TD; A-->B");
}

const click = (el: Element | null) =>
  el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
const canvas = (f: HTMLElement) =>
  f.querySelector<HTMLElement>(".mermaid-canvas")!;

describe("zoom math", () => {
  it("clamps the scale to the supported range", () => {
    expect(clampScale(100)).toBe(MAX_SCALE);
    expect(clampScale(0)).toBe(MIN_SCALE);
    expect(clampScale(Number.NaN)).toBe(1);
  });

  it("keeps the anchor point fixed", () => {
    const next = zoomAt(INITIAL_ZOOM, 2, 100, 50);
    expect(next.scale).toBe(2);
    expect(next.x).toBe(-100);
    expect(next.y).toBe(-50);
  });
});

describe("mountMermaidFigure", () => {
  it("replaces the placeholder with a figure holding the svg and a toolbar", () => {
    const fig = mount();
    expect(document.querySelector(".mermaid-placeholder")).toBeNull();
    expect(fig.querySelector(".mermaid-canvas svg")).not.toBeNull();
    expect(fig.querySelectorAll(".mermaid-tool").length).toBe(4);
    expect(decodeURIComponent(fig.dataset.mermaidSource!)).toBe(
      "graph TD; A-->B",
    );
  });

  it("sanitizes the svg at the mount site", () => {
    const fig = mount(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect onclick="x()" width="1" height="1"/></svg>',
    );
    expect(fig.innerHTML).not.toContain("<script");
    expect(fig.innerHTML).not.toContain("onclick");
  });

  it("zooms in, out and resets with the buttons", () => {
    const fig = mount();
    click(fig.querySelector('[data-mermaid-action="zoom-in"]'));
    expect(canvas(fig).style.transform).toContain("scale(1.25)");
    expect(fig.dataset.zoomed).toBe("true");
    click(fig.querySelector('[data-mermaid-action="zoom-out"]'));
    click(fig.querySelector('[data-mermaid-action="zoom-out"]'));
    expect(canvas(fig).style.transform).toContain("scale(0.8)");
    click(fig.querySelector('[data-mermaid-action="reset"]'));
    expect(canvas(fig).style.transform).toContain("scale(1)");
    expect(fig.dataset.zoomed).toBe("false");
  });

  it("zooms with ctrl+wheel only", () => {
    const fig = mount();
    const vp = fig.querySelector(".mermaid-viewport")!;
    vp.dispatchEvent(
      new WheelEvent("wheel", { deltaY: -1, bubbles: true, cancelable: true }),
    );
    expect(canvas(fig).style.transform).toContain("scale(1)");
    const ev = new WheelEvent("wheel", {
      deltaY: -1,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    vp.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(canvas(fig).style.transform).toContain("scale(1.25)");
  });

  it("toggles full screen and leaves it on Escape", () => {
    const fig = mount();
    const full = fig.querySelector('[data-mermaid-action="fullscreen"]')!;
    click(full);
    expect(fig.classList.contains("mermaid-fullscreen")).toBe(true);
    expect(full.getAttribute("aria-pressed")).toBe("true");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(fig.classList.contains("mermaid-fullscreen")).toBe(false);
    expect(full.getAttribute("aria-pressed")).toBe("false");
  });
});
