// Interactive wrapper for a rendered Mermaid diagram in the Preview pane:
// zoom buttons, wheel zoom, drag to pan, and a fullscreen view. The diagram
// stays an inline SVG that scales to the note width (src/styles/mermaid.css);
// zoom and pan are a CSS transform on a canvas element, so nothing is
// re-rendered and nothing leaves the device.
import { sanitizeMermaidSvgForInjection } from "./mermaid";

export const MIN_SCALE = 0.25;
export const MAX_SCALE = 6;
const STEP = 1.25;

export interface ZoomState {
  scale: number;
  x: number;
  y: number;
}

export const INITIAL_ZOOM: ZoomState = { scale: 1, x: 0, y: 0 };

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** Zoom by `factor` keeping the point (px, py), relative to the viewport, fixed. */
export function zoomAt(
  state: ZoomState,
  factor: number,
  px = 0,
  py = 0,
): ZoomState {
  const scale = clampScale(state.scale * factor);
  const ratio = scale / state.scale;
  return {
    scale,
    x: px - (px - state.x) * ratio,
    y: py - (py - state.y) * ratio,
  };
}

function button(
  doc: Document,
  action: string,
  label: string,
  text: string,
): HTMLButtonElement {
  const b = doc.createElement("button");
  b.type = "button";
  b.className = "mermaid-tool";
  b.dataset.mermaidAction = action;
  b.setAttribute("aria-label", label);
  b.title = label;
  b.textContent = text;
  return b;
}

/**
 * Replace `target` with a zoomable figure holding `svgHtml`. The SVG is run
 * through the injection-site sanitizer here, so no caller can skip it.
 */
export function mountMermaidFigure(
  target: HTMLElement,
  svgHtml: string,
  source: string,
): HTMLElement {
  const doc = target.ownerDocument;
  const figure = doc.createElement("div");
  figure.className = "mermaid-figure";
  figure.dataset.mermaidSource = encodeURIComponent(source);

  const toolbar = doc.createElement("div");
  toolbar.className = "mermaid-toolbar";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "Diagram view");
  const zoomOut = button(doc, "zoom-out", "Zoom out", "−");
  const zoomIn = button(doc, "zoom-in", "Zoom in", "+");
  const reset = button(doc, "reset", "Reset zoom", "1:1");
  const full = button(doc, "fullscreen", "Full screen", "⛶");
  full.setAttribute("aria-pressed", "false");
  toolbar.append(zoomOut, zoomIn, reset, full);

  const viewport = doc.createElement("div");
  viewport.className = "mermaid-viewport";
  const canvas = doc.createElement("div");
  canvas.className = "mermaid-canvas";
  canvas.innerHTML = sanitizeMermaidSvgForInjection(svgHtml);
  viewport.append(canvas);
  figure.append(toolbar, viewport);

  let state = INITIAL_ZOOM;
  const apply = () => {
    canvas.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
    figure.dataset.zoomed =
      state.scale === 1 && state.x === 0 && state.y === 0 ? "false" : "true";
  };
  const center = () => {
    const r = viewport.getBoundingClientRect();
    return { px: r.width / 2, py: r.height / 2 };
  };
  zoomIn.addEventListener("click", () => {
    const { px, py } = center();
    state = zoomAt(state, STEP, px, py);
    apply();
  });
  zoomOut.addEventListener("click", () => {
    const { px, py } = center();
    state = zoomAt(state, 1 / STEP, px, py);
    apply();
  });
  reset.addEventListener("click", () => {
    state = INITIAL_ZOOM;
    apply();
  });

  // Ctrl/Cmd + wheel (also a trackpad pinch) zooms; a plain wheel scrolls the note.
  viewport.addEventListener(
    "wheel",
    (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const r = viewport.getBoundingClientRect();
      state = zoomAt(
        state,
        event.deltaY < 0 ? STEP : 1 / STEP,
        event.clientX - r.left,
        event.clientY - r.top,
      );
      apply();
    },
    { passive: false },
  );

  let drag: {
    id: number;
    sx: number;
    sy: number;
    ox: number;
    oy: number;
  } | null = null;
  viewport.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || state.scale <= 1) return;
    drag = {
      id: event.pointerId,
      sx: event.clientX,
      sy: event.clientY,
      ox: state.x,
      oy: state.y,
    };
    viewport.setPointerCapture?.(event.pointerId);
    figure.dataset.panning = "true";
  });
  viewport.addEventListener("pointermove", (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    state = {
      ...state,
      x: drag.ox + event.clientX - drag.sx,
      y: drag.oy + event.clientY - drag.sy,
    };
    apply();
  });
  const endDrag = (event: PointerEvent) => {
    if (!drag || drag.id !== event.pointerId) return;
    drag = null;
    delete figure.dataset.panning;
  };
  viewport.addEventListener("pointerup", endDrag);
  viewport.addEventListener("pointercancel", endDrag);

  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") setFullscreen(false);
  };
  const setFullscreen = (on: boolean) => {
    figure.classList.toggle("mermaid-fullscreen", on);
    full.setAttribute("aria-pressed", String(on));
    const label = on ? "Exit full screen" : "Full screen";
    full.title = label;
    full.setAttribute("aria-label", label);
    if (on) doc.addEventListener("keydown", onKey);
    else doc.removeEventListener("keydown", onKey);
    state = INITIAL_ZOOM;
    apply();
  };
  full.addEventListener("click", () =>
    setFullscreen(!figure.classList.contains("mermaid-fullscreen")),
  );

  apply();
  target.replaceWith(figure);
  return figure;
}
