/**
 * Force-directed graph layout with an explicit CPU-work budget. Small graphs
 * keep the exact all-pairs Fruchterman-Reingold behavior. Larger graphs use a
 * deterministic, evenly-spaced repulsion sample and a bounded edge sample so
 * layout cost cannot grow as O(nodes² * 300) without limit on the UI thread.
 */

export interface Point {
  x: number;
  y: number;
}

export interface LayoutWorkBudget {
  mode: "exhaustive" | "sampled";
  iterations: number;
  repulsionPairsPerIteration: number;
  attractionEdgesPerIteration: number;
  estimatedInteractions: number;
}

const MAX_LAYOUT_INTERACTIONS = 500_000;
const MAX_SAMPLED_NEIGHBORS = 24;
const MAX_ATTRACTION_EDGES_PER_ITERATION = 20_000;

export function layoutWorkBudget(nodeCount: number, edgeCount = 0): LayoutWorkBudget {
  if (nodeCount <= 1) {
    return {
      mode: "exhaustive",
      iterations: 0,
      repulsionPairsPerIteration: 0,
      attractionEdgesPerIteration: 0,
      estimatedInteractions: 0,
    };
  }

  const baseIterations = Math.min(300, 80 + nodeCount * 2);
  const exhaustivePairs = (nodeCount * (nodeCount - 1)) / 2;
  const exhaustivePerIteration = exhaustivePairs + edgeCount;
  if (exhaustivePerIteration * baseIterations <= MAX_LAYOUT_INTERACTIONS) {
    return {
      mode: "exhaustive",
      iterations: baseIterations,
      repulsionPairsPerIteration: exhaustivePairs,
      attractionEdgesPerIteration: edgeCount,
      estimatedInteractions: exhaustivePerIteration * baseIterations,
    };
  }

  const sampledNeighbors = Math.min(MAX_SAMPLED_NEIGHBORS, nodeCount - 1);
  const sampledRepulsion = nodeCount * sampledNeighbors;
  const sampledAttraction = Math.min(edgeCount, MAX_ATTRACTION_EDGES_PER_ITERATION);
  const perIteration = Math.max(1, sampledRepulsion + sampledAttraction);
  const iterations = Math.max(1, Math.min(baseIterations, Math.floor(MAX_LAYOUT_INTERACTIONS / perIteration)));
  return {
    mode: "sampled",
    iterations,
    repulsionPairsPerIteration: sampledRepulsion,
    attractionEdgesPerIteration: sampledAttraction,
    estimatedInteractions: perIteration * iterations,
  };
}

export function computeLayout(
  nodePaths: string[],
  edges: [string, string][],
  width: number,
  height: number,
): Map<string, Point> {
  const result = new Map<string, Point>();
  const n = nodePaths.length;
  if (n === 0) return result;

  const radius = Math.min(width, height) * 0.35;
  const positions: Point[] = nodePaths.map((_, i) => {
    const angle = (2 * Math.PI * i) / n;
    return {
      x: width / 2 + Math.cos(angle) * radius,
      y: height / 2 + Math.sin(angle) * radius,
    };
  });
  if (n === 1) {
    result.set(nodePaths[0], positions[0]);
    return result;
  }

  const indexByPath = new Map(nodePaths.map((path, index) => [path, index]));
  const validEdges = edges
    .map(([a, b]) => [indexByPath.get(a), indexByPath.get(b)] as const)
    .filter((edge): edge is readonly [number, number] => edge[0] !== undefined && edge[1] !== undefined);
  const budget = layoutWorkBudget(n, validEdges.length);
  const area = width * height;
  const k = Math.sqrt(area / n) * 0.6;

  const applyRepulsion = (disp: Point[], i: number, j: number) => {
    const pa = positions[i];
    const pb = positions[j];
    let dx = pa.x - pb.x;
    let dy = pa.y - pb.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
    const force = (k * k) / dist;
    dx = (dx / dist) * force;
    dy = (dy / dist) * force;
    disp[i].x += dx;
    disp[i].y += dy;
    disp[j].x -= dx;
    disp[j].y -= dy;
  };

  for (let iter = 0; iter < budget.iterations; iter++) {
    const disp = Array.from({ length: n }, () => ({ x: 0, y: 0 }));

    if (budget.mode === "exhaustive") {
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) applyRepulsion(disp, i, j);
      }
    } else {
      const neighbors = Math.min(MAX_SAMPLED_NEIGHBORS, n - 1);
      for (let i = 0; i < n; i++) {
        for (let sample = 1; sample <= neighbors; sample++) {
          const offset = Math.max(1, Math.floor((sample * n) / (neighbors + 1)));
          const j = (i + offset) % n;
          if (j !== i) applyRepulsion(disp, i, j);
        }
      }
    }

    const edgeCount = validEdges.length;
    const attractionCount = Math.min(edgeCount, budget.attractionEdgesPerIteration);
    const start = edgeCount === 0 ? 0 : (iter * attractionCount) % edgeCount;
    for (let e = 0; e < attractionCount; e++) {
      const [a, b] = validEdges[(start + e) % edgeCount];
      const pa = positions[a];
      const pb = positions[b];
      let dx = pa.x - pb.x;
      let dy = pa.y - pb.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const force = (dist * dist) / k;
      dx = (dx / dist) * force;
      dy = (dy / dist) * force;
      disp[a].x -= dx;
      disp[a].y -= dy;
      disp[b].x += dx;
      disp[b].y += dy;
    }

    const temperature = k * (1 - iter / budget.iterations);
    for (let i = 0; i < n; i++) {
      const d = disp[i];
      const dist = Math.sqrt(d.x * d.x + d.y * d.y) || 0.01;
      const pos = positions[i];
      pos.x += (d.x / dist) * Math.min(dist, temperature);
      pos.y += (d.y / dist) * Math.min(dist, temperature);
      pos.x = Math.max(20, Math.min(width - 20, pos.x));
      pos.y = Math.max(20, Math.min(height - 20, pos.y));
    }
  }

  nodePaths.forEach((path, index) => result.set(path, positions[index]));
  return result;
}
