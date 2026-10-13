/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { HIGHLIGHT_COLOR_CHOICES, highlightColorEmoji } from "../editor/highlightColors";
import { HighlightColorPicker } from "./HighlightColorPicker";

afterEach(cleanup);

const RED = "\u{1F534}"; // 🔴

describe("HighlightColorPicker", () => {
  it("shows a closed trigger button and no menu initially", () => {
    render(<HighlightColorPicker insert={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Highlight color/i })).toBeTruthy();
    expect(document.querySelector(".highlight-picker-menu")).toBeNull();
  });

  it("opens the menu on trigger click, listing Plain first then all five colors", () => {
    render(<HighlightColorPicker insert={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Highlight color/i }));
    const menu = screen.getByRole("menu");
    const items = Array.from(menu.querySelectorAll('[role="menuitem"]')) as HTMLElement[];
    expect(items.map((el) => el.getAttribute("aria-label"))).toEqual([
      "Highlight: Plain",
      ...HIGHLIGHT_COLOR_CHOICES.map((c) => `Highlight: ${c.label}`),
    ]);
  });

  it("inserts the chosen color's emoji marker and calls onClose", () => {
    const insert = vi.fn();
    const onClose = vi.fn();
    render(<HighlightColorPicker insert={insert} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /Highlight color/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Highlight: Red/i }));

    expect(insert).toHaveBeenCalledWith(`==${RED} ==`, RED.length + 3);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("each colored swatch inserts its own emoji from the shared source of truth", () => {
    const insert = vi.fn();
    render(<HighlightColorPicker insert={insert} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Highlight color/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Highlight: Green/i }));
    const expectedEmoji = highlightColorEmoji("green")!;
    expect(insert).toHaveBeenCalledWith(`==${expectedEmoji} ==`, expectedEmoji.length + 3);
  });

  it("Plain inserts a color-less marker with the caret right after ==", () => {
    const insert = vi.fn();
    render(<HighlightColorPicker insert={insert} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Highlight color/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Highlight: Plain/i }));
    expect(insert).toHaveBeenCalledWith("====", 2);
  });

  it("closes the menu on outside click", () => {
    render(<HighlightColorPicker insert={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Highlight color/i }));
    expect(document.querySelector(".highlight-picker-menu")).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(document.querySelector(".highlight-picker-menu")).toBeNull();
  });

  it("closes the menu on Escape", () => {
    render(<HighlightColorPicker insert={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Highlight color/i }));
    expect(document.querySelector(".highlight-picker-menu")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.querySelector(".highlight-picker-menu")).toBeNull();
  });

  it("passes referentially-stable onClick handlers to its swatches across parent re-renders", () => {
    // Regression: before memoizing HighlightSwatch + useCallback'ing the
    // handlers, every parent render produced brand-new onClick closures
    // for all six swatches, so memo(HighlightSwatch) could never skip a
    // re-render. The fix gives each swatch a stable handler, which is the
    // property that actually lets memo(HighlightSwatch) take effect.
    // Asserting handler identity is the observable contract; the DOM-node
    // identity a memoized component *could* in principle skip is not a
    // meaningful test (Preact reuses same-position DOM nodes regardless).
    const { rerender } = render(
      <div>
        <HighlightColorPicker insert={vi.fn()} onClose={vi.fn()} />
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Highlight color/i }));
    const menu = screen.getByRole("menu");
    const swatches = Array.from(menu.querySelectorAll(".highlight-picker-swatch"));
    expect(swatches).toHaveLength(6);
    const handlersBefore = swatches.map((sw) => (sw as HTMLButtonElement).onclick);

    // Re-render the same tree with unchanged props (the case the fix
    // targets: a parent render that doesn't change insert/onClose).
    rerender(
      <div>
        <HighlightColorPicker insert={vi.fn()} onClose={vi.fn()} />
      </div>,
    );
    const handlersAfter = Array.from(screen.getByRole("menu").querySelectorAll(".highlight-picker-swatch")).map(
      (sw) => (sw as HTMLButtonElement).onclick,
    );
    expect(handlersAfter).toHaveLength(6);
    for (let i = 0; i < handlersBefore.length; i++) {
      expect(handlersAfter[i]).toBe(handlersBefore[i]);
    }
  });

  it("calls the CURRENT insert/onClose from the first render, not a stale captured closure", () => {
    // Regression: the six colored swatches cache a stable onClick handler per
    // color in a ref (so memo(HighlightSwatch) can skip re-renders). That cache
    // is created on the FIRST render and captured the onColorSelect closure from
    // that render. onColorSelect was a useCallback([insert, onClose]) that
    // re-created a fresh closure every render, but the ref-cached handler
    // ignored the new closure and kept calling the first one — so after a
    // parent re-render that swapped in a new insert/onClose, clicking a color
    // swatch still invoked the OLD insert/onClose (the stale-closure defect).
    //
    // The Plain swatch is unaffected: onPlainSelect is re-created each render
    // and passed directly (no ref cache), so it always sees the current props.
    // This test asserts the color swatches do the same.
    const insertA = vi.fn();
    const onCloseA = vi.fn();
    const insertB = vi.fn();
    const onCloseB = vi.fn();
    const { rerender } = render(
      <HighlightColorPicker insert={insertA} onClose={onCloseA} />,
    );
    // Open the menu while props are still A — this is when the per-color handler
    // cache is populated (first render with the menu open).
    fireEvent.click(screen.getByRole("button", { name: /Highlight color/i }));
    // First, confirm the baseline: with A still current, clicking Red calls A.
    fireEvent.click(screen.getByRole("menuitem", { name: /Highlight: Red/i }));
    expect(insertA).toHaveBeenCalledTimes(1);
    expect(onCloseA).toHaveBeenCalledTimes(1);

    // Re-render the SAME tree (menu state persists) but with NEW insert/onClose.
    // The pre-fix code's cached handlers still close over insertA/onCloseA.
    rerender(<HighlightColorPicker insert={insertB} onClose={onCloseB} />);

    // With the stale closure, clicking a color swatch still routes through
    // insertA/onCloseA. With the fix, it routes through the CURRENT insertB/onCloseB.
    //
    // Note: the menu may or may not still be open after the first click's
    // onClose fired — that is itself a stale-closure symptom (the parent's
    // onCloseA was called, which in a real app would have torn down the
    // picker). We assert on call counts, which are deterministic regardless
    // of whether the menu is open: the fix guarantees insertB/onCloseB are
    // called and insertA/onCloseA are not called again.
    fireEvent.click(screen.getByRole("menuitem", { name: /Highlight: Red/i }));

    // The fix: the CURRENT insert/onClose are called exactly once.
    expect(insertB).toHaveBeenCalledTimes(1);
    expect(onCloseB).toHaveBeenCalledTimes(1);
    // insertA/onCloseA are NOT called again — they were only used by the
    // first click, before the re-render swapped in B.
    expect(insertA).toHaveBeenCalledTimes(1);
    expect(onCloseA).toHaveBeenCalledTimes(1);
  });
});
