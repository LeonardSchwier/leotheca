/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/preact";

afterEach(() => {
  cleanup();
});

const { readBinaryFile, writeActiveWorkspaceBinaryFile } = vi.hoisted(() => ({
  readBinaryFile: vi.fn<(path: string) => Promise<Uint8Array>>(),
  writeActiveWorkspaceBinaryFile: vi.fn<(path: string, data: Uint8Array) => Promise<void>>(),
}));

vi.mock("../workspace/tauriBridge", () => ({
  readBinaryFile,
  writeActiveWorkspaceBinaryFile,
}));

/**
 * A minimal fake standing in for the real pdf.js module. This jsdom
 * environment's `HTMLCanvasElement.getContext("2d")` does return a (very
 * minimal, largely no-op) stub context rather than null, so
 * `PdfViewer.tsx`'s render effect runs past its null-context guard here
 * -- but `page.render`/`TextLayer` themselves are still this file's own
 * mocks below, not real pdf.js, so no real glyph is ever actually drawn
 * or laid out; only this component's own state/DOM wiring (overlay
 * elements, pointer/click handlers, PDF-space coordinate conversion
 * calls) is under test. Real page rendering, the real text layer,
 * coordinate conversion against a genuine `PageViewport`, and the full
 * select-text -> compute QuadPoints -> write/read back a real annotation
 * pipeline were instead verified against the actual installed
 * pdfjs-dist/pdf-lib in a real headless Chromium browser (see this
 * feature's own commit messages for that verification's details), not
 * just asserted here.
 */
function makeFakePage(text: string) {
  return {
    getViewport: ({ scale }: { scale: number }) => ({
      width: 600 * scale,
      height: 800 * scale,
      scale,
      convertToPdfPoint: (x: number, y: number) => [x, y],
      convertToViewportPoint: (x: number, y: number) => [x, y],
    }),
    streamTextContent: () => ({}),
    getTextContent: async () => ({ items: [{ str: text }] }),
    render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
  };
}

function makeFakeDoc(pageTexts: string[]) {
  return {
    numPages: pageTexts.length,
    getPage: async (n: number) => makeFakePage(pageTexts[n - 1] ?? ""),
    loadingTask: { destroy: vi.fn(async () => {}) },
  };
}

const { getDocumentMock } = vi.hoisted(() => ({
  getDocumentMock: vi.fn(),
}));

vi.mock("./pdfWorker", () => ({
  pdfjsLib: {
    getDocument: getDocumentMock,
    GlobalWorkerOptions: {},
    TextLayer: class {
      render() {
        return Promise.resolve();
      }
      cancel() {}
    },
  },
  PDFJS_CMAP_URL: "/pdfjs/cmaps/",
  PDFJS_STANDARD_FONT_DATA_URL: "/pdfjs/standard_fonts/",
  PDFJS_ICC_URL: "/pdfjs/iccs/",
  PDFJS_WASM_URL: "/pdfjs/wasm/",
}));

vi.mock("./pdfAnnotations", async () => {
  const actual = await vi.importActual<typeof import("./pdfAnnotations")>("./pdfAnnotations");
  return {
    ...actual,
    readMarkupAnnotations: vi.fn(async () => []),
    readInkAnnotations: vi.fn(async () => []),
    readStickyNotes: vi.fn(async () => []),
    readShapeAnnotations: vi.fn(async () => []),
  };
});

const { PdfViewer } = await import("./PdfViewer");

function mockDoc(pageTexts: string[]) {
  const doc = makeFakeDoc(pageTexts);
  getDocumentMock.mockReturnValue({ promise: Promise.resolve(doc) });
  readBinaryFile.mockResolvedValue(new Uint8Array([1, 2, 3]));
  return doc;
}

afterEach(() => {
  getDocumentMock.mockReset();
  readBinaryFile.mockReset();
  writeActiveWorkspaceBinaryFile.mockReset();
});

describe("PdfViewer", () => {
  it("shows the real page count once the document loads", async () => {
    mockDoc(["page one text", "page two text", "page three text"]);
    const { getByLabelText, findByText } = render(<PdfViewer path="/vault/doc.pdf" />);

    await findByText("/ 3");
    expect((getByLabelText("Page number") as HTMLInputElement).value).toBe("1");
  });

  it("shows an error message when the file can't be read", async () => {
    readBinaryFile.mockRejectedValue(new Error("disk full"));
    getDocumentMock.mockReturnValue({ promise: Promise.resolve(makeFakeDoc(["x"])) });
    const { findByRole } = render(<PdfViewer path="/vault/doc.pdf" />);

    const alert = await findByRole("alert");
    expect(alert.textContent).toContain("disk full");
  });

  it("page navigation buttons respect the 1..numPages bounds", async () => {
    mockDoc(["a", "b"]);
    const { getByLabelText, findByText } = render(<PdfViewer path="/vault/doc.pdf" />);
    await findByText("/ 2");

    const prev = getByLabelText("Previous page") as HTMLButtonElement;
    const next = getByLabelText("Next page") as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(false);

    await act(async () => {
      fireEvent.click(next);
    });
    expect((getByLabelText("Page number") as HTMLInputElement).value).toBe("2");
    expect(next.disabled).toBe(true);
    expect(prev.disabled).toBe(false);

    await act(async () => {
      fireEvent.click(prev);
    });
    expect((getByLabelText("Page number") as HTMLInputElement).value).toBe("1");
  });

  it("typing a page number in range jumps to that page, and an out-of-range one is ignored", async () => {
    mockDoc(["a", "b", "c"]);
    const { getByLabelText, findByText } = render(<PdfViewer path="/vault/doc.pdf" />);
    await findByText("/ 3");

    const input = getByLabelText("Page number") as HTMLInputElement;
    // The input and change events are dispatched in separate `act()`
    // blocks so each gets its own committed render: firing both in one
    // block sets the DOM's raw `.value` directly (as a real keystroke
    // never does) ahead of Preact's own controlled-value diff, which
    // then compares the final state against the *pre-block* render and
    // sees no change to write, leaving the stale DOM value in place --
    // a testing-library/Preact batching artifact, not a real bug (the
    // component's own onChange handler runs and computes the correct
    // clamped value either way, confirmed via a temporary console.log
    // while diagnosing this).
    await act(async () => {
      fireEvent.input(input, { target: { value: "3" } });
    });
    await act(async () => {
      fireEvent.change(input, { target: { value: "3" } });
    });
    expect(input.value).toBe("3");

    await act(async () => {
      fireEvent.input(input, { target: { value: "99" } });
    });
    await act(async () => {
      fireEvent.change(input, { target: { value: "99" } });
    });
    expect(input.value).toBe("3"); // clamped to numPages
  });

  it("zoom in/out/reset change the displayed percentage", async () => {
    mockDoc(["a"]);
    const { getByLabelText, findByText } = render(<PdfViewer path="/vault/doc.pdf" />);
    await findByText("/ 1");

    const zoomIn = getByLabelText("Zoom in");
    const zoomOut = getByLabelText("Zoom out");
    const reset = getByLabelText("Reset zoom");

    expect(reset.textContent).toBe("125%");
    await act(async () => {
      fireEvent.click(zoomIn);
    });
    expect(reset.textContent).not.toBe("125%");
    await act(async () => {
      fireEvent.click(reset);
    });
    expect(reset.textContent).toBe("125%");
    await act(async () => {
      fireEvent.click(zoomOut);
    });
    expect(reset.textContent).not.toBe("125%");
  });

  it("searches every page's real text content and reports how many pages match", async () => {
    mockDoc(["nothing here", "the quick brown fox", "another fox sighting"]);
    const { getByLabelText, getByText, findByText } = render(<PdfViewer path="/vault/doc.pdf" />);
    await findByText("/ 3");

    const searchInput = document.querySelector(".pdf-search-input") as HTMLInputElement;
    await act(async () => {
      fireEvent.input(searchInput, { target: { value: "fox" } });
    });
    await act(async () => {
      fireEvent.click(getByLabelText("Search"));
    });

    await waitFor(() => {
      expect(getByText(/Page 1 of 2 with a match/)).toBeTruthy();
    });
    // Jumped to the first matching page (2), not page 1, since page 1 has no match.
    expect((getByLabelText("Page number") as HTMLInputElement).value).toBe("2");
  });

  it("reports no matches for a query nothing contains", async () => {
    mockDoc(["alpha", "beta"]);
    const { getByLabelText, getByText, findByText } = render(<PdfViewer path="/vault/doc.pdf" />);
    await findByText("/ 2");

    const searchInput = document.querySelector(".pdf-search-input") as HTMLInputElement;
    await act(async () => {
      fireEvent.input(searchInput, { target: { value: "zzz" } });
    });
    await act(async () => {
      fireEvent.click(getByLabelText("Search"));
    });

    await waitFor(() => {
      expect(getByText("No matches")).toBeTruthy();
    });
  });

  it("the markup tool buttons toggle active state on click", async () => {
    mockDoc(["a"]);
    const { getByRole, findByText } = render(<PdfViewer path="/vault/doc.pdf" />);
    await findByText("/ 1");

    const highlightButton = getByRole("button", { name: "Highlight" });
    expect(highlightButton.getAttribute("aria-pressed")).toBe("false");

    await act(async () => {
      fireEvent.click(highlightButton);
    });
    expect(highlightButton.getAttribute("aria-pressed")).toBe("true");

    await act(async () => {
      fireEvent.click(highlightButton);
    });
    expect(highlightButton.getAttribute("aria-pressed")).toBe("false");
  });

  it("Save annotations starts disabled with nothing pending", async () => {
    mockDoc(["a"]);
    const { getByText, findByText } = render(<PdfViewer path="/vault/doc.pdf" />);
    await findByText("/ 1");

    const saveButton = getByText("Save annotations") as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
  });
});

describe("PdfViewer -- PDF Phase 2 (ink, sticky notes, shapes)", () => {
  it("the Draw tool mounts a real InkSurface overlay, and committing a stroke adds one pending annotation", async () => {
    mockDoc(["a"]);
    const { getByRole, getByText, findByText, container } = render(<PdfViewer path="/vault/doc.pdf" />);
    await findByText("/ 1");

    await act(async () => {
      fireEvent.click(getByRole("button", { name: "Draw" }));
    });

    const surface = container.querySelector(".ink-surface") as unknown as (SVGSVGElement & {
      setPointerCapture: (id: number) => void;
      hasPointerCapture: (id: number) => boolean;
    });
    expect(surface).toBeTruthy();
    // jsdom doesn't implement pointer capture; InkSurface itself guards
    // every pointermove/up on it, so tests must stub it, the same
    // pattern InkSurface.test.tsx already establishes.
    surface.setPointerCapture = vi.fn();
    surface.hasPointerCapture = vi.fn(() => true);

    await act(async () => {
      fireEvent.pointerDown(surface, { pointerId: 1, pointerType: "mouse", button: 0, clientX: 10, clientY: 10 });
      fireEvent.pointerMove(surface, { pointerId: 1, pointerType: "mouse", button: 0, clientX: 20, clientY: 20 });
      fireEvent.pointerUp(surface, { pointerId: 1, pointerType: "mouse", button: 0, clientX: 30, clientY: 10 });
    });

    const saveButton = getByText(/Save annotations/) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(false);
    expect(saveButton.textContent).toContain("(1)");
    await waitFor(() => expect(container.querySelector(".pdf-drawing-overlay polyline")).toBeTruthy());
  });

  it("the Note tool places a sticky-note draft on click, and Enter commits it as one pending annotation", async () => {
    mockDoc(["a"]);
    const { getByRole, getByText, findByText, container } = render(<PdfViewer path="/vault/doc.pdf" />);
    await findByText("/ 1");

    await act(async () => {
      fireEvent.click(getByRole("button", { name: "Note" }));
    });
    const pageContainer = container.querySelector(".pdf-page-container") as HTMLDivElement;
    await act(async () => {
      fireEvent.click(pageContainer, { clientX: 50, clientY: 60 });
    });

    const textarea = container.querySelector(".pdf-sticky-note-draft textarea") as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();

    await act(async () => {
      fireEvent.input(textarea, { target: { value: "remember this" } });
    });
    await act(async () => {
      fireEvent.keyDown(textarea, { key: "Enter" });
    });

    expect(container.querySelector(".pdf-sticky-note-draft")).toBeNull();
    const saveButton = getByText(/Save annotations/) as HTMLButtonElement;
    expect(saveButton.textContent).toContain("(1)");
    await waitFor(() => expect(container.querySelector(".pdf-sticky-note-icon")).toBeTruthy());
  });

  it("Escape cancels a sticky-note draft without adding a pending annotation", async () => {
    mockDoc(["a"]);
    const { getByRole, getByText, findByText, container } = render(<PdfViewer path="/vault/doc.pdf" />);
    await findByText("/ 1");

    await act(async () => {
      fireEvent.click(getByRole("button", { name: "Note" }));
    });
    const pageContainer = container.querySelector(".pdf-page-container") as HTMLDivElement;
    await act(async () => {
      fireEvent.click(pageContainer, { clientX: 50, clientY: 60 });
    });
    const textarea = container.querySelector(".pdf-sticky-note-draft textarea") as HTMLTextAreaElement;
    await act(async () => {
      fireEvent.input(textarea, { target: { value: "discard me" } });
      fireEvent.keyDown(textarea, { key: "Escape" });
    });

    expect(container.querySelector(".pdf-sticky-note-draft")).toBeNull();
    const saveButton = getByText("Save annotations") as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
  });

  it("dragging with the Square tool commits one pending shape annotation", async () => {
    mockDoc(["a"]);
    const { getByRole, getByText, findByText, container } = render(<PdfViewer path="/vault/doc.pdf" />);
    await findByText("/ 1");

    await act(async () => {
      fireEvent.click(getByRole("button", { name: "Square" }));
    });
    const pageContainer = container.querySelector(".pdf-page-container") as HTMLDivElement;

    await act(async () => {
      fireEvent.pointerDown(pageContainer, { pointerId: 1, clientX: 10, clientY: 10 });
      fireEvent.pointerMove(pageContainer, { pointerId: 1, clientX: 60, clientY: 60 });
      fireEvent.pointerUp(pageContainer, { pointerId: 1, clientX: 60, clientY: 60 });
    });

    const saveButton = getByText(/Save annotations/) as HTMLButtonElement;
    expect(saveButton.textContent).toContain("(1)");
    await waitFor(() => expect(container.querySelector(".pdf-drawing-overlay rect")).toBeTruthy());
  });

  it("a drag shorter than the click-vs-drag threshold does not commit a degenerate shape", async () => {
    mockDoc(["a"]);
    const { getByRole, getByText, findByText, container } = render(<PdfViewer path="/vault/doc.pdf" />);
    await findByText("/ 1");

    await act(async () => {
      fireEvent.click(getByRole("button", { name: "Line" }));
    });
    const pageContainer = container.querySelector(".pdf-page-container") as HTMLDivElement;
    await act(async () => {
      fireEvent.pointerDown(pageContainer, { pointerId: 1, clientX: 10, clientY: 10 });
      fireEvent.pointerUp(pageContainer, { pointerId: 1, clientX: 11, clientY: 10 });
    });

    const saveButton = getByText("Save annotations") as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
  });

  it("clicking with the Polygon tool adds vertices, and Finish shape commits one pending shape annotation", async () => {
    mockDoc(["a"]);
    const { getByRole, getByText, queryByText, findByText, container } = render(<PdfViewer path="/vault/doc.pdf" />);
    await findByText("/ 1");

    await act(async () => {
      fireEvent.click(getByRole("button", { name: "Polygon" }));
    });
    const pageContainer = container.querySelector(".pdf-page-container") as HTMLDivElement;

    await act(async () => {
      fireEvent.click(pageContainer, { clientX: 10, clientY: 10 });
    });
    await act(async () => {
      fireEvent.click(pageContainer, { clientX: 50, clientY: 10 });
    });
    await act(async () => {
      fireEvent.click(pageContainer, { clientX: 30, clientY: 50 });
    });

    const finishButton = getByText(/Finish shape/) as HTMLButtonElement;
    expect(finishButton.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(finishButton);
    });

    expect(queryByText(/Finish shape/)).toBeNull();
    const saveButton = getByText(/Save annotations/) as HTMLButtonElement;
    expect(saveButton.textContent).toContain("(1)");
    await waitFor(() => expect(container.querySelector(".pdf-drawing-overlay polygon")).toBeTruthy());
  });

  it("switching tools clears an in-progress (uncommitted) polygon draft", async () => {
    mockDoc(["a"]);
    const { getByRole, getByText, findByText, container } = render(<PdfViewer path="/vault/doc.pdf" />);
    await findByText("/ 1");

    await act(async () => {
      fireEvent.click(getByRole("button", { name: "Polygon" }));
    });
    const pageContainer = container.querySelector(".pdf-page-container") as HTMLDivElement;
    await act(async () => {
      fireEvent.click(pageContainer, { clientX: 10, clientY: 10 });
      fireEvent.click(pageContainer, { clientX: 20, clientY: 10 });
      fireEvent.click(pageContainer, { clientX: 15, clientY: 20 });
    });
    expect(getByText(/Finish shape/)).toBeTruthy();

    await act(async () => {
      fireEvent.click(getByRole("button", { name: "Square" }));
    });

    expect(container.querySelector(".pdf-shape-draft")).toBeNull();
    const saveButton = getByText("Save annotations") as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
  });
});
