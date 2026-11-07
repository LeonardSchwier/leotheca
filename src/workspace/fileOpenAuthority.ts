import { workspaceTransitions } from "./workspaceTransition";

/**
 * Audit follow-up N-002: `App.tsx`'s `handleOpenFile` awaits `readTextFile`
 * before opening or focusing a tab, so an older open request can still
 * complete after a newer one and override it ("latest-selection-wins" is
 * the intended behavior, not first-response-wins), or reopen a tab from a
 * workspace the user has since switched away from.
 *
 * Mirrors `fileTreeStore.ts`'s internal `SearchAuthority` pattern: a
 * monotonically increasing per-open-request generation makes the newest
 * `handleOpenFile` call authoritative over any older one still awaiting
 * its read. Unlike search (which is scoped by `settings/store.ts`'s
 * `workspaceSession`, since Android's synthetic `/workspace` path can't
 * otherwise distinguish two grants), a file-open request is additionally
 * scoped by `workspaceTransition.ts`'s own transition generation, which is
 * bumped synchronously at the very start of a transition, before its
 * `prepareOutgoing` step (which clears open tabs) even begins. Capturing
 * that generation here, rather than `workspaceSession`, closes the exact
 * window `workspaceSession` alone would miss: `workspaceSession` isn't
 * incremented until a transition actually publishes, well after tabs are
 * already cleared, so a stale read completing in between would pass a
 * `workspaceSession`-only check.
 */
let fileOpenGeneration = 0;

export interface FileOpenAuthority {
  generation: number;
  transitionGeneration: number;
}

/** Call once, synchronously, before starting an open request's own async
 * work (a `readTextFile`). Invalidates every request already in flight,
 * including one for a different kind of resource that never itself
 * awaits anything (an image tab opens synchronously), so a slow note
 * read started before a fast image click can never override it. */
export function beginFileOpenAuthority(): FileOpenAuthority {
  return {
    generation: ++fileOpenGeneration,
    transitionGeneration: workspaceTransitions.currentGeneration(),
  };
}

/** Whether `authority` is still the newest request and no workspace
 * transition has started since it began. Call again after every await,
 * before mutating tabs, focus, or sidebar state. */
export function isCurrentFileOpen(authority: FileOpenAuthority): boolean {
  return (
    authority.generation === fileOpenGeneration &&
    authority.transitionGeneration === workspaceTransitions.currentGeneration()
  );
}
