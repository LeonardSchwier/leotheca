/**
 * Freehand Phase 2b: InkView - Standalone drawing note viewer/editor
 * 
 * A workspace-integrated component for viewing and editing .ink files.
 * Owns the ink document state and persistence for a single file.
 */

import { useState, useEffect, useCallback } from "preact/hooks";
import type { InkStroke, InkPoint, InkDocument } from "./inkDocument";
import { createInkHistory, commitInkEdit, undoInkEdit, redoInkEdit, eraseInkAtPoint } from "./inkEditing";
import { InkSurface, type InkSurfaceTool } from "./InkSurface";
import type { InkHistory } from "./inkEditing";

export interface InkViewProps {
  path: string;
  source: string;
  onChange: (newSource: string) => void;
}

/**
 * Default ink document for new files
 */
function getDefaultInkDocument(): InkDocument {
  return {
    version: 1,
    strokes: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

/**
 * Decode an ink document from its JSON source
 */
function decodeInkDocument(source: string): InkDocument {
  try {
    const parsed = JSON.parse(source) as InkDocument;
    // Basic validation
    if (!parsed.version || !Array.isArray(parsed.strokes) || !parsed.viewport) {
      return getDefaultInkDocument();
    }
    return parsed;
  } catch {
    return getDefaultInkDocument();
  }
}

/**
 * Encode an ink document to JSON source
 */
function encodeInkDocument(document: InkDocument): string {
  return JSON.stringify(document, null, 2);
}

/**
 * Freehand Phase 2b: Standalone drawing note viewer/editor
 */
export function InkView({ path, source, onChange }: InkViewProps) {
  const [document, setDocument] = useState<InkDocument>(() => decodeInkDocument(source));
  const [history, setHistory] = useState<InkHistory>(() => createInkHistory(document.strokes));
  const [tool, setTool] = useState<InkSurfaceTool>("pen");
  const [color, setColor] = useState<string>("#1f2937");
  const [width, setWidth] = useState<number>(3);

  // Sync document from props (e.g., when switching tabs)
  useEffect(() => {
    const decoded = decodeInkDocument(source);
    setDocument(decoded);
    setHistory(createInkHistory(decoded.strokes));
  }, [source, path]);

  // Handle stroke creation from InkSurface
  const handleCommitStroke = useCallback((stroke: InkStroke) => {
    const newStrokes = [...document.strokes, stroke];
    const newDocument = { ...document, strokes: newStrokes };
    setDocument(newDocument);
    setHistory(commitInkEdit(history, newStrokes));
    onChange(encodeInkDocument(newDocument));
  }, [document, history, onChange]);

  // Handle eraser input from InkSurface
  const handleEraseAt = useCallback((point: InkPoint) => {
    const newStrokes = eraseInkAtPoint(document.strokes, point, width);
    const newDocument = { ...document, strokes: newStrokes };
    setDocument(newDocument);
    setHistory(commitInkEdit(history, newStrokes));
    onChange(encodeInkDocument(newDocument));
  }, [document, history, width, onChange]);

  // Handle undo
  const handleUndo = useCallback(() => {
    setHistory(undoInkEdit(history));
    setDocument({ ...document, strokes: history.past[history.past.length - 1] ?? document.strokes });
  }, [history, document]);

  // Handle redo
  const handleRedo = useCallback(() => {
    setHistory(redoInkEdit(history));
    setDocument({ ...document, strokes: history.future[0] ?? document.strokes });
  }, [history, document]);

  // Tool selection handlers
  const handleToolChange = useCallback((newTool: InkSurfaceTool) => {
    setTool(newTool);
  }, []);

  // Color selection handlers
  const handleColorChange = useCallback((newColor: string) => {
    setColor(newColor);
  }, []);

  // Width selection handlers
  const handleWidthChange = useCallback((newWidth: number) => {
    setWidth(newWidth);
  }, []);

  return (
    <div class="ink-view">
      <div class="ink-toolbar" role="toolbar" aria-label="Drawing tools">
        {/* Tool selection */}
        <div class="ink-tool-group" role="radiogroup" aria-label="Drawing tool">
          <button 
            type="button" 
            class={`ink-tool-button ${tool === "pen" ? "active" : ""}`}
            onClick={() => handleToolChange("pen")}
            aria-label="Pen tool"
            title="Pen"
          >
            <span class="ink-tool-icon pen-icon" /> Pen
          </button>
          <button 
            type="button" 
            class={`ink-tool-button ${tool === "highlighter" ? "active" : ""}`}
            onClick={() => handleToolChange("highlighter")}
            aria-label="Highlighter tool"
            title="Highlighter"
          >
            <span class="ink-tool-icon highlighter-icon" /> Highlighter
          </button>
          <button 
            type="button" 
            class={`ink-tool-button ${tool === "eraser" ? "active" : ""}`}
            onClick={() => handleToolChange("eraser")}
            aria-label="Eraser tool"
            title="Eraser"
          >
            <span class="ink-tool-icon eraser-icon" /> Eraser
          </button>
        </div>

        {/* Color selection */}
        <div class="ink-color-group" role="group" aria-label="Color selection">
          <label class="ink-color-button">
            <input 
              type="color" 
              value={color}
              onInput={(e) => handleColorChange((e.target as HTMLInputElement).value)}
              aria-label="Stroke color"
            />
          </label>
        </div>

        {/* Width selection */}
        <div class="ink-width-group" role="group" aria-label="Stroke width">
          <select 
            value={width} 
            onChange={(e) => handleWidthChange(Number((e.target as HTMLSelectElement).value))}
            aria-label="Stroke width"
          >
            <option value="1">Thin</option>
            <option value="3">Medium</option>
            <option value="6">Thick</option>
            <option value="10">Very thick</option>
          </select>
        </div>

        {/* Action buttons */}
        <div class="ink-action-group" role="group" aria-label="Drawing actions">
          <button 
            type="button" 
            onClick={handleUndo}
            disabled={history.past.length === 0}
            aria-label="Undo"
            title="Undo"
          >
            <span class="ink-action-icon undo-icon" /> Undo
          </button>
          <button 
            type="button" 
            onClick={handleRedo}
            disabled={history.future.length === 0}
            aria-label="Redo"
            title="Redo"
          >
            <span class="ink-action-icon redo-icon" /> Redo
          </button>
        </div>
      </div>

      {/* Drawing surface */}
      <div class="ink-surface-container">
        <InkSurface
          strokes={document.strokes}
          tool={tool}
          color={color}
          width={width}
          onCommitStroke={handleCommitStroke}
          onEraseAt={handleEraseAt}
        />
      </div>
    </div>
  );
}