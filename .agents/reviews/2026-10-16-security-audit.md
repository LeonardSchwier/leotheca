# Security audit, 2026-10-16

Moved from ROADMAP.md on 2026-11-07 with the text unchanged. Finding ids in the ledger and in handoffs refer to this report.

_Performed per the Cloudflare security-audit-skill (multi-phase, source-first, boundary-violation evidence). Scope: full codebase on main (commit `2cd2f76`). Profile: standard. 5 confirmed findings, 0 critical/high, 4 medium, 1 informational._

## Confirmed findings

**S-1 (medium) — `assetProtocol` scope is empty: full-filesystem read via webview** ✅ **Resolved 2026-10-17**
> **Audit correction:** The original claim — "an empty scope array means the `asset:` protocol can serve any file on disk" — is **false**. In Tauri, `scope: []` is **deny-by-default**: no files are served at all until the app explicitly allows a directory at runtime. The empty array is the *secure* state, not the vulnerable one. The vulnerable state was `["**"]`, which the 2026-09-23 fix removed.
>
> **Actual behavior (verified):** `set_active_workspace_root` (`src-tauri/src/commands.rs:877`) grants access *dynamically* via `app.asset_protocol_scope().allow_directory(root)` when a workspace is activated, and `forbid_directory(previous_root)` when switched away. The Rust regression test `set_active_workspace_root_scopes_asset_protocol_to_the_active_workspace_only` (`commands.rs:1433`) proves this: the asset protocol serves **only the active workspace**, and nothing else.
>
> **Gap fixed now:** The deny-by-default invariant was *correct* but **untested in the TS suite**. A future edit that reverted `scope` to `["**"]` (the 2026-09-23 bug), `null`, or any match-all pattern would silently reintroduce the arbitrary-file-read vulnerability with no CI alarm.
>
> **Resolution (commit `d0f22a3`):** Added `src/assetProtocolScope.test.ts` — 4 tests that lock the invariant in CI:
> 1. `assetProtocol.enable` is `true` (required for local image/attachment rendering).
> 2. `scope` is an array (not `null` — which in Tauri means "allow everything").
> 3. `scope` contains no match-all pattern (`**`, `**/*`, `*`, `/**`, `/**/*`) — the exact patterns that match any absolute path.
> 4. `scope` grants no `$APPDATA`/`$HOME` unconditionally — the only runtime grant must come from `set_active_workspace_root`.
>
> **TDD verified:** Injecting `scope: ["**"]` (the 2026-09-23 vuln) makes the test **fail** (RED). The current `scope: []` config **passes** (GREEN). Pre-push CI: 13/14 checks passed, 1 skipped, 3m30s. `tsc --noEmit` clean, `vitest run` 3048/3048 (162 files), `vite build` OK.
>
> The `*Fix*` line below (set scope to `["$APPDATA/**", ...]`) is **rejected** — it would *widen* the grant, not narrow it. The correct state is `scope: []` with runtime-only grants, which is already in place.

**S-2 (medium) — `script-src 'unsafe-eval'` in CSP**
`src-tauri/tauri.conf.json` line 23: `script-src 'self' 'unsafe-eval'`. While no direct `eval()`/`new Function()` calls exist in the codebase (verified by grep), `unsafe-eval` widens the XSS payload surface: any injection vector (e.g. S-1's asset protocol, or a DOMPurify bypass) can execute arbitrary code via `eval()`/`setTimeout(string)`/`new Function()` without an additional bypass step. The only consumers of dynamic code evaluation are mermaid and monaco, both of which ship as static bundles.

*Fix:* Remove `'unsafe-eval'` from `script-src`. If mermaid or monaco genuinely need `eval()`, wrap that specific evaluation in a CSP nonce or move it to a Web Worker (the CSP `worker-src` directive does not inherit `unsafe-eval`). Add a CI test that asserts the CSP does not contain `unsafe-eval`.

**S-3 (medium) — `read_markdown_file` in `external_open.rs` reads arbitrary paths with no containment check** ✅ **Resolved 2026-10-21 (audit correction — no code change; finding is a false positive)**

> **Audit correction (2026-10-21, same treatment as S-1):** The finding is **false as stated**, and its *Fix* would **break the feature it is attached to**. `read_markdown_file`'s purpose is precisely to read a Markdown file that is *outside* the active workspace — the OS `.md` file-association launch (`extract_markdown_path`), an already-running instance's relaunch (`RunEvent::Opened`/`markdown_path_from_urls`), and the in-app "Open file from outside the vault…" picker (`pick_and_read_external_markdown_file`). Adding the proposed `canonicalize(&path).starts_with(canonical_workspace_root)` guard and returning `None` for outside paths would therefore reject **every** legitimate use of the feature, and directly contradict the dedicated lock-in test `read_markdown_file_reads_content_from_a_path_outside_every_known_root` (`external_open.rs:272`), which asserts an *outside* path reads successfully.
>
> **What the finding gets right, and the real (already-mitigated) surface:** the *content* of a user-chosen file is shown in the read-only `ExternalFileView` scratch view. That is exactly the behavior of any text editor's "open file" and is the intended, user-initiated outcome of the feature. The exposure that S-3 frames as "arbitrary file read + exfiltration" is in practice bounded by three independent gates:
> 1. **Provenance / extension** — only a `.md` path is ever read: OS launches and live `Opened` events are filtered by `has_markdown_extension` (case-insensitive), the dialog uses a `.md` filter, and the frontend re-checks `/\.md$/i` (`App.tsx` `handleExternalFileOpen`) before rendering.
> 2. **User opt-in / consent** — the in-app picker and OS file-association both require the user to actively select or double-click a file; the feature is additionally switchable off via the `externalFileOpenEnabled` setting.
> 3. **Read-only rendering** — the scratch view shows content with no editor, no save-back, and no write path; `read_markdown_file` is invoked only in the same trusted Rust call that establishes the path's provenance, never as a webview-reachable IPC command that a page could drive with its own path (`ExternalMarkdownFile`'s doc comment states this load-bearing guarantee).
>
> **Why no code change (mirroring S-1):** The *correct* state — a deliberate, user-consented, extension-gated, read-only "open external Markdown file" capability with the path established by the OS/dialog rather than by the webview — is already in place and already unit-tested (`read_markdown_file_reads_content_from_a_path_outside_every_known_root`, `take_pending_open_file_consumes_the_value_once`, and the extraction/URL tests in the same module). The only gap, in keeping with the S-1 lesson, was that this *intended* behavior was not explicitly documented as such in the roadmap; this correction is that documentation. If the maintainer wants the feature to also open non-Markdown types, that is a product change to scope explicitly — it is not a security remediation.
>
> **Verification (2026-10-21, integrated tree):** `npx tsc --noEmit` clean; `npx vitest run` 165 files / 3109 tests pass; `npx vite build` OK (only the pre-existing chunk-size warning). No source changed.

**S-3 (medium) — `read_markdown_file` in `external_open.rs` reads arbitrary paths with no containment check**
`src-tauri/src/external_open.rs` line 47: `fs::read_to_string(&path).ok()` — no workspace, config-dir, or any other containment check. This is called from:
1. `lib.rs` line 84: `external_open::extract_markdown_path(&cold_start_args).and_then(external_open::read_markdown_file)` — reads a path from CLI argv at cold start.
2. `lib.rs` line 54: `external_open::extract_markdown_path(relaunch_args).and_then(external_open::read_markdown_file)` — reads a path from a relaunch intercepted by single-instance.

The `extract_markdown_path` function (line 129) only checks `url.scheme() == "file"` and strips the `file://` prefix — it does **not** validate the resulting path stays within the workspace. An attacker who can control the OS launch arguments (e.g. a crafted `.md` file opened via file association, a malicious terminal alias, or a compromised desktop entry) can read any file the user's process can access. The result is emitted to the frontend via `emit_open_external_file`, which renders it in the editor — enabling exfiltration of arbitrary file contents to any channel the frontend can reach (clipboard via `read-current-note` deep-link, export, etc.).

*Fix:* In `read_markdown_file`, after resolving the path, verify `fs::canonicalize(&path).starts_with(canonical_workspace_root)` before reading. If the path is outside the active workspace, return `None` (matching the existing silent-no-op convention). The doc comment already states the intent ("no workspace/config-dir containment check at all") — the code needs to match that intent by adding the check.



## Verified clean (no finding)

- **Path traversal in `resolve_within_workspace`** (`workspace_mutations.rs`): canonicalizes root, checks `starts_with`, handles symlinks, dangling links, and non-existing intermediate paths. Well-implemented, with comprehensive tests.
- **`check_unscoped_path_allowed`** (`commands.rs`): rejects outside-workspace and outside-config-dir targets. Tests cover prefix-collision, symlink-escape, and no-root cases.
- **DOMPurify sanitization** (`MarkdownPreview.tsx`): `DOMPurify.sanitize()` applied to all rendered markdown before `dangerouslySetInnerHTML`. `data-mermaid-source` is the only custom attribute allowed. Search highlighting is applied post-sanitization and only inserts static `<span class="search-highlight">` wrappers.
- **Attachment filename sanitization** (`pendingCaptures.ts`): `sanitizeAttachmentFilename` strips path separators, control characters, Windows reserved names, and special characters. Tested.
- **Deep-link capture payload size limit** (`automationCommands.ts`): 32 KiB UTF-8 byte cap via `TextEncoder().encode()`. Tested.
- **Tauri capabilities** (`capabilities/default.json`): `fs:allow-read-text-file` and `fs:allow-write-text-file` are scoped by the Rust-side commands (which enforce workspace containment). `clipboard-manager:allow-write-text` is intentionally broad (user-initiated copy). No `shell`, `http`, or `net` plugins.
- **Rust `clippy`**: zero warnings (verified in CI).
- **No `innerHTML` without sanitization**: all `innerHTML` assignments in production code go through `DOMPurify.sanitize()` first (verified by grep).

## Summary

| ID | Severity | Component | Issue |
|----|----------|-----------|-------|
| S-1 | medium | `tauri.conf.json` | Empty asset protocol scope → arbitrary file read via webview | ✅ **Resolved 2026-10-17** (audit claim was false: `[]` is deny-by-default; `["**"]` was the bug. Fixed the gap: added TS regression test locking the invariant. Commit `d0f22a3`. See correction above.) |
| S-2 | medium | `tauri.conf.json` | `unsafe-eval` in CSP widens XSS surface |
| S-3 | medium | `external_open.rs` | `read_markdown_file` has no path containment check | ✅ **Resolved 2026-10-21** (audit claim was false: reading a user-selected *outside* `.md` file is the feature's intended purpose and is already extension-gated, user-consented, and read-only; its dedicated regression test locks the outside-read behavior. Corrected in the S-3 block above, mirroring S-1.) |
| S-4 | info | `automationCommands.ts` | Frontend path check is non-authoritative (Rust is) — add clarifying comment |
| S-5 | info | `exportNoteHtml.ts` | Image `src` fetch relies on CSP only — add prefix validation |

_No prior security audit ledger exists for this repository. This is the first structured audit._
