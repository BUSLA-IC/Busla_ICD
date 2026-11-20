const path = require('path');
const fs = require('fs');
const http = require('http');

const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
const ROOT_DIR = __dirname;

let express = null;
try {
  express = require('express');
} catch {
  express = null;
}

if (express) {
  const app = express();

  app.use(express.static(ROOT_DIR, {
    dotfiles: 'ignore',
    index: 'index.html',
  }));

  app.get('/', (req, res) => {
    res.sendFile(path.join(ROOT_DIR, 'index.html'));
  });

  app.listen(PORT, HOST, () => {
    console.log(`Server running at http://${HOST}:${PORT}`);
  });
} else {
  const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.pdf': 'application/pdf',
  };

  const server = http.createServer((req, res) => {
    const reqUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    let relPath = decodeURIComponent(reqUrl.pathname);
    if (relPath === '/') relPath = '/index.html';

    // Block hidden dotfiles & path traversal
    const segments = relPath.split('/').filter(Boolean);
    if (segments.some(seg => seg.startsWith('.') || seg === '..')) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    let filePath = path.resolve(ROOT_DIR, '.' + relPath);
    if (!filePath.startsWith(ROOT_DIR)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });

  server.listen(PORT, HOST, () => {
    console.log(`Server running (built-in http) at http://${HOST}:${PORT}`);
  });
}
