# Skill: Persistence Implementation

**Purpose:** Ensure every persisted or externally decoded type has a complete, robust write/read/migration/round-trip story with comprehensive validation, testing, and error handling.

**Status:** Derived from CONSTITUTION.md requirements and concrete failure modes observed in commit 07820fa (F07 Phase 2b editor layout persistence).

## When to Use This Skill

Use this checklist **before implementing any feature that:**
- Adds new persistent data to settings files
- Introduces a new settings version
- Decodes external data into domain types
- Implements migration from legacy formats
- Touches workspace settings, global config, or any JSON persistence

## Critical Lessons from F07 Phase 2b Failure Modes

The commit 07820fa demonstrated these specific anti-patterns:

1. **DO NOT describe schema preparation as completed persistence** — Having types, interfaces, and validation functions is not "implementing persistence." Persistence requires the full lifecycle.

2. **DO NOT introduce a new settings version without the complete story** — A coherent write, read, migration, and round-trip implementation must all be present.

3. **DO NOT let runtime validators accept states that TypeScript says are impossible** — Every field in the TypeScript interface must have corresponding validation that proves the same constraints.

4. **DO NOT test only one hand-constructed happy-path object** — Comprehensive test coverage across valid cases, edge cases, invalid inputs, and failure modes is mandatory.

5. **DO NOT use comments as substitutes for unfinished behavior** — Commented-out code or TODO comments are not acceptable substitutes for actual implementation.

6. **DO NOT silently cast partially validated external data into a trusted domain type** — Use proper type guards and validation before any `as` cast.

7. **DO NOT hide missing integrations behind optional callbacks or no-op defaults** — Unless explicitly documented as an intentional API requirement.

8. **DO NOT use fixed sleeps in asynchronous tests** — Wait for observable conditions instead.

## Required Implementation Checklist

### 1. Define Exact Deliverable
- [ ] State precisely what user-visible behavior this change enables
- [ ] Identify which files will store the persisted data
- [ ] Define the exact JSON schema including all required and optional fields
- [ ] Document the version bump strategy and backward compatibility requirements

### 2. Define Scope and Out-of-Scope
- [ ] Explicitly state what this implementation includes
- [ ] Explicitly state what this implementation does NOT include
- [ ] Identify any future work that this enables but doesn't implement

### 3. Define Invariants
For every persisted or decoded type, write down and enforce its invariants:

#### For Editor Layout State (Example from F07):
- [ ] Every required field is present and has the correct type
- [ ] Every path collection contains only strings
- [ ] Group keys and embedded group IDs agree ("primary".id === "primary")
- [ ] The primary group always exists
- [ ] A secondary active or visible group requires a valid secondary group
- [ ] Active paths belong to their group's open tabs or are null
- [ ] Pinned paths are unique and belong to their group's tab paths
- [ ] Pinned tabs occupy the required stable region
- [ ] Ratios are finite and within specification's accepted range
- [ ] Unsupported versions remain identifiable and are never overwritten
- [ ] Legacy settings migrate deterministically
- [ ] Decoding and encoding produce a valid round trip

#### Template for New Persisted Types:
```markdown
## Invariants for [TypeName]

- [ ] Required fields: [list]
- [ ] Optional fields: [list with defaults]
- [ ] Type constraints: [list]
- [ ] Cross-field relationships: [list]
- [ ] Collection constraints: [list]
- [ ] Numeric constraints: [list]
- [ ] String format constraints: [list]
- [ ] Version compatibility: [describe]
```

### 4. Migration and Backward Compatibility
- [ ] Define migration strategy from all previous versions
- [ ] Implement deterministic migration that preserves user intent
- [ ] Ensure migration is idempotent (running twice produces same result)
- [ ] Define backward compatibility for reading older versions
- [ ] Define forward compatibility for ignoring unknown future fields
- [ ] Document the complete version support matrix

### 5. Required Tests

#### 5.1 Positive Tests
- [ ] Valid current-version data
- [ ] Valid legacy data from all supported previous versions
- [ ] All required fields present with valid values
- [ ] All optional fields with valid values
- [ ] Boundary numeric values (min, max, min+1, max-1)
- [ ] Empty but valid collections (empty arrays, empty objects where allowed)

#### 5.2 Negative Tests
- [ ] Missing required fields
- [ ] Wrong primitive types for each field
- [ ] Wrong collection element types (non-string in string array, etc.)
- [ ] Invalid enum values
- [ ] Invalid cross-field combinations
- [ ] Non-finite numeric values (NaN, Infinity, -Infinity)
- [ ] Out-of-range numeric values
- [ ] Malformed strings (null bytes, path traversal, etc.)
- [ ] Invalid JSON syntax
- [ ] Wrong top-level JSON type (array, primitive, null)
- [ ] Unknown future versions (should be preserved, not overwritten)

#### 5.3 Migration Tests
- [ ] Actual legacy-to-current migration
- [ ] Migration preserves all valid data
- [ ] Migration handles missing legacy fields gracefully
- [ ] Migration is deterministic (same input always produces same output)
- [ ] Migration handles edge cases in legacy data

#### 5.4 Round-Trip Tests
- [ ] Serialization followed by decoding (encode → decode → same semantic result)
- [ ] Decode → modify → encode → decode produces expected result
- [ ] Full lifecycle: write → read → use → save → reload

#### 5.5 Integration Tests
- [ ] UI/store lifecycle behavior
- [ ] Concurrent operations and component teardown where promises/callbacks retained
- [ ] Error handling and recovery paths
- [ ] Performance with realistic data sizes

### 6. Implementation Rules

#### 6.1 Structure
- [ ] Prefer small pure functions for validation, normalization, and migration
- [ ] Keep validators at module scope unless closure state is genuinely required
- [ ] Separate validation from normalization and migration
- [ ] Reuse established repository helpers and naming conventions

#### 6.2 Type Safety
- [ ] Avoid `as unknown as` at trust boundaries
- [ ] If a cast is unavoidable, explain why validation proves it safe
- [ ] Use proper type guards that match TypeScript interface exactly
- [ ] Every TypeScript required field must have corresponding runtime validation

#### 6.3 State Management
- [ ] Preserve one canonical state owner
- [ ] Do not create competing sources of truth
- [ ] Ensure persistence operations are atomic and consistent

#### 6.4 Code Quality
- [ ] Match existing style (indentation, naming, error handling)
- [ ] Minimal diff - remove completely when removing, don't leave dead code
- [ ] Use existing conventions and patterns rather than inventing new ones

### 7. Commit Requirements
- [ ] Commits are independently coherent and accurately titled
- [ ] If work is only preparatory, say "prepare" or "add schema groundwork", not "implement persistence"
- [ ] Do not mark a roadmap phase complete when user-visible or lifecycle behavior is deferred
- [ ] Commit message accurately reflects what the code delivers

### 8. Pre-Commit Adversarial Self-Review

Before committing any persistence-related change:

#### 8.1 Commit Message Validation
- [ ] Compare every bullet in proposed commit message with the diff
- [ ] Identify anything the title could cause a reviewer to believe the code does not deliver
- [ ] Ensure commit title is accurate and complete

#### 8.2 Input Validation Testing
- [ ] Construct at least five malformed inputs designed to bypass new validation
- [ ] Verify each malformed input is properly rejected or handled
- [ ] Test boundary conditions and edge cases

#### 8.3 Lifecycle Tracing
- [ ] Trace one legacy object from load through migration, use, save, and reload
- [ ] Trace one current object through the same lifecycle
- [ ] Verify both paths work correctly and produce expected results

#### 8.4 Concurrent Operation Testing
- [ ] Check concurrent operations and component unmount behavior
- [ ] Ensure no memory leaks or race conditions
- [ ] Verify cleanup happens correctly on teardown

#### 8.5 Test Quality Validation
- [ ] Confirm tests assert externally observable behavior, not implementation details
- [ ] Ensure tests don't use timing guesses or fixed sleeps
- [ ] Verify tests cover both happy paths and error paths

#### 8.6 Full Verification Suite
- [ ] Run formatting (Prettier/ESLint)
- [ ] Run type checking (`tsc --noEmit`)
- [ ] Run linting
- [ ] Run focused tests for changed modules
- [ ] Run full test suite
- [ ] Run production build
- [ ] Run version checks
- [ ] Run every repository-required verification command

#### 8.7 Documentation
- [ ] Record honestly what was not verified (physical device, platform-specific behavior, etc.)
- [ ] Document any known limitations or gaps
- [ ] Update relevant documentation and comments

#### 8.8 Final Diff Review
- [ ] Review the final diff again after formatting and generated changes
- [ ] Ensure no unintended changes are included
- [ ] Verify all intended changes are present

### 9. Claim vs Evidence Table

Create a table in commit message or documentation mapping each claim to proving code/test:

```markdown
| Claim | Evidence |
|-------|----------|
| Accepts valid version 2 settings | `decodeWorkspaceSettings` + test line 305-316 |
| Rejects invalid editorLayout | `isValidEditorLayoutState` + negative tests |
| Preserves unknown future fields | Line 556-557 spread + preserve test |
| Migrates v1 to v2 | Migration function + round-trip test |
```

## Template: Persistence Implementation Plan

```markdown
## [Feature] Persistence Implementation

### 1. Exact Deliverable
[What user-visible behavior this enables]

### 2. Out of Scope
[What this explicitly does NOT implement]

### 3. Invariants
[List all invariants for the persisted type]

### 4. Migration Strategy
- From v1: [describe]
- From v2: [describe]
- Version support: [list supported versions]

### 5. File Changes Required
- [ ] Schema definition in [file]
- [ ] Validation function in [file]
- [ ] Migration function in [file]
- [ ] Decode function updates in [file]
- [ ] Encode/save function updates in [file]
- [ ] Integration in [UI/store file]
- [ ] Tests in [test files]

### 6. Test Cases Required
#### Positive: [list]
#### Negative: [list]
#### Migration: [list]
#### Round-trip: [list]
#### Integration: [list]

### 7. Verification Commands
```bash
# Type check
tsc --noEmit

# Lint
eslint .

# Tests
vitest run

# Build
vite build

# Rust (if applicable)
cargo check
cargo test
```

### 8. Known Limitations
[What cannot be verified in this environment]
```

## Quick Reference: Validation Function Template

```typescript
/**
 * Validates [TypeName] according to spec [section] and all invariants.
 * This function must enforce every constraint that the TypeScript interface implies.
 */
function isValidTypeName(value: unknown): value is TypeName {
  // 1. Top-level type check
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  
  const obj = value as Record<string, unknown>;
  
  // 2. Required field validation
  if (typeof obj.requiredField !== "string") return false;
  if (!Array.isArray(obj.arrayField)) return false;
  
  // 3. Type constraints
  if (obj.enumField !== "valid1" && obj.enumField !== "valid2") return false;
  if (typeof obj.numberField !== "number" || !Number.isFinite(obj.numberField)) return false;
  
  // 4. Range constraints
  if (obj.numberField < MIN_VALUE || obj.numberField > MAX_VALUE) return false;
  
  // 5. Collection element validation
  for (const item of obj.arrayField as unknown[]) {
    if (typeof item !== "string") return false;
    if (item.includes("\u0000")) return false; // no null bytes
  }
  
  // 6. Cross-field validation
  if (obj.arrayField.length === 0 && obj.requiredWhenEmpty !== null) return false;
  
  // 7. Structural validation
  if (obj.nestedObject?.id !== obj.nestedObject.id) return false; // identity check
  
  return true;
}
```

## Quick Reference: Test Suite Template

```typescript
describe("isValidTypeName", () => {
  describe("accepts valid inputs", () => {
    it("accepts minimal valid object", () => {
      const valid = { /* minimal valid object */ };
      expect(isValidTypeName(valid)).toBe(true);
    });

    it("accepts complete valid object", () => {
      const valid = { /* complete valid object */ };
      expect(isValidTypeName(valid)).toBe(true);
    });

    it("accepts boundary numeric values", () => {
      expect(isValidTypeName({ numberField: MIN_VALUE })).toBe(true);
      expect(isValidTypeName({ numberField: MAX_VALUE })).toBe(true);
    });
  });

  describe("rejects invalid inputs", () => {
    it("rejects missing required field", () => {
      const invalid = { /* missing required field */ };
      expect(isValidTypeName(invalid)).toBe(false);
    });

    it("rejects wrong type for required field", () => {
      const invalid = { requiredField: 123 };
      expect(isValidTypeName(invalid)).toBe(false);
    });

    it("rejects non-finite numbers", () => {
      expect(isValidTypeName({ numberField: NaN })).toBe(false);
      expect(isValidTypeName({ numberField: Infinity })).toBe(false);
      expect(isValidTypeName({ numberField: -Infinity })).toBe(false);
    });

    it("rejects out-of-range numbers", () => {
      expect(isValidTypeName({ numberField: MIN_VALUE - 1 })).toBe(false);
      expect(isValidTypeName({ numberField: MAX_VALUE + 1 })).toBe(false);
    });

    it("rejects arrays with invalid elements", () => {
      const invalid = { arrayField: [123, "valid"] };
      expect(isValidTypeName(invalid)).toBe(false);
    });

    it("rejects invalid enum values", () => {
      const invalid = { enumField: "invalid-value" };
      expect(isValidTypeName(invalid)).toBe(false);
    });

    it("rejects top-level non-objects", () => {
      expect(isValidTypeName(null)).toBe(false);
      expect(isValidTypeName(undefined)).toBe(false);
      expect(isValidTypeName("string")).toBe(false);
      expect(isValidTypeName(123)).toBe(false);
      expect(isValidTypeName([])).toBe(false);
    });

    it("rejects objects with malformed strings", () => {
      const invalid = { stringField: "path\u0000with\u0000null" };
      expect(isValidTypeName(invalid)).toBe(false);
    });
  });
});

describe("decodeTypeName", () => {
  // Similar structure for decode function tests
});

describe("round-trip", () => {
  it("encodes and decodes valid object unchanged", () => {
    const original = { /* valid object */ };
    const encoded = JSON.stringify(original);
    const decoded = decodeTypeName(encoded);
    expect(decoded).toEqual(original);
  });
});
```

## Verification Checklist (Pre-Commit)

- [ ] All invariants from spec are enforced in validation
- [ ] Every TypeScript required field has runtime validation
- [ ] All numeric fields have finite and range validation
- [ ] All string fields have format validation (path traversal, null bytes, etc.)
- [ ] All collection fields validate their elements
- [ ] Cross-field relationships are validated
- [ ] Migration from all previous versions is implemented
- [ ] Migration is deterministic and idempotent
- [ ] Round-trip encode/decode works
- [ ] Unknown future fields are preserved
- [ ] Legacy data is properly migrated
- [ ] All positive test cases pass
- [ ] All negative test cases properly reject invalid input
- [ ] All migration tests pass
- [ ] All round-trip tests pass
- [ ] Full verification suite passes
- [ ] No `as unknown as` casts at trust boundaries
- [ ] All temporary code/comments are removed
- [ ] Commit message accurately describes delivered functionality

---

**See also:**
- `CONSTITUTION.md` — Project-wide engineering practices and guardrails
- `skills/verification-suite.md` — Exact verification commands to run
- `skills/roadmap-workflow.md` — Claim-to-landing mechanics