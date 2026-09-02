import { useRef, useState } from "preact/hooks";
import { commitInkEdit, createInkHistory, eraseInkAtPoint, redoInkEdit, undoInkEdit } from "./inkEditing";
import type { InkPoint, InkStroke, InkTool } from "./inkDocument";
import { inkWidthAtPoint, normalizeInkSample, smoothInkPoints } from "./strokeProcessing";

export type InkSurfaceTool = InkTool | "eraser";

interface InkSurfaceProps {
  initialStrokes?: InkStroke[];
  onChange?: (strokes: InkStroke[]) => void;
}

function pointerPoint(event: PointerEvent, element: SVGSVGElement): InkPoint {
  const rect = element.getBoundingClientRect();
  return normalizeInkSample({
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
    pressure: event.pressure,
    tiltX: event.tiltX,
    tiltY: event.tiltY,
    time: event.timeStamp,
  });
}

function coalescedEvents(event: PointerEvent): PointerEvent[] {
  const getter = event.getCoalescedEvents;
  if (typeof getter !== "function") return [event];
  const samples = getter.call(event);
  return samples.length > 0 ? samples : [event];
}

/** Shared Pointer-Events drawing surface; file/tab integration is deliberately external. */
export function InkSurface({ initialStrokes = [], onChange }: InkSurfaceProps) {
  const [tool, setTool] = useState<InkSurfaceTool>("pen");
  const [color, setColor] = useState("#111111");
  const [baseWidth, setBaseWidth] = useState(4);
  const [history, setHistory] = useState(() => createInkHistory(initialStrokes));
  const [draft, setDraft] = useState<InkStroke | null>(null);
  const activePointer = useRef<number | null>(null);
  const activePenPointer = useRef<number | null>(null);

  const publish = (nextHistory: ReturnType<typeof createInkHistory>) => {
    setHistory(nextHistory);
    onChange?.(nextHistory.present);
  };

  const renderStroke = (stroke: InkStroke) => {
    const points = smoothInkPoints(stroke.points);
    if (points.length === 1) {
      const width = inkWidthAtPoint(stroke.width, points[0]);
      return <circle key={`${stroke.id}:dot`} cx={points[0].x} cy={points[0].y} r={width / 2} fill={stroke.color} opacity={stroke.opacity} />;
    }
    return points.slice(1).map((point, index) => {
      const previous = points[index];
      const width = (inkWidthAtPoint(stroke.width, previous) + inkWidthAtPoint(stroke.width, point)) / 2;
      return (
        <line
          key={`${stroke.id}:${index}`}
          x1={previous.x}
          y1={previous.y}
          x2={point.x}
          y2={point.y}
          stroke={stroke.color}
          stroke-width={width}
          stroke-linecap="round"
          opacity={stroke.opacity}
        />
      );
    });
  };

  const beginStroke = (event: PointerEvent, element: SVGSVGElement) => {
    const point = pointerPoint(event, element);
    setDraft({
      id: crypto.randomUUID(),
      tool: tool === "highlighter" ? "highlighter" : "pen",
      color,
      width: baseWidth,
      opacity: tool === "highlighter" ? 0.35 : 1,
      points: [point],
    });
  };

  const appendDraftSamples = (event: PointerEvent, element: SVGSVGElement) => {
    const samples = coalescedEvents(event).map((sample) => pointerPoint(sample, element));
    setDraft((current) => current ? { ...current, points: [...current.points, ...samples] } : current);
  };

  const finishPointer = (event: PointerEvent) => {
    if (event.pointerId !== activePointer.current) return;
    if (draft && draft.points.length > 0) {
      const completed = { ...draft, points: smoothInkPoints(draft.points) };
      publish(commitInkEdit(history, [...history.present, completed]));
    }
    setDraft(null);
    activePointer.current = null;
    if (activePenPointer.current === event.pointerId) activePenPointer.current = null;
  };

  const undo = () => {
    const next = undoInkEdit(history);
    if (next !== history) publish(next);
  };
  const redo = () => {
    const next = redoInkEdit(history);
    if (next !== history) publish(next);
  };

  return (
    <section class="ink-surface">
      <div class="ink-toolbar" role="toolbar" aria-label="Ink tools">
        <button aria-pressed={tool === "pen"} onClick={() => setTool("pen")}>Pen</button>
        <button aria-pressed={tool === "highlighter"} onClick={() => setTool("highlighter")}>Highlighter</button>
        <button aria-pressed={tool === "eraser"} onClick={() => setTool("eraser")}>Eraser</button>
        <label>
          Color
          <input aria-label="Ink color" type="color" value={color} onInput={(event) => setColor(event.currentTarget.value)} />
        </label>
        <label>
          Width
          <input
            aria-label="Ink width"
            type="range"
            min="1"
            max="32"
            step="0.5"
            value={baseWidth}
            onInput={(event) => setBaseWidth(Number(event.currentTarget.value))}
          />
        </label>
        <button onClick={undo} disabled={history.past.length === 0}>Undo</button>
        <button onClick={redo} disabled={history.future.length === 0}>Redo</button>
      </div>
      <svg
        aria-label="Ink drawing surface"
        class="ink-canvas"
        style={{ width: "100%", height: "100%", minHeight: "320px", touchAction: "none" }}
        onPointerDown={(event) => {
          const native = event as unknown as PointerEvent;
          if (native.pointerType === "touch" && activePenPointer.current !== null) return;
          if (activePointer.current !== null) return;
          activePointer.current = native.pointerId;
          if (native.pointerType === "pen") activePenPointer.current = native.pointerId;
          event.currentTarget.setPointerCapture?.(native.pointerId);
          const point = pointerPoint(native, event.currentTarget);
          if (tool === "eraser") {
            publish(commitInkEdit(history, eraseInkAtPoint(history.present, point, baseWidth * 2)));
            return;
          }
          beginStroke(native, event.currentTarget);
        }}
        onPointerMove={(event) => {
          const native = event as unknown as PointerEvent;
          if (native.pointerId !== activePointer.current) return;
          if (tool === "eraser") {
            const point = pointerPoint(native, event.currentTarget);
            publish(commitInkEdit(history, eraseInkAtPoint(history.present, point, baseWidth * 2)));
            return;
          }
          appendDraftSamples(native, event.currentTarget);
        }}
        onPointerUp={(event) => finishPointer(event as unknown as PointerEvent)}
        onPointerCancel={(event) => finishPointer(event as unknown as PointerEvent)}
      >
        {history.present.map(renderStroke)}
        {draft && renderStroke(draft)}
      </svg>
    </section>
  );
}
