/* Hero and page QA. Needs node tools/serve.mjs 4173 (dev) and PROD=1 node tools/serve.mjs 4174.
   node tools/qa.mjs  -> prints a report and writes .work/qa/report.json plus screenshots */
import { chromium } from 'playwright-core';
import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DEV = 'http://localhost:4173', PROD = 'http://localhost:4174';
const OUT = '.work/qa';
mkdirSync(OUT, { recursive: true });
const R = { refs: [], fit: [], overlap: [], luminance: [], ring: [], frames: [], modes: [], network: [], console: [], weight: {} };
const defects = [];
const fail = (area, msg) => defects.push(area + ': ' + msg);

/* ---------- A. every referenced local file exists with exact case ---------- */
function exact(rel) {
  let dir = '.';
  for (const seg of rel.split('/').filter(Boolean)) {
    if (!existsSync(dir) || !readdirSync(dir).includes(seg)) return false;
    dir = join(dir, seg);
  }
  return true;
}
{
  const files = ['index.html', '404.html', 'site.webmanifest', ...readdirSync('js').map((f) => 'js/' + f)];
  const refs = new Set();
  for (const f of files) {
    const s = readFileSync(f, 'utf8');
    const base = f.startsWith('js/') ? 'js/' : '';
    for (const m of s.matchAll(/(?:src|href|data-src)="([^"#?]+)[^"]*"|url\(["']?([^"')#?]+)["']?\)|from ['"]([^'"]+)['"]|fetch\(['"]([^'"]+)['"]\)|"src": "([^"]+)"/g)) {
      let u = m[1] || m[2] || m[3] || m[4] || m[5];
      if (!u || /^(https?:|mailto:|tel:|data:|blob:|#|%23|three)/.test(u) || u.includes('${') || u.includes("' +")) continue;
      if (u.startsWith('./')) u = u.slice(2);
      if (u.startsWith('/')) u = u.slice(1);
      else if (m[3] && base) u = base + u.replace(/^\.\//, '');
      refs.add(u.replace(/\/$/, '/index.html'));
    }
    for (const m of s.matchAll(/file: '([^']+)'/g)) refs.add('models/' + m[1] + '.glb');
  }
  for (const u of refs) {
    const ok = u === '' || exact(u.replace(/\.\.\//g, ''));
    R.refs.push([u, ok]);
    if (!ok) fail('refs', 'missing or wrong case: ' + u);
  }
}

const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });

async function open(w, { base = DEV, extra = {}, init } = {}) {
  const mobile = w < 768;
  const ctx = await browser.newContext({ viewport: { width: w, height: mobile ? 844 : w === 768 ? 1024 : 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1, ...extra });
  await ctx.addInitScript(() => sessionStorage.setItem('bn-intro-played', '1'));
  if (init) await ctx.addInitScript(init);
  const p = await ctx.newPage();
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) R.console.push(w + ' ' + m.type() + ': ' + m.text().slice(0, 200)); });
  p.on('pageerror', (e) => R.console.push(w + ' pageerror: ' + e.message));
  p.on('request', (r) => { const u = r.url(); if (!u.startsWith(base) && !/^(data|blob):/.test(u)) R.network.push(w + ' outside request: ' + u); });
  p.on('response', (r) => { if (r.status() >= 400) R.network.push(w + ' HTTP ' + r.status() + ' ' + r.url()); });
  return { ctx, p };
}
const ready = (p) => p.waitForFunction(() => { const s = document.getElementById('heroStage'); return s.classList.contains('is-ready') || s.classList.contains('is-static'); }, null, { timeout: 30000 });

/* luminance of a list of points from a screenshot, 7x7 box mean, decoded in the page */
async function lum(p, pts) {
  const png = (await p.screenshot()).toString('base64');
  return p.evaluate(async ({ png, pts }) => {
    const img = await createImageBitmap(await (await fetch('data:image/png;base64,' + png)).blob());
    const c = new OffscreenCanvas(img.width, img.height), g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const k = img.width / innerWidth;
    return pts.map(([x, y]) => {
      const d = g.getImageData(Math.round(x * k) - 3, Math.round(y * k) - 3, 7, 7).data;
      let s = 0;
      for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      return +(s / (d.length / 4)).toFixed(2);
    });
  }, { png, pts });
}
function bumps(series) {
  let worst = 0;
  for (let i = 10; i < series.length - 10; i++) {
    const base = (series[i - 10] + series[i + 10]) / 2;
    worst = Math.max(worst, Math.abs(series[i] - base));
  }
  return +worst.toFixed(2);
}

async function geometry(p) {
  return p.evaluate(() => {
    const st = window.bnStage ? window.bnStage.boxes() : null;
    const cr = document.getElementById('heroCanvas').getBoundingClientRect();
    const rr = document.getElementById('heroStageRegion').getBoundingClientRect();
    const sel = ['.hero-kicker', '#heroHeading', '.hero-sub', '.hero-cta .btn-solid', '.hero-cta .btn-ghost', '#heroBadge', '.hero-scroll', '#hd'];
    const text = sel.map((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { s, x0: r.left, y0: r.top, x1: r.right, y1: r.bottom, vis: getComputedStyle(e).display !== 'none' && r.width > 0 }; }).filter((t) => t && t.vis);
    return { st, canvas: { x: cr.left, y: cr.top, w: cr.width, h: cr.height }, region: { x: rr.left, y: rr.top, w: rr.width, h: rr.height }, text };
  });
}
function checkFit(tag, g, padFrac) {
  if (!g.st) { R.fit.push([tag, 'no live stage']); return; }
  const { w, h } = g.canvas;
  let minPad = Infinity;
  for (const [id, b] of Object.entries(g.st.boxes)) {
    const pad = Math.min(b.x0, b.y0, w - b.x1, h - b.y1);
    const padPct = Math.min(b.x0 / w, b.y0 / h, (w - b.x1) / w, (h - b.y1) / h);
    minPad = Math.min(minPad, padPct);
    if (pad < 0) fail('fit', `${tag} ${id} crosses the canvas edge by ${(-pad).toFixed(1)}px`);
  }
  /* padding against the region the products are fitted into */
  const rx = g.region.x - g.canvas.x, ry = g.region.y - g.canvas.y;
  let minRegion = Infinity;
  for (const b of Object.values(g.st.boxes)) {
    minRegion = Math.min(minRegion, (b.x0 - rx) / g.region.w, (b.y0 - ry) / g.region.h, (rx + g.region.w - b.x1) / g.region.w, (ry + g.region.h - b.y1) / g.region.h);
  }
  R.fit.push([tag, 'min canvas margin ' + (minPad * 100).toFixed(1) + '%', 'min region margin ' + (minRegion * 100).toFixed(1) + '%']);
  if (padFrac && minRegion < padFrac) fail('fit', `${tag} region padding ${(minRegion * 100).toFixed(1)}% is under ${(padFrac * 100).toFixed(0)}%`);
}
function checkOverlap(tag, g, skipHeader) {
  if (!g.st) return;
  if (skipHeader) g = { ...g, text: g.text.filter((t) => t.s !== '#hd') };
  const hits = [];
  for (const [id, b] of Object.entries(g.st.boxes)) {
    const bx = { x0: b.x0 + g.canvas.x, y0: b.y0 + g.canvas.y, x1: b.x1 + g.canvas.x, y1: b.y1 + g.canvas.y };
    for (const t of g.text) if (bx.x0 < t.x1 && bx.x1 > t.x0 && bx.y0 < t.y1 && bx.y1 > t.y0) hits.push(id + ' x ' + t.s);
  }
  R.overlap.push([tag, hits.length ? hits.join(', ') : 'none']);
  hits.forEach((h) => fail('overlap', tag + ' ' + h));
}

/* ---------- B. per width: moments, fit, overlap, luminance, ring ---------- */
for (const w of [1440, 768, 390]) {
  const { ctx, p } = await open(w);
  await p.goto(DEV + '/');
  await p.waitForTimeout(250);
  await p.screenshot({ path: `${OUT}/${w}-1-poster.png` });
  await ready(p);
  await p.waitForTimeout(2200);
  const mobile = w < 768;
  if (mobile) { await p.evaluate(() => document.getElementById('heroStage').scrollIntoView({ block: 'center' })); await p.waitForTimeout(900); }
  await p.screenshot({ path: `${OUT}/${w}-2-live.png` });
  let g = await geometry(p);
  checkFit(w + ' rest', g, 0.075);
  checkOverlap(w + ' rest', g);

  /* no ring or arch: no torus or ring geometry anywhere in the stage */
  const rings = await p.evaluate(() => {
    const out = [];
    window.bnStage.renderer && window.bnStage.items[0].holder.parent.parent.traverse((o) => { if (o.geometry && /Torus|Ring/.test(o.geometry.type)) out.push(o.geometry.type); });
    return out;
  });
  R.ring.push([w, rings.length ? rings.join(',') : 'none']);
  if (rings.length) fail('ring', w + ' found ' + rings.join(','));

  /* background: lines through the empty parts of the stage, live scene on */
  {
    const r = g.region, c = g.canvas, pts = [];
    let lines;
    if (!mobile) {
      lines = { ['top band y=' + Math.round(r.y - 14)]: [], ['bottom band y=' + Math.round(r.y + r.h + 20)]: [] };
      const ys = [r.y - 14, r.y + r.h + 20];
      Object.keys(lines).forEach((k, i) => { for (let x = w * 0.5; x < w - 48; x += 8) { lines[k].push(pts.length); pts.push([x, ys[i]]); } });
    } else {
      lines = { 'stage top y+6': [], 'stage bottom y-6': [] };
      const ys = [c.y + 6, c.y + c.h - 6];
      Object.keys(lines).forEach((k, i) => { for (let x = 8; x < w - 8; x += 6) { lines[k].push(pts.length); pts.push([x, ys[i]]); } });
    }
    const v = await lum(p, pts);
    for (const [k, idx] of Object.entries(lines)) {
      const s = idx.map((i) => v[i]);
      const b = bumps(s);
      R.luminance.push([w, k, 'range ' + Math.min(...s).toFixed(1) + '..' + Math.max(...s).toFixed(1), 'worst local bump ' + b]);
      if (b > 4) fail('luminance', `${w} ${k} bump ${b}`);
    }
    /* CSS field alone, stage hidden: one line across the right half at mid height */
    await p.evaluate(() => { document.getElementById('heroStage').style.visibility = 'hidden'; });
    await p.waitForTimeout(150);
    const y = mobile ? c.y + c.h / 2 : 450, row = [];
    for (let x = (mobile ? 8 : w * 0.5); x < w - (mobile ? 8 : 48); x += 8) row.push([x, y]); /* skip the section dots */
    const s2 = await lum(p, row);
    const b2 = bumps(s2);
    R.luminance.push([w, 'CSS background only y=' + Math.round(y), 'range ' + Math.min(...s2).toFixed(1) + '..' + Math.max(...s2).toFixed(1), 'worst local bump ' + b2, 'samples ' + s2.filter((_, i) => i % 10 === 0).join(' ')]);
    if (b2 > 4) fail('luminance', `${w} CSS background bump ${b2}`);
    await p.evaluate(() => { document.getElementById('heroStage').style.visibility = ''; });
  }

  /* drag (mouse) */
  if (!mobile) {
    const c = g.canvas, r = g.region;
    const sx = r.x + r.w * 0.5, sy = r.y + r.h * 0.85;
    await p.mouse.move(sx, sy); await p.mouse.down();
    await p.mouse.move(sx + 420, sy, { steps: 12 }); await p.mouse.up();
    await p.waitForTimeout(1200);
    await p.screenshot({ path: `${OUT}/${w}-3-drag-right.png` });
    { const gg = await geometry(p); checkFit(w + ' after drag right (+35 deg)', gg); checkOverlap(w + ' drag right', gg); }
    await p.mouse.move(sx + 420, sy); await p.mouse.down();
    await p.mouse.move(sx - 500, sy, { steps: 14 }); await p.mouse.up();
    await p.waitForTimeout(1200);
    await p.screenshot({ path: `${OUT}/${w}-3-drag-left.png` });
    { const gg = await geometry(p); checkFit(w + ' after drag left (-35 deg)', gg); checkOverlap(w + ' drag left', gg); }
    await p.mouse.move(5, 5);
  }
  /* scroll 30% and 60% of the hero */
  for (const f of [0.3, 0.6]) {
    await p.evaluate((f) => window.scrollTo(0, document.getElementById('top').offsetHeight * f), f);
    await p.waitForTimeout(1500);
    await p.screenshot({ path: `${OUT}/${w}-4-scroll${f * 100}.png` });
    g = await geometry(p);
    checkFit(w + ' scroll ' + f * 100 + '%', g);
    checkOverlap(w + ' scroll ' + f * 100 + '% (fixed header ignored)', g, true);
  }
  await ctx.close();
}

/* ---------- C. frame times ---------- */
async function frameRun(w, throttle) {
  const { ctx, p } = await open(w);
  const cdp = await ctx.newCDPSession(p);
  await p.goto(DEV + '/');
  await ready(p);
  if (w < 768) { await p.evaluate(() => document.getElementById('heroStage').scrollIntoView({ block: 'center' })); }
  await p.waitForTimeout(1500);
  if (throttle) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  const measure = (scroll) => p.evaluate((scroll) => new Promise((res) => {
    const iv = []; let last = performance.now(), t0 = last, y = scrollY;
    function f(now) {
      iv.push(now - last); last = now;
      if (scroll) { y += 6; window.scrollTo(0, y); }
      if (now - t0 < 4000) requestAnimationFrame(f); else res(iv.slice(2));
    }
    requestAnimationFrame(f);
  }), scroll);
  const stats = (iv) => {
    const s = [...iv].sort((a, b) => a - b);
    return { frames: iv.length, avgMs: +(iv.reduce((a, b) => a + b, 0) / iv.length).toFixed(2), p95Ms: +s[Math.floor(s.length * 0.95)].toFixed(2), worstMs: +s[s.length - 1].toFixed(2) };
  };
  const idle = stats(await measure(false));
  if (w < 768) await p.evaluate(() => window.scrollTo(0, 0));
  const scroll = stats(await measure(true));
  const tier = await p.evaluate(() => window.bnStage && window.bnStage.tier);
  R.frames.push({ width: w, cpuThrottle: throttle || 1, tier, idle, scroll });
  await ctx.close();
}
await frameRun(1440, 0);
await frameRun(390, 4);

/* ---------- D. modes ---------- */
/* WebGL off */
{
  const b2 = await chromium.launch({ channel: 'chrome', args: ['--disable-webgl', '--disable-webgl2', '--disable-3d-apis'] });
  const ctx = await b2.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => sessionStorage.setItem('bn-intro-played', '1'));
  const p = await ctx.newPage();
  const e = []; p.on('pageerror', (x) => e.push(x.message));
  await p.goto(DEV + '/'); await p.waitForTimeout(2500);
  const st = await p.evaluate(() => ({ cls: document.getElementById('heroStage').className, poster: document.getElementById('heroPoster').complete && document.getElementById('heroPoster').naturalWidth > 0 }));
  await p.screenshot({ path: `${OUT}/mode-webgl-off.png` });
  const pass = st.cls.includes('is-static') && st.poster && !e.length;
  R.modes.push(['WebGL off', pass ? 'PASS poster shown, static mode' : 'FAIL ' + JSON.stringify(st) + e.join(';')]);
  if (!pass) fail('mode', 'WebGL off');
  await b2.close();
}
/* reduced motion */
{
  const { ctx, p } = await open(1440, { extra: { reducedMotion: 'reduce' } });
  await p.goto(DEV + '/'); await p.waitForTimeout(2500);
  const st = await p.evaluate(() => ({ cls: document.getElementById('heroStage').className, live: !!window.bnStage }));
  await p.screenshot({ path: `${OUT}/mode-reduced-motion.png` });
  const pass = st.cls.includes('is-static') && !st.live;
  R.modes.push(['Reduced motion', pass ? 'PASS poster only, no WebGL, no float' : 'FAIL ' + JSON.stringify(st)]);
  if (!pass) fail('mode', 'reduced motion');
  await ctx.close();
}
/* slow 3G: poster before models */
{
  const { ctx, p } = await open(390);
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 400 * 1024 / 8, uploadThroughput: 400 * 1024 / 8 });
  const t0 = Date.now();
  await p.goto(DEV + '/', { waitUntil: 'commit' });
  await p.waitForFunction(() => { const i = document.getElementById('heroPoster'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 120000, polling: 100 });
  const tPoster = Date.now() - t0;
  await p.screenshot({ path: `${OUT}/mode-slow3g-poster.png` });
  await p.waitForFunction(() => document.getElementById('heroStage').classList.contains('is-ready'), null, { timeout: 240000, polling: 200 });
  const tLive = Date.now() - t0;
  const pass = tPoster < tLive;
  R.modes.push(['Slow 3G (400 kbps, 400 ms)', `${pass ? 'PASS' : 'FAIL'} poster visible at ${(tPoster / 1000).toFixed(1)} s, live scene at ${(tLive / 1000).toFixed(1)} s`]);
  if (!pass) fail('mode', 'slow 3G order');
  await ctx.close();
}
/* keyboard only: every chip reachable, visible on focus, Enter opens WhatsApp */
{
  const { ctx, p } = await open(1440);
  await p.goto(DEV + '/'); await ready(p); await p.waitForTimeout(800);
  await p.focus('.hero-cta .btn-ghost');
  const seen = [];
  for (let i = 0; i < 25 && seen.length < 6; i++) {
    await p.keyboard.press('Tab');
    const f = await p.evaluate(() => { const a = document.activeElement; return a && a.classList.contains('stage-chip') ? [a.dataset.product, getComputedStyle(a).opacity, a.getBoundingClientRect().width > 0] : null; });
    if (f) seen.push(f);
  }
  await p.waitForTimeout(400);
  const vis = await p.evaluate(() => getComputedStyle(document.activeElement).opacity);
  await p.screenshot({ path: `${OUT}/mode-keyboard-chip.png` });
  let pop = null; ctx.on('page', (x) => { pop = x; });
  await p.keyboard.press('Enter'); await p.waitForTimeout(2500);
  const pass = seen.length === 6 && +vis > 0.9 && !!pop;
  R.modes.push(['Keyboard chips', `${pass ? 'PASS' : 'FAIL'} reached ${seen.map((s) => s[0]).join(', ')}; focused chip opacity ${vis}; Enter opened ${pop ? pop.url().slice(0, 40) : 'nothing'}`]);
  if (!pass) fail('mode', 'keyboard chips');
  await ctx.close();
}
/* touch scrolling over the canvas */
{
  const { ctx, p } = await open(390);
  const cdp = await ctx.newCDPSession(p);
  await p.goto(DEV + '/'); await ready(p);
  await p.evaluate(() => document.getElementById('heroStage').scrollIntoView({ block: 'center' }));
  await p.waitForTimeout(800);
  const r = await p.evaluate(() => { const c = document.getElementById('heroCanvas').getBoundingClientRect(); return { x: c.left + c.width / 2, y: c.top + c.height * 0.7, top: c.top + c.height * 0.2 }; });
  const y0 = await p.evaluate(() => scrollY);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.y }] });
  for (let i = 1; i <= 12; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: r.x, y: r.y - i * 25 }] }); await p.waitForTimeout(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.waitForTimeout(600);
  const y1 = await p.evaluate(() => scrollY);
  const pass = y1 - y0 > 150;
  R.modes.push(['Touch scroll over canvas', `${pass ? 'PASS' : 'FAIL'} page scrolled ${Math.round(y1 - y0)} px from a swipe that started on the canvas`]);
  if (!pass) fail('mode', 'touch scroll');
  /* tap a product: chip shows */
  await p.evaluate(() => document.getElementById('heroStage').scrollIntoView({ block: 'center' }));
  await p.waitForTimeout(700);
  const bx = await p.evaluate(() => { const b = window.bnStage.boxes(); const c = document.getElementById('heroCanvas').getBoundingClientRect(); const s = b.boxes.serum; return [c.left + (s.x0 + s.x1) / 2, c.top + (s.y0 * 0.4 + s.y1 * 0.6)]; });
  await p.touchscreen.tap(bx[0], bx[1]);
  await p.waitForTimeout(500);
  const on = await p.evaluate(() => [...document.querySelectorAll('.stage-chip.on')].map((c) => c.dataset.product));
  await p.screenshot({ path: `${OUT}/mode-touch-tap.png` });
  R.modes.push(['Touch tap product', (on.includes('serum') ? 'PASS' : 'FAIL') + ' chip shown: ' + (on.join(',') || 'none')]);
  if (!on.includes('serum')) fail('mode', 'touch tap chip');
  /* reload */
  await p.reload(); await ready(p); await p.waitForTimeout(800);
  const again = await p.evaluate(() => document.getElementById('heroStage').className);
  R.modes.push(['Reload', (again.includes('is-ready') ? 'PASS' : 'FAIL') + ' ' + again]);
  await ctx.close();
}

/* ---------- E. first-load weight on the production server ---------- */
{
  const { ctx, p } = await open(390, { base: PROD });
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Network.enable');
  const reqs = new Map();
  cdp.on('Network.requestWillBeSent', (e) => reqs.set(e.requestId, { url: e.request.url, t: e.timestamp }));
  cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (r) r.bytes = e.encodedDataLength; });
  let fcpAt = 0;
  await p.goto(PROD + '/', { waitUntil: 'load' });
  fcpAt = await p.evaluate(() => (performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime || 0);
  await ready(p); await p.waitForTimeout(1500);
  const groups = {};
  let first = 0, later = 0;
  for (const r of reqs.values()) {
    if (!r.bytes || !r.url.startsWith(PROD)) continue;
    const path = r.url.slice(PROD.length);
    const kind = path.endsWith('.glb') ? 'models (after first paint)' : /\.(webp|jpg|png)$/.test(path) ? 'images' : /\.woff2$/.test(path) ? 'fonts' : /\.js$/.test(path) ? 'js' : /\.html$|\/$/.test(path) ? 'html' : 'other';
    groups[kind] = (groups[kind] || 0) + r.bytes;
    if (kind.startsWith('models')) later += r.bytes; else first += r.bytes;
  }
  R.weight = { firstLoadKB: +(first / 1024).toFixed(1), modelsKB: +(later / 1024).toFixed(1), byTypeKB: Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, +(v / 1024).toFixed(1)])), fcpMs: Math.round(fcpAt) };
  if (first > 2.5 * 1024 * 1024) fail('weight', 'first load ' + (first / 1048576).toFixed(2) + ' MB');
  await ctx.close();
}

await browser.close();
R.console = [...new Set(R.console)];
R.network = [...new Set(R.network)];
R.console.forEach((c) => fail('console', c));
R.network.filter((n) => !/google\.com\/maps/.test(n)).forEach((n) => fail('network', n));
writeFileSync(`${OUT}/report.json`, JSON.stringify({ ...R, defects }, null, 2));
const line = (a) => '  ' + a.join(' | ');
console.log('REFS: ' + R.refs.length + ' checked, ' + R.refs.filter((r) => !r[1]).length + ' missing');
console.log('FIT:\n' + R.fit.map(line).join('\n'));
console.log('OVERLAP:\n' + R.overlap.map(line).join('\n'));
console.log('LUMINANCE:\n' + R.luminance.map(line).join('\n'));
console.log('RING/ARCH: ' + R.ring.map((r) => r.join(' ')).join('; '));
console.log('FRAMES:\n' + R.frames.map((f) => `  ${f.width}px cpu x${f.cpuThrottle} tier ${f.tier}: idle avg ${f.idle.avgMs} ms p95 ${f.idle.p95Ms} worst ${f.idle.worstMs}; scroll avg ${f.scroll.avgMs} ms p95 ${f.scroll.p95Ms} worst ${f.scroll.worstMs}`).join('\n'));
console.log('MODES:\n' + R.modes.map(line).join('\n'));
console.log('WEIGHT: ' + JSON.stringify(R.weight));
console.log('CONSOLE: ' + (R.console.length ? '\n  ' + R.console.join('\n  ') : 'clean'));
console.log('NETWORK: ' + (R.network.length ? '\n  ' + R.network.join('\n  ') : 'only own files'));
console.log('\nDEFECTS: ' + (defects.length ? '\n  ' + defects.join('\n  ') : 'none'));
