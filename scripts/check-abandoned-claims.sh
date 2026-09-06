#!/bin/bash
# Script: check-abandoned-claims.sh
# Purpose: Help agents identify abandoned claims that can be reclaimed
# Usage: ./scripts/check-abandoned-claims.sh [--hours N] [--reclaim AGENT_ID]

# ====================================================================
# PROJECT VARIABLES - UPDATE THESE FOR YOUR PROJECT
# ====================================================================
REPO_FULL_NAME="LeonardSchwier/leotheca"  # GitHub repository (user/repo)
REPO_SHORT_NAME="leotheca"               # Repository name (no user)
MAIN_BRANCH="main"                      # Default/main branch name
ROADMAP_FILE="ROADMAP.md"               # Roadmap filename
MAINTAINER_NAME="Leonard Schwer"        # Repository owner name
MAINTAINER_EMAIL="leonardschwier"      # Repository owner email (for human work detection)
# ====================================================================

set -euo pipefail

# Default abandonment threshold: 4 hours
ABANDON_HOURS=${1:-4}
RECLAIM_AGENT=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --hours)
            ABANDON_HOURS="$2"
            shift 2
            ;;
        --reclaim)
            RECLAIM_AGENT="$2"
            shift 2
            ;;
        *)
            echo "Unknown argument: $1"
            exit 1
            ;;
    esac
done

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== ABANDONED CLAIM DETECTOR ===${NC}"
echo -e "Repository: ${REPO_FULL_NAME}"
echo -e "Abandonment threshold: ${ABANDON_HOURS} hours"
echo ""

# Get current timestamp
CURRENT_EPOCH=$(date +%s)
ABANDON_EPOCH=$((CURRENT_EPOCH - ABANDON_HOURS * 3600))
ABANDON_DATE=$(date -d @$ABANDON_EPOCH +%Y-%m-%dT%H:%M:%SZ)

echo "Checking for claims abandoned before: $ABANDON_DATE"
echo ""

# Get all agent branches
AGENT_BRANCHES=$(git branch -r | grep 'origin/agent/' | sed 's/origin\///' || true)

if [[ -z "$AGENT_BRANCHES" ]]; then
    echo "No agent branches found."
    exit 0
fi

# Process ROADMAP_FILE to find 🚧 items
echo -e "${BLUE}=== SCANNING ${ROADMAP_FILE} ===${NC}"

# Temporary files
TEMP_ABANDONED=$(mktemp)

# Extract 🚧 items with their claim details
grep -n "^\s*-\s*🚧" "${ROADMAP_FILE}" | while read -r line; do
    LINE_NUM=$(echo "$line" | cut -d: -f1)
    LINE_TEXT=$(echo "$line" | cut -d: -f2-)
    
    # Extract branch name from claim
    BRANCH=$(echo "$LINE_TEXT" | grep -oP 'branch:\s*\Kagent/[^\s,]*' || true)
    AGENT_ID=$(echo "$LINE_TEXT" | grep -oP 'claim:\s*\K[^,]*' || true)
    TIMESTAMP=$(echo "$LINE_TEXT" | grep -oP '\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z' || true)
    
    if [[ -z "$BRANCH" ]]; then
        echo -e "${YELLOW}Line $LINE_NUM: $LINE_TEXT${NC}"
        echo -e "  -> No branch found in claim, skipping..."
        continue
    fi
    
    echo -e "${BLUE}Line $LINE_NUM: $LINE_TEXT${NC}"
    echo -e "  -> Branch: $BRANCH"
    echo -e "  -> Claimed by: $AGENT_ID"
    echo -e "  -> Timestamp: $TIMESTAMP"
    
    # Check if branch exists
    if ! git rev-parse --quiet "origin/$BRANCH" >/dev/null 2>&1; then
        echo -e "  -> ${RED}BRANCH DOES NOT EXIST ON REMOTE${NC}"
        
        # Check when the claim was made (from git log on MAIN_BRANCH)
        CLAIM_COMMIT=$(git log --all --grep="$BRANCH" --oneline --grep="claim.*$AGENT_ID" | head -1 || true)
        if [[ -n "$CLAIM_COMMIT" ]]; then
            CLAIM_EPOCH=$(git log -1 --format='%at' "$CLAIM_COMMIT" || echo "0")
            if [[ $CLAIM_EPOCH -lt $ABANDON_EPOCH ]]; then
                echo -e "  -> ${GREEN}ABANDONED: Claim older than $ABANDON_HOURS hours, no branch exists${NC}"
                echo "$LINE_NUM:$BRANCH:$AGENT_ID" >> "$TEMP_ABANDONED"
            else
                echo -e "  -> Claim too recent to be abandoned"
            fi
        else
            echo -e "  -> Cannot determine claim age, skipping"
        fi
        continue
    fi
    
    # Get last commit time on branch
    LAST_COMMIT_EPOCH=$(git log -1 --format='%at' "origin/$BRANCH" || echo "0")
    LAST_COMMIT_DATE=$(git log -1 --format='%aI' "origin/$BRANCH" || echo "unknown")
    
    echo -e "  -> Last commit: $LAST_COMMIT_DATE"
    
    # Check for recent pushes to MAIN_BRANCH referencing this item
    MAIN_PUSHES=$(git log --since="$ABANDON_DATE" --grep="$BRANCH" --grep="$AGENT_ID" --oneline origin/${MAIN_BRANCH} | wc -l || echo "0")
    
    # Determine if abandoned
    if [[ $LAST_COMMIT_EPOCH -lt $ABANDON_EPOCH ]]; then
        if [[ $MAIN_PUSHES -eq 0 ]]; then
            # Check if author is human (repository owner)
            LAST_AUTHOR=$(git log -1 --format='%an' "origin/$BRANCH" || echo "unknown")
            LAST_EMAIL=$(git log -1 --format='%ae' "origin/$BRANCH" || echo "unknown")
            
            echo -e "  -> Last author: $LAST_AUTHOR ($LAST_EMAIL)"
            
            # Check for human work - repository owner
            if [[ "$LAST_AUTHOR" == "$MAINTAINER_NAME" ]] || [[ "$LAST_EMAIL" == *"@${MAINTAINER_EMAIL}"* ]] || [[ "$LAST_EMAIL" == "$MAINTAINER_EMAIL" ]]; then
                echo -e "  -> ${YELLOW}HUMAN WORK DETECTED - Do not reclaim${NC}"
            else
                echo -e "  -> ${GREEN}ABANDONED: No commits for $ABANDON_HOURS+ hours, no $MAIN_BRANCH activity${NC}"
                echo "$LINE_NUM:$BRANCH:$AGENT_ID" >> "$TEMP_ABANDONED"
            fi
        else
            echo -e "  -> Recent $MAIN_BRANCH activity found, not abandoned"
        fi
    else
        echo -e "  -> Recent commits found, not abandoned"
    fi
    
    echo ""
done

# Show summary
echo -e "${BLUE}=== ABANDONMENT SUMMARY ===${NC}"

ABANDONED_COUNT=$(wc -l < "$TEMP_ABANDONED" 2>/dev/null || echo "0")

if [[ "$ABANDONED_COUNT" -eq 0 ]]; then
    echo "No abandoned claims found."
else
    echo "Found $ABANDONED_COUNT abandoned claim(s):"
    echo ""
    
    while IFS=: read -r line_num branch agent_id; do
        echo -e "  ${RED}Line $line_num: $branch (claimed by: $agent_id)${NC}"
    done < "$TEMP_ABANDONED"
    
    echo ""
    
    if [[ -n "$RECLAIM_AGENT" ]]; then
        echo -e "${GREEN}=== RECLAIM PROCEDURE ===${NC}"
        echo "To reclaim an abandoned claim:"
        echo "1. Verify it's truly abandoned (4+ hours of inactivity)"
        echo "2. Check for human work ($MAINTAINER_NAME as recent author = DO NOT RECLAIM)"
        echo "3. Update $ROADMAP_FILE with your claim, noting it's RECLAIMED from abandoned <old-agent>"
        echo "4. Push claim to $MAIN_BRANCH"
        echo "5. Create your own branch and start fresh implementation"
        echo ""
        echo "Example claim format:"
        echo "  claim: $RECLAIM_AGENT, $(date -u +%Y-%m-%dT%H:%M:%SZ), branch: agent/<new-slug>, RECLAIMED from abandoned <old-agent>"
    fi
fi

# Cleanup
rm -f "$TEMP_ABANDONED"

echo ""
echo -e "${BLUE}=== CHECK COMPLETE ===${NC}"