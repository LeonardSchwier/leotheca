Task: rm-7da5133cbd5a7ec6 — Crash-hunting review: filesystem bridge, persistence and capture paths
Owner/token: claude-code-crashfs2-20261106T231917Z-ab120eca / 5beaf8d0984c3f53fb56dfc457acd213
  (released on finish)
Scope: touch = src-tauri/src/commands.rs, src-tauri/src/workspace_mutations.rs;
  resources = crash-review-fs-commands. Reclaimed a dead structured claim
  (owner claude-code-crash-fs-20261106T184537Z-bf870172, lease expired
  2026-11-06T20:17:55Z, no branch/handoff was ever pushed for it — verified
  via `git log --all --grep`/branch listing before claiming).

Scope covered (bounded forward review, per the crash-freedom checklist):
  all production code in `src-tauri/src/commands.rs` (every `#[tauri::command]`
  and its helpers, lines 1-1336: workspace walks/`find_*`/`list_dir`,
  `read_text_file(s_batch)`/`read_binary_file`, `set_active_workspace_root`,
  `write_text_file`/`write_binary_file`/`write_file_atomically`,
  `create_dir`/`rename_path`/`trash_path`/`delete_path_permanent`,
  `check_unscoped_path_allowed` and the symlink/containment helpers it and
  `resolve_within_workspace` share) and the entire
  `src-tauri/src/workspace_mutations.rs` (F-004's no-replace create/rename
  commands and their own `resolve_within_workspace`). Traced every public
  entrypoint's success and failure path against the checklist's six
  questions (unhandled rejection, lifecycle, boundary inputs, concurrency,
  platform no-op, recovery).

Finding (proven, fixed, regression-tested):
  **Concurrency / silent data corruption in `write_file_atomically`.** Its
  temp-file name was built from only a millisecond timestamp + PID
  (`.{file}.leotheca-tmp-{stamp}-{pid}`). Two writes to the *same* `target`
  from the same process landing in the same millisecond — a realistic
  "two of these fire at once" scenario the checklist calls out directly:
  an autosave debounce tick racing an explicit save, or two capture/commit
  paths touching the same note back-to-back — computed the *identical*
  temp path. The second call's `fs::write` then silently truncated and
  overwrote the first call's still-in-flight temp file with its own bytes
  before the first call's `fs::rename` ran. Effect: the first caller's
  `Ok(())` was a lie (the file actually ends up holding the *second*
  call's content, not its own, with no error raised at all — silent
  overwrite of a successful-looking save with different content), while
  the second caller's own rename then failed with a spurious `ENOENT`
  (reporting failure for a write whose bytes had, in fact, already
  landed via the first caller's rename). This affects every writer that
  goes through `write_file_atomically`: `write_workspace_text_file`,
  `write_workspace_binary_file`, `write_text_file`, `write_binary_file`
  (note autosave, capture commit, task mutation, rename-preview commit,
  global config save).

  Fix: added a per-process monotonic `AtomicU64` sequence number
  (`TEMP_FILE_SEQUENCE`), folded into the temp-file name alongside the
  existing timestamp and PID, via a new pure/testable `temp_file_path`
  helper. Every call now gets a temp file no other call can ever collide
  with, regardless of clock resolution or thread timing — no stolen
  content, no silent swap, no spurious failure. No behavior/signature
  change for any caller; purely an internal correctness fix.

  Regression tests (both revert-confirmed to fail without the fix, 3/3
  runs, and pass with it restored — see Review below):
  - `temp_file_path_is_unique_even_with_the_same_timestamp_and_pid`:
    deterministic unit test pinning timestamp and PID and varying only the
    sequence number; proves the exact collision inputs now produce
    distinct paths.
  - `concurrent_writes_to_the_same_target_never_lose_or_corrupt_content`:
    24 real threads, barrier-synchronized to start together, all
    atomically-writing the same target with distinct payloads; asserts
    every call returns `Ok`, the final content is exactly one caller's
    complete payload (never a mix, never empty), and no `leotheca-tmp`
    file is left behind.

Reviewed and found sound, no defect (traced but not changed):
  - `resolve_within_workspace` (both copies, commands.rs and
    workspace_mutations.rs) and `check_unscoped_path_allowed`: lexical
    `..`/absolute/root-component rejection before any filesystem access,
    then canonicalize-and-`starts_with` containment on the nearest
    existing ancestor, with the exact-target-is-a-symlink case resolved
    and checked directly first. Already covered by extensive existing
    tests (sibling-name-prefix rejection, symlinked-parent escape,
    dangling symlink, lexical traversal hidden mid-path).
  - `is_symlink_escaping_workspace`/`MAX_WALK_DEPTH`: bounds every
    recursive walk (`workspace_stats`, `find_markdown_files`,
    `find_all_files`, `find_all_entries`) against a symlink cycle;
    existing tests exercise the cycle case directly.
  - `write_file_atomically`'s own two already-existing failure-path tests
    (temp-write fails before anything is created; rename fails, target
    and its contents survive, orphaned temp file is cleaned up) still
    hold and were not weakened.
  - `trash_path`'s lexical `strip_prefix` + `resolve_within_workspace`
    double-check, and its millisecond-timestamp collision-suffix for an
    existing `.trash` entry: this prefix is per-destination-path, not
    shared across concurrent calls to different source paths, so it does
    not have the same cross-call collision shape as
    `write_file_atomically`'s single shared `target`.
  - `rename_no_replace`'s per-platform `unsafe` FFI (`renameat2` on Linux,
    `renamex_np` on macOS, `MoveFileExW` on Windows): `CString::new`
    rejects embedded NUL before any FFI call; flag values and fallback
    (non-atomic exists-check-then-rename) match the documented "no
    replace" contract; signatures match the platforms' real headers.

Not examined (disclosed gap, out of this bounded pass): capture-path
  frontend code under `src/capture`/`src/editor` (claimed by this review's
  sibling "frontend async lifecycle" item, not this one's touch scope),
  and the Android `FolderAccessPlugin` native side (its own separate
  crash-hunting item). `write_unscoped_file`'s best-effort cleanup gap on
  a genuinely *partial* `fs::write` failure (e.g. `ENOSPC` mid-write
  leaving a truncated temp file with no cleanup on that specific error
  branch, as opposed to the rename-fails branch which already cleans up)
  was noted but not fixed in this pass: reproducing it deterministically
  needs a way to force `fs::write` to fail *after* creating the file
  (disk-quota/injectable-IO-error territory), which the sandbox cannot
  do safely; left as a separately scoped follow-up rather than landed
  without a real regression test proving it.

Checkpoint: none needed; implemented and landed in one session.

Landed: e164691 on origin/main (branch agent/rm-7da5133cbd5a7ec6/5beaf8d0984c,
  pushed directly to main after merging fresh main twice more during
  verification; confirmed an ancestor of origin/main by
  `git merge-base --is-ancestor`).

Concurrency note: while landing this, a newly-merged concurrent push
  (the "Git hooks and enforced quality gates" item) wired a `prettier`
  format-ratchet CI job (`rules.yml`) that, combined with the separately
  concurrent "Master specification" item's own `master-spec` CI job
  (`agent-policy.yml`), made master-spec.md's generated traceability
  table and Prettier's table formatting mutually exclusive for any push
  that had to touch master-spec.md -- which this item's own change did,
  since it touches an application path. Seeded a small, unclaimed
  ROADMAP.md bug entry documenting this the moment it was discovered;
  by the time the next fresh-main merge landed, the git-hooks owner had
  already added master-spec.md to `.prettierignore` (resolving it), so
  the seeded entry was removed again in the same push rather than left
  stale. No separate claim was taken for either the discovery or the
  removal -- both were small, coordination-only ROADMAP.md edits.

Checks (final merged tree, immediately before the push that landed e164691):
- `cargo fmt --all -- --check` (src-tauri): clean
- `cargo clippy --all-targets -- -D warnings` (src-tauri): 0 warnings
- `cargo test` (src-tauri): 118 passed, 0 failed (includes 2 new tests
  from this fix plus concurrently-landed modules merged in from main)
- `cargo check` (src-tauri): clean
- `npx tsc -p tsconfig.json --noEmit`: clean
- `npx vitest run`: 178 files, 3345 tests passed
- `npx vite build`: succeeds (pre-existing >500kB chunk-size warnings,
  unrelated)
- `npm run lint` (eslint): 0 errors (3 pre-existing warnings in
  `CaptureSheet.tsx`, from a concurrently-merged feature, not touched
  by this item)
- `npm run check-version`: passed
- `node scripts/check-rules.mjs {commits,lines,files,deps,format}`
  against `origin/main..HEAD`: all pass
- `python3 scripts/check_master_spec.py --root . --base origin/main
  --head HEAD`: "Master specification OK."
- `python3 scripts/check_roadmap_format.py --root . --base origin/main`:
  "Roadmap format OK."
- `python3 -m unittest discover -s scripts -p 'test_agent_ledger.py'`:
  22 passed
- `python3 -m unittest scripts.test_check_master_spec`: 21 passed
- The repo's own installed `pre-commit`/`pre-push` hooks (from the
  concurrently-landed git-hooks item) also ran clean on every commit in
  this session, including the final push (full vitest, version check,
  roadmap format all reported `ok` in the push's own output).

Review: traced the real success path (note autosave -> `saveCoordinator.ts`
  -> `write_text_file`/`write_workspace_text_file` -> `write_file_atomically`)
  and the real failure path (rename onto a non-empty directory; missing
  parent for the temp write) through to this fix's two new tests plus the
  three pre-existing `write_file_atomically` tests, all still green.
  Revert-confirmed the fix itself: temporarily restored the pre-fix
  temp-file-name formula (dropped the `sequence` component) and re-ran
  both new tests three times each — both failed deterministically every
  run (`temp_file_path_is_unique...` by direct `assert_ne!` on identical
  paths; `concurrent_writes_to_the_same_target...` by a panicked assertion
  from an `Err`/corrupted-content outcome) — then restored the fix
  (diffed byte-identical to the pre-revert file) and re-ran the full
  `cargo test`: 96/96 pass again. No weakening of any existing test or
  security boundary; no new IPC surface, no new caller-visible behavior.

CI: not independently checked for this landed SHA from this session (no
  hosted-CI tool was invoked here); all applicable local checks listed
  above are green, including the repo's own hosted-CI-equivalent
  mechanical gates (check-rules.mjs, check_master_spec.py,
  check_roadmap_format.py) run directly against `origin/main..HEAD`, so
  per verification-suite.md's landing table this is "all applicable
  local checks and review pass; no known code failure" -- eligible to
  land and finish, with a duplicate branch CI run optional. A later
  session/CI run may still inspect the landed SHA's hosted workflow
  result.

Missing evidence: none for the changed behavior itself. The disclosed,
  deliberately-not-fixed `write_unscoped_file`/`write_file_atomically`
  partial-write-orphan gap (see "Not examined" above) is recorded here as
  a candidate for a future, separately-scoped item rather than attempted
  without a real reproducing test.

Next action: none required; item is done.
Retry: not applicable (finished, not blocked).
