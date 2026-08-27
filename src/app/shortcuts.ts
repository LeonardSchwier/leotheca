/** The single source of truth for which keyboard shortcuts exist and how
 * they're described, so the Settings panel and the help dialog can't drift
 * out of sync with each other (or with App.tsx's own keydown handler). */
export interface KeyboardShortcut {
  keys: string;
  description: string;
}

export const KEYBOARD_SHORTCUTS: KeyboardShortcut[] = [
  { keys: "Ctrl+N", description: "New note" },
  { keys: "Ctrl+K", description: "Command palette" },
  { keys: "Ctrl+W", description: "Close current tab" },
  { keys: "Ctrl+Tab", description: "Next tab" },
  { keys: "Ctrl+Shift+Tab", description: "Previous tab" },
  { keys: "Ctrl+S", description: "Save the current note now" },
  { keys: "Ctrl+,", description: "Open Settings" },
];
