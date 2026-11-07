---
name: database-best-practices
description: Design, change or review any relational schema or embedded database.
version: 1.0.0
author: Leonard Schwier
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [database, schema, normalization, keys, migrations, leotheca]
    related_skills: [persistence-implementation, change-quality-gates, pdlc-playbook]
---

<!--
Variables: SPEC_FILE and the playbook stages come from skills/pdlc-playbook.md.
MIGRATION_RULES = skills/persistence-implementation.md
-->

# Database best practices

Load this only when a change creates or alters a table, index, key, query layer or stored migration. Today the app's notes are plain files in the user's workspace. Any database is a **derived index or cache that can be rebuilt from those files**; if a design makes the database the only copy of user content, record a ruling in the spec and follow `MIGRATION_RULES` for data safety. This skill adds schema rules; it does not replace the persistence skill.

## Schema rules

| Rule | Check before landing |
| --- | --- |
| 1NF: one value per column, no repeating groups or comma-lists | No column stores a list or JSON blob that is filtered or joined on. |
| 2NF/3NF: every non-key column depends on the whole key and nothing but the key | Each fact is stored once. A copied value needs a stated reason. |
| BCNF: every determinant is a candidate key | No hidden functional dependency between non-key columns. |
| Every table has a primary key | Stable, never reused, never meaningful to the user (surrogate or a proven natural key). |
| Every real-world uniqueness rule is a UNIQUE constraint | Not only an application check. Include composite keys, e.g. (workspace_id, path). Normalize case/Unicode before comparing. |
| Foreign keys are declared and enforced | State ON DELETE (RESTRICT, CASCADE or SET NULL) per key and why. Enable enforcement where the engine defaults to off (SQLite needs `PRAGMA foreign_keys = ON` per connection). |
| Constraints live in the schema | NOT NULL, CHECK, and a type that matches the data. Times as UTC, one format. |
| Index what you query | Foreign keys and frequent predicates. Remove indexes nothing uses. Each index costs writes. |

Denormalize only with a measured problem and a ruling in the spec (decision, why, cost if wrong). Name the code that keeps the copy consistent and test it.

## Changing a schema

1. Migrations are versioned, ordered, forward-only and tested against a copy of data written by the previous version. They are irreversible until a restore path is proven.
2. A destructive step (drop, narrowing a type, merging rows) needs a backup or a rebuild-from-files path first, and a test that the failure halfway leaves the prior state intact.
3. A migration must be idempotent on re-run after a crash.
4. Parameterized queries only, never string-built SQL. Treat any path or id from the frontend as untrusted (`change-quality-gates.md`).
5. One transaction per logical change. Two concurrent writers must not corrupt state: test the double-submit.

## Tests that must exist

- The schema applies from empty and from the previous version.
- A duplicate insert violates the UNIQUE constraint (the test asserts the error, not the happy path).
- A foreign-key violation and a cascade behave as declared.
- Empty, very large and non-UTF-8-adjacent inputs (long names, combining characters) are handled.
- The rebuild-from-files path reproduces the same rows, if the database is derived.

## Review questions

Which functional dependencies exist that are not keys? What breaks if two rows differ only in case or normalization? What happens on a crash between two statements? Can the database be deleted and rebuilt without data loss?
