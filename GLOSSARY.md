# Glossary

The shared vocabulary of Leotheca. Read it at session start (`AGENTS.md`). Use these words in specs, code, commits and handoffs, and do not coin a synonym. The grill stage of `skills/pdlc-playbook.md` extends this file whenever a spec introduces or sharpens a term; a spec records that in its `Glossary:` line (added terms, or `none`), and `scripts/check-rules.mjs glossary` rejects an archived spec without it. One line per term, only facts you can check in the named source. The long form lives in `master-spec.md`, section 3.

## Product

| Term                     | Meaning                                                                                                                           | Source                                 |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Workspace                | One user-selected folder; the UI sometimes says vault.                                                                            | `master-spec.md` section 3             |
| Profile                  | A catalog entry in the global config that points at a workspace.                                                                  | `master-spec.md` section 3             |
| Workspace session        | The monotonic counter `workspaceSession` that tells workspace openings apart.                                                     | `master-spec.md` section 3             |
| Workspace transition     | The staged switch from one workspace to another.                                                                                  | `src/workspace/workspaceTransition.ts` |
| Grant                    | Permission to use a folder: on desktop a root in the native workspace grant registry, on Android a persistable SAF tree URI.      | `master-spec.md` section 7.1           |
| Workspace grant registry | `workspace-grants.json` in the app data dir, filled only by the native `pick_workspace_folder` command or a one-time seed.        | `src-tauri/src/workspace_grants.rs`    |
| Synthetic root           | The constant path `/workspace` that stands for the granted SAF tree on Android.                                                   | `master-spec.md` section 3             |
| Containment              | The check that a path stays inside the allowed root after symlinks are resolved.                                                  | `master-spec.md` section 3             |
| Bridge                   | The storage and native layer behind `workspace/tauriBridge.ts`, with a desktop (Tauri) and an Android (Capacitor) implementation. | `master-spec.md` section 5             |
| Note                     | A Markdown file, normally `.md`.                                                                                                  | `master-spec.md` section 3             |
| Wikilink                 | The link form `[[target#fragment\|label]]`.                                                                                       | `master-spec.md` section 3             |
| Embed                    | The form `![[target]]`, expanded in preview.                                                                                      | `master-spec.md` section 3             |
| Block id                 | The marker `^id` that names a block.                                                                                              | `master-spec.md` section 3             |
| Link index               | In-memory metadata built by reading notes: backlinks, names, aliases, tags, tasks.                                                | `master-spec.md` section 3             |
| Save coordinator         | The debounced, revision-ordered note writer.                                                                                      | `master-spec.md` section 3             |
| Tab kind                 | One of `text`, `image`, `canvas`, `ink` or `pdf`.                                                                                 | `master-spec.md` section 3             |
| Editor group             | The `primary` or `secondary` split pane.                                                                                          | `master-spec.md` section 3             |
| Capture                  | Text or attachments sent into a note through the capture sheet, a deep link or an Android share; the mode is append, new or date. | `master-spec.md` FR-CAP                |
| Pending capture          | A capture that could not be committed and waits in the queue stored under the `localStorage` key `leotheca-pending-captures`.     | `master-spec.md` section 6.14          |
| Bookmark                 | An entry in `.leotheca/bookmarks.json`, either a file or a saved search.                                                          | `master-spec.md` section 6.5           |
| Collection               | A smart collection: a saved query with a view and a sort, stored in `.leotheca/collections.json`.                                 | `master-spec.md` section 6.6           |
| Trash                    | The folder `<workspace>/.trash/`, which mirrors the original relative path.                                                       | `master-spec.md` section 6.10          |
| Automation URL           | A `leotheca://` link such as `read-current-note`, `open-favorites` or `open-note`.                                                | `master-spec.md` section 7.5           |

## Delivery process

| Term             | Meaning                                                                                                                                | Source                            |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Ledger           | The roadmap and handoff files on the `agent-ledger` branch; the only record of who owns what.                                          | `CONSTITUTION.md`                 |
| Roadmap item     | One entry in the ledger roadmap, with an id and a state.                                                                               | `skills/roadmap-workflow.md`      |
| Claim            | A pushed ledger transaction that reserves an item, its touch paths and resources for one session.                                      | `skills/roadmap-workflow.md`      |
| Token            | The unpredictable string a claim returns; a new owner always gets a new one.                                                           | `skills/roadmap-workflow.md`      |
| Lease            | The time limit on a claim (`lease_minutes`), kept alive by renewing every `heartbeat_minutes`.                                         | `CONSTITUTION.md`                 |
| Touch path       | A file or directory prefix a claim reserves; overlapping live claims are rejected.                                                     | `skills/roadmap-workflow.md`      |
| Resource         | A named shared contract, such as `editor-state`, that a claim reserves besides files.                                                  | `skills/roadmap-workflow.md`      |
| Handoff          | The per-task file in `.agents/handoffs` that carries acceptance criteria, evidence and the merge SHA.                                  | `skills/roadmap-workflow.md`      |
| Control worktree | A separate clean worktree used only for ledger commits.                                                                                | `skills/roadmap-workflow.md`      |
| Work branch      | The branch `agent/<item id>/<token prefix>` that carries the code and becomes the pull request.                                        | `skills/pull-request-delivery.md` |
| Spec             | The file `spec/<slug>.md` written before implementation; it moves to `spec/completed/` when the item is archived.                      | `skills/pdlc-playbook.md`         |
| Grill            | Stage 3 of the playbook: questions answered in writing as rulings before building.                                                     | `skills/pdlc-playbook.md`         |
| Evidence trailer | A commit trailer such as `Legal-Check:`, `Review:`, `Database-Review:` or `Dependency-intake:`, checked by `check-rules.mjs trailers`. | `skills/pdlc-playbook.md`         |
