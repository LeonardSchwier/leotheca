import { computeLayout, type Point } from "./layout";

export interface GraphLayoutRequest {
  nodes: string[];
  edges: [string, string][];
  width: number;
  height: number;
}

export type LayoutComputer = (
  nodes: string[],
  edges: [string, string][],
  width: number,
  height: number,
) => Map<string, Point>;

/**
 * Coalesces graph layout requests into one microtask and gives each request a
 * generation. Only the newest generation may publish. The second authority
 * check after compute also protects against a testable re-entrant/newer request
 * during computation, so stale graph or workspace results never replace the
 * latest requested view.
 */
export function createGraphLayoutCoordinator(compute: LayoutComputer = computeLayout) {
  let generation = 0;
  let scheduled = false;
  let latest:
    | { generation: number; request: GraphLayoutRequest; publish: (positions: Map<string, Point>) => void }
    | undefined;

  function request(
    graph: GraphLayoutRequest,
    publish: (positions: Map<string, Point>) => void,
  ): number {
    const mine = ++generation;
    latest = { generation: mine, request: graph, publish };
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(runLatest);
    }
    return mine;
  }

  function runLatest(): void {
    scheduled = false;
    const work = latest;
    latest = undefined;
    if (!work || work.generation !== generation) return;
    const { nodes, edges, width, height } = work.request;
    const positions = compute(nodes, edges, width, height);
    if (work.generation !== generation) return;
    work.publish(positions);
    if (latest && !scheduled) {
      scheduled = true;
      queueMicrotask(runLatest);
    }
  }

  function cancel(): void {
    generation++;
    latest = undefined;
  }

  return { request, cancel };
}
