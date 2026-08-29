import { useState } from "preact/hooks";
import "./canvas.css";

interface CanvasNode { id: string; text: string; x: number; y: number; }
interface CanvasDocument { nodes: CanvasNode[]; edges: Array<{ from: string; to: string }>; }

function parseCanvas(source: string): CanvasDocument | null {
  try {
    const parsed = JSON.parse(source) as Partial<CanvasDocument>;
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return null;
    const nodes = parsed.nodes.filter((node): node is CanvasNode =>
      typeof node?.id === "string" && typeof node.text === "string" && typeof node.x === "number" && typeof node.y === "number",
    );
    return { nodes, edges: parsed.edges as CanvasDocument["edges"] };
  } catch {
    return null;
  }
}

/** Editable local JSON canvas. Changes use the normal tab autosave path. */
export function CanvasView({ source, onChange }: { source: string; onChange: (source: string) => void }) {
  const [drag, setDrag] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const document = parseCanvas(source);
  if (!document) return <div class="canvas-view"><p class="canvas-empty-hint">This canvas file is not valid JSON.</p></div>;
  const update = (nodes: CanvasNode[]) => onChange(JSON.stringify({ ...document, nodes }, null, 2));
  const addCard = () => update([...document.nodes, { id: crypto.randomUUID(), text: "Untitled card", x: 80 + document.nodes.length * 24, y: 80 + document.nodes.length * 24 }]);
  return <div class="canvas-view"><div class="canvas-toolbar"><button onClick={addCard}>New card</button></div><div class="canvas-viewport" onPointerMove={(event) => {
    if (!drag) return;
    const rect = event.currentTarget.getBoundingClientRect();
    update(document.nodes.map((node) => node.id === drag.id ? { ...node, x: event.clientX - rect.left - drag.offsetX, y: event.clientY - rect.top - drag.offsetY } : node));
  }} onPointerUp={() => setDrag(null)}>
    {document.nodes.length === 0 ? <p class="canvas-empty-hint">Create a card to begin.</p> : document.nodes.map((node) => <article class="canvas-card" style={{ left: `${node.x}px`, top: `${node.y}px` }} onPointerDown={(event) => { const rect = event.currentTarget.getBoundingClientRect(); event.currentTarget.setPointerCapture(event.pointerId); setDrag({ id: node.id, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top }); }}><textarea value={node.text} onInput={(event) => update(document.nodes.map((item) => item.id === node.id ? { ...item, text: event.currentTarget.value } : item))} /></article>)}
  </div></div>;
}
