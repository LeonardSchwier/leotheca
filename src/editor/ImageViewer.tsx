import { useEffect, useState, useRef, useCallback } from "preact/hooks";
import { fileSrc } from "../workspace/tauriBridge";

export function ImageViewer({ path }: { path: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [scale, setScale] = useState<number>(1);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    fileSrc(path).then((resolved) => {
      if (!cancelled) setSrc(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  const handleZoomIn = useCallback(() => {
    setScale((prev) => Math.min(prev * 1.5, 10));
    setPosition({ x: 0, y: 0 });
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((prev) => Math.max(prev / 1.5, 0.1));
    setPosition({ x: 0, y: 0 });
  }, []);

  const handleReset = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true);
      dragStartPos.current = { x: e.clientX - position.x, y: e.clientY - position.y };
      e.preventDefault();
    }
  }, [position.x, position.y]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging && dragStartPos.current) {
      setPosition({
        x: e.clientX - dragStartPos.current.x,
        y: e.clientY - dragStartPos.current.y,
      });
    }
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    dragStartPos.current = null;
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    switch (e.key) {
      case "+":
      case "=":
        handleZoomIn();
        break;
      case "-":
      case "_":
        handleZoomOut();
        break;
      case "0":
        handleReset();
        break;
    }
  }, [handleZoomIn, handleZoomOut, handleReset]);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  if (!src) {
    return <div class="image-viewer">Loading...</div>;
  }

  return (
    <div
      class="image-viewer"
      onMouseDown={handleMouseDown}
      ref={containerRef}
      style={{ cursor: isDragging ? "grabbing" : "default" }}
    >
      <div
        class="image-viewer-container"
        style={{
          transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
          cursor: isDragging ? "grabbing" : "grab",
        }}
      >
        <img
          src={src}
          alt={path}
          class="image-viewer-image"
          draggable={false}
        />
      </div>
      <div class="image-viewer-controls">
        <button class="image-viewer-button" onClick={handleZoomOut} title="Zoom out" aria-label="Zoom out">−</button>
        <button class="image-viewer-button" onClick={handleReset} title="Reset zoom" aria-label="Reset zoom">1:1</button>
        <button class="image-viewer-button" onClick={handleZoomIn} title="Zoom in" aria-label="Zoom in">+</button>
      </div>
    </div>
  );
}
