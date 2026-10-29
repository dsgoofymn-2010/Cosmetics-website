/* Hero screenshots for review.
   node tools/shoot.mjs [outdir] [widths]   e.g. node tools/shoot.mjs .work/shots 1440,768,390
   Env: INTRO=1 plays the intro instead of skipping it, RM=1 reduced motion,
   NOGL=1 disables WebGL, SCROLLS=0.3,0.6 extra scroll fractions of the hero. */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:4173';
const out = process.argv[2] || '.work/shots';
const widths = (process.argv[3] || '1440,768,390').split(',').map(Number);
const heights = { 1440: 900, 768: 1024, 390: 844 };
mkdirSync(out, { recursive: true });

const args = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'];
if (process.env.NOGL) args.push('--disable-webgl', '--disable-webgl2');
const browser = await chromium.launch({ channel: 'chrome', args });
const errors = [];
for (const w of widths) {
  const mobile = w < 768;
  const ctx = await browser.newContext({
    viewport: { width: w, height: heights[w] || 900 }, deviceScaleFactor: mobile ? 2 : 1,
    isMobile: mobile, hasTouch: mobile, reducedMotion: process.env.RM ? 'reduce' : 'no-preference'
  });
  if (!process.env.INTRO) await ctx.addInitScript(() => { try { sessionStorage.setItem('bn-intro-played', '1'); } catch (e) {} });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${w} ${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${w} pageerror: ${e.message}`));
  page.on('requestfailed', (r) => errors.push(`${w} failed: ${r.url()}`));
  await page.goto(BASE + '/');
  const tag = (process.env.TAG ? process.env.TAG + '-' : '') + w;
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${tag}-early.png` });
  await page.waitForFunction(() => document.getElementById('heroStage').classList.contains('is-ready') || document.getElementById('heroStage').classList.contains('is-static'), null, { timeout: 30000 }).catch(() => errors.push(w + ' stage never ready'));
  await page.waitForTimeout(2600);
  await page.screenshot({ path: `${out}/${tag}-live.png` });
  for (const f of (process.env.SCROLLS || '').split(',').filter(Boolean).map(Number)) {
    await page.evaluate((f) => window.scrollTo(0, document.getElementById('top').offsetHeight * f), f);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/${tag}-scroll${f}.png` });
  }
  await ctx.close();
}
await browser.close();
console.log(errors.length ? errors.join('\n') : 'no console errors');
