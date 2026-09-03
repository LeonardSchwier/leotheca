import { signal } from "@preact/signals";

/** A monotonic request lets command-palette callers open the header switcher
 * without coupling App-level command construction to component refs. */
export const workspaceSwitcherOpenRequest = signal(0);

export function requestWorkspaceSwitcherOpen(): void {
  workspaceSwitcherOpenRequest.value++;
}
