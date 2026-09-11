/**
 * Markdown Worker Manager
 * 
 * Manages Web Worker pools for offloading markdown parsing to separate threads.
 * This significantly improves UI responsiveness during heavy markdown processing.
 */

import { useEffect, useState, useRef } from "preact/hooks";

// Worker pool configuration
const WORKER_POOL_SIZE = 2; // Number of workers to keep warm
const WORKER_IDLE_TIMEOUT = 30000; // Terminate idle workers after 30 seconds

// Types for worker messages and results
interface WorkerMessage<T extends string, D = unknown> {
  type: T;
  data?: D;
  messageId?: string;
}

interface ParseRequest {
  markdown: string;
  options?: {
    gfm?: boolean;
    breaks?: boolean;
    sanitize?: boolean;
    smartypants?: boolean;
  };
}

interface ParseResult {
  success: boolean;
  html?: string;
  parseTime?: number;
  error?: string;
  workerId?: string;
}

interface HeadingsResult {
  success: boolean;
  headings?: { level: number; title: string }[];
  parseTime?: number;
  error?: string;
  workerId?: string;
}

// Worker instance class
class MarkdownWorkerInstance {
  private worker: Worker;
  private busy = false;
  private lastUsed = Date.now();
  private pending: Array<{ 
    message: WorkerMessage<string>; 
    resolve: (value: any) => void; 
    reject: (error: Error) => void 
  }> = [];
  private messageIdCounter = 0;

  constructor() {
    // Create the worker from the public directory
    this.worker = new Worker(new URL("/markdownWorker.js", import.meta.url), { type: "module" });
    this.setupMessageHandler();
  }

  private setupMessageHandler() {
    this.worker.onmessage = (e: MessageEvent) => {
      const message = e.data as WorkerMessage<string> & { workerId?: string };
      
      switch (message.type) {
        case 'WORKER_READY': {
          // Worker is ready to receive messages
          this.busy = false;
          this.processQueue();
          break;
        }
          
        case 'PARSE_RESULT':
        case 'EXTRACT_HEADINGS_RESULT':
        case 'PONG':
        case 'PERF_STATS': {
          // Forward result to the waiting promise
          const pending = this.pending.find(p => p.message.messageId === message.messageId);
          if (pending) {
            this.pending = this.pending.filter(p => p.message.messageId !== message.messageId);
            this.busy = false;
            this.lastUsed = Date.now();
            this.processQueue();
            
            if (message.type === 'PARSE_RESULT') {
              const result = message as WorkerMessage<'PARSE_RESULT', ParseResult>;
              pending.resolve(result.data);
            } else if (message.type === 'EXTRACT_HEADINGS_RESULT') {
              const result = message as WorkerMessage<'EXTRACT_HEADINGS_RESULT', HeadingsResult>;
              pending.resolve(result.data);
            } else if (message.type === 'PONG') {
              pending.resolve({ success: true, workerId: (message.data as { workerId?: string })?.workerId });
            } else {
              pending.resolve(message.data);
            }
          }
          break;
        }
          
        case 'ERROR': {
          const pendingError = this.pending.find(p => p.message.messageId === message.messageId);
          if (pendingError) {
            this.pending = this.pending.filter(p => p.message.messageId !== message.messageId);
            this.busy = false;
            pendingError.reject(new Error((message.data as { error?: string })?.error || 'Worker error'));
            this.processQueue();
          }
          break;
        }
      }
    };

    this.worker.onerror = (error) => {
      console.error("Markdown worker error:", error);
      // Mark all pending requests as failed
      const errorMessage = error.message || 'Worker error';
      const failed = this.pending.splice(0);
      for (const pending of failed) {
        pending.reject(new Error(errorMessage));
      }
      this.busy = false;
    };
  }

  private processQueue() {
    if (this.pending.length > 0 && !this.busy) {
      const next = this.pending.shift()!;
      this.busy = true;
      this.worker.postMessage(next.message);
    }
  }

  private generateMessageId() {
    return `${Date.now()}-${++this.messageIdCounter}`;
  }

  async parse(markdown: string, options?: ParseRequest['options']): Promise<ParseResult> {
    return this.sendMessage<ParseRequest, ParseResult>('PARSE', { markdown, options });
  }

  async extractHeadings(markdown: string): Promise<HeadingsResult> {
    return this.sendMessage<{ markdown: string }, HeadingsResult>('EXTRACT_HEADINGS', { markdown });
  }

  async ping(): Promise<{ success: boolean; workerId?: string }> {
    return this.sendMessage<void, { success: boolean; workerId?: string }>('PING');
  }

  terminate(): void {
    this.worker.terminate();
  }

  isIdle(): boolean {
    return !this.busy && this.pending.length === 0;
  }

  getIdleTime(): number {
    return Date.now() - this.lastUsed;
  }

  private async sendMessage<T, R>(type: string, data?: T): Promise<R> {
    const messageId = this.generateMessageId();
    const message: WorkerMessage<string, T> = { type, data, messageId };
    
    return new Promise<R>((resolve, reject) => {
      this.pending.push({ message, resolve, reject });
      this.lastUsed = Date.now();
      this.processQueue();
    });
  }
}

// Worker pool manager
class MarkdownWorkerPool {
  private pool: MarkdownWorkerInstance[] = [];
  private availableWorkers: MarkdownWorkerInstance[] = [];

  constructor(size: number = WORKER_POOL_SIZE) {
    this.initializePool(size);
  }

  private initializePool(size: number) {
    for (let i = 0; i < size; i++) {
      const worker = new MarkdownWorkerInstance();
      this.pool.push(worker);
      this.availableWorkers.push(worker);
    }
  }

  private async getAvailableWorker(): Promise<MarkdownWorkerInstance> {
    // Find an available worker
    let worker = this.availableWorkers.find(w => !w.isIdle());
    
    if (!worker) {
      // All workers are busy, wait for one to become available
      await new Promise(resolve => {
        const checkInterval = setInterval(() => {
          worker = this.availableWorkers.find(w => !w.isIdle());
          if (worker) {
            clearInterval(checkInterval);
            resolve(worker);
          }
        }, 10);
        
        // Timeout after 5 seconds to prevent deadlocks
        setTimeout(() => {
          clearInterval(checkInterval);
          // Create a new worker if all are still busy
          worker = new MarkdownWorkerInstance();
          this.pool.push(worker);
          this.availableWorkers.push(worker);
          resolve(worker);
        }, 5000);
      });
    }
    
    return worker!;
  }

  async parse(markdown: string, options?: ParseRequest['options']): Promise<ParseResult> {
    const worker = await this.getAvailableWorker();
    return worker.parse(markdown, options);
  }

  async extractHeadings(markdown: string): Promise<HeadingsResult> {
    const worker = await this.getAvailableWorker();
    return worker.extractHeadings(markdown);
  }

  cleanupIdleWorkers() {
    const idleWorkers = this.pool.filter(worker => 
      worker.isIdle() && worker.getIdleTime() > WORKER_IDLE_TIMEOUT
    );
    
    for (const idleWorker of idleWorkers) {
      const index = this.pool.indexOf(idleWorker);
      if (index > -1) {
        this.pool.splice(index, 1);
      }
      
      const availableIndex = this.availableWorkers.indexOf(idleWorker);
      if (availableIndex > -1) {
        this.availableWorkers.splice(availableIndex, 1);
      }
      
      idleWorker.terminate();
    }
  }
}

// Global worker pool instance
let globalWorkerPool: MarkdownWorkerPool | null = null;

/**
 * Gets the global markdown worker pool
 */
export function getMarkdownWorkerPool(): MarkdownWorkerPool {
  if (!globalWorkerPool) {
    globalWorkerPool = new MarkdownWorkerPool();
  }
  return globalWorkerPool;
}

/**
 * Parses markdown using a web worker
 */
export async function parseMarkdownInWorker(markdown: string, options?: ParseRequest['options']): Promise<ParseResult> {
  const pool = getMarkdownWorkerPool();
  return pool.parse(markdown, options);
}

/**
 * Extracts headings from markdown using a web worker
 */
export async function extractHeadingsInWorker(markdown: string): Promise<HeadingsResult> {
  const pool = getMarkdownWorkerPool();
  return pool.extractHeadings(markdown);
}

/**
 * React hook for using markdown worker parsing
 */
export function useMarkdownWorker() {
  const [isSupported, setIsSupported] = useState(true);
  const [workerPool] = useState(() => getMarkdownWorkerPool());

  // Check if web workers are supported
  useEffect(() => {
    setIsSupported(window.Worker !== undefined);
  }, []);

  const parseMarkdown = useRef(async (markdown: string, options?: ParseRequest['options']) => {
    if (!isSupported) {
      // Fallback to synchronous parsing if workers aren't supported
      console.warn("Web Workers not supported, falling back to synchronous parsing");
      return { 
        success: false, 
        error: "Web Workers not supported",
        html: "",
        parseTime: 0 
      };
    }
    
    return workerPool.parse(markdown, options);
  }).current;

  const extractHeadings = useRef(async (markdown: string) => {
    if (!isSupported) {
      return { 
        success: false, 
        error: "Web Workers not supported",
        headings: [],
        parseTime: 0 
      };
    }
    
    return workerPool.extractHeadings(markdown);
  }).current;

  return {
    isSupported,
    parseMarkdown,
    extractHeadings,
    cleanup: () => workerPool.cleanupIdleWorkers()
  };
}

/**
 * Performance metrics for markdown parsing
 */
export const markdownParseMetrics = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  totalParseTime: 0,
  maxParseTime: 0,
  
  recordParse: (parseTime: number, success: boolean) => {
    markdownParseMetrics.totalRequests++;
    markdownParseMetrics.totalParseTime += parseTime;
    markdownParseMetrics.maxParseTime = Math.max(markdownParseMetrics.maxParseTime, parseTime);
    
    if (success) {
      markdownParseMetrics.successfulRequests++;
    } else {
      markdownParseMetrics.failedRequests++;
    }
  },
  
  getStats: () => ({
    totalRequests: markdownParseMetrics.totalRequests,
    successfulRequests: markdownParseMetrics.successfulRequests,
    failedRequests: markdownParseMetrics.failedRequests,
    avgParseTime: markdownParseMetrics.totalRequests > 0 
      ? markdownParseMetrics.totalParseTime / markdownParseMetrics.totalRequests 
      : 0,
    maxParseTime: markdownParseMetrics.maxParseTime
  })
};

// Fallback for environments without worker support
export const hasWorkerSupport = typeof Worker !== 'undefined' && typeof Blob !== 'undefined';

// Re-export types for consumers
export type { ParseResult, HeadingsResult, ParseRequest };