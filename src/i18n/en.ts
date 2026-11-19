/** The English catalog is the source of truth: its keys define `MessageKey`,
 * and every other catalog must provide the same keys (the type checks it, and
 * `i18n.test.ts` checks the placeholders). Placeholders are written `{name}`. */
export const en = {
  "welcome.title": "Welcome to Leotheca",
  "welcome.chooseFolderHint":
    "Choose a folder on disk to use as your root workspace. You can change it later from Settings.",
  "welcome.chooseFolder": "Choose Folder",
  "welcome.addWorkspace": "Add workspace",
  "welcome.openingPicker": "Opening folder picker…",
  "welcome.couldNotOpenFolder":
    "Could not open that folder. Try again or choose another folder.",
  "welcome.relinkFailed": "Could not relink workspace. Try again.",
  "welcome.relinkConflict":
    'This folder is already used by workspace "{name}".',
  "welcome.failedTitle": 'Couldn\'t open "{name}"',
  "welcome.failedBody":
    "This workspace's folder may have moved, or access may have been revoked.",
  "welcome.retry": "Retry",
  "welcome.retrying": "Retrying…",
  "welcome.relink": "Relink folder",
  "welcome.relinking": "Relinking…",
  "welcome.openWorkspace": "Open a workspace",
  "welcome.orOpenDifferent": "Or open a different workspace",
  "welcome.recentWorkspaces": "Recent workspaces",
  "settings.language.label": "Language",
  "settings.language.followSystem": "Follow System",
} as const satisfies Record<string, string>;

export type MessageKey = keyof typeof en;
