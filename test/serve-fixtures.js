// Servidor estático mínimo para os testes (serve test/fixtures).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp' };

export function startFixtureServer(port = 0, host = '127.0.0.1') {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let p = url.pathname;
    if (p === '/' || p.startsWith('/ruim')) p = '/ruim.html';
    if (p.startsWith('/boa')) p = '/boa.html';
    if (p.startsWith('/media')) p = '/media.html';
    if (['/contato', '/agendar', '/privacidade', '/og.jpg', '/favicon.ico'].includes(p)) { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('ok'); }
    if (p === '/foto-grande.png') {
      // PNG "pesado" fictício: 1x1 válido seguido de bytes de preenchimento.
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
      res.writeHead(200, { 'content-type': 'image/png' });
      return res.end(Buffer.concat([png, Buffer.alloc(300 * 1024)]));
    }
    if (p === '/lento.js') {
      return setTimeout(() => { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end('var x=1;'); }, 300);
    }
    if (p === '/estilo.css') { res.writeHead(200, { 'content-type': 'text/css' }); return res.end('.a{color:#333}'); }
    if (p === '/foto.webp') {
      res.writeHead(200, { 'content-type': 'image/webp', 'cache-control': 'max-age=31536000' });
      // WebP 1×1 válido + preenchimento para simular ~20 KB.
      return res.end(Buffer.concat([Buffer.from('UklGRjoAAABXRUJQVlA4IC4AAADQAQCdASoEAAQAAUAmJaACdLoB+AADsAD+pNf/TSPGkeNI+Yt/84ljqd3aAAAA', 'base64'), Buffer.alloc(20 * 1024)]));
    }
    const file = path.join(dir, path.normalize(p));
    if (!file.startsWith(dir) || !fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, host, () => resolve(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const s = await startFixtureServer(Number(process.env.PORT) || 4000, process.env.HOST || '127.0.0.1');
  console.log('fixtures em http://127.0.0.1:' + s.address().port);
}
