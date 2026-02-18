/**
 * Local dev server for Strike POS PWA.
 * Run: STRIKE_API_KEY=your_key node server.js
 * Serves static files from . and proxies POST /api/create-invoice to the serverless handler.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const createInvoiceHandler = require('./api/create-invoice').handler;
const getInvoiceHandler = require('./api/get-invoice').handler;

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

const PORT = process.env.PORT || 3000;

const server = http.createServer(async (req, res) => {
  const urlPath = req.url.split('?')[0];
  const urlSearch = req.url.includes('?') ? req.url.slice(req.url.indexOf('?') + 1) : '';
  const query = {};
  urlSearch.split('&').forEach((p) => {
    const [k, v] = p.split('=');
    if (k && v != null) query[k] = decodeURIComponent(v.replace(/\+/g, ' '));
  });

  if (req.method === 'POST' && urlPath === '/api/create-invoice') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const result = await createInvoiceHandler({ httpMethod: 'POST', body });
    res.writeHead(result.statusCode, result.headers);
    res.end(result.body);
    return;
  }

  if (req.method === 'GET' && urlPath === '/api/get-invoice') {
    const result = await getInvoiceHandler({
      httpMethod: 'GET',
      queryStringParameters: query,
    });
    res.writeHead(result.statusCode, result.headers);
    res.end(result.body);
    return;
  }

  if (req.method === 'OPTIONS' && (urlPath === '/api/create-invoice' || urlPath === '/api/get-invoice')) {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  let file = req.url === '/' ? '/index.html' : urlPath || req.url;
  file = path.join(__dirname, path.normalize(file).replace(/^(\.\.(\/|\\|$))+/, ''));
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  const ext = path.extname(file);
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
});

server.listen(PORT, () => {
  console.log(`Strike POS PWA: http://localhost:${PORT}`);
  if (!process.env.STRIKE_API_KEY) {
    console.warn('Warning: STRIKE_API_KEY not set. Invoice creation will fail.');
  }
});
