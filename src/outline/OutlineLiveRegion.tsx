import { outlineAnnouncement } from "./outlineAnnouncements";

/**
 * spec/f06-note-outline-heading-breadcrumbs.md section 15.2: the single
 * shared polite live region for outline/breadcrumb navigation, filter
 * count, and copy-link announcements (see outlineAnnouncements.ts).
 * Mounted exactly once, in App.tsx, independent of whether the Outline
 * panel or the breadcrumbs (or both, or neither) are currently visible,
 * so an event announces once no matter which surface raised it.
 */
export function OutlineLiveRegion() {
  return (
    <p class="sr-only" role="status">
      {outlineAnnouncement.value?.message ?? ""}
    </p>
  );
}
