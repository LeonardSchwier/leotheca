import { describe, expect, it } from "vitest";
import { computeLayout, layoutWorkBudget } from "./layout";

function nodes(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `/note-${index}.md`);
}

function chainEdges(count: number): [string, string][] {
  return Array.from({ length: Math.max(0, count - 1) }, (_, index) => [
    `/note-${index}.md`,
    `/note-${index + 1}.md`,
  ]);
}

describe("graph layout work budget", () => {
  it("keeps small graphs on exhaustive force calculations", () => {
    const budget = layoutWorkBudget(20, 19);
    expect(budget.mode).toBe("exhaustive");
    expect(budget.iterations).toBeGreaterThan(0);
  });

  it("caps representative large-graph interaction work", () => {
    for (const count of [100, 500, 2_000, 5_000]) {
      const budget = layoutWorkBudget(count, count * 2);
      expect(budget.estimatedInteractions).toBeLessThanOrEqual(500_000);
      if (count >= 500) expect(budget.mode).toBe("sampled");
    }
  });

  it("keeps the interaction cap true even when one pass over every node would exceed it", () => {
    const budget = layoutWorkBudget(1_000_000, 2_000_000);
    expect(budget.mode).toBe("sampled");
    expect(budget.repulsionSourcesPerIteration).toBeLessThan(1_000_000);
    expect(budget.estimatedInteractions).toBeLessThanOrEqual(500_000);
  });

  it("lays out a 2,000-note representative graph within a generous CI responsiveness budget", () => {
    const graphNodes = nodes(2_000);
    const graphEdges = chainEdges(2_000);
    const started = performance.now();
    const positions = computeLayout(graphNodes, graphEdges, 1_200, 800);
    const elapsedMs = performance.now() - started;

    expect(positions.size).toBe(2_000);
    // The deterministic interaction cap is the primary regression guard. This
    // wall-clock ceiling catches accidental removal of that cap while leaving
    // ample room for slower shared CI runners.
    expect(elapsedMs).toBeLessThan(2_000);
  });
});
