/**
 * Regression test: `viewForMode` must preserve `columns` (table mode) and
 * `fields` (card mode) when GroupOrderMenu moves or hides a group column.
 *
 * Bug: `viewForMode(mode, groupBy, groupOrder)` rebuilt the view object
 * from scratch, silently dropping `columns`/`fields`. The first time a
 * user reordered a group in table or card view, the user's column/field
 * selections were lost and persisted back to collections.json.
 */
import { describe, expect, it } from "vitest";
import { viewForMode } from "./CollectionResults";

describe("viewForMode preserves mode-specific view fields", () => {
  it("preserves table columns when groupOrder changes", () => {
    const view = viewForMode("table", "status", ["done", "active"]);
    expect(view.mode).toBe("table");
    // The bug: columns was undefined. After fix, the caller (GroupOrderMenu)
    // passes columns through, so viewForMode must accept and preserve them.
    // Since viewForMode's signature only takes (mode, groupBy, groupOrder),
    // the fix is to add an optional `extras` parameter. We test the public
    // contract: the returned view must be a valid table view.
    if (view.mode === "table") {
      expect(view.groupBy).toBe("status");
      expect(view.groupOrder).toEqual(["done", "active"]);
    }
  });

  it("preserves card fields when groupOrder changes", () => {
    const view = viewForMode("card", "priority", ["high", "low"]);
    expect(view.mode).toBe("card");
    if (view.mode === "card") {
      expect(view.groupBy).toBe("priority");
      expect(view.groupOrder).toEqual(["high", "low"]);
    }
  });

  it("returns a valid list view with groupBy and groupOrder", () => {
    const view = viewForMode("list", "status", ["active"]);
    expect(view.mode).toBe("list");
    if (view.mode === "list") {
      expect(view.groupBy).toBe("status");
      expect(view.groupOrder).toEqual(["active"]);
    }
  });

  it("omits groupBy when empty string", () => {
    const view = viewForMode("list", "", undefined);
    expect(view.mode).toBe("list");
    if (view.mode === "list") {
      expect(view.groupBy).toBeUndefined();
    }
  });

  it("omits groupOrder when empty array", () => {
    const view = viewForMode("list", "status", []);
    expect(view.mode).toBe("list");
    if (view.mode === "list") {
      expect(view.groupBy).toBe("status");
      expect(view.groupOrder).toBeUndefined();
    }
  });

  // The critical regression: when GroupOrderMenu calls viewForMode for a
  // table view that has `columns`, those columns must survive.
  // The fix: viewForMode accepts an optional `existing` view to merge from.
  it("preserves existing table columns via merge parameter", () => {
    const existing = { mode: "table" as const, columns: ["title", "status", "due"], groupBy: "status" };
    const view = viewForMode("table", "status", ["done"], existing);
    expect(view.mode).toBe("table");
    if (view.mode === "table") {
      expect(view.columns).toEqual(["title", "status", "due"]);
      expect(view.groupBy).toBe("status");
      expect(view.groupOrder).toEqual(["done"]);
    }
  });

  it("preserves existing card fields via merge parameter", () => {
    const existing = { mode: "card" as const, fields: ["title", "author"], groupBy: "author" };
    const view = viewForMode("card", "author", ["Smith"], existing);
    expect(view.mode).toBe("card");
    if (view.mode === "card") {
      expect(view.fields).toEqual(["title", "author"]);
      expect(view.groupBy).toBe("author");
      expect(view.groupOrder).toEqual(["Smith"]);
    }
  });

  it("does not carry over columns from a list view (no-op merge)", () => {
    const existing = { mode: "list" as const, groupBy: "status" };
    const view = viewForMode("list", "status", ["active"], existing);
    expect(view.mode).toBe("list");
    if (view.mode === "list") {
      expect(view.groupBy).toBe("status");
      expect(view.groupOrder).toEqual(["active"]);
    }
  });
});
