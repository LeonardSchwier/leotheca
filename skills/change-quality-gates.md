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

## Review questions

- Does the native/provider shape match the TypeScript/Rust/Java interface exactly?
- Does every value needed for the promised behavior cross the boundary, including staged attachment metadata and cleanup ownership?
- Are one-time reads atomic enough for retry and crash behavior, and is the acknowledgement point intentional?
- Can malformed provider data, an unavailable platform, or a rejected call leak sensitive data or leave corrupt state?
- Do completion notes state what actually ran, what could not run, and what remains unverified?

If a review discovers a defect outside the current claim, seed one deduplicated Open Bug with reproduction, impact, affected paths, and acceptance criteria. Do not quietly broaden the implementation claim.
