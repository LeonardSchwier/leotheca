<!--
Fill every section; the Rules workflow (scripts/check-rules.mjs prbody) fails a
pull request whose body lacks the headings Summary, Evidence and Merge danger.
The squash commit is built from this body, so write it for a reader of the log.
Delete these comments or leave them, they are ignored.
-->

## Summary

What changed and why, in a few lines. Name the `ROADMAP.md` item and its id.

## Evidence

Before and after: the failing output or behaviour before the change, the passing output after it, or the exact command and what it printed (for example `npm run verify`). A count of tests is not evidence. For docs-only changes name the check that proves the links and format hold.

## Merge danger

- Door: one-way (cannot be undone by reverting: data or file format migration, published release, deleted data, changed public contract) or two-way (a revert restores the previous state).
- Blast radius: what breaks, and for whom, if this is wrong (one feature, one platform, every user, the pipeline itself).
- Rollback: the command or step that undoes it.

## Evidence trailers

End the body with the trailers the changed paths require, one per line, nothing after them (see [`hooks/README.md`](https://github.com/LeonardSchwier/leotheca/blob/main/hooks/README.md)):

```text
Co-Authored-By: <agent name and version> <noreply address>
Legal-Check: <result>
Review: <reviewer model or tool>: <result>
Database-Review: <result>
Dependency-intake: <package>: <license, maintainer, reason>
```

Keep only the lines that apply. `Co-Authored-By:` is always required for an agent.
