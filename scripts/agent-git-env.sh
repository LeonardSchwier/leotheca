# Source this before running git as an agent:
#   source scripts/agent-git-env.sh
# Agents commit as a distinct identity, so history shows who wrote what; the
# Co-Authored-By trailer still names the exact model.
export GIT_AUTHOR_NAME="Claude Code (agent)"
export GIT_AUTHOR_EMAIL="noreply@anthropic.com"
export GIT_COMMITTER_NAME="Claude Code (agent)"
export GIT_COMMITTER_EMAIL="noreply@anthropic.com"
