/**
 * The single source of truth for every design token. `scripts/build.mjs`
 * turns this module into `tokens.css` and `tokens.json`, so a value changed
 * here reaches all three formats and the contrast test in the same step.
 */

/** Semantic color roles. Components read roles, never raw palette values. */
export interface ColorRoles {
  /** The page or application background. */
  canvas: string;
  /** Docked panels that sit on the canvas. */
  panel: string;
  /** Floating or lifted surfaces: menus, dialogs, cards. */
  raised: string;
  /** Recessed wells and code backgrounds. */
  sunken: string;
  hover: string;
  selected: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  /** Decorative separators. Exempt from non-text contrast by WCAG 1.4.11. */
  border: string;
  /** Boundaries of interactive controls. Must reach 3:1 on every surface. */
  borderStrong: string;
  accent: string;
  accentHover: string;
  accentSoft: string;
  onAccent: string;
  success: string;
  warning: string;
  danger: string;
  onDanger: string;
  focus: string;
  /** Marks and ornaments only, never text: gold or frost ribbon color. */
  ornament: string;
}

export type ThemeName = "folio" | "nordic";
export type ColorMode = "light" | "dark";

export interface Elevation {
  low: string;
  high: string;
}

export interface Theme {
  /** Display name. */
  label: string;
  description: string;
  color: Record<ColorMode, ColorRoles>;
  elevation: Record<ColorMode, Elevation>;
}

export const themes: Record<ThemeName, Theme> = {
  folio: {
    label: "Folio",
    description:
      "The default theme. Warm and editorial: cream paper, ink navy, a gold ribbon.",
    color: {
      light: {
        canvas: "#f5efe3",
        panel: "#faf6ec",
        raised: "#fffdf7",
        sunken: "#ede6d6",
        hover: "#e9e1cf",
        selected: "#e5d9c0",
        text: "#1a2830",
        textSecondary: "#4a5559",
        textMuted: "#59625f",
        border: "#dcd3bf",
        borderStrong: "#8b8370",
        accent: "#785618",
        accentHover: "#5f4412",
        accentSoft: "#efe3c7",
        onAccent: "#fffdf7",
        success: "#2a6346",
        warning: "#75510c",
        danger: "#9c352c",
        onDanger: "#fffdf7",
        focus: "#1c5a74",
        ornament: "#bf9b5e",
      },
      dark: {
        canvas: "#131e25",
        panel: "#18252c",
        raised: "#1f2d35",
        sunken: "#0f181e",
        hover: "#27363e",
        selected: "#303e43",
        text: "#f2ebdd",
        textSecondary: "#c4bdae",
        textMuted: "#aca89b",
        border: "#2d3c44",
        borderStrong: "#73808a",
        accent: "#d9b879",
        accentHover: "#e7cb96",
        accentSoft: "#322f22",
        onAccent: "#17150e",
        success: "#82c29e",
        warning: "#dcad5e",
        danger: "#ee9288",
        onDanger: "#1d0f0d",
        focus: "#7fbdd5",
        ornament: "#c9a566",
      },
    },
    elevation: {
      light: {
        low: "0 1px 2px rgba(26, 40, 48, 0.08), 0 6px 18px rgba(26, 40, 48, 0.1)",
        high: "0 2px 4px rgba(26, 40, 48, 0.08), 0 18px 44px rgba(26, 40, 48, 0.18)",
      },
      dark: {
        low: "0 1px 2px rgba(0, 0, 0, 0.3), 0 8px 22px rgba(0, 0, 0, 0.32)",
        high: "0 2px 4px rgba(0, 0, 0, 0.32), 0 20px 48px rgba(0, 0, 0, 0.44)",
      },
    },
  },
  nordic: {
    label: "Nordic",
    description:
      "A restrained cool theme: frost surfaces, fog blue accent, quiet borders, and a polar night dark companion.",
    color: {
      light: {
        canvas: "#f4f6f8",
        panel: "#f9fafb",
        raised: "#ffffff",
        sunken: "#ebeef1",
        hover: "#e5e9ed",
        selected: "#dbe3ea",
        text: "#232b33",
        textSecondary: "#4c5761",
        textMuted: "#59646e",
        border: "#e2e6ea",
        borderStrong: "#838d97",
        accent: "#42637c",
        accentHover: "#344f65",
        accentSoft: "#dfe8ef",
        onAccent: "#ffffff",
        success: "#35654f",
        warning: "#75591a",
        danger: "#963f3f",
        onDanger: "#ffffff",
        focus: "#2c607e",
        ornament: "#8fa6b8",
      },
      dark: {
        canvas: "#1b2028",
        panel: "#20262f",
        raised: "#272e38",
        sunken: "#171b22",
        hover: "#2d3540",
        selected: "#36404d",
        text: "#e6eaee",
        textSecondary: "#bcc4cc",
        textMuted: "#a6afb8",
        border: "#2c343e",
        borderStrong: "#747e89",
        accent: "#93b7d1",
        accentHover: "#abc8dd",
        accentSoft: "#2a3744",
        onAccent: "#12181e",
        success: "#92c7aa",
        warning: "#d9b871",
        danger: "#eba29b",
        onDanger: "#1e1111",
        focus: "#93c3e0",
        ornament: "#7f97a9",
      },
    },
    elevation: {
      // Reduced chrome: Nordic leans on surface steps, so shadows stay faint.
      light: {
        low: "0 1px 2px rgba(35, 43, 51, 0.05), 0 4px 12px rgba(35, 43, 51, 0.06)",
        high: "0 2px 4px rgba(35, 43, 51, 0.05), 0 12px 32px rgba(35, 43, 51, 0.1)",
      },
      dark: {
        low: "0 1px 2px rgba(0, 0, 0, 0.2), 0 4px 14px rgba(0, 0, 0, 0.22)",
        high: "0 2px 4px rgba(0, 0, 0, 0.22), 0 14px 36px rgba(0, 0, 0, 0.32)",
      },
    },
  },
};

export const DEFAULT_THEME: ThemeName = "folio";

export const space = {
  "0-5": "2px",
  "1": "4px",
  "1-5": "6px",
  "2": "8px",
  "3": "12px",
  "4": "16px",
  "5": "20px",
  "6": "24px",
  "8": "32px",
  "10": "40px",
  "12": "48px",
  "16": "64px",
} as const;

export const radius = {
  sm: "4px",
  md: "6px",
  lg: "10px",
  xl: "14px",
  full: "999px",
} as const;

export const font = {
  /** Figtree, bundled. System faces follow for glyphs outside its subsets. */
  sans: '"Figtree", -apple-system, "Segoe UI", "Noto Sans", sans-serif',
  /** Literata, bundled, drawn for long reading. */
  serif: '"Literata", ui-serif, Georgia, Cambria, "Times New Roman", serif',
  /** Source Code Pro, bundled. */
  mono: '"Source Code Pro", ui-monospace, monospace',
} as const;

export const fontSize = {
  xs: "0.75rem",
  sm: "0.8125rem",
  md: "0.875rem",
  lg: "1rem",
  xl: "1.25rem",
  "2xl": "1.625rem",
  "3xl": "2.25rem",
} as const;

export const fontWeight = {
  regular: "400",
  medium: "500",
  semibold: "600",
} as const;

export const lineHeight = {
  tight: "1.25",
  normal: "1.5",
  reading: "1.7",
} as const;

export const motion = {
  fast: "100ms",
  popover: "160ms",
  sheet: "200ms",
  saved: "1500ms",
} as const;

export const easing = {
  standard: "cubic-bezier(0.2, 0, 0, 1)",
} as const;

/** Durations once `prefers-reduced-motion: reduce` applies. */
export const REDUCED_MOTION_DURATION = "1ms";

export const zIndex = {
  popover: "1000",
  dialog: "1100",
  toast: "1200",
} as const;

/** `canvasText` becomes `canvas-text`, matching the emitted CSS names. */
export function cssVarName(group: string, key: string): string {
  const kebab = key.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`);
  return `--ds-${group}-${kebab}`;
}

/** A role's custom property, for code that needs a reference, not a value. */
export function colorVar(role: keyof ColorRoles): string {
  return `var(${cssVarName("color", role)})`;
}

export const tokens = {
  themes,
  defaultTheme: DEFAULT_THEME,
  space,
  radius,
  font,
  fontSize,
  fontWeight,
  lineHeight,
  motion,
  easing,
  zIndex,
} as const;
