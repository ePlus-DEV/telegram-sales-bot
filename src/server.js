import http from 'node:http';
import { Readable } from 'node:stream';
import { handleRequest } from './runtime.js';

export function createServer(env = process.env) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://localhost');
      const options = { method: req.method, headers: req.headers };
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        options.body = Readable.toWeb(req);
        options.duplex = 'half';
      }
      const request = new Request(url, options);
      const tasks = [];
      const result = await handleRequest(request, { env, waitUntil: task => tasks.push(Promise.resolve(task)) });
      res.writeHead(result.status, Object.fromEntries(result.headers.entries()));
      res.end(Buffer.from(await result.arrayBuffer()));
      // Retain Node event-loop work; surface async failures to logs.
      if (tasks.length) Promise.allSettled(tasks).then(items => {
        for (const item of items) if (item.status === 'rejected') console.error('Background notification:', item.reason);
      });
    } catch (error) {
      console.error('HTTP request error:', error.message);
      res.writeHead(500, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: 'internal error' }));
    }
  });
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  createServer().listen(port, '0.0.0.0', () => {
    console.log('Telegram Sales Bot HTTP server listening on port ' + port);
  });
}
