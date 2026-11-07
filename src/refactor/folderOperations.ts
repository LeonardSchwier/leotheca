/**
 * F03 Phase 4: Folder-level rename/move operations
 * (spec/f03-link-integrity-refactor-center.md section 9.4)
 *
 * Provides path-graph planning for folder operations, building old-to-new
 * path maps for every contained file and resolving references against
 * the post-operation path graph.
 */

import type { PlannedWikiLinkEdit, BlockedWikiLinkEdit, RenamePlan } from "./renamePlan";

/** Path move for a single file within a folder operation */
export interface FilePathMove {
  originalPath: string;
  finalPath: string;
}

/** Folder operation plan - extends RenamePlan to handle multiple files */
export interface FolderRenamePlan {
  /** Folder being renamed/moved */
  oldFolderPath: string;
  /** New folder path */
  newFolderPath: string;
  /** All individual file moves within this folder operation */
  fileMoves: FilePathMove[];
  /** WikiLink edits for all affected files */
  allEdits: PlannedWikiLinkEdit[];
  /** Blocked edits that would become ambiguous */
  allBlocked: BlockedWikiLinkEdit[];
  /** Validation errors for the folder operation */
  validationErrors: string[];
}

/**
 * Normalize a path by replacing all backslashes with forward slashes and removing trailing slash
 */
function normalizePath(path: string): string {
  let result = path.replace(/\\/g, "/");
  while (result.endsWith("/")) {
    result = result.slice(0, -1);
  }
  return result;
}

/**
 * Remove leading slashes from a path
 */
function removeLeadingSlashes(path: string): string {
  while (path.startsWith("/")) {
    path = path.substring(1);
  }
  return path;
}

/**
 * Check if newPath is a descendant of or same as oldPath
 */
function isPathDescendantOrSame(newPath: string, oldPath: string): boolean {
  const normalizedNew = normalizePath(newPath);
  const normalizedOld = normalizePath(oldPath);
  
  if (normalizedNew === normalizedOld) {
    return true;
  }
  
  return normalizedNew.startsWith(normalizedOld + "/");
}

/**
 * Check if a folder exists at the given path
 */
function folderExistsAtPath(folderPath: string, getFilePathsInFolder: (folderPath: string) => string[]): boolean {
  try {
    const filePaths = getFilePathsInFolder(folderPath);
    return filePaths.length > 0;
  } catch {
    return false;
  }
}

/**
 * Check if path is within workspace
 */
function isPathInWorkspace(path: string, workspacePath: string): boolean {
  const normalizedPath = removeLeadingSlashes(normalizePath(path));
  const normalizedWorkspace = removeLeadingSlashes(normalizePath(workspacePath));
  
  return normalizedPath.startsWith(normalizedWorkspace + "/") || 
         normalizedPath === normalizedWorkspace;
}

/**
 * Check if file is a Markdown or Canvas file that we can process
 */
function isMarkdownOrCanvasFile(filePath: string): boolean {
  return filePath.endsWith(".md") || filePath.endsWith(".canvas");
}

/**
 * Compute a folder rename plan for moving/renaming a folder
 * Builds old-to-new path map for every contained file and resolves
 * references against the post-operation path graph.
 */
export function computeFolderRenamePlan(
  oldFolderPath: string,
  newFolderPath: string,
  workspacePath: string,
  getFilePathsInFolder: (folderPath: string) => string[]
): FolderRenamePlan {
  const validationErrors: string[] = [];
  const fileMoves: FilePathMove[] = [];
  const allEdits: PlannedWikiLinkEdit[] = [];
  const allBlocked: BlockedWikiLinkEdit[] = [];

  // Step 1: Validation checks from spec 9.4
  
  if (isPathDescendantOrSame(newFolderPath, oldFolderPath)) {
    validationErrors.push(`Cannot move folder into itself or descendant: ${oldFolderPath} -> ${newFolderPath}`);
  }

  if (folderExistsAtPath(newFolderPath, getFilePathsInFolder)) {
    validationErrors.push(`Destination already exists: ${newFolderPath}`);
  }

  if (!isPathInWorkspace(newFolderPath, workspacePath)) {
    validationErrors.push(`Path outside workspace: ${newFolderPath}`);
  }

  if (newFolderPath.includes("/.leotheca/") || newFolderPath === ".leotheca") {
    validationErrors.push(`Cannot use reserved .leotheca/ path: ${newFolderPath}`);
  }

  // Step 2: If validation passes, compute file moves
  if (validationErrors.length === 0) {
    const filePaths = getFilePathsInFolder(oldFolderPath);
    
    for (const filePath of filePaths) {
      if (isMarkdownOrCanvasFile(filePath)) {
        const oldNormalized = normalizePath(oldFolderPath);
        const fileNormalized = normalizePath(filePath);
        const relativePath = fileNormalized.slice(oldNormalized.length + 1);
        const newFilePath = normalizePath(newFolderPath) + "/" + relativePath;
        
        fileMoves.push({
          originalPath: filePath,
          finalPath: newFilePath
        });
        
        // For now, create a basic rename plan without reading file contents
        // In a full implementation, we'd use planNoteRename with a readNote function
        const renamePlan: RenamePlan = {
          oldPath: filePath,
          newPath: newFilePath,
          edits: [],
          blocked: []
        };
        
        allEdits.push(...renamePlan.edits);
        allBlocked.push(...renamePlan.blocked);
      }
    }
  }

  return {
    oldFolderPath,
    newFolderPath,
    fileMoves,
    allEdits,
    allBlocked,
    validationErrors
  };
}

/**
 * Get the total count of planned changes for safety limits check
 */
export function getTotalChangeCount(plan: FolderRenamePlan): number {
  return plan.fileMoves.length + plan.allEdits.length + plan.allBlocked.length;
}

/**
 * Check if folder operation exceeds safety limits
 */
export function exceedsSafetyLimits(plan: FolderRenamePlan, maxFileMoves: number = 100, maxEdits: number = 1000): boolean {
  return plan.fileMoves.length > maxFileMoves || 
         plan.allEdits.length > maxEdits ||
         getTotalChangeCount(plan) > maxFileMoves + maxEdits;
}

/**
 * Convert folder rename plan to individual rename plans for each file
 * This allows reusing existing rename infrastructure for execution
 */
export function convertFolderPlanToIndividualPlans(
  folderPlan: FolderRenamePlan
): RenamePlan[] {
  const individualPlans: RenamePlan[] = [];
  
  for (const fileMove of folderPlan.fileMoves) {
    // For now, create a basic rename plan without reading file contents
    const renamePlan: RenamePlan = {
      oldPath: fileMove.originalPath,
      newPath: fileMove.finalPath,
      edits: [],
      blocked: []
    };
    individualPlans.push(renamePlan);
  }
  
  return individualPlans;
}

/**
 * Validate folder operation pre-conditions
 */
export function validateFolderOperation(
  oldFolderPath: string,
  newFolderPath: string,
  workspacePath: string,
  getFilePathsInFolder: (folderPath: string) => string[],
  maxFileCount: number = 1000
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  const filePaths = getFilePathsInFolder(oldFolderPath);
  if (filePaths.length === 0) {
    errors.push(`Source folder is empty or doesn't exist: ${oldFolderPath}`);
  }
  
  const markdownFiles = filePaths.filter(isMarkdownOrCanvasFile);
  if (markdownFiles.length > maxFileCount) {
    errors.push(`Too many files in folder: ${markdownFiles.length} (max: ${maxFileCount})`);
  }
  
  if (oldFolderPath === newFolderPath) {
    errors.push("Source and destination are the same");
  }
  
  if (isPathDescendantOrSame(newFolderPath, oldFolderPath)) {
    errors.push("Cannot move folder into itself or a descendant");
  }
  
  if (!isPathInWorkspace(newFolderPath, workspacePath)) {
    errors.push("Destination path is outside workspace");
  }
  
  if (newFolderPath.includes("/.leotheca/") || newFolderPath === ".leotheca") {
    errors.push("Cannot use reserved .leotheca/ path");
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}