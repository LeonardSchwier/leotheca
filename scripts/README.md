# Agent Helper Scripts

<!-- ==================================================================== -->
<!-- PROJECT VARIABLES - UPDATE THESE FOR YOUR PROJECT -->
<!-- ==================================================================== -->
<!-- REPO_FULL_NAME = LeonardSchwier/leotheca -->
<!-- REPO_NAME = leotheca -->
<!-- MAIN_BRANCH = main -->
<!-- ROADMAP_FILE = ROADMAP.md -->
<!-- CONSTITUTION_FILE = CONSTITUTION.md -->
<!-- SKILLS_DIR = skills -->
<!-- SCRIPTS_DIR = scripts -->
<!-- ==================================================================== -->

This directory contains utility scripts to help coding agents follow the autonomous multi-agent coordination protocol defined in `{SKILLS_DIR}/multi-agent-autonomous-coordination.md`.

## Available Scripts

### 1. `check-abandoned-claims.sh`

**Purpose**: Identify abandoned claims that can be reclaimed by other agents.

**Usage**:
```bash
# Basic usage (4 hour threshold)
./{SCRIPTS_DIR}/check-abandoned-claims.sh

# Custom threshold
./{SCRIPTS_DIR}/check-abandoned-claims.sh --hours 6

# With reclaim mode (shows reclaim procedure)
./{SCRIPTS_DIR}/check-abandoned-claims.sh --reclaim MistralVibe-cloud-ABC123
```

**What it does**:
- Scans {ROADMAP_FILE} for all `🚧` (claimed) items
- Checks each claimed branch for recent activity
- Identifies branches with no commits for the specified hours
- Detects branches that don't exist on remote
- Warns about human-authored recent commits (DO NOT RECLAIM)
- Provides a summary of abandoned claims

**When to use**:
- At the start of every agent session (as part of the integration pass)
- When you suspect a claim might be abandoned
- Before claiming new work to ensure you're not missing reclaimable items

### 2. Using with GitHub API (for CI status checks)

For agents that need to check GitHub Actions CI status (when you can't run CI locally):

```bash
# Check CI status for a specific branch (requires gh CLI)
gh run list --workflow ci.yml --branch agent/your-work-item --limit 5

# Get detailed status of latest run
gh run view --latest --workflow ci.yml --branch agent/your-work-item

# Using curl (if gh CLI not available)
curl -s -H "Authorization: token YOUR_GITHUB_TOKEN" \
  "https://api.github.com/repos/{REPO_FULL_NAME}/actions/runs?branch=agent/your-work-item&per_page=1"
```

## Script Integration with Agent Workflow

### Daily Agent Session Flow

```bash
# 1. Startup
./{SCRIPTS_DIR}/check-abandoned-claims.sh --reclaim YOUR-AGENT-ID

# 2. Find and reclaim abandoned items (if any)
#    ... follow the reclaim procedure shown by the script

# 3. Find next eligible unclaimed item
#    ... check {ROADMAP_FILE} manually

# 4. During implementation, check for abandoned claims periodically
git fetch origin --prune
./{SCRIPTS_DIR}/check-abandoned-claims.sh

# 5. Before shutting down, ensure no abandoned claims remain
./{SCRIPTS_DIR}/check-abandoned-claims.sh --hours 2  # Use shorter threshold
```

### Automated Session Monitoring

For scheduled/autonomous agents, you can run this check every hour:

```bash
while true; do
    git fetch origin {MAIN_BRANCH}
    ./{SCRIPTS_DIR}/check-abandoned-claims.sh
    sleep 3600  # 1 hour
    git fetch origin --prune
done
```

## Creating New Helper Scripts

When you create a new helper script for agent coordination:

1. **Place it in this directory** (`{SCRIPTS_DIR}/`)
2. **Make it executable**: `chmod +x {SCRIPTS_DIR}/your-script.sh`
3. **Add variables section**: Include the PROJECT VARIABLES block at the top
4. **Document it here** in this README
5. **Follow these conventions**:
   - Use clear, descriptive names
   - Include usage examples
   - Handle errors gracefully
   - Use exit codes properly
   - Document assumptions and limitations

## Best Practices for Script Usage

1. **Always fetch latest state first**:
   ```bash
   git fetch origin {MAIN_BRANCH}
   git fetch origin --prune
   ```

2. **Trust the script, but verify**:
   - The scripts provide guidance, but you must verify the results
   - Double-check before reclaiming abandoned claims
   - Always check for human work manually

3. **Handle failures gracefully**:
   - If a script fails, understand why
   - Don't let script failures block your work
   - Document script issues for improvement

4. **Update scripts when protocols change**:
   - If the coordination protocol changes, update the scripts
   - Keep scripts in sync with `{CONSTITUTION_FILE}` and skill files

## Common Patterns

### Pattern 1: Finding Eligible Work

```bash
# Get all unclaimed items (⬜)
grep -n '^\s*-\s*⬜' {ROADMAP_FILE}

# Get all claimed items (🚧)
grep -n '^\s*-\s*🚧' {ROADMAP_FILE}

# Get all agent branches
git branch -r | grep 'origin/agent/'
```

### Pattern 2: Checking Branch Activity

```bash
# Last commit on a specific branch
git log -1 --format='%ai %an %s' origin/agent/some-work-item

# When was a claim made (search commit messages)
git log --all --grep="claim.*work-item" --oneline

# Check if branch exists
git rev-parse --quiet origin/agent/some-work-item && echo "EXISTS" || echo "NOT FOUND"
```

### Pattern 3: Verifying {MAIN_BRANCH} Sync

```bash
# Are you in sync with {MAIN_BRANCH}?
git fetch origin {MAIN_BRANCH}
git status | grep -q "Your branch is up to date" && echo "SYNCED" || echo "NOT SYNCED"

# Force sync (be careful!)
git reset --hard origin/{MAIN_BRANCH}
```

## Portability

**To use these scripts in a new project:**
1. Copy the `{SCRIPTS_DIR}/` directory to your new project
2. Update the PROJECT VARIABLES at the top of each script
3. Ensure the scripts are executable: `chmod +x {SCRIPTS_DIR}/*.sh`
4. Test the scripts work with your project's conventions

The scripts are designed to be **fully portable** across projects by simply updating the variables at the top of each file.