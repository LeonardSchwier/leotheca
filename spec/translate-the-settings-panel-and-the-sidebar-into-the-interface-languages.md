# Translate the settings panel and the sidebar into the interface languages

## Item

Roadmap item `rm-2c7a98e6b5428986`, "Translate the settings panel and the sidebar into the interface languages". Outcome of this slice: with German active, the Settings panel (category navigation, section names, row labels, descriptions, buttons, empty states, the alerts the panel raises itself and the text of the sub-panels that live in `src/settings`), the sidebar (toolbar buttons, search field, sort tooltips, create, rename and delete prompts) and the tab bar (close buttons and the tab context menu) show German text. English output is byte-identical to today's. The settings search finds a row by its text in the active language and in English.

## Acceptance

1. Every user-visible string authored in `src/settings/SettingsPanel.tsx`, `src/settings/WorkspaceProfilesSettings.tsx`, `src/settings/VaultStatsPanel.tsx`, `src/workspace/Sidebar.tsx` and `src/workspace/TabBar.tsx` comes from `t(key, params?)`: text nodes, `aria-label`, `title`, `placeholder`, button and dialog labels, and the messages these components pass to `window.alert` or a confirm dialog. Text the component only displays (a note name, a path, a version number, an error message from a library) stays as it is.
2. `en.ts` holds the English text of each key; `de.ts` has every key (the type checks it) and `i18n.test.ts` checks the placeholder sets of the two catalogs, so a German string cannot lose or invent a `{name}`.
3. English output is byte-identical: every existing English test keeps its assertions unchanged, and the spec reviewer compares each removed English literal with its `en.ts` value character by character.
4. A German rendering sweep for the Settings panel (every section visible: workspace open, every optional feature row reachable) and for the sidebar and tab bar: no text node and no `aria-label`, `title` or `placeholder` equals the English value of a migrated key whose German value differs, and a sample of rows shows the German text.
5. The settings search matches a query against the row's text in the active language and in English. In English it behaves exactly as today. In German, "Schriftgröße" and "font size" both find the Font size row. A query that matches no row still shows the empty state, translated.
6. The category navigation, the compact detail header and the empty state use translated names; the internal category ids and the `data-` attributes the tests and the e2e journey rely on do not change.
7. The sidebar sort tooltips, the create prompt (note or folder), the rename prompt, the permanent-delete confirmation (with the entry name) and the tab bar's `Close {name}` label and context menu are translated, with the entry or tab name interpolated in one pass.
8. `tsc`, `eslint`, `prettier --check`, the unit tests, the build and the e2e journey pass (the verification suite, `skills/verification-suite.md`).

## Context

- Files read: `src/i18n/index.ts`, `en.ts`, `de.ts`, `locales.ts`, `i18n.test.ts` (the layer from `rm-1b35b6a35c2046a8`), `src/settings/SettingsPanel.tsx` (the `matches()` search, the option arrays, the category list), `SettingsPanelCurrentTests.tsx` (its mock of `./store`, the Language row cases), `src/workspace/Sidebar.tsx`, `TabBar.tsx`.
- Data flow is unchanged: `languagePreference` -> `activeLocale` -> `t()`; a component that calls `t` re-renders when the language changes. Module-level constants that hold text (the option arrays, the category list) must not call `t()` at import time, or they freeze the language of the first render; they hold message keys and are translated where they render.
- Platform: the same code runs on desktop and Android. No bridge command, dependency, network call or font is added.
- Crash-freedom: a key unknown to every catalog returns itself and never throws (existing rule); a missing German key falls back to English.
- Text rights: German strings are written fresh as short interface text in the informal "du" form of the first slice; nothing is copied from another product.

## Plan

1. This spec, committed first.
2. Tests first: the German sweep and search tests for the Settings panel, the sidebar and the tab bar (they fail while the strings are literals); the existing English tests stay as they are.
3. `src/i18n/en.ts` and `de.ts`: `settings.*`, `sidebar.*`, `tabs.*` keys.
4. `SettingsPanel.tsx` (and the two sub-panels): keys in the option arrays and category list, `matches()` over keys, every literal onto `t()`.
5. `Sidebar.tsx`, `TabBar.tsx` the same.
6. `master-spec.md` (FR-I18N), `CHANGELOG.md`, `documentation/ARCHITECTURE.md` (which surfaces use `t`), the roadmap through the ledger helper (the follow-up item loses what this slice moved).

## Out of scope

- Everything else: the editor, dialogs outside these components, menus, the command palette, the file tree rows, the Diagnostics list inside Health, shortcut command names that come from the shared shortcut registry, the text the settings store publishes (`workspaceSelectionError`), and Tauri or Android native strings. The second roadmap item covers them.
- Plural rules and date or number formatting.
- Product, format and syntax names that are the same in every language: Leotheca, Markdown, KaTeX, Mermaid, LaTeX, wikilink and key names such as Ctrl.

## Rulings

| Question                                           | Ruling                                                                                                                                                                                | Why                                                                                                                                                                                                       | Cost if wrong                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Which texts does the settings search match?        | The active language's text and the English text of a row. English users see no change.                                                                                                | Setting names are quoted in English in docs, issues and other apps, so a German user may type either. The Language row already matches every language because someone in the wrong language must find it. | A German word that is a substring of an English one adds a rare match. |
| Do module-level option arrays keep English labels? | They hold message keys, and the label is looked up when the row renders.                                                                                                              | A `t()` call at import time reads the language once and never changes with it.                                                                                                                            | None.                                                                  |
| One key per text or one per sentence fragment?     | One key per displayed sentence, with `{name}` placeholders for values. A sentence with inline code or a link is split into the fewest keys that keep each translation a whole phrase. | Concatenated fragments cannot be reordered in German.                                                                                                                                                     | A phrase with a link may read slightly stiffer.                        |
| Are the sub-panels of `src/settings` in scope?     | Yes, when the Settings panel renders them (Workspace Profiles, vault statistics). The Diagnostics list and shortcut names belong to other directories and stay.                       | They are part of what the panel shows, and the roadmap item says "settings panel". Other directories are other surfaces with their own tests.                                                             | A few English rows remain in Health and Shortcuts until a later slice. |
| Do the existing English tests change?              | No assertion changes. A query is narrowed only where a German-neutral change makes it ambiguous (none expected).                                                                      | Acceptance 3 is the guard against accidental text edits.                                                                                                                                                  | A reworded string fails a test: fix the string, not the test.          |

## Design system

- No new component, token or style. Only the text inside existing `settings-row`, `settings-switch`, sidebar and tab bar elements changes. German strings are longer than English ones; the existing rows already wrap, and no fixed-width label is introduced. Nothing is added to or changed in Leoforma.

## Evidence

Legal/text check (`skills/text-rights-and-legal-check.md`) on the changed text surfaces: 6 verified (the two catalogs `en.ts` and `de.ts`, `CHANGELOG.md`, `documentation/ARCHITECTURE.md`, `master-spec.md`, this spec), 0 fixed, 0 open. The German strings are short original interface text written for this app, nothing copied from another product; no competitor or product name was added (the pre-commit hook and `src/tidyRepoHygiene.test.ts` pass); the claims in the new texts (a local dictionary, no network access) repeat what the English text and the code already state.
