import { effect, signal, useSignal } from "@preact/signals";
import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
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
import { ImageViewer } from "../editor/ImageViewer";
import { classifyWorkspaceResource } from "../workspace/types";
import { CanvasView } from "../canvas/CanvasView";
import {
  activeTab,
  activeTabPath,
  closeAllTabs,
  closeOtherTabs,
  closeTab,
  markTabSaved,
  markTabSaveError,
  openOrFocusTab,
  openTabs,
  renameOpenTab,
  updateTabContent,
} from "../workspace/store";
import { readTextFile } from "../workspace/tauriBridge";
import {
  initSettings,
  settingsLoaded,
  settingsPanelOpen,
  updateWorkspaceSettings,
  viewMode,
  workspacePath,
  workspaceSession,
  workspaceSettings,
} from "../settings/store";
import type { ViewMode } from "../settings/workspaceSettings";
import { SettingsPanel } from "../settings/SettingsPanel";
import { WelcomeDialog } from "../settings/WelcomeDialog";
import { BacklinksPanel } from "../linking/BacklinksPanel";
import { linkIndexBuilding, rebuildLinkIndex, resetLinkIndexCache } from "../linking/store";
import { BookmarksPanel } from "../bookmarks/BookmarksPanel";
import { addFileBookmark, bookmarks, loadBookmarks, removeBookmark } from "../bookmarks/store";
import { resetWorkspaceTree } from "../workspace/fileTreeStore";
import { TagsPanel } from "../tags/TagsPanel";
import {
  createNoteFromTemplate,
  createCanvasQuick,
  createNoteQuick,
  listTemplates,
  renameEntry,
  runSearch,
  selectedDir,
  type NoteTemplate,
} from "../workspace/fileTreeStore";
import { NamePrompt } from "../workspace/NamePrompt";
import { TemplatePicker } from "../workspace/TemplatePicker";
import { parseAutomationUrl } from "./automationCommands";
import { useResizableSidebar } from "./useResizableSidebar";
import "./resizable-sidebar.css";
import { GraphView } from "../graph/GraphView";
import { MarkdownHelpDialog } from "./MarkdownHelpDialog";
import { CommandPalette, type Command } from "./CommandPalette";
import { nextUiZoom, zoomActionForKey, zoomActionForWheel } from "./zoomControls";
import { isNarrowViewport } from "./responsiveLayout";
import { createSaveCoordinator } from "../workspace/saveCoordinator";

// Plain inline SVG, not the 🔖 emoji this used to use: it rendered as an
// unrelated (reportedly pepper-shaped) glyph on Android, the same class of
// cross-platform emoji-font problem the sidebar's new-note/new-folder
// icons hit earlier.
function BookmarkIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">
      <path d="M5 3h10a1 1 0 0 1 1 1v13l-6-4-6 4V4a1 1 0 0 1 1-1z" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M11 3h5a1 1 0 0 1 1 1v5l-8.3 8.3a1 1 0 0 1-1.4 0l-4.6-4.6a1 1 0 0 1 0-1.4L11 3z" />
      <circle cx="14" cy="7" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function GraphIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="5" cy="6" r="2" />
      <circle cx="15" cy="5" r="2" />
      <circle cx="6" cy="15" r="2" />
      <circle cx="15" cy="14" r="2" />
      <path d="M6.7 7.3L13.3 5.7M7 13.2L13.5 13.9M6.4 7.8L7 13" />
    </svg>
  );
}

// Text labels ("Source"/"Split"/"Preview") don't fit at narrow mobile
// widths (confirmed via screenshot, "Preview" clipped to "Previe"), same
// class of problem the sidebar toolbar icons already hit. Small SVGs,
// same reasoning as NewNoteIcon/NewFolderIcon in Sidebar.tsx.
function SourceModeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="7,5 3,10 7,15" />
      <polyline points="13,5 17,10 13,15" />
    </svg>
  );
}

function SplitModeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2" y="3" width="7" height="14" rx="1" />
      <rect x="11" y="3" width="7" height="14" rx="1" />
    </svg>
  );
}

function PreviewModeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M2 10s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6z" />
      <circle cx="10" cy="10" r="2.2" />
    </svg>
  );
}

function CommandPaletteIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2" y="4" width="16" height="12" rx="1.5" />
      <path d="M6 8l2.5 2L6 12M10.5 12h3.5" />
    </svg>
  );
}

const VIEW_MODE_ICONS: Record<ViewMode, ComponentType> = {
  source: SourceModeIcon,
  split: SplitModeIcon,
  preview: PreviewModeIcon,
};

const bookmarksOpen = signal(false);
const tagsOpen = signal(false);
const graphOpen = signal(false);
const markdownHelpOpen = signal(false);
const commandPaletteOpen = signal(false);
// Collapsed by default on Android, where the sidebar would otherwise eat
// most of a phone-width screen; open by default on desktop, unchanged from
// before this toggle existed.
const sidebarOpen = signal(!Capacitor.isNativePlatform());

/** Bookmarks and Tags both replace the file tree in the sidebar's primary
 * slot (see the `.sidebar-primary` render below), so opening one closes
 * the other rather than leaving both toggled on at once, which would
 * otherwise show two toolbar buttons as simultaneously "active" for a
 * single visible panel. */
function toggleSidebarPanel(panel: typeof bookmarksOpen): void {
  const next = !panel.value;
  bookmarksOpen.value = false;
  tagsOpen.value = false;
  panel.value = next;
  if (next) sidebarOpen.value = true;
}

export function App() {
  const tick = useSignal(0);
  const rootPath = workspacePath.value;
  const session = workspaceSession.value;
  const save = useMemo(() => createSaveCoordinator({
    onSaved: (path: string) => { markTabSaved(path); refresh(); },
    onError: (path: string, error: string) => markTabSaveError(path, error),
  }), []);
  const [tabRename, setTabRename] = useState<{ path: string; name: string } | null>(null);
  const [tabRenameError, setTabRenameError] = useState<string | null>(null);
  const [templatePicker, setTemplatePicker] = useState<{
    targetDir: string;
    templates: NoteTemplate[];
  } | null>(null);

  // Clear all pending/in-flight saves when the workspace session changes
  // (Android SAF switch, desktop reload). This prevents writes from the old
  // session from targeting the wrong folder or a file that was renamed.
  useEffect(() => {
    save.resetForSession(session);
  }, [session, save]);

  useEffect(() => {
    // Always ensure settingsLoaded becomes true even if initSettings() fails.
    // A fresh install with no workspace will show the WelcomeDialog; if the
    // version check or config read fails, we still want the UI to render.
    const p = initSettings();
    if (p) {
      p.catch(() => {
        settingsLoaded.value = true;
      });
    } else {
      // In tests/initSettings is mocked to undefined; render immediately.
      settingsLoaded.value = true;
    }
  }, []);

  useEffect(() => {
    resetWorkspaceTree();
    resetLinkIndexCache();
  }, [session]);

  // Deferring rebuildLinkIndex until the user explicitly opens the Graph or
  // Tags view. Building the link index on every workspace open adds 100-3000ms
  // of native bridge calls (recursive file walk + per-note content reads)
  // before the user needs it. The index is built on-demand by openGraphView
  // and openTagsPanel, and manually via settings.

  // Defer bookmarks loading until the user opens the Bookmarks panel.
  // Reading bookmarks.json costs one native bridge call on startup that
  // provides zero user value on first paint.
  useEffect(() => {
    if (bookmarksOpen.value && workspacePath.value) void loadBookmarks(workspacePath.value);
  }, [bookmarksOpen.value, workspacePath.value]);

  // Use effect() from @preact/signals (not useEffect) so changes to
  // workspaceSettings.value.accentColor or themesEnabled are properly
  // tracked reactively — Preact Signals only subscribes during render,
  // not inside useEffect callbacks.
  effect(() => {
    const root = document.documentElement;
    if (!workspacePath.value || !workspaceSettings.value.themesEnabled) {
      root.removeAttribute("data-accent");
      return;
    }
    root.setAttribute("data-accent", workspaceSettings.value.accentColor);
  });

  const { width: sidebarWidth, onDragStart } = useResizableSidebar();

  const refresh = useCallback(() => {
    tick.value++;
  }, [tick]);

  const handleOpenFile = useCallback(
    async (path: string, name: string) => {
      const kind = classifyWorkspaceResource(path);
      if (kind === "image") {
        openOrFocusTab(path, name, "", "image");
      } else {
        const content = await readTextFile(path);
        openOrFocusTab(path, name, content, kind);
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
        // Silently does nothing without an open text note: there is
        // nothing sensible to copy, and this command has no channel back
        // to whatever external tool triggered it to report an error.
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
      // Same reasoning: a "new-note" command that arrives before any
      // workspace is open has nowhere to create the note, so it's a
      // silent no-op rather than a confusing error dialog for something
      // an external tool triggered, not the user directly.
      if (!workspacePath.value) return;
      const targetDir = selectedDir.value ?? workspacePath.value;
      const { path, name } = await createNoteQuick(targetDir, command.content);
      await handleOpenFile(path, name);
    },
    [handleOpenFile],
  );

  // Local inter-application automation (see automationCommands.ts and
  // ROADMAP.md's "Local Automation Commands"): registers this window to
  // receive leotheca:// URLs. Desktop (Tauri) only, this plugin has no
  // Android/Capacitor equivalent (see CONSTITUTION.md's "Technology
  // stack"), so it's skipped entirely on Android rather than calling into
  // a native bridge that isn't there.
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

  const handleChange = useCallback(
    (path: string, content: string) => {
      updateTabContent(path, content);
      save.change(session, path, content);
    },
    [session, save],
  );

  // If a debounced autosave (see handleChange above) is still pending for
  // `path`, its closure captured that path at schedule time: left alone,
  // it would fire later against wherever `path` used to point, silently
  // dropping the file's last edit if `path` gets renamed or moved out from
  // under it in the meantime. Both places that can rename an open tab's
  // file (this component's own tab-rename dialog, and Sidebar.tsx's
  // file-tree rename) call this first, so neither can reintroduce the race
  // independently of the other.
  const flushPendingAutosave = useCallback(async (path: string) => {
    await save.flush(session, path);
  }, [session, save]);

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
        activeTabPath.value = tabs[nextIndex].path;
        refresh();
      } else if (key === "s" && activeTabPath.value) {
        e.preventDefault();
        void flushPendingAutosave(activeTabPath.value).then(refresh);
      } else if (key === ",") {
        e.preventDefault();
        settingsPanelOpen.value = true;
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
  const currentBookmark =
    current && bookmarks.value.find((b) => b.kind === "file" && b.path === current.path);

  const toggleCurrentNoteBookmark = () => {
    if (!current) return;
    if (currentBookmark) {
      void removeBookmark(currentBookmark.id);
    } else {
      void addFileBookmark(current.path, current.name);
    }
  };

  const openTagsPanel = () => {
    toggleSidebarPanel(tagsOpen);
    // The link index only rebuilds when the workspace first opens or the
    // graph view is shown; a note edited since then could have new tags
    // the panel hasn't seen yet, so refresh right before showing it too.
    if (tagsOpen.value && rootPath) {
      void rebuildLinkIndex(
        rootPath,
        workspaceSettings.value.frontmatterAliasesEnabled,
        workspaceSettings.value.tagsEnabled,
      );
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
        id: "markdown-help",
        label: "Markdown formatting help",
        run: () => (markdownHelpOpen.value = true),
      },
      { id: "settings", label: "Open Settings", run: () => (settingsPanelOpen.value = true) },
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
    if (openTabs.value.length > 0) {
      list.push({
        id: "close-all-tabs",
        label: "Close all tabs",
        run: () => {
          closeAllTabs();
          refresh();
        },
      });
    }
    return list;
  }, [
    rootPath,
    current,
    currentBookmark,
    sidebarOpen.value,
    bookmarksOpen.value,
    tagsOpen.value,
    workspaceSettings.value.tagsEnabled,
    workspaceSettings.value.templatesEnabled,
    workspaceSettings.value.canvasEnabled,
    openTabs.value,
  ]);

  const handleTabRenameSubmit = useCallback(async (newName: string) => {
    if (!tabRename) return;
    try {
      await flushPendingAutosave(tabRename.path);

      const newPath = await renameEntry(tabRename.path, newName);
      renameOpenTab(tabRename.path, newPath, newName);
      setTabRename(null);
      setTabRenameError(null);
    } catch (e) {
      setTabRenameError(e instanceof Error ? e.message : String(e));
    }
  }, [tabRename, flushPendingAutosave, renameEntry, renameOpenTab, setTabRename, setTabRenameError]);

  return (
    <div class="app-shell">
      <header class="toolbar">
        <button
          class={`icon-button ${sidebarOpen.value ? "active" : ""}`}
          aria-label="Toggle file browser"
          title="Toggle file browser"
          onClick={() => (sidebarOpen.value = !sidebarOpen.value)}
        >
          ☰
        </button>
        <span class="app-title">Leotheca</span>
        {linkIndexBuilding.value && (
          <span class="app-title-hint" title="Building the wikilink index for this workspace">
            Indexing…
          </span>
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
        <div class="toolbar-spacer" />
        {current?.kind === "text" && (
          <button
            class={`icon-button ${currentBookmark ? "active" : ""}`}
            aria-label={currentBookmark ? "Remove bookmark" : "Bookmark this note"}
            title={currentBookmark ? "Remove bookmark" : "Bookmark this note"}
            onClick={toggleCurrentNoteBookmark}
          >
            {currentBookmark ? "★" : "☆"}
          </button>
        )}
        <button
          class={`icon-button ${bookmarksOpen.value ? "active" : ""}`}
          aria-label="View bookmarks"
          title="View bookmarks"
          onClick={() => toggleSidebarPanel(bookmarksOpen)}
        >
          <BookmarkIcon />
        </button>
        {workspaceSettings.value.tagsEnabled && (
          <button
            class={`icon-button ${tagsOpen.value ? "active" : ""}`}
            aria-label="View tags"
            title="View tags"
            onClick={openTagsPanel}
          >
            <TagIcon />
          </button>
        )}
        {rootPath && (
          <button
            class="icon-button"
            aria-label="Graph view"
            title="Graph view"
            onClick={() => {
              // The link index only rebuilds when the workspace first
              // opens; a note edited since then could have new links the
              // graph hasn't seen yet, so refresh right before showing it.
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
        <button
          class="icon-button"
          aria-label="Settings"
          title="Settings (Ctrl+,)"
          onClick={() => (settingsPanelOpen.value = true)}
        >
          ⚙
        </button>
      </header>
      <div class="app-body">
        {sidebarOpen.value && (
          <>
            <aside class="sidebar" style={{ width: `${sidebarWidth.value}px` }}>
              {rootPath ? (
                <>
                  <div class="sidebar-primary">
                    {tagsOpen.value && workspaceSettings.value.tagsEnabled ? (
                      <TagsPanel onOpenFile={handleOpenFile} />
                    ) : bookmarksOpen.value ? (
                      <BookmarksPanel
                        onOpenFile={handleOpenFile}
                        onRunSearch={(query) => runSearch(rootPath, query)}
                      />
                    ) : (
                      <Sidebar
                        rootPath={rootPath}
                        onOpenFile={handleOpenFile}
                        flushPendingAutosave={flushPendingAutosave}
                      />
                    )}
                  </div>
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
        <main class="editor-area">
          <TabBar
            tabs={openTabs.value}
            activePath={activeTabPath.value}
            onSelect={(path) => {
              activeTabPath.value = path;
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
              closeAllTabs();
              refresh();
            }}
          />
          {current ? (
            current.kind === "image" ? (
              <ImageViewer path={current.path} />
            ) : current.kind === "canvas" ? (
              <CanvasView path={current.path} source={current.content} onChange={(value) => handleChange(current.path, value)} onOpenFile={(path) => void handleOpenFile(path, path.split("/").pop() ?? path)} />
            ) : (
              <>
                <FrontmatterPropertiesPanel
                  key={current.path}
                  source={current.content}
                  onChange={(value) => handleChange(current.path, value)}
                  enabled={workspaceSettings.value.frontmatterPropertiesEnabled}
                />
                <div class={`editor-panes mode-${viewMode.value}`}>
                  {viewMode.value !== "preview" && (
                    <MarkdownEditor
                      key={current.path}
                      path={current.path}
                      value={current.content}
                      onChange={(value) => handleChange(current.path, value)}
                      workspaceRoot={rootPath ?? ""}
                      attachmentsFolder={workspaceSettings.value.attachmentsFolder}
                      pasteImagesEnabled={workspaceSettings.value.pasteImagesEnabled}
                      snippetsEnabled={workspaceSettings.value.snippetsEnabled}
                      snippets={workspaceSettings.value.snippets}
                    />
                  )}
                  {viewMode.value !== "source" && (
                    <MarkdownPreview
                      source={current.content}
                      onOpenFile={handleOpenFile}
                      mathRenderingEnabled={workspaceSettings.value.mathRenderingEnabled}
                      notePath={current.path}
                    />
                  )}
                </div>
              </>
            )
          ) : (
            <div class="empty-hint editor-empty">No file open.</div>
          )}
        </main>
      </div>
      <SettingsPanel />
      {settingsLoaded.value && !rootPath && <WelcomeDialog />}
      {tabRename && (
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
          onOpenFile={(path, name) => {
            graphOpen.value = false;
            void handleOpenFile(path, name);
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
    </div>
  );
}
