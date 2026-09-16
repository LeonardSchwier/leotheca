import { batch, computed, effect, signal, useSignal } from "@preact/signals";
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { ComponentType } from "preact";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { getCurrent as getCurrentDeepLinkUrls, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { writeText as writeClipboardText } from "@tauri-apps/plugin-clipboard-manager";
import { Sidebar } from "../workspace/Sidebar";
import { TabBar } from "../workspace/TabBar";
import { MarkdownEditor } from "../editor/MarkdownEditor";
import { MarkdownPreview } from "../editor/MarkdownPreview";
import { FrontmatterPropertiesPanel } from "../editor/FrontmatterPropertiesPanel";
import { isNoteReadOnlyActive, setNoteReadOnly } from "../editor/noteReadOnly";
import { SpeechRecognitionButton } from "../editor/SpeechRecognitionButton";
import { ImageViewer } from "../editor/ImageViewer";
import { ImageViewerOverlay } from "../editor/ImageViewerOverlay";
import { PdfViewer } from "../pdf/PdfViewer";
import { CaptureSheet, captureSheetOpen, openCaptureSheet } from "./CaptureSheet";
import { PendingCapturesPanel, initPendingCaptures, processAndroidPendingShareData } from "../capture";
import { classifyWorkspaceResource } from "../workspace/types";
import { CanvasView } from "../canvas/CanvasView";
import { InkView } from "../ink/InkView";
import {
  activeGroupTab,
  activeTab,
  activeTabPath,
  closeAllUnpinnedTabs,
  closeOtherTabs,
  closeSecondaryGroup,
  focusGroup,
  focusTab,
  closeTab,
  clearTabSaveError,
  editorLayout,
  markTabSaved,
  markTabSaveError,
  moveActiveTabToOtherGroup,
  moveTabWithinGroup,
  openDocuments,
  openInOtherGroup as openPathInOtherGroup,
  openOrFocusTab,
  openTabs,
  pinTab,
  renameOpenTab,
  reorderTabWithinGroup,
  resetSplitRatio,
  secondaryActiveTabPath,
  secondaryOpenTabs,
  setCompactVisibleGroup,
  setGroupViewMode,
  setSplitRatio,
  splitRight,
  unpinAndCloseTab,
  unpinTab,
  updateTabContent,
} from "../workspace/store";
import { SplitSeparator } from "../editorGroups/SplitSeparator";
import { SecondaryEditorPane } from "../editorGroups/SecondaryEditorPane";
import { CompactGroupSwitcher } from "../editorGroups/CompactGroupSwitcher";
import { onExternalFileOpen, readTextFile, takePendingExternalFile } from "../workspace/tauriBridge";
import { isPathWithinWorkspace } from "../workspace/paths";
import { beginFileOpenAuthority, isCurrentFileOpen } from "../workspace/fileOpenAuthority";
import {
  addWorkspaceFromPath,
  externalFileOpenEnabled,
  initSettings,
  settingsLoaded,
  settingsPanelOpen,
  updateWorkspaceSettings,
  viewMode,
  workspacePath,
  workspaceSession,
  workspaceSettings,
  waitForSettingsLoaded,
} from "../settings/store";
import { ExternalFileView } from "./ExternalFileView";
import type { ViewMode } from "../settings/workspaceSettings";
import { SettingsPanel } from "../settings/SettingsPanel";
import { WelcomeDialog } from "../settings/WelcomeDialog";
import { WorkspaceTransitionBanner } from "../settings/WorkspaceTransitionBanner";
import { WorkspaceSwitcher } from "../settings/WorkspaceSwitcher";
import { BacklinksPanel } from "../linking/BacklinksPanel";
import { OutlinePanel } from "../outline/OutlinePanel";
import { OutlineLiveRegion } from "../outline/OutlineLiveRegion";
import { announceOutline, headingNavigationAnnouncement } from "../outline/outlineAnnouncements";
import { outlineInsertRequest, outlineRevealRequest, requestOutlineReveal } from "../outline/outlineNavigation";
import {
  blockLinkCopyRequest,
  blockLinkCreateRequest,
  requestCopyBlockLinkAtCursor,
  requestCreateBlockLinkAtCursor,
} from "../editor/blockLinkRequest";

import { requestTableCommand, tableCommandRequest } from "../editor/tableCommandRequest";
import { HeadingBreadcrumbs } from "../outline/HeadingBreadcrumbs";
import { nextSplitAuthority, type SplitAuthority } from "../outline/splitAuthority";
import { scanHeadings } from "../markdown/headings";
import { scanBlockIds } from "../markdown/blocks";
import { resolveBlockFragment, resolveHeadingFragment } from "../linking/wikiResolver";
import {
  linkIndexBuilding,
  linkIndexUnreadablePaths,
  rebuildLinkIndex,
  resetLinkIndexCache,
} from "../linking/store";
import { BookmarksPanel } from "../bookmarks/BookmarksPanel";
import { addFileBookmark, bookmarks, loadBookmarks, removeBookmark } from "../bookmarks/store";
import { resetWorkspaceTree } from "../workspace/fileTreeStore";
import { TagsPanel } from "../tags/TagsPanel";
import { TaskHubPanel } from "../tasks/TaskHubPanel";
import { replaceIndexedTasks } from "../tasks/taskMutation";
import { CollectionsPanel } from "../collections/CollectionsPanel";
import { loadCollections } from "../collections/collectionStore";
import {
  createNoteFromTemplate,
  createCanvasQuick,
  createInkQuick,
  createNoteQuick,
  listTemplates,
  renameEntry,
  runSearch,
  selectedDir,
  type NoteTemplate,
} from "../workspace/fileTreeStore";
import { NamePrompt } from "../workspace/NamePrompt";
import { useRenamePreview } from "../refactor/useRenamePreview";
import { RenamePreviewDialog } from "../refactor/RenamePreviewDialog";
import { TemplatePicker } from "../workspace/TemplatePicker";
import { parseAutomationUrl } from "./automationCommands";
import { useResizableSidebar } from "./useResizableSidebar";
import "./resizable-sidebar.css";
import { GraphView } from "../graph/GraphView";
import { MarkdownHelpDialog } from "./MarkdownHelpDialog";
import { CommandPalette, type Command } from "./CommandPalette";
import { nextUiZoom, zoomActionForKey, zoomActionForWheel } from "./zoomControls";
import { isNarrowViewport } from "./responsiveLayout";
import { classifyLayout, showsActivityRail } from "./layout/adaptiveLayout";
import { ActivityRail } from "./layout/ActivityRail";
import { createSaveCoordinator } from "../workspace/saveCoordinator";
import { workspaceTransitions } from "../workspace/workspaceTransition";
import { EmptyEditorState } from "./EmptyEditorState";
import {
  BookmarkIcon,
  BookmarkFilledIcon,
  TagIcon,
  GraphIcon,
  TaskIcon,
  CollectionsIcon,
  OutlineIcon,
  SourceModeIcon,
  SplitModeIcon,
  PreviewModeIcon,
  CommandPaletteIcon,
  MenuIcon,
  CloseIcon,
  SwapGroupsIcon,
  SettingsIcon,
} from "./shellIcons";

// Workspace-scoped stores participate in the same generation-authoritative
// transition as settings and autosave. Registration is synchronous at module
// initialization, before App's initSettings effect or any folder picker can
// publish a workspace. This replaces the old post-render session effects.
workspaceTransitions.registerReset(resetWorkspaceTree);
workspaceTransitions.registerReset(resetLinkIndexCache);


const VIEW_MODE_ICONS: Record<ViewMode, ComponentType> = {
  source: SourceModeIcon,
  split: SplitModeIcon,
  preview: PreviewModeIcon,
};

const bookmarksOpen = signal(false);
const tagsOpen = signal(false);
const taskHubOpen = signal(false);
const collectionsOpen = signal(false);
const graphOpen = signal(false);
// Unlike bookmarksOpen/tagsOpen, this does not swap out the file tree: the
// outline is per-note context like BacklinksPanel, not a workspace-wide
// list, so it renders alongside the sidebar's primary content instead of
// replacing it.
const outlineOpen = signal(false);
const markdownHelpOpen = signal(false);
const commandPaletteOpen = signal(false);
const sidebarOpen = signal(!Capacitor.isNativePlatform());

// RTL Phase 2: Derived signal for workspace-level RTL mode
const rtlWorkspaceEnabled = computed(() => workspaceSettings.value.rtlWorkspaceEnabled);

function toggleSidebarPanel(panel: typeof bookmarksOpen): void {
  const next = !panel.value;
  bookmarksOpen.value = false;
  tagsOpen.value = false;
  taskHubOpen.value = false;
  collectionsOpen.value = false;
  panel.value = next;
  if (next) sidebarOpen.value = true;
}

export function App() {
  const tick = useSignal(0);
  const refresh = useCallback(() => {
    tick.value++;
  }, [tick]);
  // F07 Phase 4, spec 8.1's "available-width rule": whether two groups can
  // render side by side. Tracks window.innerWidth reactively (the existing
  // isNarrowViewport checks elsewhere in this file read it once, at an
  // event's own call time, which doesn't re-render on its own) via the
  // same NARROW_VIEWPORT_MAX_WIDTH breakpoint responsiveLayout.ts already
  // defines. A disclosed simplification of the spec's own rule: measures
  // the whole viewport, not the document-area width after the sidebar and
  // Inspector are subtracted, and does not factor a UX-01 layout mode or
  // platform text-scaling threshold, neither of which exists in this
  // codebase yet.
  const viewportWidth = useSignal(window.innerWidth);
  useEffect(() => {
    function onResize() {
      viewportWidth.value = window.innerWidth;
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [viewportWidth]);
  const isCompactLayout = isNarrowViewport(viewportWidth.value);
  // UX-01 spec section 12.1/13.2, Phase 2 (Wide/Expanded first): reuses the
  // same viewportWidth signal above rather than a second subscription, per
  // section 24.3's "one match-media subscription per application."
  const layoutClass = classifyLayout(viewportWidth.value);
  const showActivityRailNav = showsActivityRail(layoutClass);
  // Matches the sidebar-content ternary chain's own precedence below
  // exactly (tags > Task Hub > Collections > bookmarks > Files), so the
  // rail's selected destination always agrees with what's actually shown.
  // Task Hub and Collections have no Activity Rail slot in the base spec
  // (see ActivityRailProps' own doc comment), so the rail shows no
  // selection while either is open rather than a misleading one.
  const activeNavDestination: "files" | "bookmarks" | "tags" | null = !sidebarOpen.value
    ? null
    : tagsOpen.value && workspaceSettings.value.tagsEnabled
      ? "tags"
      : taskHubOpen.value || (collectionsOpen.value && workspaceSettings.value.collectionsEnabled)
        ? null
        : bookmarksOpen.value
          ? "bookmarks"
          : "files";
  // Spec 8.2: in compact layout, only the switcher's currently-selected
  // group is mounted (never both at once); outside compact layout, both
  // panes and the separator render as before, unaffected by
  // compactVisibleGroupId. Switching groups here never touches
  // activeGroupId, so it does not affect which group a global command or a
  // new-note open targets.
  const showPrimaryPane =
    !editorLayout.value.splitEnabled ||
    !isCompactLayout ||
    editorLayout.value.compactVisibleGroupId === "primary";
  const showSecondaryPane =
    editorLayout.value.splitEnabled &&
    (!isCompactLayout || editorLayout.value.compactVisibleGroupId === "secondary");
  const showSeparator = editorLayout.value.splitEnabled && !isCompactLayout;
  const rootPath = workspacePath.value;
  const session = workspaceSession.value;
  const save = useMemo(() => createSaveCoordinator({
    // Keeps the Task Hub's own `tasksByPath` projection current for an
    // ordinary editor edit (typing a task's checkbox open/closed, or any
    // other edit to a task line), not just a toggle driven by the Task
    // Hub's own checkbox: without this, a note saved while the panel is
    // already open never updates it until the panel is closed and
    // reopened (which forces a full rebuildLinkIndex). The tab's own
    // current content is read here rather than threaded through the
    // coordinator's callback signature, since it is already the same
    // content this save just wrote (a still-open tab is the only source
    // `save.change` ever writes from).
    onSaved: (path: string) => {
      markTabSaved(path);
      clearTabSaveError(path);
      const content = openTabs.value.find((tab) => tab.path === path)?.content;
      if (content !== undefined) replaceIndexedTasks(path, content);
      refresh();
    },
    onError: (path: string, error: string) => markTabSaveError(path, error),
  }), [refresh]);
  const [tabRename, setTabRename] = useState<{ path: string; name: string } | null>(null);
  const [tabRenameError, setTabRenameError] = useState<string | null>(null);
  const renamePreview = useRenamePreview();
  const [templatePicker, setTemplatePicker] = useState<{
    targetDir: string;
    templates: NoteTemplate[];
  } | null>(null);
  // ROADMAP.md's "Open a Markdown file from outside the workspace via OS
  // file association": read-only scratch-view state for a note opened
  // this way whose path resolves outside every currently open workspace.
  const [externalFile, setExternalFile] = useState<{ path: string; name: string; content: string } | null>(null);
  const [externalFileOpeningWorkspace, setExternalFileOpeningWorkspace] = useState(false);
  const [externalFileWorkspaceError, setExternalFileWorkspaceError] = useState<string | null>(null);
  // Fullscreen image viewer overlay state
  const [imageOverlay, setImageOverlay] = useState<{ src: string; alt: string } | null>(null);
  const handleImageClick = useCallback((src: string, alt: string) => {
    setImageOverlay({ src, alt });
  }, []);
  const handleCloseImageOverlay = useCallback(() => {
    setImageOverlay(null);
  }, []);
  // Global keyboard shortcut for Quick Capture (Cmd/Ctrl+Shift+C)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "c" && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault();
        openCaptureSheet();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);
  // Source-mode cursor position for HeadingBreadcrumbs (spec section 7.3).
  // MarkdownEditor itself reports this; it is not rendered at all in a
  // preview-only view mode or for a non-text tab, so this can go stale
  // while either is true. HeadingBreadcrumbs is only ever given this value
  // guarded by the same conditions (see its render below), so a stale
  // value is never actually read as if it reflected the current pane.
  const [cursorPos, setCursorPos] = useState<number | null>(null);
  // Preview-mode counterpart to cursorPos (spec section 7.4): the index,
  // among MarkdownPreview's own rendered heading elements, that has
  // crossed the reading threshold.
  const [previewActiveIndex, setPreviewActiveIndex] = useState<number | undefined>(undefined);
  // Split-mode breadcrumb authority (spec section 7.5): which of
  // cursorPos/previewActiveIndex above HeadingBreadcrumbs should actually
  // follow while both panes are visible. Only consulted when viewMode is
  // "split" (see the activeSource prop below); fed by every real Source
  // cursor/keyboard action and every real, direct Preview interaction
  // regardless of the current view mode, so it already reflects the
  // right pane the moment the user switches into Split. See
  // src/outline/splitAuthority.ts for the transition rule itself.
  const [splitAuthority, setSplitAuthority] = useState<SplitAuthority>("source");

  useEffect(() => {
    const p = initSettings();
    initPendingCaptures();
    // F05: Process any pending Android share intent data
    void processAndroidPendingShareData();
    if (p) {
      p.catch(() => {
        settingsLoaded.value = true;
      });
    } else {
      settingsLoaded.value = true;
    }
  }, []);

  effect(() => {
    if (bookmarksOpen.value && workspacePath.value) void loadBookmarks(workspacePath.value);
  });

  effect(() => {
    if (collectionsOpen.value && workspaceSettings.value.collectionsEnabled && workspacePath.value)
      void loadCollections(workspacePath.value);
  });

  effect(() => {
    const root = document.documentElement;
    if (!workspacePath.value || !workspaceSettings.value.themesEnabled) {
      root.removeAttribute("data-accent");
      return;
    }
    root.setAttribute("data-accent", workspaceSettings.value.accentColor);
  });

  const { width: sidebarWidth, onDragStart } = useResizableSidebar();

  const handleOpenFile = useCallback(
    /**
     * `options.headingKey`/`options.blockId` (F04 Phase 1 for headings,
     * see MarkdownPreview.tsx's `onOpenFile` doc comment; F04 Phase 3a
     * for blocks) is the raw heading text or block id a resolved
     * cross-note `[[Note#Heading]]`/`[[Note#^block-id]]` Preview link
     * named. It's resolved here, against the content this function just
     * read to open the tab, rather than in MarkdownPreview: this is the
     * one place that already reads the target note's fresh content, and
     * the note-open (`openOrFocusTab`) and the outline reveal request are
     * batched into one signal update together so MarkdownEditor's
     * `reveal` effect (keyed only on the `reveal` prop's identity) never
     * fires against the *previous* note's still-displayed content in
     * between. A target that turns out missing or ambiguous in the
     * freshly-read note is a silent no-op reveal: the note still opens,
     * matching spec section 10.4's "open the note if its path still
     * resolves."
     *
     * N-002: `beginFileOpenAuthority()` runs synchronously, before any
     * await, so it invalidates every open request already in flight,
     * including a synchronous image-tab open that never itself awaits
     * anything. The one await below (`readTextFile`) re-checks it before
     * touching tabs, focus, or sidebar state, so an older request that
     * resolves after a newer one (or after a workspace switch, via the
     * transition generation `fileOpenAuthority.ts` also captures) is a
     * silent no-op rather than overriding the newer selection. A
     * rejected read is only rethrown if this request was still current
     * when it failed; a stale request's own read failure is not this
     * call's problem to report, since a newer request already
     * superseded it.
     *
     * `options.otherGroup` (F07 Phase 5, spec section 6.3's "Open link in
     * other group" entry point) routes the open through the store's
     * `openInOtherGroup` instead of the ordinary active-group routing --
     * see MarkdownPreview.tsx's Ctrl/Cmd+click handling, its first real
     * caller. `options.sourceNotePath` -- the note whose preview the link
     * was clicked in -- is threaded through so `openInOtherGroup` can
     * resolve "other" against the pane actually clicked rather than the
     * possibly-stale global active group (see its own doc comment).
     * Heading/block reveal still only targets the primary group's
     * OutlinePanel/HeadingBreadcrumbs wiring (F07 Phase 3's own disclosed
     * scope), so a reveal request alongside `otherGroup` still runs (the
     * note opens correctly in the other group either way) but will only
     * visibly scroll to the target when that group happens to be primary.
     */
    async (
      path: string,
      name: string,
      options?: { headingKey?: string; blockId?: string; searchQuery?: string; otherGroup?: boolean; sourceNotePath?: string },
    ) => {
      const authority = beginFileOpenAuthority();
      const kind = classifyWorkspaceResource(path);
      if (kind === "image") {
        if (options?.otherGroup) openPathInOtherGroup(path, name, "", "image", options.sourceNotePath);
        else openOrFocusTab(path, name, "", "image", options?.searchQuery);
      } else {
        let content: string;
        try {
          content = await readTextFile(path);
        } catch (error) {
          if (!isCurrentFileOpen(authority)) return;
          throw error;
        }
        if (!isCurrentFileOpen(authority)) return;
        // An already-open tab (in either group) keeps its own (possibly
        // unsaved, dirty) content; the open call below only focuses/moves
        // it rather than overwriting it with what's on disk. Reveal
        // against whichever content is actually about to be displayed,
        // not the disk read. openDocuments, not openTabs: the canonical
        // document list is group-agnostic, so this also finds a tab open
        // only in the secondary group.
        const existingDocument = openDocuments.value.find((document) => document.path === path);
        const effectiveContent = existingDocument?.content ?? content;
        batch(() => {
          if (options?.otherGroup) openPathInOtherGroup(path, name, content, kind, options.sourceNotePath);
          else openOrFocusTab(path, name, content, kind, options?.searchQuery);
          if (options?.headingKey) {
            const match = resolveHeadingFragment(scanHeadings(effectiveContent), options.headingKey);
            if (match.status === "resolved") {
              requestOutlineReveal(match.heading.contentFrom, match.heading.contentTo);
            }
          } else if (options?.blockId) {
            const match = resolveBlockFragment(scanBlockIds(effectiveContent), options.blockId);
            if (match.status === "resolved") {
              requestOutlineReveal(match.block.contentFrom, match.block.contentTo);
            }
          }
        });
      }
      if (isNarrowViewport(window.innerWidth)) sidebarOpen.value = false;
      refresh();
    },
    [refresh],
  );

  const handleSelectTemplate = async (template: NoteTemplate) => {
    if (!templatePicker) return;
    const { path, name } = await createNoteFromTemplate(templatePicker.targetDir, template);
    setTemplatePicker(null);
    await handleOpenFile(path, name);
  };

  const runAutomationUrl = useCallback(
    async (url: string) => {
      const command = parseAutomationUrl(url);
      if (!command) return;
      if (command.kind === "read-current-note") {
        const activeNote = activeTab();
        if (activeNote?.kind === "text") void writeClipboardText(activeNote.content);
        return;
      }
      if (command.kind === "open-favorites") {
        bookmarksOpen.value = true;
        tagsOpen.value = false;
        sidebarOpen.value = true;
        return;
      }
      if (command.kind === "open-note") {
        // Backs the Android favorites-list home-screen widget: each row's
        // tap deep-links here with the note's own workspace-absolute path
        // (bookmarks/store.ts's own path shape). No workspace loaded, or a
        // path from a stale widget snapshot that no longer resolves inside
        // the current workspace (a different workspace is now active, or
        // the note was moved/deleted since the widget last synced), is a
        // silent no-op, matching handleOpenFile's own "target that turns
        // out missing is a silent no-op" convention documented above.
        if (!workspacePath.value || !isPathWithinWorkspace(workspacePath.value, command.path)) {
          return;
        }
        const name = command.path.slice(command.path.lastIndexOf("/") + 1);
        try {
          await handleOpenFile(command.path, name);
        } catch {
          // Real read failure (e.g. the note was deleted): same silent
          // no-op as a resolved-but-missing link target above.
        }
        return;
      }
      if (command.kind === "capture") {
        // F05: Universal quick capture - handle different modes and parameters
        const mode = command.mode ?? "new";
        const text = command.text ?? "";
        const title = command.title;
        const sourceUrl = command.url;
        const profile = command.profile; // F05-FR-08: Target profile UUID
        const shouldOpen = command.open ?? true;
        
        // F05-FR-03: External deep-link captures shall require user review before writing
        if (!workspacePath.value) {
          // Queue capture if no workspace is available
          const { queueCaptureIfNoWorkspace } = await import("../capture/captureProcessor");
          queueCaptureIfNoWorkspace(
            { text, title, sourceUrl, mode, targetProfileId: profile, openAfterCommit: shouldOpen },
            workspacePath.value,
            "deep-link"
          );
          return;
        }
        
        // When workspace is available, open CaptureSheet for user review
        const { openCaptureSheetWithData } = await import("./CaptureSheet");
        openCaptureSheetWithData({
          content: text,
          title,
          sourceUrl,
          mode: mode as "append" | "new" | "date",
          targetProfileId: profile,
          openAfterCapture: shouldOpen
        });
        return;
      }
      if (command.kind === "new-note") {
        // Dispatched from the same mount effect as initSettings (see the
        // useEffect below), so this can race ahead of it: a cold start from
        // the Android "new note" home-screen widget fires this command
        // through CapacitorApp.getLaunchUrl() before the async initSettings
        // chain has finished restoring workspacePath, which would otherwise
        // make this an unconditional, silent no-op even though a workspace
        // is about to become available a moment later. Wait for the same
        // first-load signal initSettings itself sets once it's done, so
        // "no workspace configured at all" (workspacePath still null after
        // that) is the only case that still silently no-ops below.
        await waitForSettingsLoaded();
        if (!workspacePath.value) return;
        const targetDir = selectedDir.value ?? workspacePath.value;
        const { path, name } = await createNoteQuick(targetDir, command.content);
        await handleOpenFile(path, name);
        return;
      }
    },
    [handleOpenFile],
  );

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      let listener: { remove: () => Promise<void> } | undefined;
      void CapacitorApp.getLaunchUrl().then((result) => result?.url && void runAutomationUrl(result.url));
      void CapacitorApp.addListener("appUrlOpen", ({ url }) => void runAutomationUrl(url)).then((next) => (listener = next));
      return () => void listener?.remove();
    }
    let cancelled = false;
    void getCurrentDeepLinkUrls().then((urls) => {
      if (!cancelled) urls?.forEach((url) => void runAutomationUrl(url));
    });
    const unlistenPromise = onOpenUrl((urls) => urls.forEach((url) => void runAutomationUrl(url)));
    return () => {
      cancelled = true;
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [runAutomationUrl]);

  /** ROADMAP.md's "Open a Markdown file from outside the workspace via OS
   * file association". `waitForSettingsLoaded()` closes the same cold-start
   * race `createNoteQuick`'s own automation-command handling above guards
   * against: `workspacePath` may not have finished hydrating from disk yet
   * when this fires at mount. A target outside every `.md` extension (the
   * only thing `tauri.conf.json`'s `bundle.fileAssociations` registers
   * this app to be launched with) or that fails to read is a silent
   * no-op, the same convention `handleOpenFile`'s other callers already
   * use for a target that turns out missing. Disabling the feature
   * (`externalFileOpenEnabled`) makes the request a no-op entirely rather
   * than un-registering the static OS association itself, per that
   * setting's own doc comment in globalConfig.ts. */
  const handleExternalFileOpen = useCallback(
    async (path: string) => {
      if (!/\.md$/i.test(path)) return;
      await waitForSettingsLoaded();
      if (!externalFileOpenEnabled.value) return;
      const name = path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);
      if (workspacePath.value && isPathWithinWorkspace(workspacePath.value, path)) {
        try {
          await handleOpenFile(path, name);
          // A second external open landing inside the workspace supersedes
          // any scratch view still open from an earlier one.
          setExternalFile(null);
        } catch {
          // Real read failure (e.g. the file was deleted since the OS
          // launched Leotheca with it): same silent no-op as
          // handleOpenFile's other callers document above.
        }
        return;
      }
      let content: string;
      try {
        content = await readTextFile(path);
      } catch {
        return;
      }
      setExternalFile({ path, name, content });
    },
    [handleOpenFile],
  );

  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    let cancelled = false;
    void takePendingExternalFile().then((path) => {
      if (!cancelled && path) void handleExternalFileOpen(path);
    });
    const unlisten = onExternalFileOpen((path) => void handleExternalFileOpen(path));
    return () => {
      cancelled = true;
      unlisten();
    };
  }, [handleExternalFileOpen]);

  const handleCloseExternalFile = useCallback(() => {
    setExternalFile(null);
    setExternalFileOpeningWorkspace(false);
    setExternalFileWorkspaceError(null);
  }, []);

  /** `addWorkspaceFromPath` (via `setWorkspacePath`/`workspaceTransitions.run`)
   * rethrows on failure after already publishing a message to
   * `workspaceSelectionError` for surfaces like WelcomeDialog that stay
   * mounted through the failure. This scratch view is not one of those --
   * it unmounts on success (`setExternalFile(null)`) and would otherwise
   * unmount on failure too with nothing left to show that signal, so the
   * failure must be caught and kept local instead: same
   * catch-and-setState-error shape as handleTabRenameSubmit above. Without
   * this catch, a rejection (e.g. the folder was deleted or access denied
   * since the file was opened) left the promise returned to the plain
   * `onClick={() => void ...}` handler unhandled, and the dialog silently
   * reverted to its normal state with no indication anything had failed. */
  const handleOpenExternalFileAsWorkspace = useCallback(async () => {
    if (!externalFile) return;
    const folder = externalFile.path.slice(
      0,
      Math.max(externalFile.path.lastIndexOf("/"), externalFile.path.lastIndexOf("\\")),
    );
    setExternalFileOpeningWorkspace(true);
    setExternalFileWorkspaceError(null);
    try {
      await addWorkspaceFromPath(folder);
      setExternalFile(null);
    } catch (e) {
      setExternalFileWorkspaceError(e instanceof Error ? e.message : String(e));
    } finally {
      setExternalFileOpeningWorkspace(false);
    }
  }, [externalFile]);

  const handleChange = useCallback(
    (path: string, content: string) => {
      // openDocuments, not openTabs: the canonical document list is
      // group-agnostic, so this also works for a path open only in the
      // secondary group (F07 Phase 3), not just primary.
      const document = openDocuments.value.find((candidate) => candidate.path === path);
      if (document && isNoteReadOnlyActive(document.content, workspaceSettings.value.noteReadOnlyLockEnabled)) return;
      updateTabContent(path, content);
      save.change(session, path, content);
    },
    [session, save],
  );

  const flushPendingAutosave = useCallback(async (path: string) => {
    await save.flush(session, path);
  }, [session, save]);

  /** Spec 6.4: "If any affected document has an unresolved save error,
   * group close first presents the existing save-recovery flow." Reuses
   * that flow rather than building a second one: focusing the failing tab
   * brings SecondaryEditorPane's own save-error-bar (with its Retry
   * button) into view, the same bar the primary pane already shows. */
  const attemptCloseSecondaryGroup = useCallback(() => {
    const blocking = secondaryOpenTabs.value.find((tab) => tab.saveError);
    if (blocking) {
      focusTab(blocking.path);
      window.alert(`Couldn't close: "${blocking.name}" has an unresolved save error. Resolve or retry it first.`);
      refresh();
      return;
    }
    closeSecondaryGroup();
    refresh();
  }, [refresh]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      const zoomAction = zoomActionForKey(key);
      if (zoomAction) {
        if (!workspacePath.value) return;
        e.preventDefault();
        const next = nextUiZoom(workspaceSettings.value.uiZoom, zoomAction);
        if (next !== workspaceSettings.value.uiZoom) void updateWorkspaceSettings({ uiZoom: next });
      } else if (key === "n" && rootPath) {
        e.preventDefault();
        void createNoteQuick(selectedDir.value ?? rootPath).then(({ path, name }) =>
          handleOpenFile(path, name),
        );
      } else if (key === "k") {
        e.preventDefault();
        commandPaletteOpen.value = true;
      } else if (key === "w" && activeTabPath.value) {
        e.preventDefault();
        closeTab(activeTabPath.value);
        refresh();
      } else if (key === "tab" && openTabs.value.length > 1) {
        e.preventDefault();
        const tabs = openTabs.value;
        const currentIndex = tabs.findIndex((t) => t.path === activeTabPath.value);
        const delta = e.shiftKey ? -1 : 1;
        const nextIndex = (currentIndex + delta + tabs.length) % tabs.length;
        focusTab(tabs[nextIndex].path);
        refresh();
      } else if (key === "s" && activeTabPath.value) {
        e.preventDefault();
        void flushPendingAutosave(activeTabPath.value).then(refresh);
      } else if (key === ",") {
        e.preventDefault();
        settingsPanelOpen.value = true;
      } else if (key === "p" && e.shiftKey && activeTabPath.value) {
        e.preventDefault();
        pinTab(activeTabPath.value);
        refresh();
      } else if (key === "u" && e.shiftKey && activeTabPath.value) {
        e.preventDefault();
        unpinTab(activeTabPath.value);
        refresh();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [rootPath, handleOpenFile, refresh, flushPendingAutosave]);

  useEffect(() => {
    function onWheel(e: WheelEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (!workspacePath.value) return;
      const zoomAction = zoomActionForWheel(e.deltaY);
      if (!zoomAction) return;
      e.preventDefault();
      const next = nextUiZoom(workspaceSettings.value.uiZoom, zoomAction);
      if (next !== workspaceSettings.value.uiZoom) void updateWorkspaceSettings({ uiZoom: next });
    }
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);

  const current = activeTab();
  const currentNoteReadOnly =
    current?.kind === "text" &&
    isNoteReadOnlyActive(current.content, workspaceSettings.value.noteReadOnlyLockEnabled);
  const currentBookmark =
    current && bookmarks.value.find((b) => b.kind === "file" && b.path === current.path);
  const currentIsPinned = current && editorLayout.value.groups.primary.pinnedPaths.includes(current.path);

  // F07 Phase 3: the secondary group's own active document, independent of
  // `current` above (which stays primary-only, matching every existing
  // caller of it -- bookmarks, pin state, breadcrumbs, the outline panel).
  const secondaryCurrent = secondaryActiveTabPath.value
    ? openDocuments.value.find((document) => document.path === secondaryActiveTabPath.value)
    : undefined;
  const editorGroupsShellRef = useRef<HTMLDivElement>(null);

  // Reset Split-mode breadcrumb authority (spec section 7.5) whenever the
  // active note changes: an authority carried over from a different
  // note's Split session has nothing to do with this one.
  useEffect(() => {
    setSplitAuthority(nextSplitAuthority("note-changed"));
  }, [current?.path]);

  const toggleCurrentNoteBookmark = () => {
    if (!current) return;
    if (currentBookmark) {
      void removeBookmark(currentBookmark.id);
    } else {
      void addFileBookmark(current.path, current.name);
    }
  };

  const toggleCurrentNoteReadOnly = useCallback(() => {
    if (!current || current.kind !== "text") return;
    const content = setNoteReadOnly(current.content, !currentNoteReadOnly);
    updateTabContent(current.path, content);
    save.change(session, current.path, content);
  }, [current, currentNoteReadOnly, save, session]);

  // UX-01 spec section 13.2: the Activity Rail's Files destination, the
  // one member of the sidebar's existing mutually-exclusive panel group
  // (see toggleSidebarPanel above) that never had a dedicated toggle of
  // its own before this -- it was only ever reachable as the implicit
  // "none of the others" default. Mirrors toggleSidebarPanel's own
  // click-active-again-closes-it behavior for consistency.
  const openFilesPanel = () => {
    const filesAlreadyActive =
      sidebarOpen.value &&
      !bookmarksOpen.value &&
      !tagsOpen.value &&
      !taskHubOpen.value &&
      !collectionsOpen.value;
    if (filesAlreadyActive) {
      sidebarOpen.value = false;
      return;
    }
    bookmarksOpen.value = false;
    tagsOpen.value = false;
    taskHubOpen.value = false;
    collectionsOpen.value = false;
    sidebarOpen.value = true;
  };

  const openTagsPanel = () => {
    toggleSidebarPanel(tagsOpen);
    if (tagsOpen.value && rootPath) {
      void rebuildLinkIndex(
        rootPath,
        workspaceSettings.value.frontmatterAliasesEnabled,
        workspaceSettings.value.tagsEnabled,
      );
    }
  };

  const openTaskHubPanel = () => {
    toggleSidebarPanel(taskHubOpen);
    if (taskHubOpen.value && rootPath) {
      void rebuildLinkIndex(
        rootPath,
        workspaceSettings.value.frontmatterAliasesEnabled,
        workspaceSettings.value.tagsEnabled,
      );
    }
  };

  const openCollectionsPanel = () => {
    toggleSidebarPanel(collectionsOpen);
    if (collectionsOpen.value && rootPath) {
      void rebuildLinkIndex(
        rootPath,
        workspaceSettings.value.frontmatterAliasesEnabled,
        workspaceSettings.value.tagsEnabled,
      );
      void loadCollections(rootPath);
    }
  };

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [
      {
        id: "toggle-sidebar",
        label: sidebarOpen.value ? "Hide file browser" : "Show file browser",
        run: () => (sidebarOpen.value = !sidebarOpen.value),
      },
      {
        id: "toggle-bookmarks",
        label: bookmarksOpen.value ? "Hide bookmarks panel" : "Show bookmarks panel",
        run: () => toggleSidebarPanel(bookmarksOpen),
      },
      ...(workspaceSettings.value.tagsEnabled
        ? [
            {
              id: "toggle-tags",
              label: tagsOpen.value ? "Hide tags panel" : "Show tags panel",
              run: openTagsPanel,
            },
          ]
        : []),
      {
        id: "toggle-task-hub",
        label: taskHubOpen.value ? "Hide Task Hub" : "Open Task Hub",
        run: openTaskHubPanel,
      },
      ...(workspaceSettings.value.collectionsEnabled
        ? [
            {
              id: "toggle-collections",
              label: collectionsOpen.value ? "Hide Collections" : "Open Collections",
              run: openCollectionsPanel,
            },
          ]
        : []),
      {
        id: "markdown-help",
        label: "Markdown formatting help",
        run: () => (markdownHelpOpen.value = true),
      },
      { id: "settings", label: "Open Settings", run: () => (settingsPanelOpen.value = true) },
      { id: "capture", label: "Quick Capture", run: () => openCaptureSheet() },
    ];
    if (rootPath) {
      if (workspaceSettings.value.templatesEnabled) {
        list.unshift({
          id: "new-note-from-template",
          label: "New note from template",
          run: () => {
            const targetDir = selectedDir.value ?? rootPath;
            void listTemplates(rootPath).then((templates) => setTemplatePicker({ targetDir, templates }));
          },
        });
      }
      list.unshift({
        id: "new-note",
        label: "New note",
        run: () =>
          void createNoteQuick(selectedDir.value ?? rootPath).then(({ path, name }) =>
            handleOpenFile(path, name),
          ),
      });
      if (workspaceSettings.value.canvasEnabled) {
        list.unshift({
          id: "new-canvas",
          label: "New canvas",
          run: () => void createCanvasQuick(selectedDir.value ?? rootPath).then(({ path, name }) => handleOpenFile(path, name)),
        });
      }
      list.unshift({
        id: "new-drawing",
        label: "New drawing",
        run: () => void createInkQuick(selectedDir.value ?? rootPath).then(({ path, name }) => handleOpenFile(path, name)),
      });
      list.push({
        id: "graph-view",
        label: "Open graph view",
        run: () => {
          void rebuildLinkIndex(rootPath, workspaceSettings.value.frontmatterAliasesEnabled, workspaceSettings.value.tagsEnabled);
          graphOpen.value = true;
        },
      });
    }
    if (current?.kind === "text") {
      list.push(
        {
          id: "view-source",
          label: "Switch to Source view",
          run: () => (viewMode.value = "source"),
        },
        { id: "view-split", label: "Switch to Split view", run: () => (viewMode.value = "split") },
        {
          id: "view-preview",
          label: "Switch to Preview view",
          run: () => (viewMode.value = "preview"),
        },
        {
          id: "toggle-bookmark",
          label: currentBookmark ? "Remove bookmark from this note" : "Bookmark this note",
          run: toggleCurrentNoteBookmark,
        },
        ...(workspaceSettings.value.noteReadOnlyLockEnabled
          ? [{
              id: "toggle-note-read-only",
              label: currentNoteReadOnly ? "Unlock current note" : "Lock current note",
              run: toggleCurrentNoteReadOnly,
            }]
          : []),
        ...(!currentNoteReadOnly && workspaceSettings.value.headingLinksEnabled && viewMode.value !== "preview"
          ? [
              {
                id: "copy-block-link",
                label: "Copy block link",
                run: requestCopyBlockLinkAtCursor,
              },
              {
                id: "create-block-link",
                label: "Create block link",
                run: requestCreateBlockLinkAtCursor,
              },
            ]
          : []),
        ...(!currentNoteReadOnly && viewMode.value !== "preview"
          ? [
              { id: "table-add-row", label: "Table: add row below", run: () => requestTableCommand("add-row-below") },
              { id: "table-delete-row", label: "Table: delete row", run: () => requestTableCommand("delete-row") },
              { id: "table-add-column", label: "Table: add column right", run: () => requestTableCommand("add-column-right") },
              { id: "table-delete-column", label: "Table: delete column", run: () => requestTableCommand("delete-column") },
            ]
          : []),
        { id: "rename-tab", label: "Rename current note", run: () => setTabRename(current) },
        {
          id: "close-tab",
          label: "Close current tab",
          run: () => {
            closeTab(current.path);
            refresh();
          },
        },
      );
    }
    if (current) {
      list.push(
        ...(currentIsPinned
          ? [
              {
                id: "unpin-tab",
                label: "Unpin current tab",
                run: () => {
                  unpinTab(current.path);
                  refresh();
                },
              },
              {
                id: "unpin-and-close-tab",
                label: "Unpin and close current tab",
                run: () => {
                  unpinAndCloseTab(current.path);
                  refresh();
                },
              },
            ]
          : [
              {
                id: "pin-tab",
                label: "Pin current tab",
                run: () => {
                  pinTab(current.path);
                  refresh();
                },
              },
            ]),
      );
    }
    if (openTabs.value.length > 0) {
      list.push({
        id: "close-all-tabs",
        label: "Close all unpinned tabs",
        run: () => {
          closeAllUnpinnedTabs();
          refresh();
        },
      });
    }
    return list;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    rootPath,
    current,
    currentBookmark,
    currentIsPinned,
    sidebarOpen.value,
    bookmarksOpen.value,
    tagsOpen.value,
    taskHubOpen.value,
    collectionsOpen.value,
    workspaceSettings.value.tagsEnabled,
    workspaceSettings.value.templatesEnabled,
    workspaceSettings.value.canvasEnabled,
    workspaceSettings.value.collectionsEnabled,
    workspaceSettings.value.noteReadOnlyLockEnabled,
    currentNoteReadOnly,
    toggleCurrentNoteReadOnly,
    openTabs.value,
    handleOpenFile,
    openCollectionsPanel,
    openTagsPanel,
    openTaskHubPanel,
    refresh,
    toggleCurrentNoteBookmark,
  ]);

  const handleTabRenameSubmit = useCallback(async (newName: string) => {
    if (!tabRename) return;
    try {
      if (!(await renamePreview.confirmRenameWithPreview(tabRename.path, newName))) return;
      await flushPendingAutosave(tabRename.path);
      const newPath = await renameEntry(tabRename.path, newName);
      renameOpenTab(tabRename.path, newPath, newName);
      setTabRename(null);
      setTabRenameError(null);
    } catch (e) {
      setTabRenameError(e instanceof Error ? e.message : String(e));
    }
  }, [tabRename, flushPendingAutosave, renamePreview, setTabRename, setTabRenameError]);

  return (
    <div class={`app-shell ${rtlWorkspaceEnabled.value ? "rtl" : ""}`}>
      <OutlineLiveRegion />
      <header class="toolbar">
        {/* UX-01 spec section 13.1/13.8: at Wide+, the Activity Rail (below)
            is the sidebar-toggle/Bookmarks/Tags/Graph/Settings entry point
            instead of these toolbar buttons, so each is hidden here rather
            than duplicated. Unchanged below Wide, per Phase 2's own
            "preserve the current narrow path temporarily" guidance. */}
        {!showActivityRailNav && (
          <button
            class={`icon-button ${sidebarOpen.value ? "active" : ""}`}
            aria-label="Toggle file browser"
            title="Toggle file browser"
            onClick={() => (sidebarOpen.value = !sidebarOpen.value)}
          >
            <MenuIcon />
          </button>
        )}
        <span class="app-title">Leotheca</span>
        <WorkspaceSwitcher />
        {linkIndexBuilding.value && (
          <span class="app-title-hint" title="Building the wikilink index for this workspace">
            Indexing…
          </span>
        )}
        {!linkIndexBuilding.value && linkIndexUnreadablePaths.value.length > 0 && (
          <span
            class="app-title-hint app-title-hint-warning"
            title={`Could not read: ${linkIndexUnreadablePaths.value.join(", ")}`}
          >
            {linkIndexUnreadablePaths.value.length === 1
              ? "1 note couldn't be indexed"
              : `${linkIndexUnreadablePaths.value.length} notes couldn't be indexed`}
          </span>
        )}
        {rootPath && (
          <button
            class="icon-button"
            aria-label={editorLayout.value.splitEnabled ? "Close reference group" : "Split right"}
            title={editorLayout.value.splitEnabled ? "Close reference group" : "Split right"}
            onClick={() => {
              if (editorLayout.value.splitEnabled) attemptCloseSecondaryGroup();
              else {
                splitRight();
                refresh();
              }
            }}
          >
            {editorLayout.value.splitEnabled ? <CloseIcon /> : <SplitModeIcon />}
          </button>
        )}
        {editorLayout.value.splitEnabled && (
          <button
            class="icon-button"
            aria-label="Move active tab to the other group"
            title="Move active tab to the other group"
            disabled={!activeGroupTab()}
            onClick={() => {
              moveActiveTabToOtherGroup();
              refresh();
            }}
          >
            <SwapGroupsIcon />
          </button>
        )}
        {current?.kind === "text" && (
          <div class="view-mode-switch">
            {(["source", "split", "preview"] as ViewMode[]).map((mode) => {
              const Icon = VIEW_MODE_ICONS[mode];
              const label = mode[0].toUpperCase() + mode.slice(1);
              return (
                <button
                  key={mode}
                  class={viewMode.value === mode ? "active" : ""}
                  title={label}
                  aria-label={label}
                  onClick={() => (viewMode.value = mode)}
                >
                  <Icon />
                </button>
              );
            })}
          </div>
        )}
        {current?.kind === "text" && workspaceSettings.value.speechToTextEnabled && (
          <SpeechRecognitionButton
            readOnly={isNoteReadOnlyActive(current.path, workspaceSettings.value.noteReadOnlyLockEnabled)}
            onResult={(text) => {
              if (text && current) {
                // Use the existing outline insert mechanism to insert speech text
                outlineInsertRequest.value = { 
                  text, 
                  requestId: Date.now() // Use timestamp as unique requestId
                };
              }
            }}
            onError={(error) => {
              console.error('Speech recognition error:', error);
            }}
          />
        )}
        <div class="toolbar-spacer" />
        {current?.kind === "text" && (
          <button
            class={`icon-button ${currentBookmark ? "active" : ""}`}
            aria-label={currentBookmark ? "Remove bookmark" : "Bookmark this note"}
            title={currentBookmark ? "Remove bookmark" : "Bookmark this note"}
            onClick={toggleCurrentNoteBookmark}
          >
            {currentBookmark ? <BookmarkFilledIcon /> : <BookmarkIcon />}
          </button>
        )}
        {!showActivityRailNav && (
          <button
            class={`icon-button ${bookmarksOpen.value ? "active" : ""}`}
            aria-label="View bookmarks"
            title="View bookmarks"
            onClick={() => toggleSidebarPanel(bookmarksOpen)}
          >
            <BookmarkIcon />
          </button>
        )}
        {!showActivityRailNav && workspaceSettings.value.tagsEnabled && (
          <button
            class={`icon-button ${tagsOpen.value ? "active" : ""}`}
            aria-label="View tags"
            title="View tags"
            onClick={openTagsPanel}
          >
            <TagIcon />
          </button>
        )}
        <button
          class={`icon-button ${taskHubOpen.value ? "active" : ""}`}
          aria-label="Open Task Hub"
          title="Open Task Hub"
          onClick={openTaskHubPanel}
        >
          <TaskIcon />
        </button>
        {workspaceSettings.value.collectionsEnabled && (
          <button
            class={`icon-button ${collectionsOpen.value ? "active" : ""}`}
            aria-label="Open Collections"
            title="Open Collections"
            onClick={openCollectionsPanel}
          >
            <CollectionsIcon />
          </button>
        )}
        {current?.kind === "text" && (
          <button
            class={`icon-button ${outlineOpen.value ? "active" : ""}`}
            aria-label={outlineOpen.value ? "Hide note outline" : "Show note outline"}
            title={outlineOpen.value ? "Hide note outline" : "Show note outline"}
            onClick={() => (outlineOpen.value = !outlineOpen.value)}
          >
            <OutlineIcon />
          </button>
        )}
        {!showActivityRailNav && rootPath && (
          <button
            class="icon-button"
            aria-label="Graph view"
            title="Graph view"
            onClick={() => {
              if (rootPath) void rebuildLinkIndex(rootPath, workspaceSettings.value.frontmatterAliasesEnabled, workspaceSettings.value.tagsEnabled);
              graphOpen.value = true;
            }}
          >
            <GraphIcon />
          </button>
        )}
        <button
          class="icon-button"
          aria-label="Command palette"
          title="Command palette (Ctrl+K)"
          onClick={() => (commandPaletteOpen.value = true)}
        >
          <CommandPaletteIcon />
        </button>
        <button
          class="icon-button"
          aria-label="Markdown formatting help"
          title="Markdown formatting help"
          onClick={() => (markdownHelpOpen.value = true)}
        >
          ?
        </button>
        {!showActivityRailNav && (
          <button
            class="icon-button"
            aria-label="Settings"
            title="Settings (Ctrl+,)"
            onClick={() => (settingsPanelOpen.value = true)}
          >
            <SettingsIcon />
          </button>
        )}
      </header>
      <div class="app-body">
        {showActivityRailNav && (
          <ActivityRail
            activeDestination={activeNavDestination}
            graphActive={graphOpen.value}
            tagsEnabled={workspaceSettings.value.tagsEnabled}
            onSelectFiles={openFilesPanel}
            onSelectBookmarks={() => toggleSidebarPanel(bookmarksOpen)}
            onSelectTags={openTagsPanel}
            onOpenGraph={() => {
              if (rootPath) void rebuildLinkIndex(rootPath, workspaceSettings.value.frontmatterAliasesEnabled, workspaceSettings.value.tagsEnabled);
              graphOpen.value = true;
            }}
            onOpenSettings={() => (settingsPanelOpen.value = true)}
          />
        )}
        {sidebarOpen.value && (
          <>
            <aside class="sidebar" style={{ width: `${sidebarWidth.value}px` }}>
              {rootPath ? (
                <>
                  <div class="sidebar-primary">
                    {tagsOpen.value && workspaceSettings.value.tagsEnabled ? (
                      <TagsPanel onOpenFile={handleOpenFile} />
                    ) : taskHubOpen.value ? (
                      <TaskHubPanel
                        onOpenFile={handleOpenFile}
                        save={save}
                        onNavigated={() => {
                          if (viewMode.value === "preview") viewMode.value = "split";
                        }}
                      />
                    ) : collectionsOpen.value && workspaceSettings.value.collectionsEnabled ? (
                      <CollectionsPanel onOpenFile={handleOpenFile} />
                    ) : bookmarksOpen.value ? (
                      <BookmarksPanel
                        onOpenFile={handleOpenFile}
                        onRunSearch={(query) => runSearch(rootPath, query)}
                      />
                    ) : (
                      <Sidebar
                        rootPath={rootPath}
                        onOpenFile={(path, name, searchQuery) => handleOpenFile(path, name, searchQuery ? { searchQuery } : undefined)}
                        flushPendingAutosave={flushPendingAutosave}
                      />
                    )}
                  </div>
                  {current?.kind === "text" && outlineOpen.value && (
                    <OutlinePanel
                      key={current.path}
                      content={current.content}
                      noteTitle={current.name}
                      canInsertLink={viewMode.value !== "preview"}
                      onNavigated={() => {
                        if (viewMode.value === "preview") viewMode.value = "split";
                      }}
                    />
                  )}
                  {current?.kind === "text" && (
                    <BacklinksPanel
                      path={current.path}
                      onOpenFile={handleOpenFile}
                    />
                  )}
                </>
              ) : (
                <p class="empty-hint">
                  No root folder set. Open Settings to choose one.
                </p>
              )}
            </aside>
            <div class="sidebar-resize-handle" onPointerDown={onDragStart} />
          </>
        )}
        <div class="editor-groups-shell" ref={editorGroupsShellRef}>
        {editorLayout.value.splitEnabled && isCompactLayout && (
          <CompactGroupSwitcher
            visibleGroupId={editorLayout.value.compactVisibleGroupId}
            primaryActiveName={current?.name ?? null}
            secondaryActiveName={secondaryCurrent?.name ?? null}
            onSelect={(groupId) => {
              setCompactVisibleGroup(groupId);
              refresh();
            }}
          />
        )}
        {showPrimaryPane && (
        <main class="editor-area"
          style={editorLayout.value.splitEnabled && !isCompactLayout ? { flex: `0 0 ${editorLayout.value.preferredRatio * 100}%` } : undefined}
          onClick={() => {
            // Spec 6.5: a group becomes active when the user focuses its
            // editor or preview. Click-anywhere-in-the-pane is a coarser
            // proxy for that than binding CodeMirror's own focus event, but
            // is enough to route the next open/global command correctly
            // without touching either editor component itself.
            if (editorLayout.value.splitEnabled && editorLayout.value.activeGroupId !== "primary") focusGroup("primary");
          }}
        >
          <TabBar
            tabs={openTabs.value}
            pinnedPaths={editorLayout.value.groups.primary.pinnedPaths}
            activePath={activeTabPath.value}
            onSelect={(path) => {
              focusTab(path);
              refresh();
            }}
            onRename={(path, name) => setTabRename({ path, name })}
            onClose={(path) => {
              closeTab(path);
              refresh();
            }}
            onCloseOthers={(path) => {
              closeOtherTabs(path);
              refresh();
            }}
            onCloseAll={() => {
              closeAllUnpinnedTabs();
              refresh();
            }}
            onPin={(path) => {
              pinTab(path);
              refresh();
            }}
            onUnpin={(path) => {
              unpinTab(path);
              refresh();
            }}
            onUnpinAndClose={(path) => {
              unpinAndCloseTab(path);
              refresh();
            }}
            onReorder={(path, beforePath) => {
              moveTabWithinGroup(path, beforePath);
              refresh();
            }}
            onMoveLeft={(path) => {
              reorderTabWithinGroup(path, "left");
              refresh();
            }}
            onMoveRight={(path) => {
              reorderTabWithinGroup(path, "right");
              refresh();
            }}
          />
          {current?.kind === "text" && workspaceSettings.value.noteReadOnlyLockEnabled && (
            <div class="note-lock-bar" role="status">
              <span>{currentNoteReadOnly ? "This note is locked." : "This note is editable."}</span>
              <button type="button" onClick={toggleCurrentNoteReadOnly}>
                {currentNoteReadOnly ? "Unlock note" : "Lock note"}
              </button>
            </div>
          )}
          {current?.saveError && (
            <div class="save-error-bar" role="alert">
              <span>
                Couldn't save "{current.name}": {current.saveError}
              </span>
              <button type="button" onClick={() => void save.retry(session, current.path)}>
                Retry
              </button>
            </div>
          )}
          {current ? (
            current.kind === "image" ? (
              <ImageViewer path={current.path} />
            ) : current.kind === "pdf" ? (
              <PdfViewer path={current.path} />
            ) : current.kind === "canvas" ? (
              <CanvasView path={current.path} source={current.content} onChange={(value) => handleChange(current.path, value)} onOpenFile={(path) => handleOpenFile(path, path.split("/").pop() ?? path)} />
            ) : current.kind === "ink" ? (
              <InkView path={current.path} source={current.content} onChange={(value) => handleChange(current.path, value)} />
            ) : (
              <>
                <HeadingBreadcrumbs
                  key={current.path}
                  noteTitle={current.name}
                  content={current.content}
                  activeSource={
                    viewMode.value === "preview" ||
                    (viewMode.value === "split" && splitAuthority === "preview")
                      ? previewActiveIndex !== undefined
                        ? { kind: "previewIndex", index: previewActiveIndex }
                        : { kind: "none" }
                      : cursorPos !== null
                        ? { kind: "cursor", offset: cursorPos }
                        : { kind: "none" }
                  }
                  onSelectRoot={() => {
                    requestOutlineReveal(0, 0);
                    announceOutline(`Navigated to ${current.name}, line 1.`);
                  }}
                  onSelectHeading={(heading) => {
                    requestOutlineReveal(heading.contentFrom, heading.contentTo);
                    announceOutline(
                      headingNavigationAnnouncement(
                        heading.displayText || "heading",
                        current.content,
                        heading.contentFrom,
                      ),
                    );
                  }}
                  canInsertLink={viewMode.value !== "preview"}
                />
                <FrontmatterPropertiesPanel
                  key={current.path}
                  source={current.content}
                  onChange={(value) => handleChange(current.path, value)}
                  enabled={workspaceSettings.value.frontmatterPropertiesEnabled}
                  readOnly={currentNoteReadOnly}
                />
                <div class={`editor-panes mode-${viewMode.value}`}>
                  {viewMode.value !== "preview" && (
                    <MarkdownEditor
                      path={current.path}
                      value={current.content}
                      onChange={(value) => handleChange(current.path, value)}
                      workspaceRoot={rootPath ?? ""}
                      attachmentsFolder={workspaceSettings.value.attachmentsFolder}
                      pasteImagesEnabled={workspaceSettings.value.pasteImagesEnabled}
                      readOnly={currentNoteReadOnly}
                      snippetsEnabled={workspaceSettings.value.snippetsEnabled}
                      snippets={workspaceSettings.value.snippets}
                      reveal={outlineRevealRequest.value}
                      insertRequest={outlineInsertRequest.value}
                      blockLinkCopyRequest={blockLinkCopyRequest.value}
                      blockLinkCreateRequest={blockLinkCreateRequest.value}
                      tableCommandRequest={tableCommandRequest.value}
                      onCursorChange={(pos) => {
                        setCursorPos(pos);
                        setSplitAuthority(nextSplitAuthority("source-cursor"));
                      }}
                      searchQuery={current.searchQuery}
                    />
                  )}
                  {viewMode.value !== "source" && (
                    <MarkdownPreview
                      source={current.content}
                      onOpenFile={handleOpenFile}
                      mathRenderingEnabled={workspaceSettings.value.mathRenderingEnabled}
                      headingLinksEnabled={workspaceSettings.value.headingLinksEnabled}
                      notePath={current.path}
                      onActiveHeadingChange={setPreviewActiveIndex}
                      onDirectInteraction={() =>
                        setSplitAuthority(nextSplitAuthority("preview-interaction"))
                      }
                      searchQuery={current.searchQuery}
                      onImageClick={handleImageClick}
                    />
                  )}
                </div>
              </>
            )
          ) : (
            <EmptyEditorState />
          )}
        </main>
        )}
        {showSeparator && (
          <SplitSeparator
            ratio={editorLayout.value.preferredRatio}
            containerRef={editorGroupsShellRef}
            onChange={setSplitRatio}
            onReset={resetSplitRatio}
          />
        )}
        {showSecondaryPane && (
            <div
              onClick={() => {
                if (editorLayout.value.activeGroupId !== "secondary") focusGroup("secondary");
              }}
            >
              <SecondaryEditorPane
                tabs={secondaryOpenTabs.value}
                pinnedPaths={editorLayout.value.groups.secondary?.pinnedPaths ?? []}
                activePath={secondaryActiveTabPath.value}
                current={secondaryCurrent}
                viewMode={editorLayout.value.groups.secondary?.viewMode ?? "source"}
                onViewModeChange={(mode) => setGroupViewMode("secondary", mode)}
                session={session}
                save={save}
                workspaceRoot={rootPath ?? ""}
                attachmentsFolder={workspaceSettings.value.attachmentsFolder}
                pasteImagesEnabled={workspaceSettings.value.pasteImagesEnabled}
                snippetsEnabled={workspaceSettings.value.snippetsEnabled}
                snippets={workspaceSettings.value.snippets}
                noteReadOnlyLockEnabled={workspaceSettings.value.noteReadOnlyLockEnabled}
                onSelect={(path) => {
                  focusTab(path);
                  refresh();
                }}
                onClose={(path) => {
                  closeTab(path);
                  refresh();
                }}
                onCloseOthers={(path) => {
                  closeOtherTabs(path);
                  refresh();
                }}
                onCloseAll={() => {
                  closeAllUnpinnedTabs("secondary");
                  refresh();
                }}
                onPin={(path) => {
                  pinTab(path);
                  refresh();
                }}
                onUnpin={(path) => {
                  unpinTab(path);
                  refresh();
                }}
                onUnpinAndClose={(path) => {
                  unpinAndCloseTab(path);
                  refresh();
                }}
                onRename={(path, name) => setTabRename({ path, name })}
                onChange={handleChange}
                onOpenFile={handleOpenFile}
                onMoveActiveTabHere={() => {
                  focusGroup("primary");
                  moveActiveTabToOtherGroup();
                  refresh();
                }}
                onClosePane={attemptCloseSecondaryGroup}
                hasPrimaryActiveTab={!!activeTabPath.value}
                onReorder={(path, beforePath) => {
                  moveTabWithinGroup(path, beforePath);
                  refresh();
                }}
                onMoveLeft={(path) => {
                  reorderTabWithinGroup(path, "left");
                  refresh();
                }}
                onMoveRight={(path) => {
                  reorderTabWithinGroup(path, "right");
                  refresh();
                }}
              />
            </div>
        )}
        </div>
      </div>
      <SettingsPanel onOpenFile={handleOpenFile} />
      {rootPath && <WorkspaceTransitionBanner />}
      {settingsLoaded.value && !rootPath && <WelcomeDialog />}
      {renamePreview.preview && (
        <RenamePreviewDialog
          oldPath={renamePreview.preview.oldPath}
          newPath={renamePreview.preview.newPath}
          plan={renamePreview.preview.plan}
          onContinue={renamePreview.continueRename}
          onCancel={renamePreview.cancelRename}
        />
      )}
      {tabRename && !renamePreview.preview && (
        <NamePrompt
          title="Rename"
          submitLabel="Rename"
          placeholder={tabRename.name}
          initialValue={tabRename.name}
          error={tabRenameError}
          onSubmit={handleTabRenameSubmit}
          onCancel={() => {
            setTabRename(null);
            setTabRenameError(null);
          }}
        />
      )}
      {graphOpen.value && (
        <GraphView
          onOpenFile={async (path, name) => {
            await handleOpenFile(path, name);
            graphOpen.value = false;
          }}
          onClose={() => (graphOpen.value = false)}
          focusPath={current?.kind === "text" ? current.path : undefined}
        />
      )}
      {markdownHelpOpen.value && (
        <MarkdownHelpDialog onClose={() => (markdownHelpOpen.value = false)} />
      )}
      {templatePicker && (
        <TemplatePicker
          templates={templatePicker.templates}
          templatesFolder={workspaceSettings.value.templatesFolder}
          onSelect={handleSelectTemplate}
          onCancel={() => setTemplatePicker(null)}
        />
      )}
      {commandPaletteOpen.value && (
        <CommandPalette commands={commands} onClose={() => (commandPaletteOpen.value = false)} />
      )}
      {imageOverlay && (
        <ImageViewerOverlay
          src={imageOverlay.src}
          alt={imageOverlay.alt}
          onClose={handleCloseImageOverlay}
        />
      )}
      <PendingCapturesPanel />
      {captureSheetOpen.value && (
        <CaptureSheet onCreated={(path, name) => void handleOpenFile(path, name)} />
      )}
      {externalFile && (
        <ExternalFileView
          path={externalFile.path}
          name={externalFile.name}
          content={externalFile.content}
          opening={externalFileOpeningWorkspace}
          error={externalFileWorkspaceError}
          onClose={handleCloseExternalFile}
          onOpenAsWorkspace={() => void handleOpenExternalFileAsWorkspace()}
        />
      )}
    </div>
  );
}
