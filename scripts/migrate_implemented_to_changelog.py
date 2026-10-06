#!/usr/bin/env python3
"""
Migrate completed (✅) items from ROADMAP.md ## Implemented to CHANGELOG.md ## Unreleased.

The agent system requires the ## Implemented heading to exist in ROADMAP.md,
so we keep the heading but move all items to CHANGELOG.
"""

import re
from pathlib import Path

ROOT = Path(__file__).parent.parent
ROADMAP = ROOT / "ROADMAP.md"
CHANGELOG = ROOT / "CHANGELOG.md"

def parse_implemented_items(text):
    lines = text.split('\n')
    impl_start = None
    for i, line in enumerate(lines):
        if line.strip() == '## Implemented':
            impl_start = i
            break
    if impl_start is None:
        raise ValueError("## Implemented section not found")
    
    impl_end = len(lines)
    for i in range(impl_start + 1, len(lines)):
        if lines[i].startswith('## '):
            impl_end = i
            break
    
    section = lines[impl_start + 1:impl_end]
    items = []
    current = None
    for line in section:
        if re.match(r'^- ✅ ', line):
            if current:
                items.append(current)
            current = {'title': line, 'body': []}
        elif current is not None:
            current['body'].append(line)
    if current:
        items.append(current)
    
    return items, impl_start, impl_end

def extract_title(item_line):
    match = re.search(r'\*\*(.+?)\*\*', item_line)
    if match:
        return match.group(1)
    return item_line.lstrip('- ✅ ').strip()

def generate_changelog_entry(item):
    title = extract_title(item['title'])
    
    # Get the description after the title
    desc_match = re.search(r'\*\*.+?\*\*:\s*(.+)', item['title'])
    desc = desc_match.group(1).strip() if desc_match else ""
    
    # Also check the body for "Completed" description
    completed_desc = ""
    for line in item['body']:
        if '**Completed**' in line:
            completed_desc = line.replace('**Completed**', '').strip(': ')
            break
    
    # Use the longer description
    if len(desc) < 20 and completed_desc:
        desc = completed_desc
    
    # Truncate to reasonable length
    if len(desc) > 300:
        desc = desc[:297] + "..."
    
    entry = f"- **{title}**"
    if desc:
        entry += f": {desc}"
    
    return entry

def main():
    roadmap_text = ROADMAP.read_text()
    changelog_text = CHANGELOG.read_text()
    
    items, impl_start, impl_end = parse_implemented_items(roadmap_text)
    
    if not items:
        print("No ✅ items found in ## Implemented")
        return
    
    print(f"Found {len(items)} completed items to migrate")
    
    entries = [generate_changelog_entry(item) for item in items]
    
    # Insert into CHANGELOG ## Unreleased
    cl_lines = changelog_text.split('\n')
    unreleased_idx = None
    for i, line in enumerate(cl_lines):
        if line.strip() == '## Unreleased':
            unreleased_idx = i
            break
    
    if unreleased_idx is None:
        raise ValueError("## Unreleased section not found in CHANGELOG.md")
    
    unreleased_end = None
    for i in range(unreleased_idx + 1, len(cl_lines)):
        if cl_lines[i].startswith('## '):
            unreleased_end = i
            break
    if unreleased_end is None:
        unreleased_end = len(cl_lines)
    
    # Skip trailing blank lines
    insert_idx = unreleased_end
    while insert_idx > unreleased_idx + 1 and cl_lines[insert_idx - 1].strip() == '':
        insert_idx -= 1
    
    new_cl = cl_lines[:insert_idx] + [''] + entries + cl_lines[insert_idx:]
    changelog_text = '\n'.join(new_cl)
    
    # Remove items from ROADMAP (keep the heading)
    rm_lines = roadmap_text.split('\n')
    new_rm = rm_lines[:impl_start + 1] + [''] + rm_lines[impl_end:]
    roadmap_text = '\n'.join(new_rm)
    
    ROADMAP.write_text(roadmap_text)
    CHANGELOG.write_text(changelog_text)
    
    print(f"Migrated {len(entries)} items to CHANGELOG.md ## Unreleased")
    print(f"ROADMAP.md ## Implemented is now empty (heading kept for agent system)")

if __name__ == '__main__':
    main()
