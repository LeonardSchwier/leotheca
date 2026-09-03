import { signal } from "@preact/signals";

/** Monotonic requests let App-level surfaces invoke workspace-profile actions
 * without coupling the generic CommandPalette to settings/store.ts. The header
 * switcher owns the actual actions and observes these counters while mounted. */
export const workspaceSwitcherOpenRequest = signal(0);
export const workspaceAddRequest = signal(0);
export const workspaceManageRequest = signal(0);

export function requestWorkspaceSwitcherOpen(): void {
  workspaceSwitcherOpenRequest.value++;
}

export function requestWorkspaceAdd(): void {
  workspaceAddRequest.value++;
}

export function requestWorkspaceManage(): void {
  workspaceManageRequest.value++;
}
