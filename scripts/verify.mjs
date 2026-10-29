/*
  Playwright verification for the BEAUTE&NUTRIE build, driven by the installed Edge.
  Run: node scripts/verify.mjs
  Produces: screenshots/ + a PASS/FAIL report in the console.
*/
import { chromium } from 'playwright-core';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

const EDGES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
];
const EDGE = EDGES.find(p => { try { return fs.existsSync(p); } catch { return false; } });

// tiny static server so the map iframe and fonts behave like they will in production
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') { p = '/index.html'; }
  const file = path.join(ROOT, p);
  try {
    const data = fs.readFileSync(file);
    const ext = path.extname(file).toLowerCase();
    const map = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
    res.writeHead(200, { 'Content-Type': map[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('nope');
  }
});

const SECTIONS = ['#top', '#inside', '#collections', '.exp', '#mens', '#proof', '#reviews', '#enquire', '#visit', '#footer'];

async function audit(page, label) {
  const out = { label, fails: [], warns: [] };
  // console errors
  // (collected by caller)
  const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth));
  if (overflow > 1) { out.fails.push(`horizontal overflow of ${overflow}px`); }

  // clipped headings: every heading fully inside viewport horizontally, has real height
  const clipped = await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('h1,h2,h3,h4').forEach(h => {
      // headings inside the pinned horizontal track live off-canvas by design
      if (h.closest('.coll-track')) { return; }
      const r = h.getBoundingClientRect();
      if (r.width > 0 && (r.left < -2 || (r.right > window.innerWidth + 2 && r.right - r.left < window.innerWidth))) {
        bad.push(h.textContent.trim().slice(0, 30) + ` [l${Math.round(r.left)} r${Math.round(r.right)} vw${window.innerWidth}]`);
      }
      const st = getComputedStyle(h);
      if (st.display !== 'none' && parseFloat(st.opacity || '1') < 0.05) {
        bad.push('invisible: ' + h.textContent.trim().slice(0, 30));
      }
    });
    return bad;
  });
  if (clipped.length) { out.fails.push('heading issues: ' + clipped.join(' | ')); }

  // anchor targets exist
  const badAnchors = await page.evaluate(() => {
    const ids = new Set(Array.from(document.querySelectorAll('[id]')).map(e => e.id));
    return Array.from(document.querySelectorAll('a[href^="#"]'))
      .filter(a => {
        const href = a.getAttribute('href');
        return href !== '#' && href.length > 1 && !ids.has(href.slice(1)) && !document.querySelector(href);
      })
      .map(a => a.getAttribute('href'));
  });
  if (badAnchors.length) { out.fails.push('dead anchors: ' + badAnchors.join(', ')); }

  // broken images
  const broken = await page.evaluate(() => Array.from(document.images).filter(i => i.complete && i.naturalWidth === 0).map(i => i.getAttribute('src')));
  if (broken.length) { out.fails.push('broken imgs: ' + broken.join(', ')); }

  // the intro must be gone by now, or the page is trapped
  const introLeft = await page.evaluate(() => !!document.getElementById('intro'));
  if (introLeft) { out.fails.push('intro overlay still present (page trapped)'); }

  // content must actually be visible: hero CTA above the fold can never sit at opacity 0
  const revealOk = await page.evaluate(() => {
    const btn = document.querySelector('.hero-cta .btn');
    if (!btn) { return 'missing'; }
    return parseFloat(getComputedStyle(btn).opacity);
  });
  if (revealOk === 'missing') { out.fails.push('hero CTA markup missing'); }
  else if (revealOk < 0.5) { out.fails.push('hero CTA invisible (reveal failed, opacity ' + revealOk + ')'); }

  // carousel: arrows wired, cards overflow on desktop
  const car = await page.evaluate(() => {
    const t = document.querySelector('#collTrack');
    if (!t) { return null; }
    return {
      arrows: !!document.querySelector('#collPrev') && !!document.querySelector('#collNext'),
      overflows: t.scrollWidth > t.clientWidth + 10,
      vw: window.innerWidth
    };
  });
  if (!car) { out.fails.push('carousel track missing'); }
  else {
    if (!car.arrows) { out.fails.push('carousel arrows missing'); }
    if (car.vw >= 901 && !car.overflows) { out.fails.push('carousel does not overflow (nothing to scroll)'); }
  }

  return out;
}

/* ---------- collections: 3D card tilt, image slots, CTA links ---------- */
async function collectionsProbe(page, name, report, opts = {}) {
  const sec = await page.$('#collections');
  if (!sec) { return report.push(`${name}: FAIL collections probe: section missing`); }
  await sec.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  // resting state already screenshotted by the SECTIONS loop above

  // 6 cards, each with title + a description <= 110 chars + a prefilled wa.me CTA
  const cards = await page.evaluate(() => Array.from(document.querySelectorAll('.col-card')).map(card => {
    const title = card.querySelector('.col-body h3');
    const desc = card.querySelector('.col-body p');
    const cta = card.querySelector('a.col-cta');
    const href = cta ? cta.href : null;
    let text = '';
    if (href && href.startsWith('https://wa.me/')) {
      try { text = decodeURIComponent(href.split('text=')[1] || ''); } catch {}
    }
    return {
      title: title ? title.textContent.trim() : null,
      descLen: desc ? desc.textContent.trim().length : -1,
      hasCta: !!cta,
      waPhone: href ? href.startsWith('https://wa.me/919355591909?text=') : false,
      catOk: !!cta && text.includes(cta.getAttribute('data-wa-ask').replace(/&amp;/g, '&').replace(/'/g, "'")),
      lift: !!card.querySelector('.col-tilt'),
      shell: !!card.querySelector('.col-3d')
    };
  }));
  if (cards.length !== 6) { report.push(`${name}: FAIL collections has ${cards.length} of 6 cards`); }
  cards.forEach((c, i) => {
    if (!c.title) { report.push(`${name}: FAIL card ${i + 1} has no title`); }
    if (c.descLen <= 0) { report.push(`${name}: FAIL card ${i + 1} has no description (${c.title})`); }
    else if (c.descLen > 110) { report.push(`${name}: FAIL card ${i + 1} description longer than 110 chars (${c.title})`); }
    if (!c.hasCta) { report.push(`${name}: FAIL card ${i + 1} has no CTA (${c.title})`); }
    else {
      if (!c.waPhone) { report.push(`${name}: FAIL CTA is not a prefilled wa.me link (${c.title})`); }
      if (!c.catOk) { report.push(`${name}: FAIL CTA prefill does not name the category (${c.title})`); }
    }
    if (!c.lift || !c.shell) { report.push(`${name}: FAIL card ${i + 1} missing 3D wrappers (${c.title})`); }
  });

  // image slots: all six cards run on the slot system, every one must load
  // files the user dropped in, and each carries the honest "Illustrative
  // image" tag. The Shop-for-Him section photo must load on its own too.
  const slots = await page.evaluate(() => {
    const slabs = Array.from(document.querySelectorAll('.col-card .col-slab'));
    return {
      slabCount: slabs.length,
      slotsSeen: slabs.filter(s => s.querySelector('.slot-tag')).length,
      slotsMissing: slabs.filter(s => s.classList.contains('slot-missing')).length,
      cardsLoaded: slabs.every(s => {
        const i = s.querySelector('.slot-img img');
        return !!i && i.naturalWidth > 0;
      }),
      mensLoaded: (() => { const i = document.getElementById('mensImg'); return !!i && i.naturalWidth > 0; })()
    };
  });
  if (slots.slabCount !== 6) { report.push(`${name}: FAIL collections has ${slots.slabCount} of 6 image slabs`); }
  if (!slots.cardsLoaded) { report.push(`${name}: FAIL at least one collection card image failed to load`); }
  if (slots.slotsSeen !== 6) { report.push(`${name}: FAIL expected 6 illustrative-image tags, found ${slots.slotsSeen}`); }
  if (slots.slotsMissing > 0) { report.push(`${name}: FAIL ${slots.slotsMissing} collection slots missing images`); }
  if (!slots.mensLoaded) { report.push(`${name}: FAIL shop-for-him photo failed to load`); }

  // tilt behaviour: desktop/tablet hover a fine-pointer plan, mobile is static
  if (!opts.touch) {
    const cardBox = await page.$$eval('.col-card', els => { const r = els[0].getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
    const readTilt = () => page.evaluate(() => {
      const t = document.querySelector('.col-card .col-tilt');
      const title = document.querySelector('.col-card .col-body h3');
      let depth = null;
      const mt = title ? getComputedStyle(title).transform : '';
      try { if (mt && mt !== 'none' && window.DOMMatrix) { depth = new DOMMatrix(mt).m43; } } catch {}
      return { tilt: t ? (t.style.transform || '') : null, depth };
    });
    const poses = [
      { fx: 0.08, fy: 0.06, label: 'topleft', wantRy: 'neg', wantRx: 'pos' },
      { fx: 0.5, fy: 0.5, label: 'centre', wantRy: 'zero', wantRx: 'zero' },
      { fx: 0.92, fy: 0.94, label: 'bottomright', wantRy: 'pos', wantRx: 'neg' }
    ];
    if (cardBox.w > 0) {
      for (const p of poses) {
        await page.mouse.move(cardBox.x + cardBox.w * p.fx, cardBox.y + cardBox.h * p.fy);
        await page.waitForTimeout(280);
        await page.screenshot({ path: `${SHOTS}/${name}-card-hover-${p.label}.jpg`, quality: 70, type: 'jpeg' });
        const st = await readTilt();
        const m = st.tilt.match(/rotateY\((-?[\d.]+)deg\) rotateX\((-?[\d.]+)deg\)/);
        if (!m) { report.push(`${name}: FAIL tilt did not engage at ${p.label} (transform "${st.tilt}")`); continue; }
        const ry = parseFloat(m[1]), rx = parseFloat(m[2]);
        const sign = v => v > 0.4 ? 'pos' : (v < -0.4 ? 'neg' : 'zero');
        if (p.wantRy !== 'zero' && sign(ry) !== p.wantRy) { report.push(`${name}: FAIL rotateY sign at ${p.label} (${ry} wanted ${p.wantRy})`); }
        if (p.wantRy === 'zero' && Math.abs(ry) > 1.5) { report.push(`${name}: FAIL rotateY not centred at centre pose (${ry})`); }
        if (p.wantRx !== 'zero' && sign(rx) !== p.wantRx) { report.push(`${name}: FAIL rotateX sign at ${p.label} (${rx} wanted ${p.wantRx})`); }
        if (p.wantRx === 'zero' && Math.abs(rx) > 1.5) { report.push(`${name}: FAIL rotateX not centred at centre pose (${rx})`); }
        // depth layering: the title rides 50px forward while hovered
        if (st.depth === null) { report.push(`${name}: FAIL title depth transform missing at ${p.label}`); }
        else if (Math.abs(st.depth - 50) > 2) { report.push(`${name}: FAIL title depth at ${p.label} is ${st.depth}px, expected 50px`); }
      }
      // leave: the card must reset on the slower ease
      await page.mouse.move(4, 4);
      await page.waitForTimeout(650);
      const after = await page.evaluate(() => {
        const t = document.querySelector('.col-card .col-tilt');
        return t ? t.style.transform : '';
      });
      if (!/rotateY\(0deg\) rotateX\(0deg\)/.test(after)) {
        report.push(`${name}: FAIL tilt did not reset on leave (transform "${after}")`);
      }
    }
  } else {
    // touch devices: no pointer tilt may ever engage
    const t = await page.evaluate(() => {
      const el = document.querySelector('.col-card .col-tilt');
      return el ? el.style.transform : null;
    });
    if (t) { report.push(`${name}: FAIL tilt style applied on touch device`); }
    const depth = await page.$eval('.col-card .col-body h3', el => getComputedStyle(el).transform);
    report.push(`${name}: INFO touch depth transform of title: ${depth}`);
    // at the comfortable reachable position (section bottom aligned to the
    // viewport bottom) the CTA must sit clear of the fixed quick-action bar
    await page.evaluate(() => {
      const sec = document.getElementById('collections');
      const top = sec.getBoundingClientRect().bottom + (window.pageYOffset || document.documentElement.scrollTop) - window.innerHeight;
      window.scrollTo(0, Math.min(document.documentElement.scrollHeight - window.innerHeight, top));
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/${name}-collections-clear.jpg`, quality: 70, type: 'jpeg' });
    const ctaPos = await page.evaluate(() => {
      const cta = document.querySelector('.col-card .col-cta');
      const bar = document.querySelector('.mbar');
      return { ctaBottom: cta ? cta.getBoundingClientRect().bottom : -1, barTop: bar ? bar.getBoundingClientRect().top : window.innerHeight };
    });
    if (ctaPos.ctaBottom >= ctaPos.barTop) {
      report.push(`${name}: FAIL card CTA sits behind the fixed bottom bar (cta ${Math.round(ctaPos.ctaBottom)} vs bar top ${Math.round(ctaPos.barTop)})`);
    }
  }

  // the carousel itself must still scroll (arrows work) after a hover cycle
  const before = await page.$eval('#collTrack', t => t.scrollLeft);
  await page.click('#collNext').catch(e => report.push(`${name}: FAIL next arrow click ${e.message.slice(0, 60)}`));
  await page.waitForTimeout(700);
  const after2 = await page.$eval('#collTrack', t => t.scrollLeft);
  if (!(after2 > before + 100)) { report.push(`${name}: FAIL carousel did not scroll via arrow (${before} to ${after2})`); }
}

/* ---------- intro / venom probe: before-appear, idle, latched, enter ---------- */
async function introProbe(page, name, report, opts = {}) {
  const hasIntro = await page.$('#intro');
  if (!hasIntro) { report.push(`${name}: FAIL intro overlay missing at load`); return; }

  // 1) before-appear: the enter unit stays hidden until the 3D name lands
  const pre = await page.evaluate(() => {
    const b = document.getElementById('introEnter');
    const st = document.getElementById('venomStage');
    const cs = st ? getComputedStyle(st) : null;
    return {
      btnIn: b ? b.classList.contains('in') : 'missing',
      txt: b ? b.textContent : null,
      label: b ? b.getAttribute('aria-label') : null,
      tabIndex: b ? b.tabIndex : null,
      stageOpacity: cs ? parseFloat(cs.opacity || '0') : null,
      stage: !!st
    };
  });
  await page.screenshot({ path: `${SHOTS}/${name}-intro-before.jpg`, quality: 70, type: 'jpeg' });
  if (pre.btnIn === 'missing') { report.push(`${name}: FAIL enter button missing at load`); }
  else if (pre.btnIn !== false) { report.push(`${name}: INFO enter button already in at probe point (load was slow)`); }
  if (!pre.stage) { report.push(`${name}: FAIL venom stage missing from markup`); }
  if (pre.txt !== 'BEAUTE&NUTRIE') { report.push(`${name}: FAIL enter label text wrong ("${pre.txt}")`); }
  if (pre.label !== 'Enter BEAUTE&NUTRIE') { report.push(`${name}: FAIL enter aria-label wrong ("${pre.label}")`); }
  if (pre.tabIndex !== -1) { report.push(`${name}: FAIL hidden enter button is tabbable pre-ready (tabIndex ${pre.tabIndex})`); }

  // 2) it appears after the name lands
  let shownIn = false;
  for (let dead = Date.now() + 6000; Date.now() < dead;) {
    shownIn = await page.evaluate(() => {
      const b = document.getElementById('introEnter');
      return !!b && b.classList.contains('in');
    });
    if (shownIn) { break; }
    await page.waitForTimeout(150);
  }
  if (!shownIn) { report.push(`${name}: FAIL enter button never appeared`); return; }

  // 3) idle: label, geometry, clear zone, hit target, goo live state
  const idle = await page.evaluate(() => {
    const b = document.getElementById('introEnter');
    const st = document.getElementById('venomStage');
    const r = b.getBoundingClientRect();
    const inter = sel => {
      const el = document.querySelector(sel);
      if (!el) { return false; }
      const r2 = el.getBoundingClientRect();
      return Math.min(r.right, r2.right) > Math.max(r.left, r2.left) && Math.min(r.bottom, r2.bottom) > Math.max(r.top, r2.top);
    };
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      txt: b.textContent, label: b.getAttribute('aria-label'),
      w: Math.round(r.width), h: Math.round(r.height), left: Math.round(r.left), right: Math.round(r.right),
      top: Math.round(r.top), bottom: Math.round(r.bottom), vh: window.innerHeight, vw: window.innerWidth,
      nowrap: b.scrollWidth <= b.clientWidth + 1,
      wordHit: inter('.intro-word'), lineHit: inter('.intro-line'), skipHit: inter('.intro-skip'),
      hitBtn: !!hit && (hit === b || b.contains(hit)),
      live: st.classList.contains('venom-live'),
      stageZ: getComputedStyle(st).zIndex, glZ: getComputedStyle(document.getElementById('gl')).zIndex,
      tabIndex: b.tabIndex,
      focusBtn: document.activeElement === b
    };
  });
  await page.waitForTimeout(1400); // let the ghost hand roam into frame
  await page.screenshot({ path: `${SHOTS}/${name}-intro-idle.jpg`, quality: 70, type: 'jpeg' });
  if (idle.txt !== 'BEAUTE&NUTRIE') { report.push(`${name}: FAIL enter label wrong (${idle.txt})`); }
  if (idle.label !== 'Enter BEAUTE&NUTRIE') { report.push(`${name}: FAIL enter aria-label wrong (${idle.label})`); }
  if (!idle.nowrap) { report.push(`${name}: FAIL button label wraps or clips`); }
  if (idle.right > idle.vw - 8 || idle.left < 8) { report.push(`${name}: FAIL button touches the viewport edge (${idle.left}..${idle.right} of ${idle.vw})`); }
  if (idle.wordHit) { report.push(`${name}: FAIL button overlaps the location line`); }
  if (idle.lineHit) { report.push(`${name}: FAIL button overlaps the progress line`); }
  if (idle.skipHit) { report.push(`${name}: FAIL button overlaps the skip control`); }
  if (!idle.hitBtn) { report.push(`${name}: FAIL button not on top at its own centre (covered by canvas or HUD)`); }
  if (idle.live !== true) { report.push(`${name}: FAIL goo mode not live (venom-live class absent)`); }
  if (idle.tabIndex !== 0) { report.push(`${name}: FAIL visible button not tabbable (tabIndex ${idle.tabIndex})`); }
  if (!idle.focusBtn) { report.push(`${name}: FAIL keyboard focus is not on the enter button when it appears`); }
  report.push(`${name}: INFO enter pill ${idle.w}x${idle.h} at y ${idle.top}..${idle.bottom} of ${idle.vh}, stage z ${idle.stageZ}, gl z ${idle.glZ}`);

  // 4) latched: move onto the pill, strands must grab the glove cursor
  const cx = (idle.left + idle.right) / 2, cy = (idle.top + idle.bottom) / 2;
  await page.mouse.move(cx, cy, { steps: 14 });
  await page.waitForTimeout(800);
  const latch = await page.evaluate(() => {
    const hand = document.getElementById('venomHand');
    const b = document.getElementById('introEnter');
    if (!hand) { return { glove: -1, hidden: 'none', transform: '' }; }
    const d = hand.getContext('2d').getImageData(0, 0, hand.width, hand.height).data;
    let a = 0;
    for (let i = 3; i < d.length; i += 47) { a += d[i]; }
    return {
      glove: a,
      stageCursor: document.getElementById('venomStage').style.cursor,
      btnCursor: b.style.cursor,
      transform: b.style.transform
    };
  });
  await page.screenshot({ path: `${SHOTS}/${name}-intro-latched.jpg`, quality: 70, type: 'jpeg' });
  if (latch.glove <= 0) { report.push(`${name}: FAIL glove cursor canvas is empty while latched`); }
  report.push(`${name}: INFO latch: glove alpha sum ${latch.glove}, btn cursor "${latch.btnCursor}", transform "${latch.transform || 'none'}"`);

  // 5) click enters exactly like Skip: overlay gone, scroll unlocked
  await page.click('#introEnter', { timeout: 6000 });
  await page.waitForSelector('#intro', { state: 'detached', timeout: 6000 });
  const after = await page.evaluate(() => ({
    locked: document.body.classList.contains('intro-lock'),
    overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
  }));
  if (after.locked) { report.push(`${name}: FAIL body still scroll-locked after enter click`); }
  if (after.overflow > 1) { report.push(`${name}: FAIL ${after.overflow}px horizontal overflow after enter`); }
}

async function run() {
  if (!EDGE) { console.log('FAIL: no Edge executable found'); process.exit(2); }
  await new Promise(r => server.listen(4173, r));
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const report = [];
  let consoleErrors = [];

  const widths = [[390, 'mobile'], [768, 'tablet'], [1440, 'desktop']];

  // ---------- main pass, with intro ----------
  for (const [w, name] of widths) {
    const ctx = await browser.newContext({ viewport: { width: w, height: Math.round(w * 1.9) }, deviceScaleFactor: 1, isMobile: w < 700, hasTouch: w < 700 });
    const page = await ctx.newPage();
    consoleErrors = [];
    page.on('console', m => { if (m.type() === 'error') { const u = m.location() && m.location().url ? ' ' + m.location().url : ''; consoleErrors.push((m.text() + u).slice(0, 240)); } });
    page.on('pageerror', e => { consoleErrors.push('PAGEERROR ' + String(e).slice(0, 140)); });
    await page.goto('http://localhost:4173/', { waitUntil: 'load', timeout: 60000 });

    // intro probe: before-appear, idle, latched shots + assertions, then click to enter
    await introProbe(page, name, report, {});
    // park the synthetic pointer in the corner: the custom cursor has an idle fade,
    // and section shots shouldn't race its 2.6s timeout
    await page.mouse.move(4, 4);
    await page.waitForTimeout(700);

    for (const sel of SECTIONS) {
      const el = await page.$(sel);
      if (!el) { report.push(`${name}: MISSING SECTION ${sel}`); continue; }
      try { await el.scrollIntoViewIfNeeded(); } catch { await el.evaluate(e => e.scrollIntoView()); }
      await page.waitForTimeout(650);
      await page.screenshot({ path: `${SHOTS}/${name}-${sel.replace(/[#.]/g, '')}.jpg`, quality: 70, type: 'jpeg' });
    }

    // scroll-trap check: nothing may stop the page from reaching its very bottom
    await collectionsProbe(page, name, report, { touch: w < 700 });
    const trap = await page.evaluate(async () => {
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      window.scrollTo(0, max);
      await new Promise(r => setTimeout(r, 700));
      const y = window.scrollY || window.pageYOffset || document.documentElement.scrollTop;
      return { y, max };
    });
    if (trap.max > 100 && (trap.y < trap.max * 0.9)) {
      report.push(`${name}: FAIL scroll trapped at ${Math.round(trap.y)} of ${Math.round(trap.max)}px`);
    }
    const a = await audit(page, name);
    const mapOk = await page.evaluate(() => {
      const f = document.querySelector('#mapShell iframe');
      const fb = document.querySelector('#mapFallback.show');
      return !!f || !!fb;
    });
    if (!mapOk) { a.fails.push('map neither iframe nor fallback'); }
    /* the five pending card images are expected 404s until the user drops
       the generated files in; every other local error stays a failure */
    const pending404 = t => /Failed to load resource|404/i.test(t) && /images\/card-(makeup|skincare|haircare|personalcare|gifting)/.test(t);
    const localErrs = consoleErrors.filter(t => !/cdnjs|unpkg|fonts|google/.test(t) && !pending404(t));
    const extErrs = consoleErrors.filter(t => /cdnjs|unpkg|fonts|google/.test(t));
    if (localErrs.length) { a.fails.push('console errors: ' + localErrs.slice(0, 4).join(' ~ ')); }
    if (extErrs.length) { a.warns.push('cdncorn err: ' + extErrs.slice(0, 2).join(' ~ ')); }
    report.push(`${a.label}: ${a.fails.length ? 'FAIL ' + a.fails.join(' ; ') : 'PASS'}`);
    if (a.warns && a.warns.length) { report.push(`${a.label}: (warnings) ${a.warns.slice(0, 4).join(' ~ ')}`); }
    await ctx.close();
  }

  // ---------- landscape desktop: exercises the wide arch branch (aspect >= 1) ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    consoleErrors = [];
    page.on('console', m => { if (m.type() === 'error') { const u = m.location() && m.location().url ? ' ' + m.location().url : ''; consoleErrors.push((m.text() + u).slice(0, 240)); } });
    page.on('pageerror', e => { consoleErrors.push('PAGEERROR ' + String(e).slice(0, 140)); });
    await page.goto('http://localhost:4173/', { waitUntil: 'load', timeout: 60000 });
    await introProbe(page, 'desktop-wide', report, {});
    const wideErrs = consoleErrors.filter(t => !/cdnjs|unpkg|fonts|google/.test(t));
    if (wideErrs.length) { report.push('desktop-wide: FAIL console errors: ' + wideErrs.slice(0, 3).join(' ~ ')); }
    await page.mouse.move(4, 4);
    await ctx.close();
  }

  // ---------- keyboard: Enter, then Space, enter the site with focus ----------
  for (const [key, label] of [['Enter', 'kbd-enter'], ['Space', 'kbd-space']]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    consoleErrors = [];
    page.on('console', m => { if (m.type() === 'error') { const u = m.location() && m.location().url ? ' ' + m.location().url : ''; consoleErrors.push((m.text() + u).slice(0, 240)); } });
    page.on('pageerror', e => { consoleErrors.push('PAGEERROR ' + String(e).slice(0, 140)); });
    await page.goto('http://localhost:4173/', { waitUntil: 'load', timeout: 60000 });
    let shownIn = false;
    for (let dead = Date.now() + 6000; Date.now() < dead;) {
      shownIn = await page.evaluate(() => { const b = document.getElementById('introEnter'); return !!b && b.classList.contains('in'); });
      if (shownIn) { break; }
      await page.waitForTimeout(150);
    }
    const focusOn = await page.evaluate(() => {
      const a = document.activeElement;
      return a ? a.id || a.tagName : 'none';
    });
    if (focusOn !== 'introEnter') { report.push(`${label}: FAIL focus is on ${focusOn}, not the enter button`); }
    await page.keyboard.press(key);
    await page.waitForSelector('#intro', { state: 'detached', timeout: 6000 });
    const unlocked = await page.evaluate(() => !document.body.classList.contains('intro-lock'));
    if (!unlocked) { report.push(`${label}: FAIL scroll locked after ${key}`); }
    else { report.push(`${label}: PASS ${key} via the venom button enters, scroll unlocked`); }
    await ctx.close();
  }

  // ---------- touch: no hover anywhere, a simple tap enters ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 741 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    consoleErrors = [];
    page.on('console', m => { if (m.type() === 'error') { const u = m.location() && m.location().url ? ' ' + m.location().url : ''; consoleErrors.push((m.text() + u).slice(0, 240)); } });
    page.on('pageerror', e => { consoleErrors.push('PAGEERROR ' + String(e).slice(0, 140)); });
    await page.goto('http://localhost:4173/', { waitUntil: 'load', timeout: 60000 });
    for (let dead = Date.now() + 6000; Date.now() < dead;) {
      const okNow = await page.evaluate(() => { const b = document.getElementById('introEnter'); return !!b && b.classList.contains('in'); });
      if (okNow) { break; }
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SHOTS}/touch-intro-idle.jpg`, quality: 70, type: 'jpeg' });
    const t = await page.evaluate(() => {
      const b = document.getElementById('introEnter');
      const r = b.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { h: Math.round(r.height), inView: r.top >= 0 && r.bottom <= window.innerHeight, hitOk: !!hit && (hit === b || b.contains(hit)) };
    });
    if (!t.inView) { report.push('touch: FAIL enter button outside the viewport'); }
    if (t.h < 44) { report.push(`touch: FAIL tap target ${t.h}px is under 44px`); }
    if (!t.hitOk) { report.push('touch: FAIL button not the top hit target at its centre'); }
    await page.tap('#introEnter');
    await page.waitForSelector('#intro', { state: 'detached', timeout: 6000 });
    report.push('touch: PASS tap enters the site');
    await ctx.close();
  }

  // ---------- reduced motion pass ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    consoleErrors = [];
    page.on('console', m => { if (m.type() === 'error') { const u = m.location() && m.location().url ? ' ' + m.location().url : ''; consoleErrors.push((m.text() + u).slice(0, 240)); } });
    page.on('pageerror', e => { consoleErrors.push('PAGEERROR ' + String(e).slice(0, 140)); });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('http://localhost:4173/', { waitUntil: 'load' });
    await page.waitForTimeout(1100);
    const introVisible = await page.evaluate(() => {
      const i = document.querySelector('#intro');
      return !!i && getComputedStyle(i).display !== 'none' && getComputedStyle(i).visibility !== 'hidden' && parseFloat(getComputedStyle(i).opacity) > 0.05;
    });
    await page.screenshot({ path: `${SHOTS}/reduced-motion-hero.jpg`, quality: 70, type: 'jpeg' });
    // collections under reduced motion: the tilt module must never engage and
    // no depth item may carry a translateZ beyond the resting 0
    const rmColl = await page.evaluate(async () => {
      const sec = document.getElementById('collections');
      sec.scrollIntoView();
      await new Promise(r => setTimeout(r, 400));
      const card = document.querySelector('.col-card');
      const r = card.getBoundingClientRect();
      const t = card.querySelector('.col-tilt');
      const out = { tiltStyle: '', maxZ: -1 };
      if (t) {
        card.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse', clientX: r.left + r.width * 0.2, clientY: r.top + r.height * 0.2, bubbles: true }));
        await new Promise(r2 => setTimeout(r2, 150));
        out.tiltStyle = t.style.transform || '';
      }
      card.querySelectorAll('.col-tilt [data-depth]').forEach(function (i) {
        const m = getComputedStyle(i).transform;
        if (m && m !== 'none' && window.DOMMatrix) {
          try { out.maxZ = Math.max(out.maxZ, Math.abs(new DOMMatrix(m).m43)); } catch (e) {}
        }
      });
      return out;
    });
    if (rmColl.tiltStyle) { report.push(`reduced-motion: FAIL tilt engaged ("${rmColl.tiltStyle.slice(0, 60)}")`); }
    if (rmColl.maxZ > 0.5) { report.push(`reduced-motion: FAIL depth translateZ ${rmColl.maxZ}px active under reduced motion`); }
    const r = await audit(page, 'reduced-motion');
    if (introVisible) { r.fails.push('intro visible under reduced motion'); }
    const rmErrs = consoleErrors.filter(t => !(/Failed to load resource|404/i.test(t) && /images\/card-(makeup|skincare|haircare|personalcare|gifting)/.test(t)));
    if (rmErrs.length) { r.fails.push('console errors: ' + rmErrs.slice(0, 4).join(' ~ ')); }
    report.push(`${r.label}: ${r.fails.length ? 'FAIL ' + r.fails.join(' ; ') : 'PASS'}`);
    await ctx.close();
  }

  // ---------- webgl disabled pass ----------
  {
    const browser2 = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--disable-webgl', '--disable-webgl2', '--disable-features=WebGL'] });
    const ctxWeb = await browser2.newContext({ viewport: { width: 1280, height: 900 } });
    const pageWeb = await ctxWeb.newPage();
    consoleErrors = [];
    pageWeb.on('console', m => { if (m.type() === 'error') { const u = m.location() && m.location().url ? ' ' + m.location().url : ''; consoleErrors.push((m.text() + u).slice(0, 240)); } });
    pageWeb.on('pageerror', e => { consoleErrors.push('PAGEERROR ' + String(e).slice(0, 140)); });
    await pageWeb.goto('http://localhost:4173/', { waitUntil: 'load' });
    await pageWeb.waitForTimeout(1500);
    await pageWeb.screenshot({ path: `${SHOTS}/webgl-off-intro.jpg`, quality: 70, type: 'jpeg' });
    const fbn = await pageWeb.evaluate(() => {
      const el = document.querySelector('.introfx-arch');
      const w = document.querySelector('.intro-word span');
      const b = document.getElementById('introEnter');
      return {
        arch: el ? getComputedStyle(el).display : 'none',
        wordOpacity: w ? getComputedStyle(w).opacity : 'none',
        btnIn: b ? b.classList.contains('in') : 'missing'
      };
    });
    if (fbn.wordOpacity !== '1') {
      report.push(`webgl-off: FAIL brand word hidden in fallback (span opacity ${fbn.wordOpacity})`);
    }
    if (fbn.btnIn !== true) {
      report.push(`webgl-off: FAIL enter button never appeared (state ${fbn.btnIn})`);
    }
    const gooOff = await pageWeb.evaluate(() => {
      const st = document.querySelector('.venom-stage');
      return st ? st.classList.contains('venom-live') : 'no';
    });
    if (gooOff === true) {
      report.push('webgl-off: FAIL goo unexpectedly live in fallback');
    }
    // Escape skips the intro at any moment (even mid auto-fade)
    await pageWeb.keyboard.press('Escape');
    await pageWeb.waitForSelector('#intro', { state: 'detached', timeout: 6000 });
    const r2 = await audit(pageWeb, 'webgl-off');
    const woErrs = consoleErrors.filter(t => !(/Failed to load resource|404/i.test(t) && /images\/card-(makeup|skincare|haircare|personalcare|gifting)/.test(t)));
    if (woErrs.length) { r2.fails.push('console errors: ' + woErrs.slice(0, 4).join(' ~ ')); }
    report.push(`webgl-off: ${r2.fails.length ? 'FAIL ' + r2.fails.join(' ; ') : 'PASS'} (fallback arch display=${fbn.arch})`);
    await browser2.close();
  }

  await browser.close();
  server.close();
  console.log('== VERIFY REPORT ==');
  report.forEach(l => console.log(l));
  console.log('== shake out done ==');
  process.exit(0);
}

run().catch(e => { console.error('VERIFY CRASHED:', e); process.exit(1); });
