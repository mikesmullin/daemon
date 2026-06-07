// Web Operations
//
// - fetch_webpage(urls, query) // Fetch and analyze content from web pages
// - open_browser(url) // Open a URL in the default web browser
//

import { _G } from '../lib/globals.mjs';
import utils, { log } from '../lib/utils.mjs';

_G.tools.fetch_webpage = {
  definition: {
    type: 'function',
    function: {
      name: 'fetch_webpage',
      description: 'Fetches the main content from a web page. This tool is useful for summarizing or analyzing the content of a webpage. You should use this tool when you think the user is looking for information from a specific webpage.',
      parameters: {
        type: 'object',
        properties: {
          urls: {
            type: 'array',
            items: {
              type: 'string'
            },
            description: 'An array of URLs to fetch content from.'
          },
          query: {
            type: 'string',
            description: 'The query to search for in the web page\'s content. This should be a clear and concise description of the content you want to find.'
          }
        },
        required: ['urls', 'query']
      }
    }
  },
  execute: async (args, options = {}) => {
    const { urls, query } = args;

    if (!Array.isArray(urls) || urls.length === 0) {
      throw new Error('URLs array is required and must not be empty');
    }

    if (!query || typeof query !== 'string') {
      throw new Error('Query is required and must be a string');
    }

    log('debug', `Fetching content from ${urls.length} URL(s) for query: "${query}"`);

    const results = [];

    for (const url of urls) {
      try {
        // Validate URL format
        new URL(url); // This will throw if URL is invalid

        utils.logFetch(url);

        // Fetch the webpage content
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; AI Agent/1.0; +https://github.com/mikesmullin/copilot-cli)'
          },
          timeout: 10000 // 10 second timeout
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
          throw new Error(`Unsupported content type: ${contentType}`);
        }

        const html = await response.text();

        // Extract main content from HTML
        const content = extractMainContent(html);

        // Filter content based on query
        const relevantContent = filterContentByQuery(content, query);

        results.push({
          url,
          content: relevantContent,
          success: true
        });

      } catch (error) {
        log('error', `Error fetching ${url}: ${error.message}`);
        results.push({
          url,
          error: error.message,
          success: false
        });
      }
    }

    // Format response
    const successfulResults = results.filter(r => r.success);
    const failedResults = results.filter(r => !r.success);

    let response = '';

    if (successfulResults.length > 0) {
      for (const result of successfulResults) {
        response += `Here is some relevant context from the web page ${result.url}:\n\n`;
        response += result.content;
        response += '\n\n';
      }
    }

    if (failedResults.length > 0) {
      response += '\nErrors encountered:\n';
      for (const result of failedResults) {
        response += `- ${result.url}: ${result.error}\n`;
      }
    }

    if (successfulResults.length === 0) {
      return {
        success: false,
        content: 'No content could be retrieved from the provided URLs.',
        metadata: {
          urls: urls,
          query: query,
          errors: failedResults,
          operation: 'fetch_webpage'
        }
      };
    }

    // Log the operation
    utils.logFetch(`Fetched content from ${successfulResults.length} webpage(s) for query: "${query}"`);

    return {
      success: true,
      content: response.trim(),
      metadata: {
        urls: urls,
        query: query,
        successfulResults: successfulResults.length,
        failedResults: failedResults.length,
        errors: failedResults,
        operation: 'fetch_webpage'
      }
    };
  }
};

// Helper function to extract main content from HTML
function extractMainContent(html) {
  if (!html || typeof html !== 'string') {
    return '';
  }

  // Remove script and style tags
  let content = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Remove HTML comments
  content = content.replace(/<!--[\s\S]*?-->/g, '');

  // Try to extract content from semantic HTML elements first
  const semanticElements = [
    'main', 'article', 'section', 'div[role="main"]',
    '.content', '.main-content', '.article-content', '.post-content'
  ];

  for (const selector of semanticElements) {
    const match = content.match(new RegExp(`<${selector}[^>]*>([\\s\\S]*?)<\/${selector.split(/[\s\[\.]/)[0]}>`, 'i'));
    if (match && match[1].trim().length > 200) {
      content = match[1];
      break;
    }
  }

  // Remove remaining HTML tags
  content = content.replace(/<[^>]*>/g, ' ');

  // Decode HTML entities
  content = content.replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
    .replace(/&#x([0-9a-f]+);/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)));

  // Clean up whitespace
  content = content.replace(/\s+/g, ' ').trim();

  // Limit content length to prevent overwhelming responses
  if (content.length > 8000) {
    content = content.substring(0, 8000) + '...';
  }

  return content;
}

// Helper function to filter content based on query
function filterContentByQuery(content, query) {
  if (!content || !query || typeof content !== 'string') {
    return content || '';
  }

  const queryTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 2);
  if (queryTerms.length === 0) return content;

  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const relevantSentences = [];
  const contentLower = content.toLowerCase();

  // First, look for sentences containing query terms
  for (const sentence of sentences) {
    const sentenceLower = sentence.toLowerCase();
    let relevanceScore = 0;

    for (const term of queryTerms) {
      if (sentenceLower.includes(term)) {
        relevanceScore++;
      }
    }

    if (relevanceScore > 0) {
      relevantSentences.push({
        text: sentence.trim(),
        score: relevanceScore
      });
    }
  }

  // If we found relevant sentences, return them sorted by relevance
  if (relevantSentences.length > 0) {
    relevantSentences.sort((a, b) => b.score - a.score);
    let filteredContent = relevantSentences.slice(0, 10).map(s => s.text).join('. ');

    // If the filtered content is too short, include more context
    if (filteredContent.length < 500 && content.length > filteredContent.length) {
      // Try to include surrounding context
      const contextLength = Math.min(2000, content.length);
      const startPos = Math.max(0, contentLower.indexOf(queryTerms[0]) - 200);
      filteredContent = content.substring(startPos, startPos + contextLength);
      if (startPos > 0) filteredContent = '...' + filteredContent;
      if (startPos + contextLength < content.length) filteredContent += '...';
    }

    return filteredContent;
  }

  // If no specific matches, return the beginning of the content
  return content.length > 2000 ? content.substring(0, 2000) + '...' : content;
}

// Open Browser Tool
_G.tools.open_browser = {
  definition: {
    type: 'function',
    function: {
      name: 'open_browser',
      description: 'Opens a URL in the default web browser. Useful for displaying web pages, documentation, or web applications to the user to interact with.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The URL to open in the browser. Must be a valid http:// or https:// URL.'
          }
        },
        required: ['url']
      }
    }
  },
  execute: async (args, options = {}) => {
    const { url } = args;

    if (!url || typeof url !== 'string') {
      throw new Error('URL is required and must be a string');
    }

    // Validate URL format
    let validatedUrl;
    try {
      validatedUrl = new URL(url);
      if (!['http:', 'https:'].includes(validatedUrl.protocol)) {
        throw new Error('URL must use http:// or https:// protocol');
      }
    } catch (error) {
      throw new Error(`Invalid URL: ${error.message}`);
    }

    log('debug', `Opening URL in browser: ${url}`);

    try {
      // Use the 'open' npm package which handles platform detection automatically
      const { default: open } = await import('open');

      // Open the URL in the default browser
      const childProcess = await open(url, { wait: false });

      // Track child process for cleanup
      if (childProcess && typeof childProcess === 'object') {
        _G.childProcesses.add(childProcess);
      }

      // CRITICAL FIX for WSL2:
      // The 'open' package has a bug where it doesn't set detached: true and stdio: 'ignore'
      // for WSL2/PowerShell (it only does this for Linux/xdg-open).
      // This means the PowerShell child process is still attached to our parent process.
      // If our parent exits via process.exit(0) before PowerShell completes its handoff
      // to Windows, the browser won't launch.
      // 
      // Solution: Wait for the PowerShell process to exit (which happens quickly ~250ms)
      // before allowing our parent process to exit.
      if (childProcess && typeof childProcess === 'object') {
        await new Promise((resolve) => {
          childProcess.on('exit', (code) => {
            _G.childProcesses.delete(childProcess);
            // log('debug', `Browser launched (exit code: ${code})`);
            resolve();
          });

          childProcess.on('error', (err) => {
            _G.childProcesses.delete(childProcess);
            log('debug', `Browser launch error: ${err.message}`);
            resolve();
          });

          // Safety timeout in case the process doesn't exit
          setTimeout(() => {
            log('debug', 'Browser launch timeout');
            resolve();
          }, 2000);
        });
      } return {
        success: true,
        content: `Successfully opened ${url} in the user's default browser.`,
        // metadata: {
        // url: url,
        // platform: process.platform,
        // operation: 'open_browser'
        // }
      };

    } catch (error) {
      log('error', `Error opening browser: ${error.message}`);

      return {
        success: false,
        content: `Failed to open browser: ${error.message}`,
        metadata: {
          url: url,
          platform: process.platform,
          error: error.message,
          operation: 'open_browser'
        }
      };
    }
  }
};