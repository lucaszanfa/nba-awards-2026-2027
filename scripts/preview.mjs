import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve('dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    const file = resolve(root, '.' + decodeURIComponent(path === '/' ? '/index.html' : path));
    if (!file.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
    res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    if (path === '/config.js' && process.env.PREVIEW_API_URL) {
      res.end('window.BOLAO_CONFIG = ' + JSON.stringify({ apiUrl: process.env.PREVIEW_API_URL }) + ';'); return;
    }
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('Não encontrado'); }
}).listen(8080, '127.0.0.1', () => console.log('Prévia: http://127.0.0.1:8080'));
