import { signal } from "@preact/signals";

/**
 * spec/f06-note-outline-heading-breadcrumbs.md section 15.2: outline
 * navigation, breadcrumb navigation, filter counts, and copy-link
 * confirmations are announced through one shared polite live region
 * (OutlineLiveRegion.tsx, mounted exactly once in App.tsx) rather than
 * each surface owning its own. The Outline panel and the breadcrumbs can
 * both be visible at the same time, and two independent live regions
 * echoing the same event would announce it twice; `requestId` is a
 * monotonically increasing counter, not the message text, so announcing
 * the identical message twice in a row (e.g. copying the same heading's
 * link twice) still updates the region instead of being ignored as an
 * unchanged value.
 */
export interface OutlineAnnouncement {
  message: string;
  requestId: number;
}

export const outlineAnnouncement = signal<OutlineAnnouncement | null>(null);

let nextAnnouncementId = 1;

export function announceOutline(message: string): void {
  outlineAnnouncement.value = { message, requestId: nextAnnouncementId++ };
}

/**
 * 1-based line number containing `offset` in `content`, used by
 * `headingNavigationAnnouncement` below (section 15.2: "announces the
 * destination heading and line"). Walks `indexOf` matches rather than
 * `split("\n")` so it never copies the note's own content just to count
 * lines in it.
 */
export function lineNumberAt(content: string, offset: number): number {
  let line = 1;
  let index = content.indexOf("\n");
  while (index !== -1 && index < offset) {
    line++;
    index = content.indexOf("\n", index + 1);
  }
  return line;
}

/** Shared wording for "navigating from the outline announces the
 * destination heading and line" (section 15.2), used identically by
 * OutlinePanel's row selection and the breadcrumbs' segment clicks so the
 * two surfaces the spec groups together never announce differently. */
export function headingNavigationAnnouncement(label: string, content: string, offset: number): string {
  return `Navigated to ${label}, line ${lineNumberAt(content, offset)}.`;
}
