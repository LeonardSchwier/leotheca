/**
 * Search Index Module
 * 
 * Provides efficient full-text search indexing and querying capabilities.
 * Uses an inverted index to enable fast searching without scanning all files
 * on every search request.
 */

import { signal } from "@preact/signals";
import type { FsEntry } from "./types";
import { workspacePath } from "../settings/store";
import { isTextFile } from "./types";

/**
 * Inverted index structure: maps terms to the set of file paths that contain them
 */
interface InvertedIndex {
  // Main index: term -> Set of file paths containing the term
  termToFiles: Map<string, Set<string>>;
  
  // File metadata: path -> file info (name, last modified, etc.)
  fileMetadata: Map<string, { name: string; path: string; lastModified: number; size: number }>;
  
  // Path index: for prefix/path searches
  pathIndex: Map<string, Set<string>>;
  
  // Name index: for filename searches
  nameIndex: Map<string, Set<string>>;
  
  // Last update timestamp for cache invalidation
  lastUpdated: number;
  
  // Current workspace path this index belongs to
  workspacePath: string;
}

/**
 * Search index state
 */
const searchIndex = signal<InvertedIndex | null>(null);
const indexBuilding = signal<boolean>(false);
const indexBuildProgress = signal<{ current: number; total: number } | null>(null);

/**
 * Minimum word length to index (shorter words are usually not useful for search)
 */
const MIN_TERM_LENGTH = 3;

/**
 * Maximum number of terms to index per file (to prevent memory issues with very large files)
 */
const MAX_TERMS_PER_FILE = 1000;

/**
 * Simple tokenizer that splits text into searchable terms
 */
function tokenize(text: string): string[] {
  // Convert to lowercase, replace non-alphanumeric characters with spaces,
  // then split and filter out empty/short terms
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u00C0-\u024F\u1E00-\u1EFF\uFB00-\uFB06]/g, ' ')
    .split(/\s+/)
    .filter(term => term.length >= MIN_TERM_LENGTH && term.length <= 50); // Also filter out very long terms
}

/**
 * Creates a new empty search index
 */
function createEmptyIndex(workspacePath: string): InvertedIndex {
  return {
    termToFiles: new Map(),
    fileMetadata: new Map(),
    pathIndex: new Map(),
    nameIndex: new Map(),
    lastUpdated: Date.now(),
    workspacePath,
  };
}

/**
 * Adds a file to the search index
 */
function addFileToIndex(index: InvertedIndex, entry: FsEntry, content?: string): void {
  const filePath = entry.path;
  const fileName = entry.name.toLowerCase();
  
  // Store file metadata
  index.fileMetadata.set(filePath, {
    name: entry.name,
    path: filePath,
    lastModified: entry.mtime || Date.now(),
    size: entry.size || 0,
  });
  
  // Index the filename
  const nameTerms = tokenize(fileName);
  for (const term of nameTerms) {
    if (!index.nameIndex.has(term)) {
      index.nameIndex.set(term, new Set());
    }
    index.nameIndex.get(term)!.add(filePath);
  }
  
  // Index the full path for path-based searches
  const pathTerms = tokenize(filePath);
  for (const term of pathTerms) {
    if (!index.pathIndex.has(term)) {
      index.pathIndex.set(term, new Set());
    }
    index.pathIndex.get(term)!.add(filePath);
  }
  
  // If we have content, index it
  if (content && isTextFile(entry.path)) {
    const contentTerms = tokenize(content);
    const uniqueTerms = new Set<string>();
    
    // Limit the number of terms indexed per file to prevent memory issues
    for (const term of contentTerms) {
      if (uniqueTerms.size >= MAX_TERMS_PER_FILE) break;
      if (!uniqueTerms.has(term)) {
        uniqueTerms.add(term);
        
        if (!index.termToFiles.has(term)) {
          index.termToFiles.set(term, new Set());
        }
        index.termToFiles.get(term)!.add(filePath);
      }
    }
  }
  
  // Update last modified timestamp
  index.lastUpdated = Date.now();
}

/**
 * Removes a file from the search index
 */
function removeFileFromIndex(index: InvertedIndex, filePath: string): void {
  const metadata = index.fileMetadata.get(filePath);
  if (!metadata) return;
  
  // Remove from file metadata
  index.fileMetadata.delete(filePath);
  
  // Remove from name index
  const nameTerms = tokenize(metadata.name);
  for (const term of nameTerms) {
    const files = index.nameIndex.get(term);
    if (files) {
      files.delete(filePath);
      if (files.size === 0) {
        index.nameIndex.delete(term);
      }
    }
  }
  
  // Remove from path index
  const pathTerms = tokenize(filePath);
  for (const term of pathTerms) {
    const files = index.pathIndex.get(term);
    if (files) {
      files.delete(filePath);
      if (files.size === 0) {
        index.pathIndex.delete(term);
      }
    }
  }
  
  // Remove from content index (this is more expensive but necessary)
  // Note: We don't store which terms came from which files, so we can't efficiently
  // remove specific terms. For now, we'll rebuild the index if this becomes a problem.
  
  index.lastUpdated = Date.now();
}

/**
 * Builds a complete search index for the workspace
 */
export async function buildSearchIndex(entries: FsEntry[]): Promise<void> {
  if (indexBuilding.value) {
    console.log("Search index build already in progress, skipping");
    return;
  }
  
  const rootPath = workspacePath.value;
  if (!rootPath) {
    console.warn("Cannot build search index: no workspace path");
    return;
  }
  
  // Check if we should use indexing (disabled by default for now)
  // For now, we'll always build the index, but this can be made configurable
  const shouldIndex = true; // Default to true, can be made configurable via settings later
  
  if (!shouldIndex) {
    console.log("Search indexing disabled in settings");
    return;
  }
  
  console.log("Starting search index build...");
  indexBuilding.value = true;
  indexBuildProgress.value = { current: 0, total: entries.length };
  
  try {
    // Create a new index
    const newIndex = createEmptyIndex(rootPath);
    
    // Add all entries to the index
    let processed = 0;
    for (const entry of entries) {
      // For directories, we index the name and path but not content
      addFileToIndex(newIndex, entry);
      
      processed++;
      indexBuildProgress.value = { current: processed, total: entries.length };
      
      // Yield to the event loop occasionally to prevent UI freezing
      if (processed % 50 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    
    // Update the signal with the new index
    searchIndex.value = newIndex;
    console.log(`Search index built: ${newIndex.fileMetadata.size} files indexed`);
    
  } catch (error) {
    console.error("Failed to build search index:", error);
  } finally {
    indexBuilding.value = false;
    indexBuildProgress.value = null;
  }
}

/**
 * Updates the search index with a modified file
 */
export function updateFileInIndex(entry: FsEntry, content?: string): void {
  const currentIndex = searchIndex.value;
  if (!currentIndex) return;
  
  // If the file already exists, remove it first
  if (currentIndex.fileMetadata.has(entry.path)) {
    removeFileFromIndex(currentIndex, entry.path);
  }
  
  // Add the updated file
  addFileToIndex(currentIndex, entry, content);
  searchIndex.value = { ...currentIndex }; // Trigger update
}

/**
 * Removes a file from the search index
 */
export function removeFileFromSearchIndex(filePath: string): void {
  const currentIndex = searchIndex.value;
  if (!currentIndex) return;
  
  removeFileFromIndex(currentIndex, filePath);
  searchIndex.value = { ...currentIndex }; // Trigger update
}

/**
 * Clears the entire search index
 */
export function clearSearchIndex(): void {
  searchIndex.value = null;
}

/**
 * Searches the index for files matching the query
 */
export function searchIndexed(query: string): FsEntry[] {
  const currentIndex = searchIndex.value;
  if (!currentIndex) {
    console.log("No search index available, falling back to regular search");
    return [];
  }
  
  const normalizedQuery = query.toLowerCase().trim();
  if (!normalizedQuery) return [];
  
  const terms = tokenize(normalizedQuery);
  if (terms.length === 0) return [];
  
  // For now, implement a simple AND search across all terms
  const termFileSets: Set<string>[] = [];
  
  for (const term of terms) {
    // Check content index
    let fileSet = currentIndex.termToFiles.get(term);
    if (fileSet && fileSet.size > 0) {
      termFileSets.push(new Set(fileSet));
      continue;
    }
    
    // Check name index
    fileSet = currentIndex.nameIndex.get(term);
    if (fileSet && fileSet.size > 0) {
      termFileSets.push(new Set(fileSet));
      continue;
    }
    
    // Check path index
    fileSet = currentIndex.pathIndex.get(term);
    if (fileSet && fileSet.size > 0) {
      termFileSets.push(new Set(fileSet));
      continue;
    }
    
    // If no files contain this term, the AND search should return empty
    if (terms.length > 1) {
      return [];
    }
  }
  
  // If no terms found any files, return empty
  if (termFileSets.length === 0) return [];
  
  // Intersect all term file sets (AND search)
  let resultFiles = new Set(termFileSets[0]);
  for (let i = 1; i < termFileSets.length; i++) {
    const nextSet = termFileSets[i];
    resultFiles = new Set([...resultFiles].filter(file => nextSet.has(file)));
    if (resultFiles.size === 0) break; // Early exit if no matches
  }
  
  // Convert file paths back to FsEntry objects using the metadata
  const results: FsEntry[] = [];
  for (const filePath of resultFiles) {
    const metadata = currentIndex.fileMetadata.get(filePath);
    if (metadata) {
      results.push({
        path: metadata.path,
        name: metadata.name,
        isDir: false, // We don't store directory info in the index yet
        size: metadata.size,
        mtime: metadata.lastModified,
      });
    }
  }
  
  return results;
}

/**
 * Checks if a search index exists and is valid for the current workspace
 */
export function hasValidSearchIndex(): boolean {
  const currentIndex = searchIndex.value;
  const currentWorkspacePath = workspacePath.value;
  
  return !!(
    currentIndex && 
    currentWorkspacePath && 
    currentIndex.workspacePath === currentWorkspacePath &&
    currentIndex.fileMetadata.size > 0
  );
}

/**
 * Gets the current search index build status
 */
export function getSearchIndexStatus() {
  return {
    hasIndex: hasValidSearchIndex(),
    isBuilding: indexBuilding.value,
    progress: indexBuildProgress.value,
    fileCount: searchIndex.value?.fileMetadata.size || 0,
  };
}

// Export signals for UI integration
export { searchIndex, indexBuilding, indexBuildProgress };