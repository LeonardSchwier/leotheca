import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { memo } from "preact/compat";
import { HIGHLIGHT_COLOR_CHOICES, highlightColorEmoji, insertHighlightColor } from "../editor/highlightColors";

export interface HighlightPickerOnSelect {
  /** Called with the text to insert at the current editor selection/cursor
   * and the caret offset within that text (see insertHighlightColor). */
  insert: (text: string, caretOffset: number) => void;
}

/**
 * The toolbar color picker for ROADMAP.md's "Highlight colors in the
 * editor and preview" (rm-7e6b338cfafec8d3): the five recognized colors
 * from the shared single source of truth in ../markdown/highlight.ts
 * (rm-c2a2c2d840b60a2e), plus "Plain" for a color-less `==…==`. Each
 * swatch carries its own CSS background (the theme's existing
 * `--lt-highlight-<color>` custom property, set by
 * src/styles/theme.css's `.lt-highlight-color-*` rules) rather than
 * re-deriving the color hex here, so the picker, the editor's live
 * decoration, and the preview's rendered `<mark>` all stay visually
 * consistent from one stylesheet.
 *
 * Selecting a color calls back into the editor through
 * `onSelect.insert` — the same single mechanism (`insertRequest`)
 * OutlinePanel/HeadingBreadcrumbs already use for their own insertions —
 * rather than reaching into the CodeMirror view directly, keeping this
 * component testable without a live editor and consistent with the rest
 * of the app's "request" pattern.
 */
export function HighlightColorPicker({ insert, onClose }: HighlightPickerOnSelect & { onClose: () => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const onPlainSelect = useCallback(() => {
    const { text, caretOffset } = insertHighlightColor("", undefined);
    insert(text, caretOffset);
    onClose();
  }, [insert, onClose]);

  const onColorSelect = useCallback(
    (color: string) => {
      const { text, caretOffset } = insertHighlightColor("", color);
      insert(text, caretOffset);
      onClose();
    },
    [insert, onClose],
  );

  // Cache one stable handler per color in a ref so each swatch's `onClick`
  // prop is the same function across every parent render — the property
  // that lets memo(HighlightSwatch) below skip a re-render. Rebuilding a
  // fresh closure per color per render (as the pre-fix code did) defeats
  // the memo even when the swatch component itself is memoized.
  const colorHandlers = useRef<Record<string, () => void>>({});
  for (const choice of HIGHLIGHT_COLOR_CHOICES) {
    if (!colorHandlers.current[choice.color]) {
      colorHandlers.current[choice.color] = () => onColorSelect(choice.color);
    }
  }

  return (
    <div class="highlight-picker" ref={rootRef}>
      <button
        class={`icon-button ${open ? "active" : ""}`}
        aria-label="Highlight color"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Highlight color"
        onClick={() => setOpen((value: boolean) => !value)}
      >
        <HighlightSwatchIcon />
      </button>
      {open && (
        <div class="highlight-picker-menu" role="menu" aria-label="Highlight color">
          <HighlightSwatch
            label="Plain"
            className="lt-highlight-color-plain"
            onClick={onPlainSelect}
          />
          {HIGHLIGHT_COLOR_CHOICES.map((choice) => (
            <HighlightSwatch
              key={choice.color}
              label={choice.label}
              className={`lt-highlight-color-${choice.color}`}
              onClick={colorHandlers.current[choice.color]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function HighlightSwatchComponent({
  label,
  className,
  onClick,
}: {
  label: string;
  className: string;
  onClick: () => void;
}) {
  return (
    <button
      class={`highlight-picker-swatch ${className}`}
      role="menuitem"
      title={label}
      aria-label={`Highlight: ${label}`}
      onClick={onClick}
    >
      <span class="highlight-picker-swatch-dot" aria-hidden="true" />
      <span class="highlight-picker-swatch-label">{label}</span>
    </button>
  );
}

// Memoize the swatch so toggling the menu open/closed re-runs only the
// parent's render, not a re-render of all six swatch buttons. Their
// `label`/`className`/`onClick` props are referentially stable across
// parent renders (see the useCallback'd handlers above), so Preact can
// skip them entirely. Matches the repo's FileTreeNode memo convention.
// `HighlightSwatch` (the memoized element type the menu renders) is
// exported so a test can assert the menu's swatches are actually memoized
// and receive referentially-stable props across parent re-renders.
export const HighlightSwatch = memo(HighlightSwatchComponent);

/** A tiny inline stand-in for the highlight marker glyph (== with a
 * colored dot), kept inline here rather than added to the shared icon
 * registry: it's used exactly once, in this picker's trigger button. */
function HighlightSwatchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="6" width="12" height="5" rx="1" class="lt-highlight-color-orange" fill="currentColor" fillOpacity="0.25" />
      <path d="M4 12 L7 4 M10 12 L13 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export { highlightColorEmoji };
