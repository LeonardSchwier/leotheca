import type { HeadingRecord } from "../markdown/headings";
import { useNoteHeadings } from "./useNoteHeadings";
import { activeHeadingIndex, breadcrumbChain } from "./outlineActiveSection";
import "./outline.css";

interface HeadingBreadcrumbsProps {
  noteTitle: string;
  content: string;
  /** The Source editor's primary selection head (character offset), or
   * `null` before it has reported one (e.g. Preview-only view mode,
   * Preview-scroll tracking is a later phase, see spec section 7.4). */
  cursorOffset: number | null;
  onSelectRoot: () => void;
  onSelectHeading: (heading: HeadingRecord) => void;
}

/**
 * Phase 2a (spec/f06-note-outline-heading-breadcrumbs.md section 7, 7.2,
 * 7.3): a breadcrumb trail from the note root through the active
 * heading's ancestors to the active heading itself, driven by the
 * Source-mode cursor position. Preview-scroll tracking and Split-mode
 * authority (7.4-7.5) are a later phase and not implemented here: with
 * `cursorOffset === null` this renders only the note root.
 */
export function HeadingBreadcrumbs({
  noteTitle,
  content,
  cursorOffset,
  onSelectRoot,
  onSelectHeading,
}: HeadingBreadcrumbsProps) {
  const headings = useNoteHeadings(content);
  const activeIndex = cursorOffset === null ? undefined : activeHeadingIndex(headings, cursorOffset);
  const chain = breadcrumbChain(headings, activeIndex);

  return (
    <nav class="heading-breadcrumbs" aria-label="Breadcrumb">
      <ol class="heading-breadcrumbs-list">
        <li>
          <button
            class="heading-breadcrumb-segment"
            aria-current={chain.length === 0 ? "location" : undefined}
            onClick={onSelectRoot}
          >
            {noteTitle}
          </button>
        </li>
        {chain.map((heading, index) => (
          <li key={`${heading.key} ${heading.occurrence}`}>
            <span class="heading-breadcrumb-separator" aria-hidden="true">
              {"›"}
            </span>
            <button
              class="heading-breadcrumb-segment"
              aria-current={index === chain.length - 1 ? "location" : undefined}
              onClick={() => onSelectHeading(heading)}
            >
              {heading.displayText || "(Untitled heading)"}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
