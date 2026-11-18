# Do not replace an app-level config.json this build cannot read or understand

## Item

rm-3504696a1a127057, "Do not replace an app-level config.json this build cannot read or understand". Two cases of the app-level `config.json` end with the next settings write replacing a file the user still has with defaults or with a migrated single profile. First, `loadGlobalConfig` in `src/settings/globalConfig.ts` treats every read error as "the file does not exist yet", so a file that exists but cannot be read (permission, I/O error, invalid UTF-8) is overwritten with defaults by the next theme change, recency update or profile edit. Second, a file whose `version` is above 2 is read by `decodeGlobalConfig` as a v1 file whenever it has no v2 catalog marker, so the next write swaps a newer build's catalog for one migrated profile. Both become "unreadable by this build": the bytes stay on disk, the existing recovery warning shows, and nothing writes the file until the user chooses **Rewrite app configuration**.

## Acceptance

1. `loadGlobalConfig()` resolves `{ config: defaults, corrupt: false, preserved: { fields: {} } }` (a first launch, no warning) only when the read failed because the file does not exist. That is a rejection whose text names a missing file: a Rust `io::Error` ending in `(os error 2)` or `(os error 3)` (the same on every OS and every UI language, so also a localized Windows message), `No such file or directory`, `cannot find the file` or `cannot find the path`, `does not exist` (the Capacitor text `'readFile' failed because file at '...' does not exist.`), or an object with `code` `ENOENT`. A bare `not found` is not one of them: Windows says `The network path was not found. (os error 53)` for an unreachable share.
2. Every other rejection of the read (including a bare `not found`) resolves `{ config: defaults, corrupt: true, preserved: { fields: {} } }` and does not throw: `Permission denied (os error 13)`, an I/O error, `stream did not contain valid UTF-8`, a failure to resolve the config path, and a rejection that is not an `Error` at all (a string, `undefined`, `null`, a number, an object without a message, an object that cannot be turned into text).
3. After `initSettings()` read such a result, `globalConfigCorrupted` is true and no ordinary write (theme, language, external-file open, profile activate, add, rename, icon, forget, relink, the startup recency update) calls `writeTextFile` for `config.json`. The explicit `repairGlobalConfigFile()` writes the current state and clears the flag, as for a malformed file today.
4. `decodeGlobalConfig(raw)` of a JSON object whose `version` is a number above 2 returns `{ config: defaults, corrupt: true }` with `preserved` holding the object's unknown top-level keys (and an unsupported `language` string), like any corrupt file that parses; whatever else the object holds, including a `workspaceProfiles` array and a `lastWorkspacePath`, is neither adopted nor migrated. A `version` of 2 with a catalog, a `version` of 1 and a missing `version` decode as before.
5. Through the store: a file with `version: 3` and a catalog of profiles is never rewritten by an ordinary write; the in-memory state is the defaults (no profiles) and the warning shows; the explicit repair writes `version: 2` with the defaults and the file's unknown keys. The same file with `version: 2` is read as before.
6. `master-spec.md` section 6.4 (the sentence that excluded a `version` above 2 and the read-error rule), a new requirement row `FR-SET-012` and the change log describe this; `CHANGELOG.md` has a user-facing line.

## Context

Read: `src/settings/globalConfig.ts` (`loadGlobalConfig` catches everything and returns defaults with `corrupt: false`; `decodeGlobalConfig` computes `hasV2Catalog = version === 2 && Array.isArray(workspaceProfiles)` and migrates from `lastWorkspacePath` when it is false), `src/settings/store.ts` (`initSettings` copies `corrupt` into `globalConfigCorrupted`; `persistGlobalConfig` returns without writing while it is set; only `repairGlobalConfigFile` writes through the flag), `src/settings/SettingsPanel.tsx` (the warning "App configuration had invalid data" with the **Rewrite app configuration** button), `src/workspace/tauriBridgeImpl.ts` and `src-tauri/src/commands.rs` (`read_text_file` returns `fs::read_to_string(..).map_err(|e| e.to_string())`), `src/workspace/capacitorBridgeImpl.ts` (`readTextFile` on the app data directory, the Capacitor error text), `src/settings/globalConfig.test.ts`, `src/settings/store.test.ts`. The Android `MainActivity` and the Rust grant-registry seed only read `config.json`. `workspaceSettings.ts` has its own copy of the "any read error is a missing file" rule for the per-workspace `settings.json`; it already treats an unrecognized version as corrupt.

Data flow: file -> `readTextFile` (rejects with a string from Tauri, an `Error` from Capacitor) -> `loadGlobalConfig` classifies the rejection -> `{ corrupt }` -> `globalConfigCorrupted` -> `persistGlobalConfig` skips every write.

Crash-freedom answers: the classifier reads the rejection value defensively (type checks, no property access on `null` or `undefined`, the conversion to text is wrapped in `try`), so a hostile or odd rejection cannot make `loadGlobalConfig` throw, and it fails toward "unreadable", the side that keeps the file. No new `await`, listener or timer. Boundary inputs: `version` is compared only when `typeof === "number"` (`NaN` is not above 2; `Infinity` and `1e9` are), a missing or string `version` keeps its old meaning. Concurrency: unchanged (the flag is set once by `initSettings`, every writer reads it at the start of its turn). Platform no-op: none. Recovery: the file is untouched; a transient error clears with the next start, a permanent one with the explicit rewrite.

## Plan

1. Tests first: `src/settings/globalConfig.test.ts` (`loadGlobalConfig` per rejection kind, odd rejection values; `decodeGlobalConfig` with `version` 3, with a catalog, with legacy fields, and the unchanged versions) and `src/settings/store.test.ts` (startup with an unreadable file and with a `version: 3` file: no write by any writer, repair writes, a first launch with a real missing-file message still writes). Run them and watch them fail on the unchanged source.
2. `src/settings/globalConfig.ts`: a private classifier `isMissingFileError`, `loadGlobalConfig` returning the unreadable result for everything else, the future-version check at the top of `decodeGlobalConfig`.
3. `master-spec.md` 6.4, `FR-SET-012` and the change log, `CHANGELOG.md`.
4. Verify (`skills/verification-suite.md`), mutation checks (classifier always "missing", classifier always "unreadable", version check removed, check on `>= 2`), two review passes, pull request.

## Out of scope

- The same read-error rule for the per-workspace `settings.json` (`src/settings/workspaceSettings.ts`), and for bookmarks and collections: seeded as a follow-up.
- The warning text. It says "App configuration had invalid data", which is accurate for a malformed file and loose for a newer or unreadable one; the settings panel text is being moved onto `t()` by the open translation items, so the wording is not touched here.
- A native "does this file exist" command. It would add a Rust command, a Kotlin plugin method and a bridge contract for one call site; the classifier fails toward keeping the file instead.
- Reading a newer file in a read-only or best-effort mode. A newer build may have changed any meaning, so this build shows defaults and leaves the file alone.
- Retrying a failed read.

## Rulings

- Tell "missing" from "unreadable" by the rejection text, or add a native existence check? -> the text | the three platforms already agree on a stable signal for a missing file (`(os error 2|3)` from Rust, `does not exist` from Capacitor, `ENOENT`), and an unrecognized text lands on the safe side: the file is kept and a warning shows | Cost if wrong: a platform whose missing-file text is not recognized shows the recovery warning on a first launch; one click on **Rewrite app configuration** clears it, and nothing is lost.
- Which way does an unknown rejection fall? -> unreadable | the two mistakes are not equal: a false "unreadable" costs one click, a false "missing" replaces the user's profiles with defaults | Cost if wrong: see above.
- Accept a bare `not found` as "missing"? -> no | the first version did, for the sake of old test fixtures; review showed a real case where it brings the defect back: `The network path was not found. (os error 53)` when the app data folder sits on an unreachable share, after which the next write replaces the catalog. No platform needs it, so the fixtures were made realistic instead | Cost if wrong: none for users; a bridge that reports a missing file with a text none of the patterns knows shows the recovery warning once.
- A newer file: defaults and the corrupt flag, or best-effort reading? -> defaults and the corrupt flag | it reuses the one recovery path the user already knows, keeps the bytes, and a partial reading of a changed format could adopt a wrong catalog | Cost if wrong: a user who downgrades sees no profiles until they reopen a folder or rewrite; the file is still there for the newer build.
- What does the explicit rewrite of a newer file keep? -> its unknown top-level keys, like every other corrupt file that parses (the rule of the previous item), and nothing it models | dropping readable data at the rewrite would be a second loss and a new exception to the section 6.4 rule; the modeled fields, catalog included, are replaced by this build's state because the user chose to rewrite | Cost if wrong: a key whose meaning depends on the newer `version` stays in a file now labeled 2; the newer build reads its own keys again.
- Which `version` values count as newer? -> a number above 2 | the roadmap names "above 2"; strings and missing values are v1 by the current contract, and `workspaceSettings.ts` also compares numbers | Cost if wrong: a file with `"version": "3"` is still read as v1; no build writes that.
- Reword the warning? -> no | see out of scope | Cost if wrong: loose wording for two rare causes.
- Anything against the product rules? -> no | no network, telemetry, AI, camera or microphone; no competitor names; offline and plain-file behaviour unchanged, and a file that cannot be understood is no longer replaced.

## Glossary

Glossary: none

## Design system

No UI surface.
