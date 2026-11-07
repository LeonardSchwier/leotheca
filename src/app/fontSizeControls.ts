import {
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  DEFAULT_WORKSPACE_SETTINGS,
  clamp,
} from "../settings/workspaceSettings";

export const FONT_SIZE_STEP = 1;

export type FontSizeAction = "in" | "out" | "reset";

export function nextFontSize(current: number, action: FontSizeAction): number {
  if (action === "reset") return DEFAULT_WORKSPACE_SETTINGS.fontSize;
  const delta = action === "in" ? FONT_SIZE_STEP : -FONT_SIZE_STEP;
  return clamp(current + delta, MIN_FONT_SIZE, MAX_FONT_SIZE);
}
