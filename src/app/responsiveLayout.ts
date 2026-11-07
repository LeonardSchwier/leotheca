export const NARROW_VIEWPORT_MAX_WIDTH = 720;

/** Keep the behavior threshold aligned with App.css's narrow-screen media
 * query. Reading the width when navigation completes also handles device
 * rotation without maintaining a second reactive viewport state. */
export function isNarrowViewport(viewportWidth: number): boolean {
  return viewportWidth <= NARROW_VIEWPORT_MAX_WIDTH;
}
