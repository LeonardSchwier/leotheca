/** The main toolbar's (App.tsx) full inline SVG icon set, extracted to its
 * own module so layout components like ActivityRail.tsx can reuse them
 * without importing App.tsx itself -- App.tsx has substantial top-level
 * side effects (workspaceTransitions.registerReset calls) that make it
 * awkward to import from a component that needs to stay independently
 * testable. Plain inline SVG, not emoji: an emoji rendered as an unrelated
 * (reportedly pepper-shaped) glyph for one of these on Android, the same
 * cross-platform emoji-font problem the sidebar's new-note/new-folder
 * icons hit separately.
 *
 * One consistent convention throughout: 15px render size, 20x20 viewBox,
 * 1.5 stroke width, currentColor (a 7.5% stroke-to-canvas ratio). This
 * predates src/ui/icons.tsx's separately-introduced registry, whose own
 * stroke width is now tuned to match this same 7.5% ratio on its 24x24
 * canvas so both sets carry the same relative visual weight; migrating
 * these 15 call sites onto that registry's shapes remains separate
 * follow-up (see ROADMAP.md), not attempted here. */

export function FilesIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">
      <path d="M2.5 6.5C2.5 5.67 3.17 5 4 5H8L10 7.5H16C16.83 7.5 17.5 8.17 17.5 9V14.5C17.5 15.33 16.83 16 16 16H4C3.17 16 2.5 15.33 2.5 14.5V6.5Z" />
    </svg>
  );
}

export function BookmarkIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">
      <path d="M5 3h10a1 1 0 0 1 1 1v13l-6-4-6 4V4a1 1 0 0 1 1-1z" />
    </svg>
  );
}

export function BookmarkFilledIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">
      <path d="M5 3h10a1 1 0 0 1 1 1v13l-6-4-6 4V4a1 1 0 0 1 1-1z" />
    </svg>
  );
}

export function TagIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M11 3h5a1 1 0 0 1 1 1v5l-8.3 8.3a1 1 0 0 1-1.4 0l-4.6-4.6a1 1 0 0 1 0-1.4L11 3z" />
      <circle cx="14" cy="7" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function GraphIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="5" cy="6" r="2" />
      <circle cx="15" cy="5" r="2" />
      <circle cx="6" cy="15" r="2" />
      <circle cx="15" cy="14" r="2" />
      <path d="M6.7 7.3L13.3 5.7M7 13.2L13.5 13.9M6.4 7.8L7 13" />
    </svg>
  );
}

export function TaskIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="3" width="6" height="6" rx="1" />
      <path d="M4.5 6l1 1 2-2" stroke-width="1.2" />
      <path d="M12 6h5M3 14h6M12 14h5" />
    </svg>
  );
}

export function CollectionsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="4" width="14" height="4" rx="1" />
      <rect x="3" y="10" width="14" height="4" rx="1" />
      <circle cx="5.5" cy="6" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="5.5" cy="12" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function OutlineIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
      <path d="M4 5h12M4 10h8M4 15h10" />
    </svg>
  );
}

export function SourceModeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="7,5 3,10 7,15" />
      <polyline points="13,5 17,10 13,15" />
    </svg>
  );
}

export function SplitModeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2" y="3" width="7" height="14" rx="1" />
      <rect x="11" y="3" width="7" height="14" rx="1" />
    </svg>
  );
}

export function PreviewModeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M2 10s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6z" />
      <circle cx="10" cy="10" r="2.2" />
    </svg>
  );
}

export function CommandPaletteIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2" y="4" width="16" height="12" rx="1.5" />
      <path d="M6 8l2.5 2L6 12M10.5 12h3.5" />
    </svg>
  );
}

export function MenuIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
      <path d="M3 5.5h14M3 10h14M3 14.5h14" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
      <path d="M5 5l10 10M15 5L5 15" />
    </svg>
  );
}

export function SwapGroupsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 7h11M11 3.5L14.5 7 11 10.5" />
      <path d="M17 13H6M9 9.5L5.5 13 9 16.5" />
    </svg>
  );
}

export function SettingsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 3v2.2M10 14.8V17M17 10h-2.2M5.2 10H3M14.8 5.2l-1.5 1.5M6.7 13.3l-1.5 1.5M14.8 14.8l-1.5-1.5M6.7 6.7L5.2 5.2" />
    </svg>
  );
}
