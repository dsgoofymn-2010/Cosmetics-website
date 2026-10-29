import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11','--enable-gpu'] });
const ctx = await b.newContext({ viewport: { width: 412, height: 823 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1.75 });
await ctx.addInitScript(() => {
  window.__lt = []; new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push([Math.round(e.startTime), Math.round(e.duration), e.attribution && e.attribution[0] && e.attribution[0].containerSrc]))).observe({ type: 'longtask', buffered: true });
  window.__mk = []; const om = performance.mark.bind(performance);
});
const p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,v8.execute', transferMode: 'ReturnAsStream' }).catch(()=>{});
await p.goto('http://localhost:4174/');
await p.waitForTimeout(14000);
console.log('longtasks', JSON.stringify(await p.evaluate(() => window.__lt)));
console.log('stage', await p.evaluate(() => document.getElementById('heroStage').className));
const chunks = []; 
const done = new Promise((res) => cdp.on('Tracing.tracingComplete', async (e) => { let d = ''; while (true) { const r = await cdp.send('IO.read', { handle: e.stream }); d += r.data; if (r.eof) break; } res(d); }));
await cdp.send('Tracing.end'); const raw = await done;
const ev = JSON.parse(raw).traceEvents || JSON.parse(raw);
const tasks = ev.filter(e => e.name === 'RunTask' && e.dur > 200000).map(e => ({ ts: e.ts, dur: e.dur, tid: e.tid }));
for (const t of tasks.slice(0, 6)) {
  const inner = ev.filter(e => e.tid === t.tid && e.ts >= t.ts && e.ts < t.ts + t.dur && e.dur > 30000 && e.name !== 'RunTask');
  console.log('TASK', Math.round(t.dur/1000)+'ms', inner.slice(0,8).map(e => e.name + ':' + Math.round(e.dur/1000) + (e.args && e.args.data && (e.args.data.url || e.args.data.functionName) ? '(' + String(e.args.data.url || e.args.data.functionName).split('/').pop() + ')' : '')).join(' | '));
}
await b.close();
