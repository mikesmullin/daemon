// HTTP server module for Task Management Plugin
// Serves the SPA and provides JSON API endpoints

import { file } from 'bun';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as tools from './tools.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Create and configure HTTP server
 * @param {number} port - Port to listen on (default: 3001)
 * @returns {Server} Bun server instance
 */
export function createServer(port = 3001) {
  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;

      // API endpoints
      if (path.startsWith('/api/')) {
        return await handleAPI(path, req);
      }

      // Serve static files from public/
      return await handleStatic(path);
    },
  });

  console.log(`📋 Task Management UI running at http://localhost:${port}`);
  return server;
}

/**
 * Handle API requests
 * @param {string} path - Request path
 * @param {Request} req - Request object
 * @returns {Response} JSON response
 */
async function handleAPI(path, req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    // GET /api/tickets - List all tickets
    if (path === '/api/tickets' && req.method === 'GET') {
      const url = new URL(req.url);
      const status = url.searchParams.get('status');
      const assignee = url.searchParams.get('assignee');
      const urgency = url.searchParams.get('urgency');
      const importance = url.searchParams.get('importance');
      const labels = url.searchParams.get('labels');
      const sort = url.searchParams.get('sort');
      const limit = url.searchParams.get('limit');
      const offset = url.searchParams.get('offset');

      const filters = {};
      if (status) filters.status = status;
      if (assignee) filters.assignee = assignee;
      if (urgency) filters.urgency = parseInt(urgency);
      if (importance) filters.importance = parseInt(importance);
      if (labels) filters.labels = labels.split(',');
      if (sort) filters.sort = sort;
      if (limit) filters.limit = parseInt(limit);
      if (offset) filters.offset = parseInt(offset);

      const tickets = await tools.listTickets(filters);
      return new Response(JSON.stringify(tickets), { headers });
    }

    // GET /api/ticket/:id - Get single ticket
    if (path.match(/^\/api\/ticket\/\d+$/) && req.method === 'GET') {
      const id = parseInt(path.split('/').pop());
      const ticket = await tools.getTicket({ id });
      
      if (!ticket) {
        return new Response(JSON.stringify({ error: 'Ticket not found' }), {
          status: 404,
          headers
        });
      }

      return new Response(JSON.stringify(ticket), { headers });
    }

    // GET /api/ticket/:id/comments - Get ticket comments
    if (path.match(/^\/api\/ticket\/\d+\/comments$/) && req.method === 'GET') {
      const id = parseInt(path.split('/')[3]);
      const url = new URL(req.url);
      const limit = url.searchParams.get('limit');
      const offset = url.searchParams.get('offset');

      const comments = await tools.getComments({
        ticketId: id,
        limit: limit ? parseInt(limit) : 100,
        offset: offset ? parseInt(offset) : 0
      });

      return new Response(JSON.stringify(comments), { headers });
    }

    // GET /api/ticket/:id/history - Get ticket history
    if (path.match(/^\/api\/ticket\/\d+\/history$/) && req.method === 'GET') {
      const id = parseInt(path.split('/')[3]);
      const url = new URL(req.url);
      const limit = url.searchParams.get('limit');

      const history = await tools.getTicketHistory({
        ticketId: id,
        limit: limit ? parseInt(limit) : 100
      });

      return new Response(JSON.stringify(history), { headers });
    }

    // Unknown API endpoint
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers
    });

  } catch (error) {
    console.error('API error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers
    });
  }
}

/**
 * Handle static file requests
 * @param {string} path - Request path
 * @returns {Response} File response
 */
async function handleStatic(path) {
  // Root path serves index.html
  if (path === '/' || path === '') {
    path = '/index.html';
  }

  // Map routes to HTML files
  if (path === '/kanban') {
    path = '/kanban.html';
  } else if (path === '/plan') {
    path = '/plan.html';
  } else if (path.startsWith('/ticket/')) {
    path = '/ticket.html';
  }

  // Resolve file path
  const filePath = join(__dirname, 'public', path.slice(1));

  try {
    const fileContent = file(filePath);
    const exists = await fileContent.exists();

    if (!exists) {
      return new Response('Not Found', { status: 404 });
    }

    // Determine content type
    const ext = path.split('.').pop();
    const contentTypes = {
      html: 'text/html',
      css: 'text/css',
      js: 'application/javascript',
      json: 'application/json',
      png: 'image/png',
      jpg: 'image/jpeg',
      svg: 'image/svg+xml',
    };

    const contentType = contentTypes[ext] || 'application/octet-stream';

    return new Response(fileContent, {
      headers: {
        'Content-Type': contentType,
      },
    });
  } catch (error) {
    console.error('Static file error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
