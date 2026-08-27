/**
 * A compact Fruchterman-Reingold force-directed layout: nodes repel each
 * other, edges pull their two endpoints together, both forces cool down
 * over a fixed number of iterations until positions settle. Computed once
 * up front rather than animated continuously, which keeps the renderer
 * simple (draw static positions, transform for pan/zoom) at the cost of
 * not visibly "unfolding". Good enough for the vault sizes a personal
 * notes app deals with; this is O(nodes^2 * iterations), not something to
 * run every frame or for tens of thousands of notes.
 */

export interface Point {
  x: number;
  y: number;
}

export function computeLayout(
  nodePaths: string[],
  edges: [string, string][],
  width: number,
  height: number,
): Map<string, Point> {
  const positions = new Map<string, Point>();
  const n = nodePaths.length;
  if (n === 0) return positions;

  const radius = Math.min(width, height) * 0.35;
  nodePaths.forEach((path, i) => {
    const angle = (2 * Math.PI * i) / n;
    positions.set(path, {
      x: width / 2 + Math.cos(angle) * radius,
      y: height / 2 + Math.sin(angle) * radius,
    });
  });

  if (n === 1) return positions;

  const area = width * height;
  const k = Math.sqrt(area / n) * 0.6;
  const iterations = Math.min(300, 80 + n * 2);

  for (let iter = 0; iter < iterations; iter++) {
    const disp = new Map<string, Point>(nodePaths.map((p) => [p, { x: 0, y: 0 }]));

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = nodePaths[i];
        const b = nodePaths[j];
        const pa = positions.get(a)!;
        const pb = positions.get(b)!;
        let dx = pa.x - pb.x;
        let dy = pa.y - pb.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const force = (k * k) / dist;
        dx = (dx / dist) * force;
        dy = (dy / dist) * force;
        const da = disp.get(a)!;
        const db = disp.get(b)!;
        da.x += dx;
        da.y += dy;
        db.x -= dx;
        db.y -= dy;
      }
    }

    for (const [a, b] of edges) {
      const pa = positions.get(a);
      const pb = positions.get(b);
      if (!pa || !pb) continue;
      let dx = pa.x - pb.x;
      let dy = pa.y - pb.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const force = (dist * dist) / k;
      dx = (dx / dist) * force;
      dy = (dy / dist) * force;
      const da = disp.get(a)!;
      const db = disp.get(b)!;
      da.x -= dx;
      da.y -= dy;
      db.x += dx;
      db.y += dy;
    }

    const temperature = k * (1 - iter / iterations);
    for (const path of nodePaths) {
      const d = disp.get(path)!;
      const dist = Math.sqrt(d.x * d.x + d.y * d.y) || 0.01;
      const pos = positions.get(path)!;
      pos.x += (d.x / dist) * Math.min(dist, temperature);
      pos.y += (d.y / dist) * Math.min(dist, temperature);
      pos.x = Math.max(20, Math.min(width - 20, pos.x));
      pos.y = Math.max(20, Math.min(height - 20, pos.y));
    }
  }

  return positions;
}
