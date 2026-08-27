import { describe, expect, it } from "vitest";
import { computeLayout } from "./layout";

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe("computeLayout", () => {
  it("returns an empty map for no nodes", () => {
    expect(computeLayout([], [], 800, 600).size).toBe(0);
  });

  it("places a single node without crashing", () => {
    const positions = computeLayout(["/a.md"], [], 800, 600);
    expect(positions.size).toBe(1);
    const p = positions.get("/a.md")!;
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
  });

  it("gives every node a finite position within the canvas bounds", () => {
    const nodes = ["/a.md", "/b.md", "/c.md", "/d.md", "/e.md"];
    const edges: [string, string][] = [
      ["/a.md", "/b.md"],
      ["/b.md", "/c.md"],
    ];
    const positions = computeLayout(nodes, edges, 800, 600);

    expect(positions.size).toBe(nodes.length);
    for (const path of nodes) {
      const p = positions.get(path)!;
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
      // Clamped in the last simulation step, see computeLayout.
      expect(p.x).toBeGreaterThanOrEqual(20);
      expect(p.x).toBeLessThanOrEqual(800 - 20);
      expect(p.y).toBeGreaterThanOrEqual(20);
      expect(p.y).toBeLessThanOrEqual(600 - 20);
    }
  });

  it("ignores edges that reference an unknown node instead of crashing", () => {
    const positions = computeLayout(["/a.md", "/b.md"], [["/a.md", "/missing.md"]], 800, 600);
    expect(positions.size).toBe(2);
  });

  it("pulls linked nodes closer together than unlinked ones", () => {
    // Six nodes on the initial circle so linked and unlinked pairs start at
    // comparable distances; only the A-B edge should pull its pair in.
    const nodes = ["a", "b", "c", "d", "e", "f"];
    const positions = computeLayout(nodes, [["a", "b"]], 800, 600);

    const linkedDistance = distance(positions.get("a")!, positions.get("b")!);
    const unlinkedDistance = distance(positions.get("c")!, positions.get("d")!);

    expect(linkedDistance).toBeLessThan(unlinkedDistance);
  });
});
