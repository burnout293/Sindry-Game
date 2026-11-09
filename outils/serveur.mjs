// Serves the game on http://localhost:8130 (or the port given): ES modules
// cannot load from a file:// page. Nothing else; no dependency.
//
//   node outils/serveur.mjs [port]

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const PORT = Number(process.argv[2] || 8130);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };

createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, `http://localhost:${PORT}`).pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT + sep)) { res.writeHead(403).end(); return; }   // never outside the game's folder
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(body);
  } catch { res.writeHead(404).end('Introuvable'); }
}).listen(PORT, () => console.log(`Roue libre : http://localhost:${PORT}/`));
