/* First-visit flow: intro plays, Skip, handoff, products rise; intro canvas must be gone. */
import { chromium } from 'playwright-core';
const BASE = process.env.BASE || 'http://localhost:4173';
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const errs = [];
for (const how of ['skip', 'enter']) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errs.push(how + ' ' + m.type() + ': ' + m.text().slice(0, 200)); });
  p.on('pageerror', (e) => errs.push(how + ' pageerror: ' + e.message));
  await p.goto(BASE + '/');
  await p.waitForTimeout(2600);
  if (how === 'skip') await p.click('#introSkip');
  else { await p.waitForSelector('#introEnter.in', { timeout: 15000 }).catch(() => {}); await p.click('#introEnter', { force: true }); }
  for (const t of [600, 1600, 3600]) {
    await p.waitForTimeout(t === 600 ? 600 : t - 600);
    await p.screenshot({ path: `.work/shots/intro-${how}-${t}.png` });
  }
  await p.waitForTimeout(2500);
  const st = await p.evaluate(() => ({
    gl: !!document.getElementById('gl'), intro: !!document.getElementById('intro'),
    stage: document.getElementById('heroStage').className,
    lifts: window.bnStage ? window.bnStage.items.map((i) => +i.lift.position.y.toFixed(3)) : null,
    canvases: document.querySelectorAll('canvas').length
  }));
  console.log(how, JSON.stringify(st));
  await p.screenshot({ path: `.work/shots/intro-${how}-final.png` });
  await ctx.close();
}
await b.close();
console.log(errs.length ? errs.join('\n') : 'no console errors');
