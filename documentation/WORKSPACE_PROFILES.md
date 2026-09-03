# Workspace profile architecture

Workspace profiles are app-local pointers to user-owned folders. They do not copy, mirror, sync, or wrap note contents. The profile catalog lives in the global config and stores only a stable profile ID, display metadata, the platform locator needed to reopen the folder, and last-opened ordering metadata.

`src/settings/workspaceProfiles.ts` owns pure validation, naming, icon fallback, locator matching, sorting, and switcher-search helpers. `src/settings/store.ts` owns the `workspaceProfiles` and `activeWorkspaceId` signals plus persisted catalog edits. Profile activation always delegates to the existing `setWorkspacePath` and `workspaceTransitions` coordinator; the profile layer never creates a second workspace-switch authority.

`src/settings/WorkspaceSwitcher.tsx` is the header switcher. It supports search, ArrowUp and ArrowDown navigation, Enter activation, Escape dismissal, focus restoration, add/forget actions, and the fixed viewport positioning needed to escape the narrow-screen toolbar's overflow clipping. Android locator tokens are never rendered or searched as user-visible text.

`src/settings/WorkspaceProfilesSettings.tsx` is the Settings management surface for validated rename and bundled-icon changes. Those metadata edits are serialized with the same ordered global-config writer as recency and active-profile changes, so an older save cannot replace a newer edit. `src/app/CommandPalette.tsx` reaches the same store and switcher control paths for switch, add, and manage actions instead of duplicating activation logic.

Recovery work remains deliberately separate. Relinking an unavailable locator, forgetting the active profile into a no-workspace state, typed transition failure and retry/discard UI, and Android-specific recovery polish belong to the later F20 recovery phase. Until those land, this document describes only the catalog and profile-management layer that is present in production code.
