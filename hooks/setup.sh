#!/usr/bin/env bash
# Install git hooks from the hooks/ directory.
# Run this once after cloning: ./hooks/setup.sh

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOKS_DIR="$REPO_ROOT/hooks"
GIT_HOOKS_DIR="$REPO_ROOT/.git/hooks"

# Only install files that are valid git hook names (no .md, .sh, etc.)
VALID_HOOKS="pre-push pre-commit commit-msg post-merge prepare-commit-msg post-checkout post-merge pre-rebase post-rewrite"

echo "Installing git hooks from $HOOKS_DIR ..."

installed=0
for hook in "$HOOKS_DIR"/*; do
  [ -f "$hook" ] || continue
  name="$(basename "$hook")"

  # Skip non-hook files
  is_valid=0
  for v in $VALID_HOOKS; do
    if [ "$name" = "$v" ]; then is_valid=1; break; fi
  done
  [ "$is_valid" -eq 1 ] || continue

  target="$GIT_HOOKS_DIR/$name"

  # Preserve any existing hooks by backing them up
  if [ -f "$target" ] && [ ! -L "$target" ]; then
    cp "$target" "$target.bak"
    echo "  Backed up existing $name to $name.bak"
  fi

  ln -sf "$hook" "$target"
  echo "  ✓ $name -> $hook"
  installed=$((installed + 1))
done

if [ "$installed" -eq 0 ]; then
  echo "  No valid git hooks found in $HOOKS_DIR"
fi

echo ""
echo "Done. Run ./hooks/setup.sh again after pulling updates."
