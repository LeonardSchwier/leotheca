from pathlib import Path

roadmap = Path("ROADMAP.md")
text = roadmap.read_text()
open_prefix = "- 🚧 **F20 Phase 2a: profile rename/icon editing, searchable keyboard switcher, and management entry points**"
lines = text.splitlines(keepends=True)
matches = [i for i, line in enumerate(lines) if line.startswith(open_prefix)]
if len(matches) != 1:
    raise SystemExit(f"expected exactly one F20 Phase 2a open entry, found {len(matches)}")
lines.pop(matches[0])
implemented = (
    "- ✅ **F20 Phase 2a: profile rename/icon editing, searchable keyboard switcher, and management entry points** "
    "(claim: ChatGPT-GPT-5.6-Sol-automation-20260903T0742Z, branch: agent/f20-phase2a-profile-editing-switcher, "
    "spec: `spec/leotheca-workspace-profiles-sdd.md`): Workspace profiles can now be renamed with validated non-empty names and assigned one of the bundled icons. Profile metadata edits persist through the ordered global-config writer so stale saves cannot replace newer edits. The header switcher supports local search, ArrowUp/ArrowDown/Enter/Escape operation, focus restoration, Android-safe locator presentation, and fixed viewport positioning outside narrow-toolbar clipping. Settings includes a Workspace profiles management surface and the command palette can open the switcher, add a workspace, or open workspace management, all through the existing authoritative profile/store/transition paths. Reconciliation head `d28016909c68bcfa0df4a8e94f27fe5adf029ded` passed the required frontend, Rust, Android emulator, and AppImage validation before final bookkeeping. Phase 2b remains open for relink/access recovery, active-profile forget, typed transition errors, Android recovery polish, and its required real-platform verification.\n"
)
header = "## Implemented\n"
joined = "".join(lines)
if implemented not in joined:
    if header not in joined:
        raise SystemExit("Implemented header not found")
    joined = joined.replace(header, header + "\n" + implemented, 1)
roadmap.write_text(joined)

changelog = Path("CHANGELOG.md")
change = changelog.read_text()
bullet = "- Workspace profiles can now be renamed and assigned a built-in icon. The workspace switcher is searchable and keyboard-operable, Settings has a Workspace profiles management section, and the command palette can switch, add, or manage workspaces without bypassing the existing workspace-transition coordinator.\n"
if bullet not in change:
    marker = "## Unreleased\n"
    if marker not in change:
        raise SystemExit("Unreleased changelog header not found")
    change = change.replace(marker, marker + "\n" + bullet, 1)
changelog.write_text(change)

Path("documentation/WORKSPACE_PROFILES.md").write_text("""# Workspace profile architecture

Workspace profiles are app-local pointers to user-owned folders. They do not copy, mirror, sync, or wrap note contents. The profile catalog lives in the global config and stores only a stable profile ID, display metadata, the platform locator needed to reopen the folder, and last-opened ordering metadata.

`src/settings/workspaceProfiles.ts` owns pure validation, naming, icon fallback, locator matching, sorting, and switcher-search helpers. `src/settings/store.ts` owns the `workspaceProfiles` and `activeWorkspaceId` signals plus persisted catalog edits. Profile activation always delegates to the existing `setWorkspacePath` and `workspaceTransitions` coordinator; the profile layer never creates a second workspace-switch authority.

`src/settings/WorkspaceSwitcher.tsx` is the header switcher. It supports search, ArrowUp and ArrowDown navigation, Enter activation, Escape dismissal, focus restoration, add/forget actions, and the fixed viewport positioning needed to escape the narrow-screen toolbar's overflow clipping. Android locator tokens are never rendered or searched as user-visible text.

`src/settings/WorkspaceProfilesSettings.tsx` is the Settings management surface for validated rename and bundled-icon changes. Those metadata edits are serialized with the same ordered global-config writer as recency and active-profile changes, so an older save cannot replace a newer edit. `src/app/CommandPalette.tsx` reaches the same store and switcher control paths for switch, add, and manage actions instead of duplicating activation logic.

Recovery work remains deliberately separate. Relinking an unavailable locator, forgetting the active profile into a no-workspace state, typed transition failure and retry/discard UI, and Android-specific recovery polish belong to the later F20 recovery phase. Until those land, this document describes only the catalog and profile-management layer that is present in production code.
""")
