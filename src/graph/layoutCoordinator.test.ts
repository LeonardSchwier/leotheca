import { describe, expect, it, vi } from "vitest";
import { createGraphLayoutCoordinator } from "./layoutCoordinator";
import type { Point } from "./layout";

const request = (name: string) => ({
  nodes: [name],
  edges: [] as [string, string][],
  width: 800,
  height: 600,
});

const positions = (name: string) => new Map<string, Point>([[name, { x: 1, y: 1 }]]);

describe("graph layout request coordinator", () => {
  it("coalesces same-turn requests so only the newest graph computes and publishes", async () => {
    const compute = vi.fn((nodes: string[]) => positions(nodes[0]));
    const coordinator = createGraphLayoutCoordinator(compute);
    const published: string[] = [];

    coordinator.request(request("old"), (result) => published.push([...result.keys()][0]));
    coordinator.request(request("new"), (result) => published.push([...result.keys()][0]));
    await Promise.resolve();

    expect(compute).toHaveBeenCalledTimes(1);
    expect(compute).toHaveBeenCalledWith(["new"], [], 800, 600);
    expect(published).toEqual(["new"]);
  });

  it("does not publish a result invalidated by a newer re-entrant request", async () => {
    const published: string[] = [];
    let coordinator: ReturnType<typeof createGraphLayoutCoordinator>;
    const compute = vi.fn((nodes: string[]) => {
      if (nodes[0] === "old") {
        coordinator.request(request("new"), (result) => published.push([...result.keys()][0]));
      }
      return positions(nodes[0]);
    });
    coordinator = createGraphLayoutCoordinator(compute);

    coordinator.request(request("old"), (result) => published.push([...result.keys()][0]));
    await Promise.resolve();
    await Promise.resolve();

    expect(published).toEqual(["new"]);
  });

  it("cancels queued work on teardown", async () => {
    const compute = vi.fn((nodes: string[]) => positions(nodes[0]));
    const coordinator = createGraphLayoutCoordinator(compute);
    const publish = vi.fn();

    coordinator.request(request("old"), publish);
    coordinator.cancel();
    await Promise.resolve();

    expect(compute).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
});
