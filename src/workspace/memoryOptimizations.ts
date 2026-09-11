/**
 * Memory Optimizations Module
 * 
 * Provides utilities and patterns for memory-efficient code, including:
 * - Weak reference management for caches
 * - Memory usage monitoring
 * - Cleanup utilities for large data structures
 * - LRU cache implementation
 */

import { signal } from "@preact/signals";

// Type declarations for modern web APIs that may not be available in all environments
declare global {
  interface Performance {
    memory?: {
      usedJSHeapSize: number;
      totalJSHeapSize: number;
      jsHeapSizeLimit: number;
    };
  }
  
  class WeakRef<T extends object> {
    constructor(value: T);
    deref(): T | undefined;
  }
  
  class FinalizationRegistry<T = unknown> {
    constructor(callback: (heldValue: T) => void);
    register(target: object, heldValue: T, unregisterToken?: unknown): void;
    unregister(unregisterToken?: unknown): void;
  }
}

// Feature detection for WeakRef and FinalizationRegistry
const hasWeakRef = typeof WeakRef !== 'undefined';
const hasFinalizationRegistry = typeof FinalizationRegistry !== 'undefined';
const hasPerformanceMemory = typeof performance !== 'undefined' && performance.memory;

// Global memory usage tracking
const memoryUsage = signal<{
  allocated: number;
  cachedEntries: number;
  weakRefsCreated: number;
  weakRefsFreed: number;
}>({
  allocated: 0,
  cachedEntries: 0,
  weakRefsCreated: 0,
  weakRefsFreed: 0,
});

/**
 * Memory thresholds for warnings and cleanup
 */
const MEMORY_WARNING_THRESHOLD = 500 * 1024 * 1024; // 500MB
const MEMORY_CRITICAL_THRESHOLD = 800 * 1024 * 1024; // 800MB

/**
 * Estimates the memory usage of an object in bytes
 */
export function estimateMemoryUsage(obj: unknown): number {
  // This is a rough estimate, actual memory usage may vary
  if (obj === null || obj === undefined) return 0;
  
  if (typeof obj === 'string') {
    // Each character is approximately 2 bytes in JavaScript (UTF-16)
    return obj.length * 2;
  }
  
  if (typeof obj === 'number') return 8; // 64-bit floating point
  if (typeof obj === 'boolean') return 4;
  if (typeof obj === 'bigint') return 16;
  
  if (Array.isArray(obj)) {
    return obj.reduce((sum, item) => sum + estimateMemoryUsage(item), 0);
  }
  
  if (typeof obj === 'object') {
    const keys = Object.keys(obj as object);
    let size = 0;
    for (const key of keys) {
      size += estimateMemoryUsage(key); // Key size
      size += estimateMemoryUsage((obj as Record<string, unknown>)[key]); // Value size
    }
    // Add overhead for object structure
    size += keys.length * 16; // Approximate overhead per property
    return size;
  }
  
  return 16; // Default for other types
}

/**
 * LRU (Least Recently Used) Cache implementation
 * Automatically evicts least recently used entries when capacity is reached
 */
export class LRUCache<K, V> {
  private capacity: number;
  private cache = new Map<K, V>();
  private accessOrder = new Map<K, number>();
  private accessCounter = 0;
  private memoryBudget: number;
  private currentMemoryUsage = 0;
  
  constructor(capacity: number, memoryBudget?: number) {
    this.capacity = capacity;
    this.memoryBudget = memoryBudget || Infinity;
  }
  
  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Update access order
      this.accessCounter++;
      this.accessOrder.set(key, this.accessCounter);
      return value;
    }
    return undefined;
  }
  
  set(key: K, value: V): void {
    const valueSize = estimateMemoryUsage(value);
    
    // If the value is too large, don't cache it
    if (valueSize > this.memoryBudget) {
      return;
    }
    
    // If key already exists, update it
    if (this.cache.has(key)) {
      this.currentMemoryUsage -= estimateMemoryUsage(this.cache.get(key)!);
    }
    
    // Check if we need to evict entries
    while (this.cache.size >= this.capacity || 
           this.currentMemoryUsage + valueSize > this.memoryBudget) {
      this.evictLeastRecentlyUsed();
    }
    
    // Add new entry
    this.cache.set(key, value);
    this.currentMemoryUsage += valueSize;
    this.accessCounter++;
    this.accessOrder.set(key, this.accessCounter);
    
    memoryUsage.value = {
      ...memoryUsage.value,
      cachedEntries: memoryUsage.value.cachedEntries + 1,
    };
  }
  
  has(key: K): boolean {
    return this.cache.has(key);
  }
  
  delete(key: K): boolean {
    if (this.cache.has(key)) {
      this.currentMemoryUsage -= estimateMemoryUsage(this.cache.get(key)!);
      this.cache.delete(key);
      this.accessOrder.delete(key);
      memoryUsage.value = {
        ...memoryUsage.value,
        cachedEntries: memoryUsage.value.cachedEntries - 1,
      };
      return true;
    }
    return false;
  }
  
  clear(): void {
    this.cache.clear();
    this.accessOrder.clear();
    this.currentMemoryUsage = 0;
    memoryUsage.value = {
      ...memoryUsage.value,
      cachedEntries: 0,
    };
  }
  
  get size(): number {
    return this.cache.size;
  }
  
  get estimatedMemoryUsage(): number {
    return this.currentMemoryUsage;
  }
  
  private evictLeastRecentlyUsed(): void {
    if (this.cache.size === 0) return;
    
    // Find the least recently used entry
    let lruKey: K | undefined;
    let minAccess = Infinity;
    
    const entries = Array.from(this.accessOrder.entries());
    for (const [key, accessTime] of entries) {
      if (accessTime < minAccess) {
        minAccess = accessTime;
        lruKey = key;
      }
    }
    
    if (lruKey !== undefined) {
      this.currentMemoryUsage -= estimateMemoryUsage(this.cache.get(lruKey)!);
      this.cache.delete(lruKey);
      this.accessOrder.delete(lruKey);
      memoryUsage.value = {
        ...memoryUsage.value,
        cachedEntries: memoryUsage.value.cachedEntries - 1,
      };
    }
  }
}

/**
 * Weak reference cache that allows entries to be garbage collected
 * Useful for caching data that can be recomputed if needed
 * 
 * Note: Only available in environments that support WeakRef and FinalizationRegistry
 */
export class WeakRefCache<K extends object, V extends object> {
  private cache = new Map<K, WeakRef<V>>();
  private finalizationRegistry: FinalizationRegistry<WeakRef<V>> | null = null;
  private cleanupCallbacks = new Set<(key: K) => void>();
  
  constructor() {
    if (!hasWeakRef || !hasFinalizationRegistry) {
      console.warn("WeakRefCache: WeakRef or FinalizationRegistry not supported in this environment");
      return;
    }
    
    this.finalizationRegistry = new FinalizationRegistry((heldValue: WeakRef<V>) => {
      // This is called when a key is garbage collected
      const entries = Array.from(this.cache.entries());
      for (const [key, ref] of entries) {
        if (ref === heldValue) {
          this.cache.delete(key);
          memoryUsage.value = {
            ...memoryUsage.value,
            weakRefsFreed: memoryUsage.value.weakRefsFreed + 1,
          };
          const callbacks = Array.from(this.cleanupCallbacks);
          for (const callback of callbacks) {
            callback(key);
          }
          break;
        }
      }
    });
  }
  
  get(key: K): V | undefined {
    if (!hasWeakRef) return undefined;
    
    const ref = this.cache.get(key);
    return ref?.deref();
  }
  
  set(key: K, value: V): void {
    if (!hasWeakRef || !hasFinalizationRegistry || !this.finalizationRegistry) return;
    
    // Register the key with the finalization registry
    const weakRef = new WeakRef(value);
    this.finalizationRegistry.register(key, weakRef, weakRef);
    
    this.cache.set(key, weakRef);
    memoryUsage.value = {
      ...memoryUsage.value,
      weakRefsCreated: memoryUsage.value.weakRefsCreated + 1,
    };
  }
  
  has(key: K): boolean {
    if (!hasWeakRef) return false;
    return this.cache.has(key) && this.cache.get(key)?.deref() !== undefined;
  }
  
  delete(key: K): boolean {
    if (this.finalizationRegistry) {
      this.finalizationRegistry.unregister(key);
    }
    return this.cache.delete(key);
  }
  
  clear(): void {
    // Clear all entries
    if (this.finalizationRegistry) {
      const keys = Array.from(this.cache.keys());
      for (const key of keys) {
        this.finalizationRegistry.unregister(key);
      }
    }
    this.cache.clear();
  }
  
  get size(): number {
    if (!hasWeakRef) return 0;
    
    // Count only live references
    let count = 0;
    const values = Array.from(this.cache.values());
    for (const ref of values) {
      if (ref?.deref() !== undefined) {
        count++;
      }
    }
    return count;
  }
  
  onCleanup(callback: (key: K) => void): void {
    this.cleanupCallbacks.add(callback);
  }
  
  offCleanup(callback: (key: K) => void): void {
    this.cleanupCallbacks.delete(callback);
  }
}

/**
 * Memory-efficient string storage using string interning
 * Stores only one copy of each unique string
 */
export class StringInterner {
  private stringMap = new Map<string, string>();
  private stringSet = new Set<string>();
  
  intern(str: string): string {
    if (this.stringSet.has(str)) {
      return this.stringMap.get(str)!;
    }
    
    this.stringSet.add(str);
    this.stringMap.set(str, str);
    return str;
  }
  
  get internedSize(): number {
    return this.stringSet.size;
  }
  
  clear(): void {
    this.stringMap.clear();
    this.stringSet.clear();
  }
}

/**
 * Global string interner for commonly used strings
 */
export const globalStringInterner = new StringInterner();

/**
 * Monitors memory usage and triggers callbacks when thresholds are exceeded
 */
export class MemoryMonitor {
  private interval: ReturnType<typeof setInterval> | null = null;
  private callbacks: Array<{ threshold: number; callback: (usage: number) => void }> = [];
  
  start(intervalMs: number = 1000): void {
    if (this.interval) {
      return; // Already started
    }
    
    this.interval = setInterval(() => {
      const usage = this.getMemoryUsage();
      memoryUsage.value = {
        ...memoryUsage.value,
        allocated: usage,
      };
      
      // Check thresholds
      for (const { threshold, callback } of this.callbacks) {
        if (usage > threshold) {
          callback(usage);
        }
      }
      
      // Log warnings for high memory usage
      if (usage > MEMORY_WARNING_THRESHOLD) {
        console.warn(`High memory usage: ${this.formatBytes(usage)}`);
      }
      
      if (usage > MEMORY_CRITICAL_THRESHOLD) {
        console.error(`Critical memory usage: ${this.formatBytes(usage)}`);
      }
    }, intervalMs);
  }
  
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
  
  onThreshold(threshold: number, callback: (usage: number) => void): void {
    this.callbacks.push({ threshold, callback });
  }
  
  getMemoryUsage(): number {
    // Use performance.memory if available (Chrome)
    if (hasPerformanceMemory) {
      return performance.memory!.usedJSHeapSize;
    }
    
    // Use window.performance.memory if available (Firefox)
    const windowPerf = (window as { performance?: { memory?: { usedJSHeapSize: number } } }).performance;
    if (windowPerf?.memory) {
      return windowPerf.memory.usedJSHeapSize;
    }
    
    // Fallback to a rough estimate
    return 0;
  }
  
  formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
}

/**
 * Global memory monitor instance
 */
export const memoryMonitor = new MemoryMonitor();

/**
 * Batch processor that processes items in chunks to avoid memory spikes
 */
export class BatchProcessor<T, R> {
  private batchSize: number;
  private delayMs: number;
  
  constructor(batchSize: number = 100, delayMs: number = 10) {
    this.batchSize = batchSize;
    this.delayMs = delayMs;
  }
  
  async process(items: T[], processor: (item: T) => R | Promise<R>): Promise<R[]> {
    const results: R[] = [];
    
    for (let i = 0; i < items.length; i += this.batchSize) {
      const batch = items.slice(i, i + this.batchSize);
      const batchPromises = batch.map(item => processor(item));
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Yield to the event loop to prevent memory spikes
      if (i + this.batchSize < items.length) {
        await new Promise(resolve => setTimeout(resolve, this.delayMs));
      }
    }
    
    return results;
  }
  
  async processWithProgress(
    items: T[], 
    processor: (item: T) => R | Promise<R>, 
    onProgress?: (progress: { current: number; total: number; percent: number }) => void
  ): Promise<R[]> {
    const results: R[] = [];
    const total = items.length;
    
    for (let i = 0; i < items.length; i += this.batchSize) {
      const batch = items.slice(i, i + this.batchSize);
      const batchPromises = batch.map(item => processor(item));
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Report progress
      if (onProgress) {
        onProgress({
          current: Math.min(i + this.batchSize, total),
          total,
          percent: Math.round((Math.min(i + this.batchSize, total) / total) * 100)
        });
      }
      
      // Yield to the event loop
      if (i + this.batchSize < items.length) {
        await new Promise(resolve => setTimeout(resolve, this.delayMs));
      }
    }
    
    return results;
  }
}

/**
 * Utility for creating memory-efficient event handlers
 * Prevents memory leaks from event listener accumulation
 */
export function createWeakEventHandler<T extends HTMLElement = HTMLElement>(
  element: T,
  eventType: string,
  handler: (this: T, ev: Event) => void
): () => void {
  // Use a weak reference to the element (if available)
  let elementRef: { deref: () => T | undefined };
  
  if (hasWeakRef) {
    elementRef = new WeakRef(element);
  } else {
    // Fallback to strong reference if WeakRef not available
    elementRef = { deref: () => element };
  }
  
  const wrappedHandler = (event: Event) => {
    const currentElement = elementRef.deref();
    if (currentElement) {
      handler.call(currentElement, event);
    } else {
      // Element was garbage collected, remove the listener
      removeHandler();
    }
  };
  
  element.addEventListener(eventType, wrappedHandler);
  
  const removeHandler = () => {
    const currentElement = elementRef.deref();
    if (currentElement) {
      currentElement.removeEventListener(eventType, wrappedHandler);
    }
  };
  
  return removeHandler;
}

/**
 * Gets the current memory usage statistics
 */
export function getMemoryUsageStats() {
  return { ...memoryUsage.value };
}

// Start memory monitoring by default (can be stopped if not needed)
memoryMonitor.start();

// Export the memory usage signal for UI integration
export { memoryUsage };