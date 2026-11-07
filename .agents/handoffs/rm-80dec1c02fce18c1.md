# Remove voice dictation and microphone access

Merged as PR 87, merge commit ded114dde6ac411446b32d6e882679338212b383. All 29 PR checks passed. Local: tsc, eslint 0 errors, vitest 3269 passed, cargo test 129 passed, clippy -D warnings clean, build ok, test:e2e 16 passed.

Post-merge runs on main: Agent policy 42423097964, Semgrep 42423097916, CI 42423097954, Release 42423098052, Rules 42423098072 (queued at finish time).

Done: removed src/speech, the speech bridges, SpeechRecognitionButton, Quick Capture voice input, the desktop speech commands and the whisper-ffi crate (Cargo.lock and flatpak/cargo-sources.json regenerated), the Android SpeechRecognitionPlugin and the RECORD_AUDIO and MODIFY_AUDIO_SETTINGS permissions, the speechToTextEnabled setting (an old value is dropped on load). Added scripts/noMicrophone.test.js, HC-10 and FR-PRIV in master-spec.md, README stance and a PROJECT_RULES product rule. Spec archived at spec/completed/remove-voice-dictation-and-microphone-access.md.

Reflection: another claim held the whole src prefix and a CRLF-attribute checkout artifact dirtied the control tree -> none: narrow touch paths are already the rule and the artifact is local.
