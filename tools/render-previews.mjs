/* Renders models/previews/<name>.png for every GLB. Needs the local server:
   node tools/serve.mjs & node tools/render-previews.mjs */
import { chromium } from 'playwright-core';
import { mkdirSync, readdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:4173';
const names = (process.argv[2] ? process.argv[2].split(',') : readdirSync('models').filter((f) => f.endsWith('.glb')).map((f) => f.slice(0, -4)));
const tier = process.env.TIER || 'high';
mkdirSync('models/previews', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text()); });
for (const n of names) {
  const yaw = process.env.YAW || (n === 'compact' ? -25 : 25);
  await page.goto(`${BASE}/tools/preview.html?m=${n}&yaw=${yaw}&tier=${tier}`);
  await page.waitForFunction(() => document.body.dataset.ready, null, { timeout: 30000 });
  const out = `models/previews/${n}${tier === 'low' ? '-low' : ''}${process.env.YAW ? '-' + process.env.YAW : ''}.png`;
  await page.screenshot({ path: out });
  console.log('wrote', out);
}
await browser.close();
