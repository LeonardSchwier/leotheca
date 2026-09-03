from pathlib import Path

path = Path("ROADMAP.md")
text = path.read_text()
old = "- ⬜ **F04 Phase 5e2: Preview on-block hover/focus/long-press copy affordance**"
new = "- 🚧 **F04 Phase 5e2: Preview on-block hover/focus/long-press copy affordance**"
if text.count(old) != 1:
    raise SystemExit("expected exactly one open F04 Phase 5e2 heading")
path.write_text(text.replace(old, new))

# exact-edit helper
