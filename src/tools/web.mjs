// Web Operations
//
// - fetch_webpage(urls, query) // Fetch and analyze content from web pages
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
      response = 'No content could be retrieved from the provided URLs.';
    }

    return response.trim();
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