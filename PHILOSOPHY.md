# Philosophy

Three principles govern every decision in this project, from architecture down to a single line of UI copy. When a choice is unclear, it is resolved by these, in order.

## 1. Free and open source, without compromise

The full source is open, under the MIT license, forever. No feature is held back for a paid tier. The app makes no network calls of any kind and runs fully offline, so nothing, telemetry included, ever phones home. No account is required to use the application. A user can read every line of code that touches their notes.

Being open source is not a marketing label here. It is the reason the other two principles are even possible: a local-first tool that respects a user's data only stays honest if anyone can verify that it does.

## 2. Standing on the shoulders of giants

This project does not exist to reinvent markdown, plain-text note-taking, or the conventions the wider note-taking ecosystem has already converged on: wikilinks, YAML frontmatter, a folder of plain files as the unit of storage, a community plugin manifest shape. Where a good convention already exists, this project adopts it instead of inventing a competing one, so that a user's existing notes and habits carry over with as little friction as possible.

This applies to engineering choices as much as file formats: prefer a mature, proven library or pattern over a bespoke one, unless the mature option cannot deliver the quality bar this project needs. Novelty is not a goal. Compatibility and quality are.

## 3. A user's notes belong to the user

Notes are plain markdown files in a folder the user controls, not a database, not a proprietary format, not something that lives only inside this application. Nothing about how a note is stored should ever depend on this application continuing to exist, being installed, or being online. Sync, backup, and versioning are the user's own choice of tool, not something this project provides or gates access behind.

Everything else, including how fast the application feels and how considered its design looks, is downstream of these three principles, not a fourth one alongside them.
