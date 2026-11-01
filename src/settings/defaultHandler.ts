/**
 * Frontend half of the ROADMAP.md "Set the app as the default handler for
 * `.md` files (OS 'Open with')" item.
 *
 * Mirrors the Rust contract in `src-tauri/src/default_handler.rs`. The Rust
 * side is the source of truth for *how* to set a default per platform; this
 * file is the frontend mirror so that:
 *
 *   - The Settings panel can render the guidance for the *current* platform
 *     without a round-trip to Rust (fast, no IPC needed just to read text).
 *   - The two sides can't drift apart: `defaultHandler.test.ts` below asserts
 *     this TS contract matches the Rust one for every platform, using the
 *     same expected values.
 *
 * Both sides are pure and fully unit-testable on any platform.
 */

export type Platform = "windows" | "macos" | "linux" | "ios" | "android" | "other";

export interface MarkdownAssociation {
  ext: string;
  description: string;
  mimeType: string;
  role: string;
}

export interface OpenWithStep {
  /** The window/screen/panel the user must reach, e.g. "Settings > Apps". */
  target: string;
  /** What the user does in that window. */
  summary: string;
}

export interface DefaultHandlerContract {
  platform: Platform;
  association: MarkdownAssociation;
  /** The single most important step for this platform, repeated for quick copy. */
  openWithTarget: string;
  steps: OpenWithStep[];
  /**
   * Whether the platform offers a first-party "set as default app" path that
   * Leotheca can surface in the UI. On Windows/macOS/Linux this is true —
   * the OS has a native settings page that can be opened. On iOS/Android and
   * unknown "Other" this is false — the app can only show instructions.
   */
  isSettable: boolean;
}

/** The one association Leotheca ships, matching `tauri.conf.json`. */
export const MARKDOWN_ASSOCIATION: MarkdownAssociation = {
  ext: "md",
  description: "Markdown Document",
  mimeType: "text/markdown",
  role: "Editor",
};

/**
 * Detect the running platform from a string the app can see: Capacitor's
 * `Capacitor.getPlatform()` value (`"ios"` / `"android"`) or `navigator.
 * userAgent`. Returns "other" for anything unrecognized so the UI never
 * crashes on an unknown platform — it just shows the generic guidance.
 */
export function detectPlatform(platformOrUa: string): Platform {
  const lower = platformOrUa.toLowerCase();
  if (lower.includes("win")) return "windows";
  if (
    lower.includes("macos") ||
    lower.includes("darwin") ||
    lower.includes("macintosh") ||
    lower.includes("mac os") ||
    lower.includes("iphone") ||
    lower.includes("ipad") ||
    lower.includes("ipod") ||
    lower.includes("ios")
  ) {
    return "macos";
  }
  if (lower.includes("android")) return "android";
  if (lower.includes("linux") || lower.includes("x11") || lower.includes("gtk")) {
    return "linux";
  }
  return "other";
}

/**
 * Pure, platform-parameterized "how to make Leotheca the default `.md` app"
 * contract. Tests and the Settings panel both call this; the Rust
 * `default_handler_for_platform` command returns the same shape.
 */
export function defaultHandlerForPlatform(platform: Platform): DefaultHandlerContract {
  switch (platform) {
    case "windows":
      return {
        platform,
        association: MARKDOWN_ASSOCIATION,
        openWithTarget: "Settings > Apps > Choose default apps by file type",
        steps: [
          {
            target: "Settings > Apps > Choose default apps by file type",
            summary:
              "Find the `.md` row, click it, and select Leotheca as the handler.",
          },
          {
            target: "Any .md file in File Explorer",
            summary:
              "Right-click → Open with → Choose another app → Leotheca → check " +
              '"Always use this app to open .md files".',
          },
        ],
        isSettable: true,
      };
    case "macos":
      return {
        platform,
        association: MARKDOWN_ASSOCIATION,
        openWithTarget: "Any .md file in Finder",
        steps: [
          {
            target: "Any .md file in Finder",
            summary:
              "Right-click → Get Info → Open with → choose Leotheca → click " +
              '"Change All…".',
          },
          {
            target: "Leotheca in Finder (Applications)",
            summary:
              "Confirm Leotheca is the selected handler and restart Leotheca if " +
              "the change does not take effect immediately.",
          },
        ],
        isSettable: true,
      };
    case "linux":
      return {
        platform,
        association: MARKDOWN_ASSOCIATION,
        openWithTarget: "File manager (GNOME Files / Nautilus)",
        steps: [
          {
            target: "File manager (GNOME Files / Nautilus)",
            summary:
              "Right-click a `.md` file → Open With → Leotheca → tick " +
              '"Use as default for "markdown document" files".',
          },
          {
            target: "KDE Dolphin",
            summary:
              "Right-click a `.md` file → Properties → Open With → Leotheca → " +
              '"Set as Default".',
          },
          {
            target: "xdg-mime (terminal)",
            summary:
              'Run `xdg-mime default <leotheca>.desktop text/markdown`.',
          },
        ],
        isSettable: true,
      };
    case "ios":
      return {
        platform,
        association: MARKDOWN_ASSOCIATION,
        openWithTarget: "Files app",
        steps: [
          {
            target: "Files app",
            summary:
              "Tap a `.md` file → Share → Open in Leotheca. iOS has no per-file-" +
              "type default handler; it always shows the share sheet.",
          },
        ],
        isSettable: false,
      };
    case "android":
      return {
        platform,
        association: MARKDOWN_ASSOCIATION,
        openWithTarget: "File manager",
        steps: [
          {
            target: "File manager",
            summary:
              "Tap a `.md` file → Open with → Leotheca → tap " +
              '"Always".',
          },
        ],
        isSettable: false,
      };
    default:
      return {
        platform,
        association: MARKDOWN_ASSOCIATION,
        openWithTarget: "OS file manager",
        steps: [
          {
            target: "OS file manager",
            summary:
              "Find the `.md` file's context menu or the OS " +
              '"Open with" / default-apps settings and select Leotheca.',
          },
        ],
        isSettable: false,
      };
  }
}

/**
 * Convenience: resolve the contract for the *current* environment, reading
 * Capacitor's platform value first (fast, synchronous in app context) and
 * falling back to `navigator.userAgent`. Kept here (not in the Settings
 * panel) so tests can call it with a stubbed `navigator`.
 */
export function currentDefaultHandlerContract(): DefaultHandlerContract {
  let raw: string;
  try {
    // Capacitor is only importable in the app bundle context; this is the
    // same pattern used elsewhere in the codebase (`isNativePlatform()`).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Capacitor } = require("@capacitor/core") as {
      Capacitor: { getPlatform(): string };
    };
    raw = Capacitor.getPlatform();
  } catch {
    raw = typeof navigator !== "undefined" ? navigator.userAgent : "";
  }
  return defaultHandlerForPlatform(detectPlatform(raw));
}
