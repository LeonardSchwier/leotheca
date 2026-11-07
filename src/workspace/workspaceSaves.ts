import { hasActiveUnsavedWork, prepareActiveSavesForTransition } from "./saveCoordinator";

/** Transition-facing facade. The editor's createSaveCoordinator() call
 * registers the active instance, avoiding a settings <-> App import cycle. */
export const workspaceSaves = {
  prepareForTransition: prepareActiveSavesForTransition,
  hasUnsavedWork: hasActiveUnsavedWork,
};
