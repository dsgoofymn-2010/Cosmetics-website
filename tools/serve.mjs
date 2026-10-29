/* Tiny static server for local QA. node tools/serve.mjs [port]
   Serves the repo root, case sensitive like Vercel, with optional throttling
   (?slow=1 on any request is ignored; use THROTTLE_KBPS env to slow every response). */
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join, dirname, basename, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, gzipSync, constants as Z } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] || 4173);
const KBPS = Number(process.env.THROTTLE_KBPS || 0);
/* apply vercel.json headers locally so QA sees the same CSP and caching */
let VH = [];
try { VH = JSON.parse(await readFile(join(ROOT, 'vercel.json'), 'utf8')).headers || []; } catch {}
function vercelHeaders(path) {
  const out = {};
  for (const rule of VH) {
    if (new RegExp('^' + rule.source + '$').test(path)) for (const h of rule.headers) out[h.key] = h.value;
  }
  return out;
}
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.glb': 'model/gltf-binary',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.txt': 'text/plain', '.xml': 'application/xml', '.vcf': 'text/vcard', '.ico': 'image/x-icon'
};

/* Windows file systems ignore case; Vercel does not. Reject a path unless every
   segment matches the real name exactly. */
async function exactCase(rel) {
  let dir = ROOT;
  for (const seg of rel.split('/').filter(Boolean)) {
    const names = await readdir(dir);
    if (!names.includes(seg)) return false;
    dir = join(dir, seg);
  }
  return true;
}

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const rel = normalize(path).replace(/\\/g, '/').replace(/^\/+/, '');
    if (rel.startsWith('..') || !(await exactCase(rel))) throw new Error('404');
    let body = await readFile(join(ROOT, rel));
    const type = TYPES[extname(rel)] || 'application/octet-stream';
    const head = { 'Content-Type': type, ...vercelHeaders('/' + rel) };
    /* PROD=1 keeps vercel.json caching; otherwise never cache while developing */
    if (!process.env.PROD) head['Cache-Control'] = 'no-store';
    /* compress text like Vercel does */
    const ae = String(req.headers['accept-encoding'] || '');
    if (/text|javascript|json|xml|svg|manifest|vcard/.test(type) && body.length > 1024) {
      if (ae.includes('br')) { body = brotliCompressSync(body, { params: { [Z.BROTLI_PARAM_QUALITY]: 9 } }); head['Content-Encoding'] = 'br'; }
      else if (ae.includes('gzip')) { body = gzipSync(body); head['Content-Encoding'] = 'gzip'; }
      head['Vary'] = 'Accept-Encoding';
    }
    res.writeHead(200, head);
    if (!KBPS) return res.end(body);
    const chunk = Math.max(1024, Math.round(KBPS * 1024 / 10));
    for (let i = 0; i < body.length; i += chunk) {
      res.write(body.subarray(i, i + chunk));
      await new Promise((r) => setTimeout(r, 100));
    }
    res.end();
  } catch {
    const nf = await readFile(join(ROOT, '404.html')).catch(() => Buffer.from('Not found'));
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(nf);
  }
}).listen(PORT, () => console.log('serving ' + ROOT + ' on http://localhost:' + PORT + (KBPS ? ' at ' + KBPS + ' KB/s' : '')));
