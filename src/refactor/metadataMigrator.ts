/**
 * F03 Phase 2b: Application metadata migration adapters
 * (spec/f03-link-integrity-refactor-center.md section 6.4)
 * 
 * Provides typed path-migration adapters for various application metadata that
 * may contain references to note paths. Each adapter knows how to update its
 * own metadata structure when paths change during rename/move operations.
 * 
 * Unknown JSON fields are preserved. F03 does not recursively replace path-like
 * strings in arbitrary configuration.
 */

import type { EditorLayoutState } from "../workspace/types";
import type { Bookmark } from "../bookmarks/types";
import type { WorkspaceSettings } from "../settings/workspaceSettings";

/** Interface for a metadata path migration adapter */
export interface MetadataPathMigrator<T> {
  /** Unique identifier for this adapter type */
  id: string;
  
  /** Migrate a single metadata instance, updating any path references
   * from oldPath to newPath. Returns the migrated metadata. */
  migrate: (metadata: T, oldPath: string, newPath: string) => T;
  
  /** Test if this adapter can handle the given metadata type */
  canHandle: (metadata: unknown) => metadata is T;
}



/** Migrator for editor layout state (F07 Phase 1) */
const editorLayoutMigrator: MetadataPathMigrator<EditorLayoutState> = {
  id: "editor-layout",
  
  canHandle: (metadata): metadata is EditorLayoutState => {
    return (
      typeof metadata === "object" &&
      metadata !== null &&
      "groups" in metadata &&
      typeof (metadata as EditorLayoutState).groups === "object" &&
      (metadata as EditorLayoutState).groups !== null
    );
  },
  
  migrate: (layout, oldPath, newPath) => {
    // Migrate primary group tab paths
    const primaryGroup = layout.groups.primary;
    
    // Update tabPaths array
    const updatedTabPaths = primaryGroup.tabPaths.map(path =>
      path === oldPath ? newPath : path
    );
    
    // Update activePath
    const updatedActivePath = primaryGroup.activePath === oldPath 
      ? newPath 
      : primaryGroup.activePath;
    
    return {
      ...layout,
      groups: {
        ...layout.groups,
        primary: {
          ...primaryGroup,
          tabPaths: updatedTabPaths,
          activePath: updatedActivePath
        }
      }
    };
  }
};

/** Migrator for bookmarks */
const bookmarksMigrator: MetadataPathMigrator<Bookmark[]> = {
  id: "bookmarks",
  
  canHandle: (metadata): metadata is Bookmark[] => {
    return Array.isArray(metadata) && 
           metadata.every(item => 
             typeof item === "object" && item !== null && 
             "id" in item && "kind" in item && "label" in item
           );
  },
  
  migrate: (bookmarks, oldPath, newPath) => {
    return bookmarks.map(bookmark => {
      if (bookmark.kind === "file" && bookmark.path === oldPath) {
        return { ...bookmark, path: newPath };
      }
      return bookmark;
    });
  }
};

/** Migrator for workspace settings with known path fields */
const workspaceSettingsMigrator: MetadataPathMigrator<WorkspaceSettings> = {
  id: "workspace-settings",
  
  canHandle: (metadata): metadata is WorkspaceSettings => {
    return (
      typeof metadata === "object" &&
      metadata !== null &&
      "version" in metadata &&
      "sortOrder" in metadata &&
      "fontSize" in metadata &&
      "defaultViewMode" in metadata
    );
  },
  
  migrate: (settings, oldPath, newPath) => {
    // Migrate lastOpenPaths - array of paths
    const migratedOpenPaths = settings.lastOpenPaths.map(path =>
      path === oldPath ? newPath : path
    );
    
    // Migrate lastActivePath - single path
    const migratedActivePath = settings.lastActivePath === oldPath 
      ? newPath 
      : settings.lastActivePath;
    
    // Migrate editorLayout if it exists
    const migratedEditorLayout = settings.editorLayout 
      ? editorLayoutMigrator.migrate(settings.editorLayout, oldPath, newPath)
      : undefined;
    
    return {
      ...settings,
      lastOpenPaths: migratedOpenPaths,
      lastActivePath: migratedActivePath,
      editorLayout: migratedEditorLayout,
    };
  }
};

/** Registry of all available metadata migrators */
const migratorRegistry = [
  editorLayoutMigrator,
  bookmarksMigrator,
  workspaceSettingsMigrator
] as const;

/** Find the appropriate migrator for a given metadata object */
export function findMigrator<T>(metadata: T): MetadataPathMigrator<T> | undefined {
  for (const migrator of migratorRegistry) {
    if (migrator.canHandle(metadata)) {
      return migrator as unknown as MetadataPathMigrator<T>;
    }
  }
  return undefined;
}

/** Migrate metadata through all registered adapters */
export function migrateMetadata(
  metadata: unknown,
  oldPath: string,
  newPath: string
): unknown {
  const migrator = findMigrator(metadata);
  if (migrator) {
    return migrator.migrate(metadata, oldPath, newPath);
  }
  
  // If no specific migrator found, try to handle arrays
  if (Array.isArray(metadata)) {
    return metadata.map(item => migrateMetadata(item, oldPath, newPath));
  }
  
  // If no specific migrator found, return unchanged
  return metadata;
}

/** Apply migration to all metadata instances in a metadata collection */
export function migrateMetadataCollection(
  collection: Record<string, unknown>,
  oldPath: string,
  newPath: string
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(collection)) {
    result[key] = migrateMetadata(value, oldPath, newPath);
  }
  
  return result;
}

/**
 * Create a metadata migration plan for application metadata.
 * This identifies what metadata needs to be updated when paths change.
 */
export interface MetadataMigrationPlan {
  editorLayout: EditorLayoutState;
  bookmarks: Bookmark[];
  workspaceSettings: WorkspaceSettings;
}

export function createMetadataMigrationPlan(
  currentLayout: EditorLayoutState,
  currentBookmarks: Bookmark[],
  currentSettings: WorkspaceSettings,
  oldPath: string,
  newPath: string
): MetadataMigrationPlan {
  return {
    editorLayout: editorLayoutMigrator.migrate(currentLayout, oldPath, newPath),
    bookmarks: bookmarksMigrator.migrate(currentBookmarks, oldPath, newPath),
    workspaceSettings: workspaceSettingsMigrator.migrate(currentSettings, oldPath, newPath)
  };
}

export { editorLayoutMigrator, bookmarksMigrator, workspaceSettingsMigrator };