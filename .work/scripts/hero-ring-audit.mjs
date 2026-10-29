import { chromium } from 'playwright-core';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const ROOT = process.cwd();
const OUT = path.join(ROOT, '.work', 'previews', 'hero-ring-audit');
fs.mkdirSync(OUT, { recursive: true });
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
if (!EDGE) throw new Error('Microsoft Edge was not found');

const server = http.createServer((req, res) => {
  let pathname = decodeURIComponent((req.url || '/').split('?')[0]);
  if (pathname === '/') pathname = '/index.html';
  const file = path.join(ROOT, pathname);
  try {
    const data = fs.readFileSync(file);
    const ext = path.extname(file).toLowerCase();
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;

const widths = [390, 768, 1440];
const scenarios = [
  { name: 'normal-skip', returning: false, reduced: false, webgl: false, skip: true },
  { name: 'returning-visitor', returning: true, reduced: false, webgl: false, skip: false },
  { name: 'reduced-motion', returning: false, reduced: true, webgl: false, skip: false },
  { name: 'webgl-disabled', returning: false, reduced: false, webgl: true, skip: true }
];

function overlap(a, b) {
  return a && b && a.width > 0 && b.width > 0 && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

async function runScenario(browser, scenario, width) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    reducedMotion: scenario.reduced ? 'reduce' : 'no-preference'
  });
  await context.addInitScript(({ returning }) => {
    try { sessionStorage.clear(); if (returning) sessionStorage.setItem('bn-intro-played', '1'); } catch {}
  }, { returning: scenario.returning });
  const page = await context.newPage();
  if (scenario.webgl) await page.addInitScript(() => { const old = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function(type, ...args) { if (String(type).includes('webgl')) return null; return old.call(this, type, ...args); }; });
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error' && !/ERR_NETWORK_ACCESS_DENIED|fonts\.googleapis|cdnjs|unpkg/i.test(msg.text())) errors.push(msg.text()); });
  page.on('pageerror', err => errors.push('pageerror: ' + err.message));
  await page.goto(pathToFileURL(path.join(ROOT, 'index.html')).href, { waitUntil: 'domcontentloaded' });
  if (scenario.skip) {
    await page.waitForTimeout(700);
    const skip = page.locator('#introSkip');
    if (await skip.isVisible().catch(() => false)) await skip.click();
  }
  await page.waitForTimeout(scenario.returning || scenario.reduced || scenario.webgl ? 1200 : 4300);
  const metrics = await page.evaluate(() => {
    const rect = el => { const r = el?.getBoundingClientRect(); return r ? { left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height } : null; };
    const overlapsBox = (a, b) => a && b && a.width > 0 && b.width > 0 && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const hero = document.querySelector('.hero');
    const selectors = { header: document.querySelector('.hd'), nav: document.querySelector('.hd-nav'), heading: document.querySelector('#heroHeading'), sub: document.querySelector('.hero-sub'), ctas: document.querySelector('.hero-cta'), badge: document.querySelector('#heroBadge'), scroll: document.querySelector('.hero-scroll'), canvas: document.querySelector('#gl') };
    const boxes = Object.fromEntries(Object.entries(selectors).map(([k,v]) => [k, rect(v)]));
    const pairs = [['heading','badge'],['sub','badge'],['ctas','badge'],['heading','nav'],['sub','nav'],['ctas','nav'],['badge','scroll'],['ctas','scroll']];
    const overlaps = pairs.filter(([a,b]) => overlapsBox(boxes[a], boxes[b])).map(([a,b]) => `${a}:${b}`);
    const graph = { archRefNull: window.bnScene ? window.bnScene.arch === null : null, heroClusterVisible: window.bnScene?.heroCluster?.visible ?? null, heroClusterChildren: window.bnScene?.heroCluster?.children?.length ?? 0, torus: 0, tube: 0, extrude: 0, archGroups: 0, geometryCount: 0, materialCount: 0 };
    if (window.bnScene?.scene) window.bnScene.scene.traverse(obj => { if (obj.isMesh || obj.isPoints) { graph.geometryCount++; if (obj.geometry?.type === 'TorusGeometry') graph.torus++; if (obj.geometry?.type === 'TubeGeometry') graph.tube++; if (obj.geometry?.type === 'ExtrudeGeometry') graph.extrude++; if (obj.material) graph.materialCount += Array.isArray(obj.material) ? obj.material.length : 1; } if (obj.name === 'hero-cosmetics-cluster') graph.heroClusterVisible = obj.visible; if (obj.name === 'intro-arch' || obj.name === 'arch') graph.archGroups++; });
    const heroStyle = hero ? getComputedStyle(hero) : null;
    const canvasStyle = selectors.canvas ? getComputedStyle(selectors.canvas) : null;
    return { boxes, overlaps, heroTop: hero?.getBoundingClientRect().top ?? null, canvasTop: selectors.canvas?.getBoundingClientRect().top ?? null, bodyTop: document.body.getBoundingClientRect().top, scrollY: window.scrollY, heroOverflow: heroStyle?.overflow, canvasPosition: canvasStyle?.position, canvasZ: canvasStyle?.zIndex, graph, introPresent: !!document.querySelector('#intro'), htmlClasses: document.documentElement.className };
  });
  const frames = await page.evaluate(async () => new Promise(resolve => { const times=[]; let last; const start=performance.now(); function tick(t){ if(last != null) times.push(t-last); last=t; if(t-start < 1800) requestAnimationFrame(tick); else { const sorted=times.slice().sort((a,b)=>a-b); resolve({ samples:times.length, avg:times.reduce((a,b)=>a+b,0)/Math.max(1,times.length), worst:Math.max(...times,0), p95:sorted[Math.floor(sorted.length*.95)]||0 }); }} requestAnimationFrame(tick); }));
  const shot = path.join(OUT, `${scenario.name}-${width}.png`);
  await page.screenshot({ path: shot, fullPage: false });
  await context.close();
  return { scenario: scenario.name, width, metrics, frames, errors, screenshot: shot };
}

const results = [];
for (const scenario of scenarios) {
  const args = scenario.webgl ? ['--disable-gpu', '--disable-webgl'] : [];
  const browser = await chromium.launch({ executablePath: EDGE, headless: true, args });
  for (const width of widths) results.push(await runScenario(browser, scenario, width));
  await browser.close();
}
server.close();
console.log(JSON.stringify({ port, results }, null, 2));
