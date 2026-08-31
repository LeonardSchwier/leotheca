from pathlib import Path

roadmap = Path("ROADMAP.md")
lines = roadmap.read_text().splitlines()
prefix = "- 🚧 **Audit follow-up F-014: Make one same-commit validation gate authoritative**"
matches = [i for i, line in enumerate(lines) if line.startswith(prefix)]
if len(matches) != 1:
    raise SystemExit(f"expected one F-014 roadmap entry, found {len(matches)}")
del lines[matches[0]]
completed = (
    "- ✅ **Audit follow-up F-014: Make one same-commit validation gate authoritative**: "
    "`.github/workflows/ci.yml` is now the reusable canonical validation contract for an exact commit, requiring "
    "TypeScript checking/lint/tests/build, Rust formatting/Clippy-with-warnings-denied/tests/check, Android JVM "
    "tests and debug APK build plus emulator installation, and an AppImage build/extract/headless-launch smoke. "
    "`.github/workflows/release.yml` calls that workflow for the same commit and publication requires its aggregate "
    "`validation` result; the `always()` aggregate fails skipped, cancelled, or red required jobs. Integration run "
    "`33409547239` on the current-main implementation head passed every required job after the new gate exposed and "
    "fixed one pre-existing frontend lint defect plus a Java-source-level incompatibility in the widget resource "
    "contract test. Emulator installation is not physical Android-device verification, and no physical-device "
    "confirmation is claimed."
)
marker = lines.index("## Implemented") + 1
while marker < len(lines) and lines[marker] == "":
    marker += 1
lines.insert(marker, completed)
roadmap.write_text("\n".join(lines) + "\n")
