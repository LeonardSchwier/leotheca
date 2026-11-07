# Remove voice dictation and microphone access

## Item

Roadmap item `rm-80dec1c02fce18c1`, "Remove voice dictation and microphone access". Owner decision (2026-11-07): no camera and no voice dictation, because both need access that can invade privacy. Outcome: the dictation feature and every microphone permission are gone, and the stance is a written product rule.

## Acceptance

1. No frontend, desktop or Android source touches an audio or video capture API or a speech engine (`scripts/noMicrophone.test.js`).
2. The Android manifest requests no `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS` or `CAMERA`.
3. The `whisper-ffi` crate, its `Cargo.lock` tree and its Flatpak cargo sources are removed.
4. No dictation setting, palette entry, editor button or Quick Capture voice control remains; an old stored `speechToTextEnabled` loads without corruption and is dropped.
5. README, `documentation/PROJECT_RULES.md`, `master-spec.md` and `CHANGELOG.md` state the rule.

## Context

Read: `src/speech`, the speech bridges, `speech_commands.rs`, `lib.rs`, `SpeechRecognitionPlugin`, `MainActivity`, the manifest, `CaptureSheet`, `App`, settings. The whisper crate was only used by `speech_commands.rs`. Settings load spreads unknown keys, so the legacy key had to be deleted explicitly.

## Plan

Delete the files, fix the call sites, add the guard test and the legacy-setting tests, regenerate `flatpak/cargo-sources.json`, update the docs.

## Out of scope

Camera features were already dropped from the roadmap. Historic specs and handoffs that mention dictation stay as history.

## Rulings

| Question                                                | Ruling                                  | Why                                            | Cost if wrong                                            |
| ------------------------------------------------------- | --------------------------------------- | ---------------------------------------------- | -------------------------------------------------------- |
| Keep the Rust command stubs behind a flag?              | No, delete.                             | A dormant microphone path still invites reuse. | Re-adding needs a new decision.                          |
| Keep the stored key for downgrade?                      | Drop it on load.                        | A dead key helps nobody.                       | An old build would see dictation off.                    |
| Guard test or only prose?                               | Add `scripts/noMicrophone.test.js`.     | A rule that no test enforces is forgotten.     | A false positive on a harmless word: narrow the pattern. |
| Regenerate flatpak sources with the upstream generator? | Yes, then keep the original formatting. | Recipe in `flatpak/README.md`.                 | Fixed by regenerating.                                   |

## Design system

No UI surface added; a settings row, a toolbar button and a capture control are removed.

## Evidence

| Claim              | Evidence                                                                         | Result                                             |
| ------------------ | -------------------------------------------------------------------------------- | -------------------------------------------------- |
| 1, 2               | `npx vitest run scripts/noMicrophone.test.js`                                    | 3 passed                                           |
| 4                  | `src/settings/workspaceSettings.test.ts`, `SettingsPanelCurrentTests.tsx`        | passed, full vitest 3269 passed in 178 files       |
| 3                  | `cargo test --offline` (129 passed), `cargo clippy --all-targets -- -D warnings` | clean; 34 cargo-source entries removed, none added |
| types, lint, build | `tsc`, `eslint .` (0 errors), `npm run build`                                    | pass                                               |
| e2e smoke          | `npm run test:e2e`                                                               | 16 passed                                          |
| docs               | `scripts/check_master_spec.py --root .`                                          | OK                                                 |
| review             | self-review of the diff against the brief                                        | no findings                                        |
| hosted checks      | the pull request's required checks                                               | recorded in the handoff                            |

Reflection: the claim was blocked by another agent holding the whole `src` prefix for over an hour, and a dirty `gradlew.bat` (CRLF attribute) made the helper refuse a clean control tree -> none: narrow touch paths are already the rule, and the checkout artifact is local to this machine.
