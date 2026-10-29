import { chromium } from 'playwright-core';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') { p = '/index.html'; }
  const file = path.join(ROOT, p);
  try {
    const data = fs.readFileSync(file);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  } catch { res.writeHead(404); res.end('nope'); }
});

const EDGES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
];
const EDGE = EDGES.find(p => { try { return fs.existsSync(p); } catch { return false; } });

await new Promise(r => server.listen(4181, r));
const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGEERROR', String(e).slice(0, 200)));
await page.goto('http://localhost:4181/', { waitUntil: 'load' });
for (let dead = Date.now() + 8000; Date.now() < dead;) {
  const ok = await page.evaluate(() => { const b = document.getElementById('introEnter'); return !!b && b.classList.contains('in'); });
  if (ok) break;
  await page.waitForTimeout(150);
}
const info = await page.evaluate(() => {
  const b = document.getElementById('introEnter');
  const st = document.getElementById('venomStage');
  const cb = st ? st.style.cssText : '';
  const before = document.activeElement.id || document.activeElement.tagName;
  let thrown = null;
  try { b.focus({ preventScroll: true }); } catch (e) { thrown = String(e); }
  const after = document.activeElement.id || document.activeElement.tagName;
  return {
    before, after, thrown,
    stageVisibility: st ? getComputedStyle(st).visibility : null,
    stageOpacityIn: st ? st.className : null,
    btnVisibility: getComputedStyle(b).visibility,
    btnOpacity: getComputedStyle(b).opacity,
    btnTabIndex: b.tabIndex,
    btnDisabled: b.disabled,
    stageCss: cb
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
server.close();
