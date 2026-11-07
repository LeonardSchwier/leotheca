/**
 * Freehand Phase 2b: InkView - Standalone drawing note viewer/editor
 * 
 * A workspace-integrated component for viewing and editing .ink files.
 * Owns the ink document state and persistence for a single file.
 */

import { useState, useEffect, useCallback } from "preact/hooks";
import type { InkStroke, InkPoint } from "./inkDocument";
import {
  decodeInkDocument,
  serializeInkDocument,
  createEmptyInkDocument,
  type DecodedInkDocument,
} from "./inkDocument";
import { createInkHistory, commitInkEdit, undoInkEdit, redoInkEdit, eraseInkAtPoint } from "./inkEditing";
import { InkSurface, type InkSurfaceTool } from "./InkSurface";
import type { InkHistory } from "./inkEditing";

export interface InkViewProps {
  path: string;
  source: string;
  onChange: (newSource: string) => void;
}

/**
 * Decode an ink document from its JSON source, falling back to an empty one
 * only for unparsable/structurally unusable input. decodeInkDocument itself
 * tolerates missing/invalid version and viewport fields and preserves
 * unrecognized top-level fields and stroke shapes, so a minor format
 * deviation never discards strokes this build already understands.
 */
function decodeInkSource(source: string): DecodedInkDocument {
  return decodeInkDocument(source) ?? createEmptyInkDocument();
}

/**
 * Freehand Phase 2b: Standalone drawing note viewer/editor
 */
export function InkView({ path, source, onChange }: InkViewProps) {
  const [decoded, setDecoded] = useState<DecodedInkDocument>(() => decodeInkSource(source));
  const [history, setHistory] = useState<InkHistory>(() => createInkHistory(decoded.document.strokes));
  const [tool, setTool] = useState<InkSurfaceTool>("pen");
  const [color, setColor] = useState<string>("#1f2937");
  const [width, setWidth] = useState<number>(3);

  // Sync document from props (e.g., when switching tabs)
  useEffect(() => {
    const next = decodeInkSource(source);
    setDecoded(next);
    setHistory(createInkHistory(next.document.strokes));
  }, [source, path]);

  // Handle stroke creation from InkSurface
  const handleCommitStroke = useCallback((stroke: InkStroke) => {
    const newStrokes = [...decoded.document.strokes, stroke];
    const newDecoded: DecodedInkDocument = { ...decoded, document: { ...decoded.document, strokes: newStrokes } };
    setDecoded(newDecoded);
    setHistory(commitInkEdit(history, newStrokes));
    onChange(serializeInkDocument(newDecoded));
  }, [decoded, history, onChange]);

  // Handle eraser input from InkSurface
  const handleEraseAt = useCallback((point: InkPoint) => {
    const newStrokes = eraseInkAtPoint(decoded.document.strokes, point, width);
    const newDecoded: DecodedInkDocument = { ...decoded, document: { ...decoded.document, strokes: newStrokes } };
    setDecoded(newDecoded);
    setHistory(commitInkEdit(history, newStrokes));
    onChange(serializeInkDocument(newDecoded));
  }, [decoded, history, width, onChange]);

  // Handle undo
  const handleUndo = useCallback(() => {
    const newHistory = undoInkEdit(history);
    if (newHistory === history) return;
    const newDecoded: DecodedInkDocument = { ...decoded, document: { ...decoded.document, strokes: newHistory.present } };
    setHistory(newHistory);
    setDecoded(newDecoded);
    onChange(serializeInkDocument(newDecoded));
  }, [history, decoded, onChange]);

  // Handle redo
  const handleRedo = useCallback(() => {
    const newHistory = redoInkEdit(history);
    if (newHistory === history) return;
    const newDecoded: DecodedInkDocument = { ...decoded, document: { ...decoded.document, strokes: newHistory.present } };
    setHistory(newHistory);
    setDecoded(newDecoded);
    onChange(serializeInkDocument(newDecoded));
  }, [history, decoded, onChange]);

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
          strokes={decoded.document.strokes}
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