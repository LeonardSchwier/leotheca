<!--
Variables: CONFIG = ../CONSTITUTION.md; CHECKS = verification-suite.md
SETTINGS_ROOT = src/settings
WORKSPACE_LIFECYCLE = src/workspace/workspaceTransition.ts
SAVE_COORDINATOR = src/workspace/saveCoordinator.ts
BRIDGE = src/workspace/tauriBridge.ts
ARCHITECTURE = configured architecture_file
-->

# Implement persistence without losing data

Use for persisted settings, layouts, bookmarks, caches, migrations, or runtime decoding of external data. Claim the relevant source paths and a shared storage/lifecycle resource before changing them. Read the real schema, readers, writers, startup path, and transition/save coordinators; a codec-only change can leave the actual lifecycle broken.

## Define the contract first

Write acceptance criteria for:

- What data survives which event: restart, note close, workspace switch, crash, failed save.
- Current and supported older versions; explicit handling for a future version.
- Runtime shape validation and bounds: enums, finite numeric values, IDs, duplicate entries, active references, group sizes, file paths.
- What happens to unknown fields, partially invalid entries, corrupt bytes, and missing files.
- The entire round trip: read, decode/migrate, normalize, update state, encode, write, reopen.

State which existing version and storage boundary each field belongs to. Do not claim full layout persistence if only an in-memory model or migration fixture exists.

## Preserve recoverability

A missing file can use defaults. Corrupt or unsupported future data is different: retain original bytes and make its state identifiable. An unrelated autosave, settings toggle, or workspace transition must not silently overwrite it with defaults.

Partial-entry recovery is appropriate only when each retained entry is independently valid and no discarded data is irreplaceable without an explicit recovery path. A derivable index cache may be dropped and rebuilt; user-authored settings/notes need preservation.

Migrate only known formats. Preserve supported unknown fields when the contract promises forward compatibility. Use actual runtime validation; casting parsed JSON to a type does not validate it. Avoid boolean coercions and numeric coercions that silently accept malformed external input.

## Wire and protect the lifecycle

Route writes through existing workspace-scoped boundaries. Capture workspace/note identity when queuing asynchronous work. Verify ownership again when results arrive; an old read/save must not replace another workspace's current state.

Use the existing save/transition coordination and atomic write mechanism. Test flush, cancellation, read failure, write failure, and cleanup paths. Do not mark data saved merely because a write was queued. Do not overwrite a corrupt file before the explicit repair action. A UI field must update the persisted domain model and survive reopen.

For native changes, check both platform implementations and callers. Frontend-only tests cannot prove a new native mutation contract.

## Tests that establish the claim

Use focused tests for relevant cases, then the verification skill's applicable suite:

| Boundary | Prove |
| --- | --- |
| Decode | Valid current data; malformed primitives/objects; invalid individual fields; missing file; future version. |
| Migrate | Representative old fixtures; no data loss; new required defaults; unsupported version left intact. |
| Normalize | Invalid active IDs repaired consistently, stable ordering, duplicate rules, bounds and empty state. |
| Round trip | Realistic data retains values and promised unknown fields through encode/decode. |
| Startup/reopen | Actual startup path loads persisted data and the UI/caller observes it. |
| Updates/save | User change reaches the encoder and real write boundary; reopen observes it. |
| Failure/recovery | Read/write failure, corrupt source preservation, explicit repair, retry without false success. |
| Concurrency | Out-of-order reads/writes, workspace switches, superseded operations, teardown. |

For a regression, retain the test and remove only the fix to prove the intended failure, then restore and pass. Assert exact values, identity, byte preservation, and call ordering where they are the contract. Do not test only that a helper was called or the number of tests increased.

## Review before finishing

Trace one normal restart and one failure/switch scenario across real callers. Compare every acceptance claim with executable evidence. Check that documentation describes what is shipped and that deferred scope has a separate item.

Keep the evidence table short: claim, test/path, observed result, limitation. Use verification-suite.md's limited-environment decision table. If persistence mutation/migration behavior cannot be tested, keep it on the checkpoint branch and release with a handoff; it is not eligible for deferred landing.
