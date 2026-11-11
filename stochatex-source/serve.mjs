// Minimal static server with Range support (mimics GitHub Pages) for local testing.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(process.argv[2] || 'dist'); const port = +(process.argv[3] || 8123);
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.wasm':'application/wasm', '.gz':'application/gzip', '.svg':'image/svg+xml', '.pdf':'application/pdf', '.woff2':'font/woff2' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  const size = fs.statSync(f).size; const h = { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
  const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
  if (m) { const s = +m[1], e = m[2] ? Math.min(+m[2], size - 1) : size - 1; res.writeHead(206, { ...h, 'Content-Range': `bytes ${s}-${e}/${size}`, 'Content-Length': e - s + 1 }); fs.createReadStream(f, { start: s, end: e }).pipe(res); }
  else { res.writeHead(200, { ...h, 'Content-Length': size }); fs.createReadStream(f).pipe(res); }
}).listen(port, () => console.log('serving', root, 'on', port));
