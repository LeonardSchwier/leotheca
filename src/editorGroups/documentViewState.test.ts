import { afterEach, describe, expect, it } from "vitest";
import {
  __resetDocumentViewStateForTests,
  clearDocumentViewState,
  getDocumentViewState,
  saveDocumentViewState,
} from "./documentViewState";

afterEach(() => {
  __resetDocumentViewStateForTests();
});

describe("saveDocumentViewState / getDocumentViewState", () => {
  it("returns undefined for a path that was never saved", () => {
    expect(getDocumentViewState("/a.md", 10)).toBeUndefined();
  });

  it("returns the saved state when the doc length still matches", () => {
    saveDocumentViewState("/a.md", { anchor: 3, head: 5, scrollTop: 120, docLength: 10 });
    expect(getDocumentViewState("/a.md", 10)).toEqual({ anchor: 3, head: 5, scrollTop: 120, docLength: 10 });
  });

  it("discards the entry as stale when the doc length no longer matches", () => {
    saveDocumentViewState("/a.md", { anchor: 3, head: 5, scrollTop: 120, docLength: 10 });
    expect(getDocumentViewState("/a.md", 11)).toBeUndefined();
  });

  it("keeps separate entries per path", () => {
    saveDocumentViewState("/a.md", { anchor: 1, head: 1, scrollTop: 0, docLength: 5 });
    saveDocumentViewState("/b.md", { anchor: 2, head: 2, scrollTop: 50, docLength: 8 });
    expect(getDocumentViewState("/a.md", 5)?.scrollTop).toBe(0);
    expect(getDocumentViewState("/b.md", 8)?.scrollTop).toBe(50);
  });

  it("overwrites a path's entry on a second save", () => {
    saveDocumentViewState("/a.md", { anchor: 1, head: 1, scrollTop: 0, docLength: 5 });
    saveDocumentViewState("/a.md", { anchor: 2, head: 2, scrollTop: 99, docLength: 6 });
    expect(getDocumentViewState("/a.md", 6)).toEqual({ anchor: 2, head: 2, scrollTop: 99, docLength: 6 });
    expect(getDocumentViewState("/a.md", 5)).toBeUndefined();
  });
});

describe("clearDocumentViewState", () => {
  it("removes exactly the given path's entry", () => {
    saveDocumentViewState("/a.md", { anchor: 1, head: 1, scrollTop: 0, docLength: 5 });
    saveDocumentViewState("/b.md", { anchor: 2, head: 2, scrollTop: 0, docLength: 5 });
    clearDocumentViewState("/a.md");
    expect(getDocumentViewState("/a.md", 5)).toBeUndefined();
    expect(getDocumentViewState("/b.md", 5)).toBeDefined();
  });
});

describe("LRU bound", () => {
  it("evicts the least-recently-used entry once the cap is exceeded", () => {
    for (let i = 0; i < 200; i++) {
      saveDocumentViewState(`/note-${i}.md`, { anchor: 0, head: 0, scrollTop: 0, docLength: 1 });
    }
    expect(getDocumentViewState("/note-0.md", 1)).toBeDefined();

    saveDocumentViewState("/note-200.md", { anchor: 0, head: 0, scrollTop: 0, docLength: 1 });

    expect(getDocumentViewState("/note-0.md", 1)).toBeUndefined(); // least recently used, evicted
    expect(getDocumentViewState("/note-1.md", 1)).toBeDefined();
    expect(getDocumentViewState("/note-200.md", 1)).toBeDefined();
  });

  it("re-saving a path refreshes its recency, protecting it from eviction", () => {
    for (let i = 0; i < 200; i++) {
      saveDocumentViewState(`/note-${i}.md`, { anchor: 0, head: 0, scrollTop: 0, docLength: 1 });
    }
    saveDocumentViewState("/note-0.md", { anchor: 9, head: 9, scrollTop: 9, docLength: 1 }); // touch it again, now most-recent

    saveDocumentViewState("/note-200.md", { anchor: 0, head: 0, scrollTop: 0, docLength: 1 });

    expect(getDocumentViewState("/note-0.md", 1)?.scrollTop).toBe(9); // survived
    expect(getDocumentViewState("/note-1.md", 1)).toBeUndefined(); // now the least-recently-used, evicted instead
  });
});
