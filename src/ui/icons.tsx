/** UX-01 spec section 19.7/24.1/VIS-004: one local SVG icon registry so
 * core shell controls stop depending on emoji or Unicode characters as
 * their primary representation (see App.tsx's/WorkspaceSwitcher's use of
 * "▾"/"×"/etc. today). Every icon here is hand-authored inline
 * markup -- no icon font, no third-party package, no runtime fetch -- and
 * inherits `currentColor` so it follows the surrounding text/button color
 * (including hover/selected/danger states) without its own color prop.
 *
 * This is Phase 1 infrastructure per the spec's own section 30 phasing:
 * the registry exists and is ready to use, but migrating every existing
 * shell control onto it is staged, separate follow-up work (section 24.6
 * explicitly allows temporary visual duplication during that migration).
 */
import type { JSX } from "preact";

export type IconName =
  | "close"
  | "chevronDown"
  | "chevronRight"
  | "menu"
  | "search"
  | "plus"
  | "moreHorizontal"
  | "check"
  | "folder"
  | "fileText"
  | "bookmark"
  | "bookmarkFilled"
  | "tag"
  | "graph"
  | "settings"
  | "command"
  | "helpCircle"
  | "warningTriangle"
  | "alertCircle"
  | "spinner"
  | "panelRight"
  | "columns"
  | "code"
  | "eye"
  | "task"
  | "collections"
  | "outline"
  | "swapGroups";

/** Every path/shape below sits on a 24x24 canvas, round caps/joins, no
 * fill except where an icon's meaning specifically needs a solid dot (a
 * period, a pupil) -- see each icon's own shape for that exception.
 *
 * UX-01 icon-convention reconciliation: this registry originally used a
 * 2.1 stroke width (the spec's literal ~1.75px-at-20px reading, scaled to
 * this file's 24-unit canvas). That produced a visibly heavier stroke
 * than `src/app/shellIcons.tsx`'s already-shipped, already-user-visible
 * toolbar icons (1.5 stroke on a 20-unit canvas, a 7.5% stroke-to-canvas
 * ratio) once both were rendered at a comparable on-screen size --
 * confirmed visually via headless Chromium screenshots of both sets side
 * by side. Rather than redraw every path here onto shellIcons.tsx's
 * 20-unit canvas (this file's icons are more numerous and more complex),
 * this stroke width is set to the same 7.5% ratio scaled to a 24-unit
 * canvas (24 * 0.075 = 1.8), so an icon from either set renders at the
 * same relative visual weight for a given pixel size. `bookmarkFilled`,
 * `task`, `collections`, `outline`, and `swapGroups` below are the same
 * shapes `shellIcons.tsx` used to draw, scaled 1.2x from its 20-unit
 * canvas onto this one, added when that file's 15 call sites were
 * migrated onto this registry (now deleted, see ROADMAP.md). */
const STROKE_WIDTH = 1.8;

const ICON_SHAPES: Record<IconName, () => JSX.Element> = {
  close: () => (
    <>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </>
  ),
  chevronDown: () => <polyline points="6 9 12 15 18 9" />,
  chevronRight: () => <polyline points="9 6 15 12 9 18" />,
  menu: () => (
    <>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </>
  ),
  search: () => (
    <>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </>
  ),
  plus: () => (
    <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </>
  ),
  moreHorizontal: () => (
    <g fill="currentColor" stroke="none">
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </g>
  ),
  check: () => <polyline points="5 12 10 17 19 7" />,
  folder: () => (
    <path d="M4 6.5C4 5.67 4.67 5 5.5 5H10L12 7.5H18.5C19.33 7.5 20 8.17 20 9V17.5C20 18.33 19.33 19 18.5 19H5.5C4.67 19 4 18.33 4 17.5V6.5Z" />
  ),
  fileText: () => (
    <>
      <path d="M7 3.5H14L18 7.5V20.5H7C6.45 20.5 6 20.05 6 19.5V4.5C6 3.95 6.45 3.5 7 3.5Z" />
      <path d="M14 3.5V7.5H18" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="9" y1="15.5" x2="15" y2="15.5" />
    </>
  ),
  bookmark: () => <path d="M6.5 4H17.5V20L12 16.5L6.5 20V4Z" />,
  bookmarkFilled: () => <path d="M6.5 4H17.5V20L12 16.5L6.5 20V4Z" fill="currentColor" />,
  tag: () => (
    <>
      <path d="M12.5 4H19C19.55 4 20 4.45 20 5V11.5L11 20.5L3.5 13L12.5 4Z" />
      <circle cx="16" cy="8" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  graph: () => (
    <>
      <circle cx="6" cy="7" r="2.3" />
      <circle cx="18" cy="6" r="2.3" />
      <circle cx="9" cy="18" r="2.3" />
      <line x1="7.8" y1="8.3" x2="16" y2="6.7" />
      <line x1="7" y1="9" x2="8.5" y2="16" />
    </>
  ),
  settings: () => (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3.5V6M12 18V20.5M20.5 12H18M6 12H3.5M17.6 6.4L15.9 8.1M8.1 15.9L6.4 17.6M17.6 17.6L15.9 15.9M8.1 8.1L6.4 6.4" />
    </>
  ),
  command: () => (
    <>
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </>
  ),
  helpCircle: () => (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.3 9.3C9.3 7.9 10.5 6.8 12 6.8C13.5 6.8 14.7 7.9 14.7 9.3C14.7 10.7 12 11.2 12 13.6" />
      <circle cx="12" cy="16.8" r="0.15" fill="currentColor" stroke="currentColor" strokeWidth={1.4} />
    </>
  ),
  warningTriangle: () => (
    <>
      <path d="M12 4L21 19.5H3L12 4Z" />
      <line x1="12" y1="10" x2="12" y2="14.5" />
      <circle cx="12" cy="17" r="0.15" fill="currentColor" stroke="currentColor" strokeWidth={1.4} />
    </>
  ),
  alertCircle: () => (
    <>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="7.5" x2="12" y2="13" />
      <circle cx="12" cy="16.2" r="0.15" fill="currentColor" stroke="currentColor" strokeWidth={1.4} />
    </>
  ),
  spinner: () => <path d="M12 3.5A8.5 8.5 0 1 1 3.5 12" />,
  panelRight: () => (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.6" />
      <line x1="15" y1="4.5" x2="15" y2="19.5" />
    </>
  ),
  columns: () => (
    <>
      <rect x="3.5" y="4.5" width="7.5" height="15" rx="1.4" />
      <rect x="13" y="4.5" width="7.5" height="15" rx="1.4" />
    </>
  ),
  code: () => (
    <>
      <polyline points="9 8 4.5 12 9 16" />
      <polyline points="15 8 19.5 12 15 16" />
    </>
  ),
  eye: () => (
    <>
      <path d="M2.5 12C2.5 12 6 5.5 12 5.5C18 5.5 21.5 12 21.5 12C21.5 12 18 18.5 12 18.5C6 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  task: () => (
    <>
      <rect x="3.6" y="3.6" width="7.2" height="7.2" rx="1.2" />
      <path d="M5.4 7.2l1.2 1.2 2.4-2.4" strokeWidth={1.44} />
      <path d="M14.4 7.2h6M3.6 16.8h7.2M14.4 16.8h6" />
    </>
  ),
  collections: () => (
    <>
      <rect x="3.6" y="4.8" width="16.8" height="4.8" rx="1.2" />
      <rect x="3.6" y="12" width="16.8" height="4.8" rx="1.2" />
      <circle cx="6.6" cy="7.2" r="0.72" fill="currentColor" stroke="none" />
      <circle cx="6.6" cy="14.4" r="0.72" fill="currentColor" stroke="none" />
    </>
  ),
  outline: () => <path d="M4.8 6h14.4M4.8 12h9.6M4.8 18h12" />,
  swapGroups: () => (
    <>
      <path d="M3.6 8.4h13.2M13.2 4.2L17.4 8.4 13.2 12.6" />
      <path d="M20.4 15.6H7.2M10.8 11.4L6.6 15.6 10.8 19.8" />
    </>
  ),
};

export interface IconProps {
  name: IconName;
  /** Matches the spec's three primary sizes (19.7); defaults to 20. */
  size?: 16 | 20 | 24;
  className?: string;
  /** Most icons sit inside an already-labeled control (a button with its
   * own aria-label/text) and stay decorative (aria-hidden) by default.
   * Pass `label` only when the icon is itself the sole accessible name,
   * e.g. a bare icon rendered with no surrounding labeled element. */
  label?: string;
  /** Applies the spinning animation appropriate for the "spinner" icon;
   * respects prefers-reduced-motion via the shared .icon-spin rule
   * (src/styles/theme.css), which freezes rotation instead of removing
   * the loading indication entirely. */
  spin?: boolean;
}

/** Renders one icon from the registry above. Stroke-only by default
 * (fill="none"), inherits currentColor, and never fetches anything at
 * runtime -- every shape is inline markup bundled with the app. */
export function Icon({ name, size = 20, className, label, spin }: IconProps): JSX.Element {
  const Shape = ICON_SHAPES[name];
  const classes = ["icon", spin ? "icon-spin" : "", className].filter(Boolean).join(" ");
  return (
    <svg
      class={classes || undefined}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={STROKE_WIDTH}
      stroke-linecap="round"
      stroke-linejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : "true"}
    >
      <Shape />
    </svg>
  );
}
