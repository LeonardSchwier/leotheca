import { useRef, useState } from "preact/hooks";
import type { JSX } from "preact";
import type { InkPoint, InkStroke, InkTool } from "./inkDocument";
import { inkWidthAtPoint, normalizeInkSample, smoothInkPoints } from "./strokeProcessing";
import "./inkSurface.css";

export interface InkSurfaceProps {
  strokes: readonly InkStroke[];
  tool?: InkTool;
  color?: string;
  width?: number;
  opacity?: number;
  onCommitStroke: (stroke: InkStroke) => void;
}

interface DraftStroke {
  pointerId: number;
  points: InkPoint[];
}

function supportedPointer(pointerType: string): boolean {
  return pointerType === "pen" || pointerType === "mouse";
}

function samplesFor(event: PointerEvent): PointerEvent[] {
  const coalesced = (event as Partial<PointerEvent>).getCoalescedEvents?.();
  return coalesced && coalesced.length > 0 ? coalesced : [event];
}

function samplePoint(event: PointerEvent, element: SVGSVGElement): InkPoint {
  const bounds = element.getBoundingClientRect();
  return normalizeInkSample({
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
    pressure: event.pressure,
    tiltX: event.tiltX,
    tiltY: event.tiltY,
    time: event.timeStamp,
  });
}

function renderStroke(stroke: InkStroke, key: string) {
  const points = stroke.points;
  if (points.length === 0) return null;
  const style = {
    stroke: stroke.color,
    strokeOpacity: stroke.opacity,
  };

  return (
    <g key={key} fill="none" stroke-linecap="round" stroke-linejoin="round">
      <circle
        cx={points[0].x}
        cy={points[0].y}
        r={inkWidthAtPoint(stroke.width, points[0]) / 2}
        fill={stroke.color}
        fill-opacity={stroke.opacity}
      />
      {points.slice(1).map((point, index) => (
        <line
          key={`${key}:${index}`}
          x1={points[index].x}
          y1={points[index].y}
          x2={point.x}
          y2={point.y}
          stroke-width={inkWidthAtPoint(stroke.width, point)}
          {...style}
        />
      ))}
    </g>
  );
}

/**
 * Low-latency Pointer Events drawing surface. It owns only a temporary
 * in-progress stroke, leaving document edits and persistence with its host.
 * Touch input stays disabled until the standalone drawing workflow defines
 * pan, pinch, and palm-rejection behavior against real devices.
 */
export function InkSurface({
  strokes,
  tool = "pen",
  color = "#1f2937",
  width = 3,
  opacity = 1,
  onCommitStroke,
}: InkSurfaceProps) {
  const draft = useRef<DraftStroke | null>(null);
  const [preview, setPreview] = useState<InkStroke | null>(null);

  const updatePreview = (points: InkPoint[]) => {
    setPreview({ id: "in-progress", tool, color, width, opacity, points });
  };

  const appendSamples = (event: PointerEvent, element: SVGSVGElement) => {
    if (!draft.current) return;
    const nextPoints = [...draft.current.points, ...samplesFor(event).map((sample) => samplePoint(sample, element))];
    draft.current = { ...draft.current, points: nextPoints };
    updatePreview(nextPoints);
  };

  const handlePointerDown = (event: JSX.TargetedPointerEvent<SVGSVGElement>) => {
    const pointerEvent = event as PointerEvent;
    if (!supportedPointer(pointerEvent.pointerType)) return;
    const element = event.currentTarget;
    const points = samplesFor(pointerEvent).map((sample) => samplePoint(sample, element));
    draft.current = { pointerId: pointerEvent.pointerId, points };
    element.setPointerCapture?.(pointerEvent.pointerId);
    updatePreview(points);
  };

  const handlePointerMove = (event: JSX.TargetedPointerEvent<SVGSVGElement>) => {
    const pointerEvent = event as PointerEvent;
    if (!draft.current || draft.current.pointerId !== pointerEvent.pointerId) return;
    appendSamples(pointerEvent, event.currentTarget);
  };

  const finishStroke = (event: JSX.TargetedPointerEvent<SVGSVGElement>, commit: boolean) => {
    const pointerEvent = event as PointerEvent;
    const element = event.currentTarget;
    if (!draft.current || draft.current.pointerId !== pointerEvent.pointerId) return;
    if (commit) appendSamples(pointerEvent, element);
    const completed = draft.current;
    draft.current = null;
    setPreview(null);
    if (element.hasPointerCapture?.(pointerEvent.pointerId)) element.releasePointerCapture?.(pointerEvent.pointerId);
    if (!commit || completed.points.length === 0) return;
    onCommitStroke({
      id: crypto.randomUUID(),
      tool,
      color,
      width,
      opacity,
      points: smoothInkPoints(completed.points),
    });
  };

  return (
    <svg
      class="ink-surface"
      aria-label="Ink drawing surface"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(event) => finishStroke(event, true)}
      onPointerCancel={(event) => finishStroke(event, false)}
    >
      {strokes.map((stroke) => renderStroke(stroke, stroke.id))}
      {preview && renderStroke(preview, preview.id)}
    </svg>
  );
}
