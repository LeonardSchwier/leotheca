<!-- Variables: POLICY = ../CONSTITUTION.md; FRONTEND = ../src; ANDROID = ../android; NATIVE = ../src-tauri -->

# Boundary and sensitive-data quality gates

Use for a changed platform bridge, IPC command, native plugin method, persisted payload, or path that carries user-provided or privileged data. Read the constitution and relevant architecture before editing; this skill adds evidence steps and does not replace the verification suite.

## Before implementation

Write the complete payload contract: producer, transport, consumer, optional fields, size limits, ownership/cleanup, and each platform’s unavailable or no-op behavior. Identify the public bridge methods and every test fake or mock that declares them. Mark which data must never appear in logs, stored error text, user-visible errors, or telemetry.

## Required checks

1. Trace one success and one failure path from native/provider input to the observable frontend or stored result. Confirm that every produced field is either consumed, deliberately discarded with an approved reason, or rejected before state changes.
2. Add focused tests for payload normalization, missing/invalid data, provider rejection, platform fallback, and any destructive read/acknowledgement behavior. If a bridge gains a method, update the typed fake/mock in the same commit and exercise the method through the exported wrapper.
3. For sensitive values, use unique sentinel data in a focused test or review and assert it does not reach logging, persisted diagnostics, or an unsafe error surface. Never log raw provider exceptions when they can include caller-controlled data.
4. Run the project’s declared static/type and focused-test commands before integration. Record the actual command, tested SHA/tree, and result in the handoff. A later CI repair is a finding to resolve, not proof the original delivery was verified.
5. Treat every value that crosses from the webview/frontend into a native command, IPC handler, or platform plugin method as untrusted input, regardless of what today’s callers happen to pass. If that value identifies a filesystem path, URI, or file handle, the native side must check it against an explicit allow-list — the active workspace root(s), the app’s own config/data directory, or another narrow, named boundary — and reject anything outside it by default, before performing a read, write, create, rename, or delete. “This command is only ever called with a safe value today” is not itself a boundary: a compromised or buggy webview can invoke any registered command directly with any argument (2026-09-22 `write_text_file`/`write_binary_file` containment fix, `rm-dfd60513a2eb352c`, and the unscoped sibling commands it left for a follow-up). When a command’s path/URI argument shape changes or gains a containment check, re-check every other exported command in the same file/plugin with a similarly-shaped argument for the same gap — that moment is the cheapest time to catch a sibling, not a later separate audit.

## Review questions

- Does the native/provider shape match the TypeScript/Rust/Java interface exactly?
- Does every value needed for the promised behavior cross the boundary, including staged attachment metadata and cleanup ownership?
- Are one-time reads atomic enough for retry and crash behavior, and is the acknowledgement point intentional?
- Can malformed provider data, an unavailable platform, or a rejected call leak sensitive data or leave corrupt state?
- Does every path/URI/file-handle argument this command (or a sibling it shares a file/plugin with) accepts get checked against an explicit allow-list before use, rather than trusted because of who currently calls it?
- Do completion notes state what actually ran, what could not run, and what remains unverified?

If a review discovers a defect outside the current claim, seed one deduplicated Open Bug with reproduction, impact, affected paths, and acceptance criteria. Do not quietly broaden the implementation claim.
