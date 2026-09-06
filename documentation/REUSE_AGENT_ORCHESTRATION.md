<!--
Source repository: LeonardSchwier/leotheca
Source branch: main
Source guide URL: https://github.com/LeonardSchwier/leotheca/blob/main/documentation/REUSE_AGENT_ORCHESTRATION.md
Orchestration assets: CONSTITUTION.md, AGENTS.md, CLAUDE.md,
scripts/agent_ledger.py, scripts/test_agent_ledger.py,
.github/workflows/agent-policy.yml, skills/
-->

# Reuse the autonomous agent orchestration

Use this guide when starting a different repository with Codex, Claude Code, or another coding agent. It installs the coordination system from this repository without copying Leotheca's product decisions.

Give the setup agent this instruction:

> Set up this repository with the reusable autonomous multi-agent orchestration described at https://github.com/LeonardSchwier/leotheca/blob/main/documentation/REUSE_AGENT_ORCHESTRATION.md. Read the guide from that repository, adapt every project-specific variable and command to this repository, preserve this repository's product and security requirements, test the orchestration helper, and commit and push the setup directly to main. Do not copy Leotheca-specific product rules, architecture, release settings, roadmap entries, or application code.

The setup agent must retrieve the complete guide and referenced source files from the source repository. A pasted excerpt or an old clone can miss later fixes.

## Result

After setup, every worker:

1. reads one shared policy;
2. claims one non-overlapping roadmap item with an expiring token;
3. writes and tests the change in an isolated checkout;
4. pushes directly to the new repository's main branch;
5. fixes available CI failures without waiting for a human or a pull-request merge;
6. records a durable checkpoint before it runs out of time; and
7. recovers abandoned work after the lease expires.

The process uses a shared roadmap and ordinary non-forced Git pushes. It coordinates cooperative agents; it is not an access-control system.

## Copy the portable assets

Copy these files from the source repository and keep their relative paths:

| Source asset | Destination | Setup action |
| --- | --- | --- |
| `CONSTITUTION.md` | `CONSTITUTION.md` | Copy, then replace the JSON configuration and remove this repository's product-specific wording. |
| `AGENTS.md` | `AGENTS.md` | Copy and retain as the universal entrypoint. |
| `CLAUDE.md` | `CLAUDE.md` | Copy only if the new repository uses Claude Code; it is a short forwarder to `AGENTS.md`. |
| `scripts/agent_ledger.py` | Same path | Copy unchanged. |
| `scripts/test_agent_ledger.py` | Same path | Copy unchanged. |
| `scripts/README.md` | Same path | Copy and adjust only links/commands if paths change. |
| `.github/workflows/agent-policy.yml` | Same path | Copy, then update its path filters if the adopted files live elsewhere. |
| `skills/README.md` | Same path | Copy and retain as the skill index. |
| `skills/autonomous-roadmap-delivery.md` | Same path | Copy unchanged except configured variable names. |
| `skills/roadmap-workflow.md` | Same path | Copy unchanged except configured variable names. |
| `skills/verification-suite.md` | Same path | Copy and replace every command, runtime, workflow name, and expected job with the new repository's truth. |
| `skills/ci-failure-triage.md` | Same path | Copy unchanged except workflow references. |
| `skills/merge-conflict-resolution.md` | Same path | Copy unchanged except remote/main names. |
| `skills/maintenance-review.md` | Same path | Copy unchanged except product risk areas. |
| `skills/phase-splitting-large-specs.md` | Same path | Copy if the new repository has large specifications. |

Do **not** copy these as defaults:

- `ROADMAP.md`, `CHANGELOG.md`, `documentation/PROJECT_RULES.md`, `documentation/ARCHITECTURE.md`, or `documentation/DECISIONS.md`. They describe this repository and must be authored for the new one.
- Application source, package manifests, native/build configuration, release workflow, distribution configuration, or current CI workflow.
- Domain skills such as persistence, Markdown scanner, packaging submission, or competitor scan instructions. Copy one only after replacing its project paths, commands, external sources, and policy assumptions, then validating that it applies.
- Any existing `agent-state` comments, lease token, checkpoint, branch name, or handoff. They belong only to the source repository.

If the target already has an instruction file, merge the orchestration policy deliberately. Do not overwrite established product constraints, security boundaries, release practices, or contributor documentation.

## Configure the new repository

Create a small project-specific `documentation/PROJECT_RULES.md`. It should state the product purpose, data/security boundaries, allowed external services, supported platforms, language/toolchain choices, release rules, dependency constraints, and any work that autonomous agents must never implement. Put those facts in variables at the top so copying the process again remains simple.

At the top of the copied `CONSTITUTION.md`, replace every field in the fenced JSON configuration:

| Field | Set it to |
| --- | --- |
| `project_name`, `repository` | The new project and `owner/repository`. |
| `remote`, `main_branch` | The actual Git remote and integration branch. |
| `roadmap_file`, `changelog_file`, `skills_dir`, `handoff_dir` | Real repository-relative paths. |
| `product_rules_file`, `architecture_file`, `decisions_file` | New project documents, or create them before agents start. |
| `lease_minutes`, `heartbeat_minutes`, `clock_skew_minutes` | Keep the safe defaults unless the new environment has a measured reason to change them. The lease must exceed heartbeat plus clock skew. |
| `ci_poll_seconds`, `ci_wait_minutes`, `setup_minutes`, `contention_retries` | The new runner's actual CI/setup budget. |

Keep the helper's config markers and fenced JSON exactly once. The helper reads that block and fails closed when it is malformed.

Write a new `ROADMAP.md` with exactly one `## Implemented` heading and an Open section. Start unclaimed work with an exact unique bold title:

```markdown
# Roadmap

## Implemented

## Open

### Bugs

- ⬜ **Short unique task title**: Observable acceptance criteria, expected touch paths, dependencies, and relevant test evidence.

### Features

- ⬜ **Another unique task title**: Observable acceptance criteria and test evidence.
```

The ledger helper reserves a task by its exact title. Avoid duplicate titles. Do not prepopulate claims from the source repository.

## Make verification truthful

Update the top variables and decision table in `skills/verification-suite.md` with commands that exist in the target project. Read its real package/build files and CI workflows first. The commands must cover the target's actual changed surfaces, including generated code, native components, migrations, and packaging where relevant.

Update the copied `agent-policy.yml` path filters to cover the target's instruction, roadmap, helper, test, and skill paths. Keep its test and ledger-validation jobs. If the target's main CI/release workflows rebuild expensive artifacts on every push, add narrow path exclusions only for the target's roadmap and handoff directory, and retain normal CI for every code/config/workflow change.

A target with no hosted CI can use the documented local-verification path. A target with neither runnable checks nor observable CI must not ship untested application behavior. Documentation and orchestration setup can still be verified through the helper tests, link/path checks, and review.

## Validate before enabling workers

From the new repository root:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts -p 'test_agent_ledger.py' -v
python3 scripts/agent_ledger.py --root . list
git diff --check
```

Also validate the changed workflow YAML and run the target's applicable documentation/policy checks. For the first claim, use two disposable local clones and confirm that one of two simultaneous claim pushes wins while the other refreshes and selects different work. The helper's test suite already covers this behavior with a local bare repository; the first live exercise confirms the target's remote permissions and branch setup.

Commit the complete setup directly to the configured main branch. Verify the policy workflow and any relevant target CI for that commit. Do not launch multiple implementation workers until these checks succeed or the verification skill records the exact unavailable capability.

## Operate it

Start every worker with the prompt in `skills/autonomous-roadmap-delivery.md`. Each worker needs its own clone and clean control worktree. They must use the target repository's remote roadmap, token lease, handoff directory, and verification commands.

When the backlog is empty or blocked, workers use `skills/maintenance-review.md` to review bounded historic code/commands, reproduce real defects, add focused tests, repair them through the same claim protocol, and update documentation. They do not create invented feature work just to remain active.

## Update this reusable guide

If an orchestration failure is discovered and the fix belongs in the generic process, improve the source files in this repository, test it, and update this guide when the setup steps change. Do not add target-specific product policy here.
