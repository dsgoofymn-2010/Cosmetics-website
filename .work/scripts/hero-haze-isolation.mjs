import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const ROOT = process.cwd();
const OUT = path.join(ROOT, '.work', 'previews', 'hero-haze-isolation');
fs.mkdirSync(OUT, { recursive: true });
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
if (!EDGE) throw new Error('Microsoft Edge was not found');
const URL = pathToFileURL(path.join(ROOT, 'index.html')).href;
const variants = [
  { name: 'baseline', apply: null },
  { name: 'css-right-radial-disabled', apply: () => { const el=document.querySelector('.hero-bg'); if(el) el.style.background='radial-gradient(115% 85% at 50% 0%, var(--wine-deep) 0%, var(--bg) 58%, #12090C 100%)'; } },
  { name: 'three-lights-disabled', apply: () => { window.bnScene?.scene?.traverse(o => { if(o.isLight) o.intensity=0; }); } },
  { name: 'particles-disabled', apply: () => { if(window.bnScene?.particles) { window.bnScene.particles.visible=false; } } },
  { name: 'canvas-disabled', apply: () => { const el=document.querySelector('#gl'); if(el) el.style.display='none'; } }
];
const results=[];
for (const v of variants) {
  const browser=await chromium.launch({ executablePath: EDGE, headless: true });
  const context=await browser.newContext({ viewport:{width:1440,height:900} });
  await context.addInitScript(() => { try { sessionStorage.clear(); } catch {} });
  const page=await context.newPage();
  const errors=[];
  page.on('console', msg => { if(msg.type()==='error' && !/ERR_NETWORK_ACCESS_DENIED|fonts\.googleapis|cdnjs|unpkg/i.test(msg.text())) errors.push(msg.text()); });
  page.on('pageerror', err => errors.push('pageerror: '+err.message));
  await page.goto(URL, {waitUntil:'domcontentloaded'});
  await page.waitForTimeout(700);
  if (await page.locator('#introSkip').isVisible().catch(()=>false)) await page.locator('#introSkip').click();
  await page.waitForTimeout(4200);
  if (v.apply) await page.evaluate(v.apply);
  await page.waitForTimeout(350);
  const screenshot=path.join(OUT,`${v.name}.png`);
  await page.screenshot({path:screenshot, fullPage:false});
  const state=await page.evaluate(() => ({
    heroBackground: getComputedStyle(document.querySelector('.hero-bg')).backgroundImage,
    canvasDisplay: getComputedStyle(document.querySelector('#gl')).display,
    lightIntensities: window.bnScene?.scene ? (()=>{const a=[];window.bnScene.scene.traverse(o=>{if(o.isLight)a.push({type:o.type,intensity:o.intensity})});return a})() : [],
    particleVisible: !!window.bnScene?.particles?.visible,
    particleOpacity: window.bnScene?.particles?.material?.opacity ?? null,
    particleBlending: window.bnScene?.particles?.material?.blending ?? null
  }));
  state.errors = errors;
  results.push({variant:v.name,screenshot,state});
  await context.close(); await browser.close();
}
console.log(JSON.stringify({results}, null, 2));
