import type { BridgeMockOptions } from "./bridgeMock.js";

export const WORKSPACE_ROOT = "/e2e/notes";
export const CONFIG_DIR = "/e2e/config";

/** Notes chosen so each journey has something observable to assert on. */
export const NOTE_FILES: Record<string, string> = {
  "welcome.md": [
    "# Welcome",
    "",
    "A **bold** claim, some *italic* text and ==highlighted words==.",
    "",
    "See [[plan]] for the roadmap and [[Missing Note]] for nothing.",
    "",
    "- [x] Finished task",
    "- [ ] Open task",
    "",
    "Inline math $a^2 + b^2 = c^2$ and a block:",
    "",
    "$$\\int_0^1 x\\,dx = \\frac{1}{2}$$",
    "",
    "| Col1 | Col2 |",
    "| ---- | ---- |",
    "| a    | b    |",
    "",
    "#welcome",
    "",
  ].join("\n"),
  "projects/plan.md": [
    "# Project Plan",
    "",
    "Ship the pelican release. Back to [[welcome]].",
    "",
    "```mermaid",
    "graph TD",
    "  A[Start] --> B[Finish]",
    "```",
    "",
    "#project #pelican",
    "",
  ].join("\n"),
  "projects/retro.md": ["# Retro", "", "The pelican team met. Nothing about walrus.", "", "#project", ""].join("\n"),
  "research/walrus.md": ["# Walrus Facts", "", "The walrus has tusks.", "", "#research", ""].join("\n"),
  "inbox/draft.md": ["# Draft", "", "Disposable note.", ""].join("\n"),
};

export function bridgeOptions(overrides: Partial<BridgeMockOptions> = {}): BridgeMockOptions {
  return {
    root: WORKSPACE_ROOT,
    configDir: CONFIG_DIR,
    files: NOTE_FILES,
    dirs: ["empty-folder"],
    ...overrides,
  };
}
