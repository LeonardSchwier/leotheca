import { useState } from "preact/hooks";
import "./canvas.css";

export interface CanvasNode { id: string; text: string; x: number; y: number; filePath?: string; }
export interface CanvasEdge { from: string; to: string; }
interface CanvasDocument { nodes: CanvasNode[]; edges: CanvasEdge[]; }

/** Reads safe canvas data, discarding malformed edges from hand-edited files. */
export function parseCanvas(source: string): CanvasDocument | null {
  try {
    const parsed = JSON.parse(source) as Partial<CanvasDocument>;
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return null;
    const nodes = parsed.nodes.filter((node): node is CanvasNode => typeof node?.id === "string" && typeof node.text === "string" && typeof node.x === "number" && typeof node.y === "number" && (node.filePath === undefined || typeof node.filePath === "string"));
    const ids = new Set(nodes.map((node) => node.id));
    const edges = parsed.edges.filter((edge): edge is CanvasEdge => typeof edge?.from === "string" && typeof edge.to === "string" && edge.from !== edge.to && ids.has(edge.from) && ids.has(edge.to));
    return { nodes, edges };
  } catch { return null; }
}

/** File-backed spatial cards, links, and local file references. */
export function CanvasView({ source, onChange, onOpenFile }: { source: string; onChange: (source: string) => void; onOpenFile: (path: string) => void }) {
  const [drag, setDrag] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [connectionStart, setConnectionStart] = useState<string | null>(null);
  const document = parseCanvas(source);
  if (!document) return <div class="canvas-view"><p class="canvas-empty-hint">This canvas file is not valid JSON.</p></div>;
  const save = (next: CanvasDocument) => onChange(JSON.stringify(next, null, 2));
  const updateNodes = (nodes: CanvasNode[]) => save({ ...document, nodes });
  const addCard = (filePath?: string) => updateNodes([...document.nodes, { id: crypto.randomUUID(), text: filePath !== undefined ? "Linked file" : "Untitled card", filePath, x: 80 + document.nodes.length * 24, y: 80 + document.nodes.length * 24 }]);
  const connect = (id: string) => {
    if (!connectionStart) { setConnectionStart(id); return; }
    if (connectionStart !== id && !document.edges.some((edge) => edge.from === connectionStart && edge.to === id)) save({ ...document, edges: [...document.edges, { from: connectionStart, to: id }] });
    setConnectionStart(null);
  };
  return <div class="canvas-view"><div class="canvas-toolbar"><button onClick={() => addCard()}>New card</button><button onClick={() => addCard("")}>Link file</button>{connectionStart && <span class="canvas-connect-hint">Choose another card to connect</span>}</div><div class="canvas-viewport" onPointerMove={(event) => { if (!drag) return; const rect = event.currentTarget.getBoundingClientRect(); updateNodes(document.nodes.map((node) => node.id === drag.id ? { ...node, x: event.clientX - rect.left - drag.offsetX, y: event.clientY - rect.top - drag.offsetY } : node)); }} onPointerUp={() => setDrag(null)}><svg class="canvas-edges" aria-hidden="true">{document.edges.map((edge) => { const from = document.nodes.find((node) => node.id === edge.from)!; const to = document.nodes.find((node) => node.id === edge.to)!; return <line key={`${edge.from}:${edge.to}`} x1={from.x + 90} y1={from.y + 40} x2={to.x + 90} y2={to.y + 40} />; })}</svg>{document.nodes.length === 0 ? <p class="canvas-empty-hint">Create a card to begin.</p> : document.nodes.map((node) => <article key={node.id} class="canvas-card" style={{ left: `${node.x}px`, top: `${node.y}px` }}><div class="canvas-card-actions" onPointerDown={(event) => { const rect = event.currentTarget.parentElement!.getBoundingClientRect(); event.currentTarget.setPointerCapture(event.pointerId); setDrag({ id: node.id, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top }); }}><button onClick={(event) => { event.stopPropagation(); connect(node.id); }}>{connectionStart === node.id ? "Connecting" : "Connect"}</button>{node.filePath && <button onClick={() => onOpenFile(node.filePath!)}>Open</button>}</div>{node.filePath !== undefined && <input aria-label="Linked file path" value={node.filePath} placeholder="Path to a note, image, or document" onInput={(event) => updateNodes(document.nodes.map((item) => item.id === node.id ? { ...item, filePath: event.currentTarget.value } : item))} />}<textarea aria-label="Card text" value={node.text} onInput={(event) => updateNodes(document.nodes.map((item) => item.id === node.id ? { ...item, text: event.currentTarget.value } : item))} /></article>)}</div></div>;
}
