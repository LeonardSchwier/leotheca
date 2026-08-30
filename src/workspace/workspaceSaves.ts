import { markTabSaved, markTabSaveError } from "./store";
import { createSaveCoordinator } from "./saveCoordinator";

/** One autosave authority for the app lifetime. Workspace transitions and the
 * editor must share the same coordinator so the transition can block and
 * drain exactly the writes the editor has already scheduled. */
export const workspaceSaves = createSaveCoordinator({
  onSaved: (path) => markTabSaved(path),
  onError: (path, error) => markTabSaveError(path, error),
});
