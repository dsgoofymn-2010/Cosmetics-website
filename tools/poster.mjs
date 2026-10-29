/* Writes images/hero-poster.webp, images/hero-poster-lqip.webp and
   images/hero-poster.json (chip anchors). Needs node tools/serve.mjs running. */
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:4173';
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 1400 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text()); });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(BASE + '/tools/poster.html');
await page.waitForFunction(() => window.posterResult, null, { timeout: 60000 });
const r = await page.evaluate(() => window.posterResult);
const save = (file, dataUrl) => writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
save('images/hero-poster.webp', r.webp);
save('images/hero-poster-lqip.webp', r.lqip);
writeFileSync('images/hero-poster.json', JSON.stringify({ width: r.width, height: r.height, anchors: r.anchors, boxes: r.boxes }) + '\n');
console.log('poster written', r.width + 'x' + r.height, Math.round(r.webp.length * 0.75 / 1024) + ' KB');
await browser.close();
