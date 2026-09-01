import { useEffect, useRef, useState } from "preact/hooks";
import { scanHeadings, type HeadingRecord } from "../markdown/headings";

// spec/f06-note-outline-heading-breadcrumbs.md section 10.2.
const SCAN_DEBOUNCE_MS = 75;

/**
 * Scans `content` for headings, debounced, so both OutlinePanel and
 * HeadingBreadcrumbs can track the active note's live structure without
 * each rescanning on every keystroke or duplicating the debounce timer
 * logic. Not a global store: each caller owns its own scan and its own
 * `content`-keyed reset, matching this feature's Phase 1 decision to add
 * shared state only once a second real consumer exists (this hook is
 * that consumer boundary, not a signal every future feature reaches into).
 */
export function useNoteHeadings(content: string): HeadingRecord[] {
  const [headings, setHeadings] = useState<HeadingRecord[]>(() => scanHeadings(content));
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isFirstContentRef = useRef(true);

  useEffect(() => {
    // Skip the debounce for the very first render: initial state above
    // already scanned this exact content synchronously.
    if (isFirstContentRef.current) {
      isFirstContentRef.current = false;
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setHeadings(scanHeadings(content)), SCAN_DEBOUNCE_MS);
    return () => clearTimeout(timerRef.current);
  }, [content]);

  return headings;
}
