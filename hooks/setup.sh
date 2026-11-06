#!/usr/bin/env bash
# Enable the tracked git hooks manually. `npm ci` / `npm install` already does
# this through the `prepare` script (scripts/install-hooks.mjs); use this when
# you installed dependencies with --ignore-scripts or want to see what it does.
set -e

cd "$(git rev-parse --show-toplevel)"
current="$(git config --local --get core.hooksPath || true)"
if [ -n "$current" ] && [ "$current" != "hooks" ]; then
  echo "core.hooksPath is already '$current'; leaving it alone."
  echo "To use these hooks anyway: git config --local core.hooksPath hooks"
  exit 0
fi
git config --local core.hooksPath hooks
chmod +x hooks/pre-commit hooks/commit-msg hooks/pre-push
echo "Git hooks enabled: core.hooksPath=hooks (pre-commit, commit-msg, pre-push)."
echo "Disable again with: git config --local --unset core.hooksPath"
