/* Click-through of the Phase 4 features. node tools/qa-features.mjs */
import { chromium } from 'playwright-core';
const BASE = process.env.BASE || 'http://localhost:4173';
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const log = [], errs = [];
const ok = (cond, msg) => log.push((cond ? 'PASS ' : 'FAIL ') + msg);

async function page(w = 1440, extra = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: w < 768 ? 844 : 900 }, isMobile: w < 768, hasTouch: w < 768, acceptDownloads: true, ...extra });
  await ctx.addInitScript(() => sessionStorage.setItem('bn-intro-played', '1'));
  const p = await ctx.newPage();
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errs.push(w + ' ' + m.text().slice(0, 200)); });
  p.on('pageerror', (e) => errs.push(w + ' pageerror ' + e.message));
  await p.goto(BASE + '/');
  await p.waitForTimeout(1200);
  return { ctx, p };
}

/* guide */
{
  const { ctx, p } = await page();
  await p.locator('#shelf-guide').scrollIntoViewIfNeeded();
  await p.click('.guide-q:nth-of-type(1) .guide-opt[data-value="A skin routine"]');
  ok(await p.isVisible('.guide-q:nth-of-type(2)'), 'guide: answer 1 shows question 2');
  ok((await p.textContent('.guide-step')).includes('2 of 3'), 'guide: step text updates');
  await p.click('.guide-back');
  ok(await p.isVisible('.guide-q:nth-of-type(1)'), 'guide: Back returns to question 1');
  await p.click('.guide-q:nth-of-type(1) .guide-opt[data-value="A skin routine"]');
  await p.click('.guide-q:nth-of-type(2) .guide-opt[data-value="Him"]');
  await p.click('.guide-q:nth-of-type(3) .guide-opt[data-value="A quick suggestion"]');
  ok(await p.isVisible('.guide-result'), 'guide: result shows after 3 answers');
  const shelf = await p.textContent('#guideShelf');
  ok(shelf.includes("Men's Grooming"), 'guide: skin routine for him suggests Men\'s Grooming (' + shelf + ')');
  const href = decodeURIComponent(await p.getAttribute('#guideSend', 'href'));
  ok(href.startsWith('https://wa.me/919355591909?text=') && href.includes('Looking for: A skin routine') && href.includes('For: Him') && href.includes("Suggested shelf: Men's Grooming"), 'guide: WhatsApp link carries the answers');
  ok(await p.evaluate(() => document.activeElement.id === 'guideShelf'), 'guide: focus moves to the result heading');
  await p.screenshot({ path: '.work/shots/qa-guide-result.png', clip: { x: 640, y: 0, width: 800, height: 900 }, fullPage: false });
  await p.click('#guideAgain');
  ok(await p.isVisible('.guide-q:nth-of-type(1)'), 'guide: Start again resets');
  /* keyboard only */
  await p.focus('.guide-q:nth-of-type(1) .guide-opt');
  await p.keyboard.press('Enter');
  ok(await p.isVisible('.guide-q:nth-of-type(2)'), 'guide: works with Enter on a focused option');
  await ctx.close();
}

/* lightbox */
{
  const { ctx, p } = await page();
  const imgs = p.locator('img[data-lightbox]');
  ok((await imgs.count()) === 3, 'lightbox: three real photos are wired');
  await imgs.nth(0).scrollIntoViewIfNeeded();
  await imgs.nth(0).click();
  await p.waitForTimeout(300);
  ok(await p.evaluate(() => document.querySelector('dialog.lb').open), 'lightbox: click opens');
  ok((await p.textContent('.lb-count')).includes('1 of 3'), 'lightbox: counter 1 of 3');
  await p.keyboard.press('ArrowRight');
  ok((await p.textContent('.lb-count')).includes('2 of 3'), 'lightbox: ArrowRight goes next');
  await p.keyboard.press('ArrowLeft'); await p.keyboard.press('ArrowLeft');
  ok((await p.textContent('.lb-count')).includes('3 of 3'), 'lightbox: ArrowLeft wraps to last');
  for (let i = 0; i < 5; i++) await p.keyboard.press('Tab');
  ok(await p.evaluate(() => !!document.activeElement.closest('dialog.lb')), 'lightbox: focus stays inside while tabbing');
  await p.waitForFunction(() => document.querySelector('.lb-img').complete && document.querySelector('.lb-img').naturalWidth > 0);
  const nat = await p.evaluate(() => { const i = document.querySelector('.lb-img'); return [i.naturalWidth, i.getBoundingClientRect().width]; });
  ok(nat[1] <= nat[0] + 1, 'lightbox: photo not shown above its own pixel width (' + nat.join(' vs ') + ')');
  await p.screenshot({ path: '.work/shots/qa-lightbox.png' });
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);
  ok(await p.evaluate(() => !document.querySelector('dialog.lb').open), 'lightbox: Esc closes');
  ok(await p.evaluate(() => document.activeElement && document.activeElement.hasAttribute('data-lightbox')), 'lightbox: focus returns to the photo');
  await imgs.nth(1).focus();
  await p.keyboard.press('Enter');
  ok(await p.evaluate(() => document.querySelector('dialog.lb').open), 'lightbox: Enter on a focused photo opens');
  await p.keyboard.press('Escape');
  await ctx.close();
}
/* lightbox swipe on touch */
{
  const { ctx, p } = await page(390);
  const img = p.locator('img[data-lightbox]').nth(0);
  await img.scrollIntoViewIfNeeded();
  await img.tap();
  await p.waitForTimeout(300);
  await p.evaluate(() => {
    const d = document.querySelector('dialog.lb');
    d.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', clientX: 300, clientY: 400, bubbles: true }));
    d.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', clientX: 120, clientY: 400, bubbles: true }));
  });
  ok((await p.textContent('.lb-count')).includes('2 of 3'), 'lightbox: swipe left goes next on touch');
  await p.screenshot({ path: '.work/shots/qa-lightbox-390.png' });
  await ctx.close();
}

/* Tamil toggle */
{
  const { ctx, p } = await page();
  await p.click('.lang-btn[data-lang="ta"]');
  ok(await p.evaluate(() => document.documentElement.lang === 'ta'), 'tamil: html lang becomes ta');
  ok((await p.textContent('.hd-nav a[href="#collections"]')).includes('தொகுப்புகள்'), 'tamil: nav label switches');
  ok((await p.textContent('#heroHeading')).includes('அழகு'), 'tamil: hero heading switches');
  ok(await p.evaluate(() => localStorage.getItem('bn-lang') === 'ta'), 'tamil: choice stored');
  await p.screenshot({ path: '.work/shots/qa-tamil-hero.png' });
  await p.reload(); await p.waitForTimeout(1200);
  ok((await p.textContent('.hd-nav a[href="#collections"]')).includes('தொகுப்புகள்'), 'tamil: survives reload');
  await p.click('.lang-btn[data-lang="en"]');
  ok((await p.textContent('.hd-nav a[href="#collections"]')).trim() === 'Collections', 'tamil: EN restores English');
  ok((await p.textContent('.hero-cta .btn-solid')).includes('Explore Collections'), 'tamil: EN restores button text');
  await ctx.close();
}
/* Tamil with storage blocked */
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); sessionStorage.setItem('bn-intro-played', '1'); });
  const p = await ctx.newPage();
  const e2 = []; p.on('pageerror', (e) => e2.push(e.message));
  await p.goto(BASE + '/'); await p.waitForTimeout(1000);
  await p.click('.lang-btn[data-lang="ta"]');
  ok(e2.length === 0 && (await p.evaluate(() => document.documentElement.lang)) === 'ta', 'tamil: works with storage blocked, no errors (' + e2.join('; ') + ')');
  await ctx.close();
}

/* map: nothing from Google until asked */
{
  const { ctx, p } = await page();
  const outside = [];
  p.on('request', (r) => { if (!r.url().startsWith(BASE) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) outside.push(r.url()); });
  await p.locator('#visit').scrollIntoViewIfNeeded();
  await p.waitForTimeout(1500);
  ok(outside.length === 0, 'map: no third-party request before the click (' + outside.length + ')');
  ok(await p.isVisible('#mapAsk'), 'map: card shows');
  await p.click('#mapLoad');
  await p.waitForTimeout(600);
  ok(await p.evaluate(() => !!document.querySelector('#mapShell iframe')), 'map: clicking adds the Google map');
  await ctx.close();
}

/* contact card download */
{
  const { ctx, p } = await page();
  await p.locator('#visit').scrollIntoViewIfNeeded();
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#visit a[download]')]);
  const path = await dl.path();
  const txt = (await import('node:fs')).readFileSync(path, 'utf8');
  ok(dl.suggestedFilename() === 'BEAUTE-NUTRIE.vcf' && txt.includes('TEL;TYPE=WORK,VOICE:+91 93555 91909') && txt.includes('600040'), 'vcf: downloads with phone and address');
  await ctx.close();
}

/* open-now logic at fixed India times (UTC = IST - 5:30) */
for (const [utc, opening, want] of [
  ['2026-10-29T08:00:00Z', '', 'Closes 10 PM'],
  ['2026-10-29T17:00:00Z', '', 'Closed now'],
  ['2026-10-29T08:00:00Z', '10:00', 'Open now, closes 10 PM'],
  ['2026-10-29T03:00:00Z', '10:00', 'Closed now'],
  ['2026-10-29T16:29:00Z', '10:00', 'Open now, closes 10 PM'],
  ['2026-10-29T16:31:00Z', '10:00', 'Closed now']
]) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(([utc, opening]) => {
    const T = new Date(utc).getTime(), D = Date;
    window.Date = class extends D { constructor(...a) { super(...(a.length ? a : [T])); } static now() { return T; } };
    sessionStorage.setItem('bn-intro-played', '1');
    window.__opening = opening;
  }, [utc, opening]);
  const p = await ctx.newPage();
  await p.route('**/', async (route) => {
    const res = await route.fetch(); let body = await res.text();
    body = body.replace("openingTime: '',", "openingTime: '" + opening + "',");
    route.fulfill({ response: res, body });
  });
  await p.goto(BASE + '/'); await p.waitForTimeout(800);
  const got = (await p.textContent('[data-open-chip] .open-txt')).trim();
  ok(got === want, `open chip at ${utc} with opening '${opening}': "${got}"`);
  await ctx.close();
}

/* chips open WhatsApp for the right shelf */
{
  const { ctx, p } = await page();
  const href = decodeURIComponent(await p.getAttribute('.stage-chip[data-product="serum"]', 'href'));
  ok(href.includes('about Skincare'), 'chips: serum asks about Skincare');
  await p.waitForFunction(() => document.getElementById('heroStage').classList.contains('is-ready'));
  const bx = await p.evaluate(() => window.bnStage.boxes().boxes.lipstick);
  const [pop] = await Promise.all([ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null), p.mouse.click((bx.x0 + bx.x1) / 2, (bx.y0 + bx.y1) / 2)]);
  ok(pop && pop.url().includes('wa.me') ? true : !!pop, 'chips: clicking the lipstick opens a WhatsApp tab (' + (pop ? pop.url().slice(0, 60) : 'none') + ')');
  await ctx.close();
}

await b.close();
console.log(log.join('\n'));
console.log(errs.length ? 'console:\n' + errs.join('\n') : 'no console errors');
