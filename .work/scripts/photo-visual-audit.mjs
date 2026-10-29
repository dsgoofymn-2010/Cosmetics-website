import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const EDGE_CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
];
const EDGE = EDGE_CANDIDATES.find(p => fs.existsSync(p));
if (!EDGE) throw new Error('Microsoft Edge executable not found');

const outDir = path.join(ROOT, '.work', 'previews');
fs.mkdirSync(outDir, { recursive: true });
const fileUrl = 'file:///' + path.resolve(ROOT, 'index.html').replace(/\\/g, '/');
const targets = [
  { id: 'sfImg', name: 'storefront', section: '#inside' },
  { id: null, selector: '.exp-frame img', name: 'vanity-mirror', section: '#experience' },
  { id: 'mensImg', name: 'shop-for-him-current', section: '#mens' }
];
const viewports = [
  { width: 390, height: 844, label: 'mobile-390' },
  { width: 1440, height: 900, label: 'desktop-1440' }
];

function round(n) { return Math.round(n * 100) / 100; }

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const results = [];
for (const vp of viewports) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.width < 700, hasTouch: vp.width < 700 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR ' + String(e)));
  await page.goto(fileUrl, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(4200);
  // Bypass the intro overlay for this focused content audit without changing page source.
  await page.evaluate(() => {
    const intro = document.getElementById('intro');
    if (intro) intro.remove();
    document.documentElement.classList.remove('bn-transition-active');
    document.body.classList.remove('intro-lock');
    document.querySelectorAll('.rv,.rv-hold,.rv-now,.curtain').forEach(el => el.classList.add('in'));
  });
  await page.waitForTimeout(500);

  for (const target of targets) {
    const selector = target.id ? `#${target.id}` : target.selector;
    await page.locator(selector).scrollIntoViewIfNeeded();
    await page.waitForTimeout(900);
    const data = await page.evaluate(({ selector }) => {
      const img = document.querySelector(selector);
      if (!img) return { missing: true };
      const r = img.getBoundingClientRect();
      const cs = getComputedStyle(img);
      const ancestors = [];
      let el = img.parentElement;
      while (el && el !== document.documentElement) {
        const s = getComputedStyle(el);
        const er = el.getBoundingClientRect();
        const clips = [];
        if (/(hidden|clip|scroll|auto)/.test(s.overflowX) || /(hidden|clip|scroll|auto)/.test(s.overflowY)) clips.push(`overflow:${s.overflow}`);
        if (s.clipPath !== 'none') clips.push(`clip-path:${s.clipPath}`);
        if (s.maskImage !== 'none' || s.webkitMaskImage !== 'none') clips.push('mask');
        if (s.borderRadius !== '0px') clips.push(`border-radius:${s.borderRadius}`);
        ancestors.push({ tag: el.tagName, id: el.id, className: String(el.className), box: { x: er.x, y: er.y, width: er.width, height: er.height }, clips });
        el = el.parentElement;
      }
      const visibleEdges = ancestors.every(a => {
        const ar = a.box;
        return !(r.left < ar.x - 0.5 || r.right > ar.x + ar.width + 0.5 || r.top < ar.y - 0.5 || r.bottom > ar.y + ar.height + 0.5);
      });
      return {
        src: img.currentSrc || img.src,
        natural: { width: img.naturalWidth, height: img.naturalHeight, ratio: img.naturalHeight ? img.naturalWidth / img.naturalHeight : null },
        rendered: { x: r.x, y: r.y, width: r.width, height: r.height, ratio: r.height ? r.width / r.height : null },
        objectFit: cs.objectFit,
        objectPosition: cs.objectPosition,
        transform: cs.transform,
        visibleWithinAncestors: visibleEdges,
        clippingAncestors: ancestors.filter(a => a.clips.length).map(a => ({ tag: a.tag, id: a.id, className: a.className, clips: a.clips })),
        parentOverflow: getComputedStyle(img.parentElement).overflow,
        renderedVsNaturalRatioPct: img.naturalWidth && img.naturalHeight ? Math.abs((r.width / r.height) / (img.naturalWidth / img.naturalHeight) - 1) * 100 : null,
        widthVsNaturalPct: img.naturalWidth ? (r.width / img.naturalWidth) * 100 : null
      };
    }, { selector });
    const screenshotPath = path.join(outDir, `${vp.label}-${target.name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    results.push({ viewport: vp, target: target.name, data, screenshot: screenshotPath, consoleErrors: errors.slice(0, 5) });
  }
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify({ fileUrl, results }, null, 2));
