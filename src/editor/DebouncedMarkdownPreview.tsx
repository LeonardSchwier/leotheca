/**
 * Debounced Markdown Preview Component
 * 
 * A wrapper around MarkdownPreview that debounces the source prop to improve
 * performance during rapid changes (e.g., typing). This prevents the expensive
 * markdown parsing and rendering from happening on every keystroke.
 */

import { useMemo } from "preact/hooks";
import { useDebounce } from "./hooks";
import { MarkdownPreview } from "./MarkdownPreview";
import type { MarkdownPreviewProps } from "./MarkdownPreview";

interface DebouncedMarkdownPreviewProps extends MarkdownPreviewProps {
  /** Whether to debounce the preview. Defaults to true. */
  debounce?: boolean;
  /** Debounce delay in milliseconds. Defaults to 300ms. */
  debounceDelay?: number;
}

/**
 * A debounced version of MarkdownPreview that delays rendering until
 * the source stops changing for the specified delay. This significantly
 * improves performance during typing while maintaining the same API
 * as the regular MarkdownPreview.
 * 
 * @example
 * ```tsx
 * // Use instead of MarkdownPreview for live preview during typing
 * <DebouncedMarkdownPreview
 *   source={content}
 *   debounce={true}
 *   debounceDelay={300}
 *   mathRenderingEnabled={true}
 *   headingLinksEnabled={true}
 *   onOpenFile={handleOpenFile}
 * />
 * ```
 */
export function DebouncedMarkdownPreview({
  source,
  debounce = true,
  debounceDelay = 300,
  ...props
}: DebouncedMarkdownPreviewProps) {
  // Use debounced source when debouncing is enabled
  const displaySource = debounce && debounceDelay > 0
    ? useDebounce(source, debounceDelay)
    : source;

  // Pass the debounced source to the regular MarkdownPreview
  return useMemo(() => (
    <MarkdownPreview
      {...props}
      source={displaySource}
    />
  ), [displaySource, props]);
}
