# Add UI localization with support for multiple languages

## Item

Roadmap item `rm-1b35b6a35c2046a8`, "Add UI localization with support for multiple languages". Outcome of this slice: the app has one typed translation layer, a persisted app-level language setting (system, English, German), a Language row in Settings, and the first-run Welcome dialog is fully translated; every other surface keeps its English text and is migrated in later slices.

## Acceptance

1. `t(key, params?)` returns the string of the active locale. A key missing in the active locale falls back to English. `{name}` placeholders are replaced in one pass, so a parameter value that itself contains `{other}` is never expanded again.
2. The German catalog has exactly the keys of the English catalog (a test fails when one side has a key the other lacks, or when a placeholder set differs between the two).
3. `GlobalConfigV2` has a `language` field of `"system" | "en" | "de"`. A missing field decodes to `"system"` without being corrupt. A present value of the wrong type (number, object, null) decodes to `"system"` and is corrupt. A present string that is not a supported language (for example `"fr"` written by a newer app) decodes to `"system"` and is not corrupt.
4. `language` is written by `readCurrentGlobalConfig` and read by `initSettings`. `setLanguage(next)` updates the signal, persists the config, and is blocked from writing while `globalConfigCorrupted` is set, exactly as `setTheme` is.
5. `"system"` resolves from `navigator.languages` by the primary subtag (`de`, `de-AT`, `de_CH` resolve to German; everything else to English). `<html lang>` follows the active locale.
6. `WelcomeDialog` renders its text through `t()` in all three cases (no profiles, failed active profile, profiles without an active one), including the relink and error alerts. With German active, no English UI string remains in the dialog.
7. Settings, Appearance section, shows a Language row with the options "Follow System", "English", "Deutsch". Each option label is shown in its own language and never translated. The row is found by the settings search for "Language" and for "Sprache".
8. English output of every migrated string is byte-identical to today's text, so the existing English tests keep passing unchanged.
9. `tsc`, `eslint`, `prettier --check`, the unit tests and the build pass.

## Context

- Files read: `src/settings/globalConfig.ts` (decode, `GlobalConfigV2`), `src/settings/decode.ts` (`decodeEnum` marks any present invalid value corrupt), `src/settings/store.ts` (`theme` signal, `readCurrentGlobalConfig`, `initSettings`, `setTheme`, `globalConfigCorrupted` write block), `src/settings/WelcomeDialog.tsx`, `src/settings/SettingsPanel.tsx` (`THEME_OPTIONS`, `showTheme`, Appearance section), the settings tests that mock `./store`.
- The language is an app-level setting, not a workspace setting. It is needed before any workspace is open (the Welcome dialog is that surface), so it lives next to `theme` in `config.json` in the app config folder, never in `.leotheca/settings.json`.
- Data flow: `config.json` -> `loadGlobalConfig` -> `initSettings` -> `languagePreference` signal -> `activeLocale` computed -> `t()` reads it, so every component that calls `t()` re-renders on a change.
- Platform: the same code runs on desktop and Android. `navigator.languages` exists in both webviews and in jsdom. No bridge command is added. No network, no font, no new dependency.
- Crash-freedom: an unknown key at run time returns the key itself in development builds and English in release (never throws); a catalog is plain data; a corrupt `language` never blocks startup (it falls back to `"system"` and the existing corrupt-file protection keeps the file bytes).
- Text rights: German strings are written fresh for this slice as short interface labels; nothing is copied from another product or from a translation corpus.

## Plan

1. Spec, rulings, glossary line (this file, `GLOSSARY.md`), committed first.
2. `src/i18n/catalog.ts` types, `src/i18n/en.ts`, `src/i18n/de.ts`, `src/i18n/index.ts` (`t`, `languagePreference`, `activeLocale`, `resolveLocale`, `LANGUAGE_PREFERENCES`) with `src/i18n/i18n.test.ts` written first (interpolation, fallback, resolution, catalog parity).
3. `src/settings/globalConfig.ts` and `globalConfig.test.ts`: the `language` field and its decode cases.
4. `src/settings/store.ts` and `store.test.ts`: signal wiring, `setLanguage`, write block while corrupt, `<html lang>`.
5. `src/settings/WelcomeDialog.tsx` and `WelcomeDialog.test.tsx`: migrate strings, add a German rendering test.
6. `src/settings/SettingsPanel.tsx`, `SettingsPanelCurrentTests.tsx`: Language row, search matching, mock update.
7. `master-spec.md`, `CHANGELOG.md`, `documentation/DECISIONS.md` (hand-written core instead of a library), `ROADMAP.md` follow-ups through the ledger helper.

## Out of scope

- Migrating strings other than the Welcome dialog and the new Language row (editor, sidebar, dialogs, menus, Settings labels). The roadmap item is split into one follow-up per surface group.
- Plural rules, date, number and list formatting (`Intl` is used where text is formatted today and stays unchanged).
- Right-to-left layout for the UI chrome (the workspace RTL setting concerns note text only).
- Native Android and Tauri menu strings, the Flatpak and store metadata.
- More than two languages; adding one is a new catalog file plus one entry in `LANGUAGE_PREFERENCES`.

## Rulings

| Question                                                                                | Ruling                                                                                                                                                                       | Why                                                                                                                                                                                                              | Cost if wrong                                                                                 |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| The roadmap text asks to adopt a mature i18n library. Adopt one or hand-write the core? | Hand-write a typed core in `src/i18n/` (about 80 lines): flat keys, `{name}` interpolation, English fallback.                                                                | The needs of this slice (lookup, interpolation, fallback) are tiny. A library adds a dependency that needs intake, supply-chain review and bundle weight, and its plural and ICU features are out of scope here. | A later slice needs plurals or ICU: swap the core behind `t()`; the catalogs stay plain data. |
| Which surfaces move in this slice?                                                      | The Welcome dialog (the surface a new user sees first, with no workspace) and the Language row. Everything else is a follow-up split by surface.                             | A whole-app migration is hundreds of strings across dozens of files and cannot be reviewed or tested as one change; one complete surface is a real, demonstrable feature.                                        | Users see a mixed-language UI until follow-ups land: the setting says so in the roadmap note. |
| Where does the setting live: global config or workspace settings?                       | `GlobalConfigV2.language`, next to `theme`.                                                                                                                                  | The Welcome dialog shows with no workspace open, so a workspace file cannot hold it. A language is a property of the person on this device, not of a folder.                                                     | Moving it later needs a config migration: a field copy, cheap.                                |
| An unknown language string in `config.json` (written by a newer app): corrupt or not?   | Not corrupt. Decode to `"system"`. A wrong type is corrupt.                                                                                                                  | Marking it corrupt would block every config write (profiles, theme, recency) after the user opened a newer build once. The data is a harmless preference.                                                        | A newer build's language is forgotten after a downgrade round trip: the user picks it again.  |
| How does `"system"` pick a language?                                                    | First entry of `navigator.languages` (then `navigator.language`) whose primary subtag is supported; otherwise English. Matching is case-insensitive and accepts `-` and `_`. | Browsers and webviews list preferences in order; the first supported one is what the user prefers. English is the safe default.                                                                                  | A user with `fr, de` gets German: that is the intent.                                         |
| How are placeholders replaced?                                                          | One regex pass over the template (`/\{(\w+)\}/g`); an unknown placeholder name stays as written.                                                                             | Sequential `replace` calls let a value containing `{other}` be expanded by a later call (injection of placeholders from file names and profile names).                                                           | None: a single pass is strictly safer.                                                        |
| Are option labels of the Language row translated?                                       | No. Each language is named in itself ("English", "Deutsch"); only "Follow System" and the row label are translated.                                                          | A person who cannot read the current language must still find their own.                                                                                                                                         | None.                                                                                         |
| Do the existing tests that assert English text change?                                  | No. The default and test locale resolve to English, and English strings are unchanged.                                                                                       | Acceptance 8 makes this a guard against accidental text edits.                                                                                                                                                   | A reworded string fails a test: fix the string, not the test.                                 |

## Design system

- Language row: Reuse. The same `settings-row` and `settings-switch` buttons the Theme row uses, with the existing `active` class. No new token or component.
- Welcome dialog: Reuse. Only the text of existing Leoforma `Dialog` and `Button` usages changes.
- Nothing is added to or changed in Leoforma.

## Evidence

(filled at stage 6)

Glossary: Locale (the language of the interface strings, chosen by the Language setting; `"system"` resolves from the device)
