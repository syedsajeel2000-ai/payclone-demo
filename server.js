'use strict';
/* PayClone server — zero external dependencies.
 * Serves the SPA from ./public and the JSON API under /api.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { PORT, NODE_ENV, loadDotEnv } = require('./lib/config');
const { handleApi } = require('./lib/api');
const db = require('./lib/db');

loadDotEnv(path.join(__dirname, '.env'));

const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

function serveFile(req, res, filePath, cacheable) {
  fs.readFile(filePath, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const stat = fs.statSync(filePath);
    const etag = 'W/"' + stat.size.toString(16) + '-' + stat.mtimeMs.toString(16) + '"';
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { ETag: etag });
      res.end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': cacheable ? 'public, max-age=300' : 'no-cache',
      ETag: etag
    });
    res.end(buf);
  });
}

const requestHandler = async (req, res) => {
  try {
    await db.prime(); // hydrate persistent store (redis) before serving
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);

    /* API */
    if (pathname.startsWith('/api/')) {
      const handled = await handleApi(req, res, pathname, url.searchParams);
      if (handled) return;
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Endpoint not found.' }));
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Method not allowed.' }));
      return;
    }

    /* Static files (path-traversal safe) */
    let rel = pathname === '/' ? '/index.html' : pathname;
    let filePath = path.normalize(path.join(PUBLIC_DIR, rel));
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(PUBLIC_DIR, 'index.html'); // SPA fallback
    }
    const cacheable = path.extname(filePath) !== '.html';
    serveFile(req, res, filePath, cacheable && NODE_ENV === 'production');
  } catch (err) {
    console.error('[server]', err);
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Internal server error.' }));
  }
};

const server = http.createServer(requestHandler);

if (require.main === module) {
  server.listen(PORT, () => {
    console.log('');
    console.log('  PayClone — PayPal-inspired DEMO payment platform');
    console.log('  Demo wallet only · no real money is transferred');
    console.log(`  ➜  http://localhost:${PORT}`);
    console.log('');
  });
}

module.exports = { server, requestHandler };
