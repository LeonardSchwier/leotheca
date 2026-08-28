import { MAX_UI_ZOOM, MIN_UI_ZOOM, clamp } from "../settings/workspaceSettings";

export const UI_ZOOM_STEP = 10;

export type UiZoomAction = "in" | "out" | "reset";

/** Maps a modified key to an app zoom action. Both "=" and "+" zoom in
 * because keyboard layouts report Ctrl+Plus as either value depending on
 * whether the Shift modifier is represented in `event.key`. */
export function zoomActionForKey(key: string): UiZoomAction | null {
  if (key === "+" || key === "=") return "in";
  if (key === "-") return "out";
  if (key === "0") return "reset";
  return null;
}

/** Maps a modified wheel gesture to a zoom action. A zero-delta event has
 * no direction and must not change the setting. */
export function zoomActionForWheel(deltaY: number): UiZoomAction | null {
  if (deltaY < 0) return "in";
  if (deltaY > 0) return "out";
  return null;
}

/** Applies one zoom action in fixed 10 percentage-point steps, always
 * respecting the same limits as the Settings input. */
export function nextUiZoom(current: number, action: UiZoomAction): number {
  if (action === "reset") return 100;
  const delta = action === "in" ? UI_ZOOM_STEP : -UI_ZOOM_STEP;
  return clamp(current + delta, MIN_UI_ZOOM, MAX_UI_ZOOM);
}
