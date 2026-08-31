import { useEffect, useRef, useState } from "preact/hooks";
import { linkIndex } from "../linking/store";
import { updateWorkspaceSettings, workspaceSettings } from "../settings/store";
import type { GraphColorGroup } from "../settings/workspaceSettings";
import type { Point } from "./layout";
import { createGraphLayoutCoordinator } from "./layoutCoordinator";
import { computeZoomTransform, findNodeAtWorld, screenToWorld, type Transform } from "./transform";
import "./graph.css";

const COLOR_GROUP_PALETTE = ["#b3541e", "#3f6b4f", "#3f5a8a", "#8a6f1e", "#7a3f6f", "#2f7a7a"];
const FILTER_DEBOUNCE_MS = 200;

interface GraphViewProps {
  onOpenFile: (path: string, name: string) => void;
  onClose: () => void;
  focusPath?: string;
}

const MIN_SCALE = 0.15;
const MAX_SCALE = 4;
const NODE_HIT_RADIUS = 10;

function noteName(path: string): string {
  return path.split("/").pop()?.replace(/\.md$/i, "") ?? path;
}

export function computeConnectedPaths(backlinksByPath: Map<string, string[]>): Set<string> {
  const connected = new Set<string>();
  for (const [target, sources] of backlinksByPath) {
    if (sources.length === 0) continue;
    connected.add(target);
    for (const source of sources) connected.add(source);
  }
  return connected;
}

export function computeLocalGraph(
  focusPath: string,
  backlinksByPath: Map<string, string[]>,
): { nodes: Set<string>; edges: [string, string][] } {
  const nodes = new Set<string>([focusPath]);
  const edges: [string, string][] = [];
  for (const source of backlinksByPath.get(focusPath) ?? []) {
    nodes.add(source);
    edges.push([source, focusPath]);
  }
  for (const [target, sources] of backlinksByPath) {
    if (target === focusPath) continue;
    if (sources.includes(focusPath)) {
      nodes.add(target);
      edges.push([focusPath, target]);
    }
  }
  return { nodes, edges };
}

export function filterGraphByQuery(
  nodePaths: string[],
  edges: [string, string][],
  query: string,
): { nodes: string[]; edges: [string, string][] } {
  const q = query.trim().toLowerCase();
  if (!q) return { nodes: nodePaths, edges };
  const nodes = nodePaths.filter((path) => noteName(path).toLowerCase().includes(q));
  const nodeSet = new Set(nodes);
  return { nodes, edges: edges.filter(([a, b]) => nodeSet.has(a) && nodeSet.has(b)) };
}

export function colorForPath(path: string, groups: GraphColorGroup[], fallback: string): string {
  const name = noteName(path).toLowerCase();
  for (const group of groups) {
    const q = group.query.trim().toLowerCase();
    if (q && name.includes(q)) return group.color;
  }
  return fallback;
}

export function computeVisibleGraph(
  backlinksByPath: Map<string, string[]>,
  options: { isLocal: boolean; focusPath?: string; showAll: boolean; filterQuery: string },
): { nodes: string[]; edges: [string, string][] } {
  let nodePaths: string[];
  let edges: [string, string][];
  if (options.isLocal && options.focusPath) {
    const local = computeLocalGraph(options.focusPath, backlinksByPath);
    nodePaths = Array.from(local.nodes);
    edges = local.edges;
  } else {
    const connected = computeConnectedPaths(backlinksByPath);
    nodePaths = options.showAll ? Array.from(backlinksByPath.keys()) : Array.from(connected);
    edges = [];
    for (const [target, sources] of backlinksByPath) {
      for (const source of sources) edges.push([source, target]);
    }
  }
  return filterGraphByQuery(nodePaths, edges, options.filterQuery);
}

function readCssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function GraphView({ onOpenFile, onClose, focusPath }: GraphViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const positionsRef = useRef<Map<string, Point>>(new Map());
  const edgesRef = useRef<[string, string][]>([]);
  const transformRef = useRef<Transform>({ offsetX: 0, offsetY: 0, scale: 1 });
  const draggingRef = useRef<{ x: number; y: number } | null>(null);
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStartRef = useRef<{
    dist: number;
    scale: number;
    midX: number;
    midY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const layoutCoordinatorRef = useRef<ReturnType<typeof createGraphLayoutCoordinator>>();
  if (!layoutCoordinatorRef.current) layoutCoordinatorRef.current = createGraphLayoutCoordinator();
  const [showAll, setShowAll] = useState(false);
  const [mode, setMode] = useState<"workspace" | "local">("workspace");
  const [filterInput, setFilterInput] = useState("");
  const [filterQuery, setFilterQuery] = useState("");
  const filterTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const [colorGroupsOpen, setColorGroupsOpen] = useState(false);
  const isLocal = mode === "local" && !!focusPath;
  const colorGroups = workspaceSettings.value.graphColorGroups;

  useEffect(() => {
    return () => {
      if (filterTimerRef.current) clearTimeout(filterTimerRef.current);
      layoutCoordinatorRef.current?.cancel();
    };
  }, []);

  const handleFilterInput = (value: string) => {
    setFilterInput(value);
    if (filterTimerRef.current) clearTimeout(filterTimerRef.current);
    filterTimerRef.current = setTimeout(() => setFilterQuery(value), FILTER_DEBOUNCE_MS);
  };

  const draw = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const { offsetX, offsetY, scale } = transformRef.current;
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = readCssVar("--bg-base", "#faf9f6");
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
    ctx.strokeStyle = readCssVar("--border", "#ddd8ca");
    ctx.lineWidth = 1 / scale;
    for (const [a, b] of edgesRef.current) {
      const pa = positionsRef.current.get(a);
      const pb = positionsRef.current.get(b);
      if (!pa || !pb) continue;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }
    const nodeColor = readCssVar("--accent", "#6f5b3e");
    for (const [path, pos] of positionsRef.current) {
      ctx.fillStyle = colorForPath(path, colorGroups, nodeColor);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 5 / scale, 0, Math.PI * 2);
      ctx.fill();
    }
    if (scale > 0.6) {
      ctx.fillStyle = readCssVar("--text-secondary", "#6b6656");
      ctx.font = `${12 / scale}px sans-serif`;
      for (const [path, pos] of positionsRef.current) {
        ctx.fillText(noteName(path), pos.x + 8 / scale, pos.y + 4 / scale);
      }
    }
    ctx.restore();
  };

  const layoutAndDraw = () => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) return;
    canvas.width = width;
    canvas.height = height;
    const { backlinksByPath } = linkIndex.value;
    const { nodes, edges } = computeVisibleGraph(backlinksByPath, {
      isLocal,
      focusPath,
      showAll,
      filterQuery,
    });
    layoutCoordinatorRef.current!.request({ nodes, edges, width, height }, (positions) => {
      edgesRef.current = edges;
      positionsRef.current = positions;
      transformRef.current = { offsetX: 0, offsetY: 0, scale: 1 };
      draw();
    });
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    layoutAndDraw();
    const observer = new ResizeObserver(() => layoutAndDraw());
    observer.observe(container);
    return () => {
      observer.disconnect();
      layoutCoordinatorRef.current?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAll, isLocal, focusPath, filterQuery]);

  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(colorGroups)]);

  function findNodeAt(clientX: number, clientY: number): string | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const { scale } = transformRef.current;
    const world = screenToWorld(clientX - rect.left, clientY - rect.top, transformRef.current);
    const node = findNodeAtWorld(world.x, world.y, positionsRef.current, scale, NODE_HIT_RADIUS);
    if (node) return node;
    if (scale <= 0.6) return null;
    for (const [path, position] of positionsRef.current) {
      const label = noteName(path);
      const left = position.x + 8 / scale;
      const width = (label.length * 7.2) / scale;
      const top = position.y - 10 / scale;
      const bottom = position.y + 7 / scale;
      if (world.x >= left && world.x <= left + width && world.y >= top && world.y <= bottom) return path;
    }
    return null;
  }

  function applyZoom(clientX: number, clientY: number, newScale: number, base: Transform) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    transformRef.current = computeZoomTransform(
      clientX - rect.left,
      clientY - rect.top,
      newScale,
      base,
      MIN_SCALE,
      MAX_SCALE,
    );
    draw();
  }

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    const zoomFactor = Math.exp(-e.deltaY * 0.001);
    applyZoom(e.clientX, e.clientY, transformRef.current.scale * zoomFactor, transformRef.current);
  };

  const handlePointerDown = (e: PointerEvent) => {
    canvasRef.current?.setPointerCapture(e.pointerId);
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointersRef.current.size === 2) {
      draggingRef.current = null;
      const pts = Array.from(activePointersRef.current.values());
      pinchStartRef.current = {
        dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1,
        scale: transformRef.current.scale,
        midX: (pts[0].x + pts[1].x) / 2,
        midY: (pts[0].y + pts[1].y) / 2,
        offsetX: transformRef.current.offsetX,
        offsetY: transformRef.current.offsetY,
      };
      return;
    }
    const node = findNodeAt(e.clientX, e.clientY);
    if (node) {
      onOpenFile(node, noteName(node) + ".md");
      return;
    }
    draggingRef.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerMove = (e: PointerEvent) => {
    if (activePointersRef.current.has(e.pointerId)) activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointersRef.current.size === 2 && pinchStartRef.current) {
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      const start = pinchStartRef.current;
      applyZoom(start.midX, start.midY, start.scale * (dist / start.dist), {
        offsetX: start.offsetX,
        offsetY: start.offsetY,
        scale: start.scale,
      });
      return;
    }
    if (!draggingRef.current) return;
    const dx = e.clientX - draggingRef.current.x;
    const dy = e.clientY - draggingRef.current.y;
    draggingRef.current = { x: e.clientX, y: e.clientY };
    transformRef.current = {
      ...transformRef.current,
      offsetX: transformRef.current.offsetX + dx,
      offsetY: transformRef.current.offsetY + dy,
    };
    draw();
  };

  const handlePointerUp = (e: PointerEvent) => {
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size < 2) pinchStartRef.current = null;
    draggingRef.current = null;
  };

  const { backlinksByPath } = linkIndex.value;
  const totalCount = backlinksByPath.size;
  const nodeCount = computeVisibleGraph(backlinksByPath, {
    isLocal,
    focusPath,
    showAll,
    filterQuery,
  }).nodes.length;

  function addColorGroup() {
    const next: GraphColorGroup = {
      id: crypto.randomUUID(),
      query: "",
      color: COLOR_GROUP_PALETTE[colorGroups.length % COLOR_GROUP_PALETTE.length],
    };
    void updateWorkspaceSettings({ graphColorGroups: [...colorGroups, next] });
  }

  function updateColorGroup(id: string, patch: Partial<Pick<GraphColorGroup, "query" | "color">>) {
    void updateWorkspaceSettings({
      graphColorGroups: colorGroups.map((group) => (group.id === id ? { ...group, ...patch } : group)),
    });
  }

  function removeColorGroup(id: string) {
    void updateWorkspaceSettings({ graphColorGroups: colorGroups.filter((group) => group.id !== id) });
  }

  return (
    <div class="graph-view-overlay">
      <div class="graph-view-header">
        <span class="graph-view-title">{isLocal ? `Local graph: ${noteName(focusPath!)}` : "Graph"}</span>
        <div class="graph-view-header-actions">
          <input
            class="graph-filter-input"
            type="text"
            placeholder="Filter notes…"
            aria-label="Filter graph notes"
            value={filterInput}
            onInput={(e) => handleFilterInput((e.target as HTMLInputElement).value)}
          />
          {focusPath && (
            <div class="settings-switch">
              <button class={mode === "workspace" ? "active" : ""} onClick={() => setMode("workspace")}>
                Workspace
              </button>
              <button class={mode === "local" ? "active" : ""} onClick={() => setMode("local")}>
                This note
              </button>
            </div>
          )}
          {!isLocal && (
            <label class="graph-view-toggle">
              <input
                type="checkbox"
                checked={showAll}
                onChange={(e) => setShowAll((e.target as HTMLInputElement).checked)}
              />
              Show all notes
            </label>
          )}
          <button
            class={colorGroupsOpen ? "graph-color-groups-toggle active" : "graph-color-groups-toggle"}
            aria-label="Color groups"
            title="Color groups"
            onClick={() => setColorGroupsOpen((open) => !open)}
          >
            Colors
          </button>
          <button class="icon-button" aria-label="Close graph" title="Close graph" onClick={onClose}>
            ×
          </button>
        </div>
      </div>
      {colorGroupsOpen && (
        <div class="graph-color-groups-panel">
          {colorGroups.map((group) => (
            <div class="graph-color-group-row" key={group.id}>
              <input
                type="color"
                aria-label={group.query ? `Color for notes matching "${group.query}"` : "Color for new group"}
                value={group.color}
                onInput={(e) => updateColorGroup(group.id, { color: (e.target as HTMLInputElement).value })}
              />
              <input
                type="text"
                class="graph-color-group-query"
                placeholder="Notes containing…"
                value={group.query}
                onInput={(e) => updateColorGroup(group.id, { query: (e.target as HTMLInputElement).value })}
              />
              <button class="graph-color-group-remove" aria-label="Remove color group" onClick={() => removeColorGroup(group.id)}>
                ×
              </button>
            </div>
          ))}
          <button class="graph-color-group-add" onClick={addColorGroup}>
            + Add color group
          </button>
        </div>
      )}
      <div class="graph-view-canvas-wrap" ref={containerRef}>
        {nodeCount === 0 ? (
          <p class="empty-hint">
            {totalCount === 0
              ? "No notes to graph yet."
              : filterInput.trim()
                ? "No notes match your filter."
                : "No connected notes yet, try “Show all notes”."}
          </p>
        ) : (
          <canvas
            ref={canvasRef}
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
        )}
      </div>
    </div>
  );
}
