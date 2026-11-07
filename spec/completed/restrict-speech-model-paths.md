# Restrict the speech model path and model directory commands

## Context

- Roadmap item `rm-cc7afa94052b442d`. Finding from the 2026-11-06 security audit: `init_speech_recognition` loaded any path the renderer sent, and `check_whisper_models` probed any directory.

## Acceptance criteria

1. `init_speech_recognition` takes a model name from `tiny|base|small|medium` and resolves `<app_data_dir>/whisper-models/ggml-<name>.bin` natively.
2. Any other string, including paths, traversal and wrong case, is refused with an error that lists the allowed names.
3. `check_whisper_models` takes no argument and reports the four files in that directory.
4. The frontend bridge sends `{ model }` and calls `check_whisper_models` without arguments; the default model is `tiny`.
5. `master-spec.md` command table, KG-001 and change log match the code.

## Grill: rulings

| Question                                        | Ruling                                 | Why                                                | Cost if wrong                                                  |
| ----------------------------------------------- | -------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------- |
| Keep accepting a path for user-supplied models? | No.                                    | No UI offers it; the controller only sends a size. | A user wants a custom model: add a picker with a native grant. |
| Create the model directory?                     | No, the probe reports `exists: false`. | Creating directories is a download feature.        | A later download item creates it.                              |
| Default when the bridge gets an empty model?    | `tiny`, the controller default.        | An empty string could never load before.           | Callers that relied on the failure now try the tiny model.     |

## Design-system check

Not applicable, no UI.

## Evidence

`cargo test --offline speech_commands` 5 passed (3 new: allow-list resolution, refusal of paths and unknown names, directory-only listing); `cargo clippy --all-targets -D warnings` and `cargo fmt --check` clean; `tsc`, `eslint` clean; vitest `src/workspace src/speech` 534 passed; master-spec check OK. Hosted checks are the pull request's required checks.

Reflection: the command signatures lived in master-spec rows and a KG note, so the code change needed four places in sync -> none: the master-spec check already caught the traceability part; a signature table check would be a new tool for one row.
