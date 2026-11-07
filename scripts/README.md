<!-- Variables: CONFIG = ../CONSTITUTION.md; WORKFLOW = ../skills/roadmap-workflow.md -->

# Agent helper

`agent_ledger.py` uses Python 3.9+ and Git. It edits only the configured roadmap in a clean, explicitly selected control checkout. It never commits, pushes, renews in the background, or decides that an implementation is tested.

```sh
python3 scripts/agent_ledger.py --help
python3 scripts/agent_ledger.py --root /path/to/control list
python3 -m unittest discover -s scripts -p 'test_agent_ledger.py' -v
```

Use [the transaction runbook](../skills/roadmap-workflow.md) for claim, renew, check, observe, release, block, and finish. Every mutation needs a fresh remote-main base, normal push, and confirmation. Output is JSON; success exit 0 means only that the local operation succeeded. Safety errors use exit 2.

The adjacent `agent-state` JSON comment is authoritative per-item metadata. Its visible Agent line is a generated summary. Do not hand-edit tokens or extend legacy grace windows. The helper rejects malformed/duplicate metadata, stale tokens, path/resource conflicts, and dirty control trees. It warns about unstructured legacy claims because their file/semantic overlap requires inspection.

The old abandoned-claim shell script has been removed. It relied on branch activity and commit authors, which cannot establish agent liveness. The new tests exercise actual competing fast-forward pushes to a local bare repository and lease expiry without any work branch.

Other scripts in this directory remain release/version tooling; consult their source and the package scripts before changing them.
