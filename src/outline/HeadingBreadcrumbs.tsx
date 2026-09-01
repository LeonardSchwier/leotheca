import type { HeadingRecord } from "../markdown/headings";
import { useNoteHeadings } from "./useNoteHeadings";
import { activeHeadingIndex, breadcrumbChain } from "./outlineActiveSection";
import "./outline.css";

/**
 * Where HeadingBreadcrumbs should get its active heading from. Kept as a
 * discriminated union rather than two optional props so a caller can
 * never accidentally supply both a stale cursor offset and a preview
 * index at once: exactly one source is ever consulted.
 *
 *  - "cursor": Source-mode tracking (spec section 7.3), an offset into
 *    the note's own text.
 *  - "previewIndex": Preview-mode tracking (section 7.4), an index into
 *    MarkdownPreview's own rendered heading elements (see its
 *    `onActiveHeadingChange`), positionally matched against this
 *    component's own heading scan.
 *  - "none": no tracking available yet (e.g. before the editor or
 *    preview has reported a position); only the note root shows.
 */
export type HeadingBreadcrumbsActiveSource =
  | { kind: "cursor"; offset: number }
  | { kind: "previewIndex"; index: number }
  | { kind: "none" };

interface HeadingBreadcrumbsProps {
  noteTitle: string;
  content: string;
  activeSource: HeadingBreadcrumbsActiveSource;
  onSelectRoot: () => void;
  onSelectHeading: (heading: HeadingRecord) => void;
}

/**
 * Phase 2a-2c (spec/f06-note-outline-heading-breadcrumbs.md section 7):
 * a breadcrumb trail from the note root through the active heading's
 * ancestors to the active heading itself, driven by either the
 * Source-mode cursor (7.3) or Preview-mode scroll tracking (7.4)
 * depending on `activeSource`. Which of the two `activeSource` carries in
 * Split view (7.5's authority switching) is decided by the caller, not
 * this component; this component only needs to know which one it was
 * actually given, which is also enough to satisfy 7.5's own requirement
 * that current authority be "visually and accessibly identifiable": the
 * nav's aria-label names the active source whenever one is tracked, so a
 * screen-reader user in Split view can tell which pane the breadcrumb
 * trail is currently following without needing separate UI for it.
 */
export function HeadingBreadcrumbs({
  noteTitle,
  content,
  activeSource,
  onSelectRoot,
  onSelectHeading,
}: HeadingBreadcrumbsProps) {
  const headings = useNoteHeadings(content);
  const activeIndex =
    activeSource.kind === "cursor"
      ? activeHeadingIndex(headings, activeSource.offset)
      : activeSource.kind === "previewIndex"
        ? activeSource.index
        : undefined;
  const chain = breadcrumbChain(headings, activeIndex);
  const ariaLabel =
    activeSource.kind === "cursor"
      ? "Breadcrumb (following Source)"
      : activeSource.kind === "previewIndex"
        ? "Breadcrumb (following Preview)"
        : "Breadcrumb";

  return (
    <nav class="heading-breadcrumbs" aria-label={ariaLabel}>
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
