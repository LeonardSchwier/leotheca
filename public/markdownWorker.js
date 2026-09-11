/**
 * Web Worker for Markdown Parsing
 * 
 * This worker runs in a separate thread to offload expensive markdown parsing
 * from the main UI thread, improving responsiveness during typing and rendering.
 */

importScripts('https://cdn.jsdelivr.net/npm/marked@11/marked.min.js');

// Worker state
let workerId = Date.now().toString(36) + Math.random().toString(36).substring(2);
let lastProcessTime = 0;
let totalProcessTime = 0;
let processedCount = 0;

// Performance monitoring
function logPerformance(markdownLength, parseTime) {
  lastProcessTime = parseTime;
  totalProcessTime += parseTime;
  processedCount++;
  
  if (processedCount % 10 === 0) {
    const avgTime = totalProcessTime / processedCount;
    postMessage({
      type: 'PERF_STATS',
      data: {
        workerId,
        lastProcessTime,
        avgProcessTime: avgTime,
        totalProcessed: processedCount
      }
    });
  }
}

// Main markdown parsing function
async function parseMarkdown(markdown, options = {}) {
  const startTime = performance.now();
  
  try {
    // Configure marked with the provided options
    marked.setOptions({
      gfm: true,
      breaks: true,
      sanitize: false, // We handle sanitization on the main thread
      smartypants: false,
      ...options
    });
    
    // Parse the markdown
    const html = marked.parse(markdown);
    
    const parseTime = performance.now() - startTime;
    logPerformance(markdown.length, parseTime);
    
    return {
      success: true,
      html,
      parseTime,
      workerId
    };
  } catch (error) {
    const parseTime = performance.now() - startTime;
    
    return {
      success: false,
      error: error.message || String(error),
      parseTime,
      workerId
    };
  }
}

// Extract headings from markdown for table of contents
function extractHeadings(markdown) {
  const startTime = performance.now();
  
  try {
    // Simple regex-based heading extraction (faster than full parsing)
    const headingRegex = /^(#{1,6})\s+(.+?)\s*$(?:\r?\n|$)/gm;
    const headings = [];
    
    let match;
    while ((match = headingRegex.exec(markdown)) !== null) {
      const level = match[1].length;
      const title = match[2];
      
      headings.push({
        level,
        title,
        // For now, we don't have line numbers, but we could add them
        // if the main thread sends us the markdown with line info
      });
    }
    
    const parseTime = performance.now() - startTime;
    
    return {
      success: true,
      headings,
      parseTime,
      workerId
    };
  } catch (error) {
    const parseTime = performance.now() - startTime;
    
    return {
      success: false,
      error: error.message || String(error),
      parseTime,
      workerId
    };
  }
}

// Handle messages from the main thread
self.onmessage = async function(e) {
  const { type, data, messageId } = e.data;
  
  switch (type) {
    case 'PARSE':
      const result = await parseMarkdown(data.markdown, data.options || {});
      postMessage({
        type: 'PARSE_RESULT',
        messageId,
        ...result
      });
      break;
      
    case 'EXTRACT_HEADINGS':
      const headingsResult = extractHeadings(data.markdown);
      postMessage({
        type: 'EXTRACT_HEADINGS_RESULT',
        messageId,
        ...headingsResult
      });
      break;
      
    case 'PING':
      postMessage({
        type: 'PONG',
        messageId,
        workerId
      });
      break;
      
    case 'TERMINATE':
      // Clean up and close the worker
      self.close();
      break;
      
    default:
      postMessage({
        type: 'ERROR',
        messageId,
        error: `Unknown message type: ${type}`
      });
  }
};

// Send initialization message
postMessage({
  type: 'WORKER_READY',
  workerId
});