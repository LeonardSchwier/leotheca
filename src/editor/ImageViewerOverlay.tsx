import { useEffect, useState, useRef, useCallback } from "preact/hooks";
import { fileSrc } from "../workspace/tauriBridge";

interface ImageViewerOverlayProps {
  src: string;
  alt: string;
  onClose: () => void;
}

export function ImageViewerOverlay({
  src,
  alt,
  onClose,
}: ImageViewerOverlayProps) {
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);
  const [scale, setScale] = useState<number>(1);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);

  // Load the actual file source for local images
  useEffect(() => {
    if (src.startsWith("leotheca:")) {
      const path = src.slice("leotheca:".length);
      let cancelled = false;
      fileSrc(path).then((resolved) => {
        if (!cancelled) setResolvedSrc(resolved);
      });
      return () => {
        cancelled = true;
      };
    } else {
      setResolvedSrc(src);
    }
  }, [src]);

  const handleZoomIn = useCallback(() => {
    setScale((prev) => Math.min(prev * 1.5, 10));
    setPosition({ x: 0, y: 0 }); // Reset position on zoom
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((prev) => Math.max(prev / 1.5, 0.1));
    setPosition({ x: 0, y: 0 }); // Reset position on zoom
  }, []);

  const handleReset = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (e.button === 0) { // Left mouse button
      setIsDragging(true);
      dragStartPos.current = { x: e.clientX - position.x, y: e.clientY - position.y };
      // Prevent text selection and other default behaviors
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

  // Add global mouse listeners for dragging
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

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    switch (e.key) {
      case "Escape":
        onClose();
        break;
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
  }, [onClose, handleZoomIn, handleZoomOut, handleReset]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  // Prevent body scrolling when overlay is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  if (!resolvedSrc) {
    return (
      <div class="image-overlay" onClick={onClose}>
        <div class="image-overlay-content">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      class="image-overlay"
      onClick={onClose}
      onMouseDown={handleMouseDown}
    >
      <div
        class="image-overlay-content"
        onClick={(e) => e.stopPropagation()}
        ref={containerRef}
        style={{
          cursor: isDragging ? "grabbing" : "default",
        }}
      >
        <div
          class="image-overlay-image-container"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            cursor: isDragging ? "grabbing" : "grab",
          }}
        >
          <img
            src={resolvedSrc}
            alt={alt}
            class="image-overlay-image"
            draggable={false}
          />
        </div>
        <div class="image-overlay-controls">
          <button
            class="image-overlay-button"
            onClick={(e) => { e.stopPropagation(); handleZoomOut(); }}
            title="Zoom out"
            aria-label="Zoom out"
          >
            −
          </button>
          <button
            class="image-overlay-button"
            onClick={(e) => { e.stopPropagation(); handleReset(); }}
            title="Reset zoom"
            aria-label="Reset zoom"
          >
            1:1
          </button>
          <button
            class="image-overlay-button"
            onClick={(e) => { e.stopPropagation(); handleZoomIn(); }}
            title="Zoom in"
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            class="image-overlay-button image-overlay-close"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            title="Close"
            aria-label="Close"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
