/* Full-page screenshots, optionally in Tamil: LANG=ta node tools/fullpage.mjs 1440,390 */
import { chromium } from 'playwright-core';
const BASE = process.env.BASE || 'http://localhost:4173';
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const errs = [];
for (const w of (process.argv[2] || '1440,390').split(',').map(Number)) {
  const ctx = await b.newContext({ viewport: { width: w, height: w < 768 ? 844 : 900 }, isMobile: w < 768, hasTouch: w < 768, deviceScaleFactor: 1 });
  await ctx.addInitScript((lang) => { sessionStorage.setItem('bn-intro-played', '1'); if (lang) localStorage.setItem('bn-lang', lang); }, process.env.LANG_TA ? 'ta' : '');
  const p = await ctx.newPage();
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errs.push(w + ' ' + m.type() + ': ' + m.text().slice(0, 240)); });
  p.on('pageerror', (e) => errs.push(w + ' pageerror: ' + e.message));
  await p.goto(BASE + '/');
  await p.waitForTimeout(1500);
  /* walk down so lazy images and reveals run */
  const H = await p.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < H; y += 500) { await p.evaluate((y) => window.scrollTo(0, y), y); await p.waitForTimeout(120); }
  await p.waitForTimeout(800);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(500);
  const ow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (ow > 0) errs.push(w + ' horizontal overflow ' + ow + 'px');
  await p.screenshot({ path: `.work/shots/full-${process.env.LANG_TA ? 'ta-' : ''}${w}.png`, fullPage: true });
  await ctx.close();
}
await b.close();
console.log(errs.length ? errs.join('\n') : 'no console errors, no overflow');
