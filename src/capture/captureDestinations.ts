/**
 * F05: Universal Quick Capture - Destination resolution
 * Handles date-pattern destination paths and validation
 */

/**
 * Supported date tokens for F05 date-pattern destinations
 */
export const DATE_TOKENS = [
  "{{date:YYYY-MM-DD}}",
  "{{date:YYYY-MM}}", 
  "{{date:YYYY}}",
] as const;

/**
 * Date token type
 */
export type DateToken = typeof DATE_TOKENS[number];

/**
 * Result of resolving a date pattern
 */
export interface ResolvedDatePattern {
  path: string;  // The resolved path with date tokens replaced
  dateUsed: Date; // The date that was used for resolution
}

/**
 * Validates that a path contains only supported date tokens
 */
export function validateDatePattern(pattern: string): boolean {
  // Check for unsupported tokens by looking for {{ and }} patterns
  const tokenRegex = /\{{\w+:.*?\}\}/g;
  const matches = pattern.match(tokenRegex) || [];
  
  // All date tokens must be from our supported list
  return matches.every(token => DATE_TOKENS.includes(token as DateToken));
}

/**
 * Resolves date tokens in a pattern string using the current date
 */
export function resolveDatePattern(pattern: string, date: Date = new Date()): ResolvedDatePattern {
  let resolvedPath = pattern;
  
  // Extract date components
  const year = date.getFullYear().toString();
  const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
  const day = String(date.getDate()).padStart(2, '0');
  
  // Replace each supported token
  resolvedPath = resolvedPath.replace(/\{{\s*date:YYYY-MM-DD\s*\}\}/g, `${year}-${month}-${day}`);
  resolvedPath = resolvedPath.replace(/\{{\s*date:YYYY-MM\s*\}\}/g, `${year}-${month}`);
  resolvedPath = resolvedPath.replace(/\{{\s*date:YYYY\s*\}\}/g, year);
  
  return {
    path: resolvedPath,
    dateUsed: date
  };
}

/**
 * Checks if a path contains any date tokens
 */
export function hasDateTokens(pattern: string): boolean {
  return DATE_TOKENS.some(token => pattern.includes(token));
}

/**
 * F05 destination modes
 */
export type DestinationMode = "append" | "new" | "date";

/**
 * Validates a destination mode
 */
export function isValidDestinationMode(mode: string): mode is DestinationMode {
  return ["append", "new", "date"].includes(mode);
}
