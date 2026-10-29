import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const ROOT = process.cwd();
const OUT = path.join(ROOT, '.work', 'previews', 'hero-particles-audit');
fs.mkdirSync(OUT, { recursive: true });
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
if (!EDGE) throw new Error('Microsoft Edge was not found');
const URL = pathToFileURL(path.join(ROOT, 'index.html')).href;
const widths = [390, 768, 1440];
const scenarios = [
  { name: 'intro-complete', reduced: false, webgl: false, returning: false, action: 'enter', wait: 4300 },
  { name: 'intro-skipped', reduced: false, webgl: false, returning: false, action: 'skip', wait: 4300 },
  { name: 'reduced-motion', reduced: true, webgl: false, returning: false, action: null, wait: 1200 },
  { name: 'webgl-disabled', reduced: false, webgl: true, returning: false, action: 'skip', wait: 1200 }
];

function overlap(a, b) { return a && b && a.width > 0 && b.width > 0 && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; }
async function frameSample(page, ms = 1800) {
  return page.evaluate(ms => new Promise(resolve => { const t=[]; let last; const start=performance.now(); function step(now){ if(last != null)t.push(now-last); last=now; if(now-start<ms)requestAnimationFrame(step); else { const s=t.slice().sort((a,b)=>a-b); resolve({samples:t.length,avg:t.reduce((a,b)=>a+b,0)/Math.max(1,t.length),worst:Math.max(...t,0),p95:s[Math.floor(s.length*.95)]||0}); }} requestAnimationFrame(step); }), ms);
}
async function sceneSummary(page) {
  return page.evaluate(() => {
    const result = { present: !!window.bnScene, objects: [], meshes: 0, points: 0, lights: 0, groups: 0, geometries: 0, materials: 0, particleCount: 0, archRefNull: null };
    if (!window.bnScene?.scene) return result;
    result.archRefNull = window.bnScene.arch === null;
    window.bnScene.scene.traverse(obj => {
      if (obj === window.bnScene.scene) return;
      result.objects.push({ type: obj.type, name: obj.name || '', geometry: obj.geometry?.type || null });
      if (obj.isMesh) result.meshes++;
      if (obj.isPoints) { result.points++; result.particleCount = obj.geometry?.attributes?.position?.count || 0; }
      if (obj.isLight) result.lights++;
      if (obj.isGroup) result.groups++;
      if (obj.geometry) result.geometries++;
      if (obj.material) result.materials += Array.isArray(obj.material) ? obj.material.length : 1;
    });
    return result;
  });
}
async function run(browser, scenario, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: scenario.reduced ? 'reduce' : 'no-preference' });
  await context.addInitScript(({ returning }) => { try { sessionStorage.clear(); if (returning) sessionStorage.setItem('bn-intro-played','1'); } catch {} }, { returning: scenario.returning });
  const page = await context.newPage();
  if (scenario.webgl) await page.addInitScript(() => { const old=HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext=function(type,...args){ if(String(type).includes('webgl'))return null; return old.call(this,type,...args); }; });
  const client = await context.newCDPSession(page);
  if (scenario.name === 'intro-complete' && width === 1440) await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  if (scenario.name === 'intro-complete' && width === 390) await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const errors=[];
  page.on('console', msg => { if(msg.type()==='error' && !/ERR_NETWORK_ACCESS_DENIED|fonts\.googleapis|cdnjs|unpkg/i.test(msg.text()))errors.push(msg.text()); });
  page.on('pageerror', err => errors.push('pageerror: '+err.message));
  await page.goto(URL, { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(300);
  const before = await sceneSummary(page);
  if (scenario.action) {
    await page.waitForTimeout(scenario.action === 'enter' ? 1600 : 700);
    const selector = scenario.action === 'enter' ? '#introEnter' : '#introSkip';
    if (await page.locator(selector).isVisible().catch(()=>false)) await page.locator(selector).click();
  }
  await page.waitForTimeout(scenario.wait);
  const after = await sceneSummary(page);
  const layout = await page.evaluate(() => {
    const box = s => { const r=document.querySelector(s)?.getBoundingClientRect(); return r ? {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}:null; };
    const overlapsBox = (a,c) => a && c && a.width > 0 && c.width > 0 && a.left < c.right && a.right > c.left && a.top < c.bottom && a.bottom > c.top;
    const b={heading:box('#heroHeading'),sub:box('.hero-sub'),ctas:box('.hero-cta'),badge:box('#heroBadge'),scroll:box('.hero-scroll'),canvas:box('#gl'),hero:box('.hero')};
    const pairs=[['heading','sub'],['sub','ctas'],['ctas','badge'],['badge','scroll'],['heading','badge']];
    const overlaps=pairs.filter(([a,c])=>overlapsBox(b[a],b[c])).map(([a,c])=>a+':'+c);
    const bg=document.querySelector('.hero-bg'); const canvasEl=document.querySelector('#gl');
    return { boxes:b, overlaps, horizontalOverflow:Math.max(0,document.documentElement.scrollWidth-window.innerWidth), topGap:b.hero&&b.canvas ? b.hero.top-b.canvas.top : null, badgeScrollGap:b.scroll&&b.badge ? b.scroll.top-b.badge.bottom : null, introPresent:!!document.querySelector('#intro'), heroBg:bg ? getComputedStyle(bg).backgroundImage : null, canvasOpacity:canvasEl ? getComputedStyle(canvasEl).opacity : null };
  });
  const frames=await frameSample(page);
  const screenshot=path.join(OUT,`${scenario.name}-${width}.png`); await page.screenshot({path:screenshot,fullPage:false});
  let scrollCheck=null;
  if (scenario.name === 'intro-complete' && width === 1440) {
    await page.evaluate(()=>window.scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(500);
    scrollCheck=await page.evaluate(()=>({scrollY:window.scrollY,errors:0,overflow:Math.max(0,document.documentElement.scrollWidth-window.innerWidth)}));
  }
  await context.close();
  return { scenario:scenario.name,width,before,after,layout,frames,scrollCheck,errors,screenshot };
}

const results=[];
for(const scenario of scenarios){ const browser=await chromium.launch({executablePath:EDGE,headless:true,args:scenario.webgl?['--disable-gpu','--disable-webgl']:[]}); for(const width of widths)results.push(await run(browser,scenario,width)); await browser.close(); }
console.log(JSON.stringify({results},null,2));
