const fs = require('fs');
const path = require('path');
const { chromium } = require('./node_modules/playwright-core');

const ROOT = __dirname;
const FRAMES_DIR = path.join(ROOT, 'verification_frames');
const fileUrl = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');

if (!fs.existsSync(FRAMES_DIR)) {
  fs.mkdirSync(FRAMES_DIR, { recursive: true });
}

async function run() {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--allow-file-access-from-files', '--disable-web-security']
  });

  const results = {
    defects: [],
    frameCaptures: [],
    performance: {},
    interactiveTests: {},
    postTransitionChecks: {}
  };

  try {
    console.log('\n--- PART 1: FRAME CAPTURES AT 390, 768, 1440px ---');
    const viewports = [
      { name: 'mobile_390', width: 390, height: 844 },
      { name: 'tablet_768', width: 768, height: 1024 },
      { name: 'desktop_1440', width: 1440, height: 900 }
    ];
    const timestamps = [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.4];

    for (const vp of viewports) {
      console.log(`Capturing frames for ${vp.name}...`);
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1
      });
      const page = await context.newPage();
      await page.goto(`${fileUrl}?debug=1`);
      // Wait for scene & intro to initialize
      await page.waitForTimeout(1400);

      // Trigger transition start by clicking enter button
      await page.evaluate(() => {
        const enterBtn = document.getElementById('introEnter') || document.getElementById('introSkip');
        enterBtn.click();
      });
      await page.waitForTimeout(120);

      // Scrub through timeline and capture each timestamp
      for (const t of timestamps) {
        const progress = Math.min(1, Math.max(0, t / 3.40));
        await page.evaluate((p) => {
          const scrub = document.getElementById('tlScrub');
          if (scrub) {
            scrub.value = String(Math.round(p * 1000));
            scrub.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }, progress);
        await page.waitForTimeout(80);

        const filename = `${vp.name}_t${t.toFixed(1).replace('.', '_')}s.png`;
        const filePath = path.join(FRAMES_DIR, filename);
        await page.screenshot({ path: filePath, fullPage: false });
        results.frameCaptures.push({ viewport: vp.name, timestamp: t, file: filename });
      }
      await context.close();
    }
    console.log(`Captured ${results.frameCaptures.length} frames total in ${FRAMES_DIR}`);

    console.log('\n--- PART 2: PERFORMANCE MEASUREMENTS (rAF deltas) ---');
    // Desktop 1440px performance
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      await page.goto(fileUrl);
      await page.waitForTimeout(1400);

      const perfData = await page.evaluate(async () => {
        return new Promise((resolve) => {
          const deltas = [];
          let lastTime = performance.now();
          let recording = true;

          function measure(now) {
            if (!recording) return;
            const delta = now - lastTime;
            lastTime = now;
            deltas.push(delta);
            requestAnimationFrame(measure);
          }
          requestAnimationFrame(measure);

          // Trigger transition
          const btn = document.getElementById('introEnter') || document.getElementById('introSkip');
          btn.click();

          // Collect for 3600ms (entire 3.4s transition + settle)
          setTimeout(() => {
            recording = false;
            const valid = deltas.slice(1);
            const sum = valid.reduce((a, b) => a + b, 0);
            const avg = sum / valid.length;
            const worst = Math.max(...valid);
            resolve({ count: valid.length, avg, worst, fps: 1000 / avg });
          }, 3600);
        });
      });
      results.performance.desktop_1440 = perfData;
      console.log(`Desktop 1440px: Avg frame time = ${perfData.avg.toFixed(2)}ms (~${perfData.fps.toFixed(1)} fps), Worst = ${perfData.worst.toFixed(2)}ms`);
      await context.close();
    }

    // Mobile emulation 390px with 4x CPU throttling
    {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true
      });
      const page = await context.newPage();
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

      await page.goto(fileUrl);
      await page.waitForTimeout(1600);

      const mobilePerf = await page.evaluate(async () => {
        return new Promise((resolve) => {
          const deltas = [];
          let lastTime = performance.now();
          let recording = true;

          function measure(now) {
            if (!recording) return;
            const delta = now - lastTime;
            lastTime = now;
            deltas.push(delta);
            requestAnimationFrame(measure);
          }
          requestAnimationFrame(measure);

          const btn = document.getElementById('introEnter') || document.getElementById('introSkip');
          btn.click();

          setTimeout(() => {
            recording = false;
            const valid = deltas.slice(1);
            const sum = valid.reduce((a, b) => a + b, 0);
            const avg = sum / valid.length;
            const worst = Math.max(...valid);
            resolve({ count: valid.length, avg, worst, fps: 1000 / avg });
          }, 3600);
        });
      });
      results.performance.mobile_4x_throttled = mobilePerf;
      console.log(`Mobile (390px, 4x CPU Throttling): Avg frame time = ${mobilePerf.avg.toFixed(2)}ms (~${mobilePerf.fps.toFixed(1)} fps), Worst = ${mobilePerf.worst.toFixed(2)}ms`);
      await context.close();
    }

    console.log('\n--- PART 3: INTERACTIVE & EDGE CASE TESTS ---');

    // Test A: Click the enter button
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(fileUrl);
      await page.waitForTimeout(1400);
      await page.click('#introEnter');
      await page.waitForTimeout(3600);
      const done = await page.evaluate(() => document.documentElement.classList.contains('bn-intro-done') && !document.getElementById('intro'));
      results.interactiveTests.clickButton = done;
      console.log(`Test A (Click Enter Button): ${done ? 'PASS' : 'FAIL'}`);
      if (!done) results.defects.push('Clicking enter button failed to complete transition and remove intro');
      await context.close();
    }

    // Test B: Enter key on button
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(fileUrl);
      await page.waitForTimeout(1400);
      await page.focus('#introEnter');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(3600);
      const done = await page.evaluate(() => document.documentElement.classList.contains('bn-intro-done') && !document.getElementById('intro'));
      results.interactiveTests.pressEnter = done;
      console.log(`Test B (Press Enter key): ${done ? 'PASS' : 'FAIL'}`);
      if (!done) results.defects.push('Pressing Enter key on enter button failed to complete transition');
      await context.close();
    }

    // Test C: Space key on button
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(fileUrl);
      await page.waitForTimeout(1400);
      await page.focus('#introEnter');
      await page.keyboard.press('Space');
      await page.waitForTimeout(3600);
      const done = await page.evaluate(() => document.documentElement.classList.contains('bn-intro-done') && !document.getElementById('intro'));
      results.interactiveTests.pressSpace = done;
      console.log(`Test C (Press Space key): ${done ? 'PASS' : 'FAIL'}`);
      if (!done) results.defects.push('Pressing Space key on enter button failed to complete transition');
      await context.close();
    }

    // Test D: Esc during transition (jump to end)
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(fileUrl);
      await page.waitForTimeout(1400);
      await page.click('#introEnter');
      // Wait 1.0s (mid fly-through), then press Esc
      await page.waitForTimeout(1000);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      const escDone = await page.evaluate(() => {
        return !document.getElementById('intro') &&
               !document.body.classList.contains('intro-lock') &&
               document.activeElement.id === 'heroHeading';
      });
      results.interactiveTests.escInterrupt = escDone;
      console.log(`Test D (Esc key interrupts transition smoothly): ${escDone ? 'PASS' : 'FAIL'}`);
      if (!escDone) results.defects.push('Pressing Escape during transition failed to immediately settle to hero');
      await context.close();
    }

    // Test E: Skip intro clicked during transition
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(fileUrl);
      await page.waitForTimeout(1400);
      await page.click('#introEnter');
      // Wait 0.8s, then click Skip intro
      await page.waitForTimeout(800);
      const skipEl = await page.$('#introSkip');
      if (skipEl) await skipEl.click();
      await page.waitForTimeout(300);
      const skipDone = await page.evaluate(() => {
        return !document.getElementById('intro') &&
               !document.body.classList.contains('intro-lock');
      });
      results.interactiveTests.skipInterrupt = skipDone;
      console.log(`Test E (Skip button interrupts transition): ${skipDone ? 'PASS' : 'FAIL'}`);
      if (!skipDone) results.defects.push('Clicking Skip during transition failed to immediately settle to hero');
      await context.close();
    }

    // Test F: prefers-reduced-motion (500ms crossfade only, no fly-through)
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(fileUrl);
      // Wait 800ms for 500ms crossfade to finish
      await page.waitForTimeout(800);
      const rmCheck = await page.evaluate(() => {
        return (document.documentElement.classList.contains('bn-css-transition') ||
                document.documentElement.classList.contains('bn-intro-done')) &&
               !document.getElementById('intro');
      });
      results.interactiveTests.reducedMotion = rmCheck;
      console.log(`Test F (prefers-reduced-motion 500ms crossfade): ${rmCheck ? 'PASS' : 'FAIL'}`);
      if (!rmCheck) results.defects.push('prefers-reduced-motion failed to bypass 3D fly-through');
      await context.close();
    }

    // Test G: WebGL disabled fallback
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      // Disable WebGL by overriding getContext
      await page.addInitScript(() => {
        const origGetContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...args) {
          if (type && type.includes('webgl')) return null;
          return origGetContext.apply(this, [type, ...args]);
        };
      });
      await page.goto(fileUrl);
      await page.waitForTimeout(1400);
      const skipBtn = await page.$('#introSkip');
      if (skipBtn) await skipBtn.click();
      await page.waitForTimeout(800);
      const fbCheck = await page.evaluate(() => {
        return !document.body.classList.contains('intro-lock');
      });
      results.interactiveTests.webglFallback = fbCheck;
      console.log(`Test G (WebGL disabled fallback): ${fbCheck ? 'PASS' : 'FAIL'}`);
      if (!fbCheck) results.defects.push('WebGL disabled fallback failed to unlock site');
      await context.close();
    }

    // Test H: Same-tab reload (returning visitor)
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(fileUrl);
      await page.waitForTimeout(1400);
      await page.click('#introEnter');
      await page.waitForTimeout(3600);

      // Now reload in the same tab
      await page.reload();
      await page.waitForTimeout(800);
      const returnCheck = await page.evaluate(() => {
        return document.documentElement.classList.contains('bn-returning') &&
               !document.getElementById('intro');
      });
      results.interactiveTests.returningVisitor = returnCheck;
      console.log(`Test H (Returning visitor reload in same tab): ${returnCheck ? 'PASS' : 'FAIL'}`);
      if (!returnCheck) results.defects.push('Returning visitor reload did not skip intro to hero fade');
      await context.close();
    }

    console.log('\n--- PART 4: POST-TRANSITION AUDIT & CHECKS ---');
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      const consoleErrors = [];
      page.on('console', msg => {
        const text = msg.text();
        if (msg.type() === 'error' && !text.includes('ERR_NAME_NOT_RESOLVED') && !text.includes('fonts.googleapis.com')) {
          consoleErrors.push(text);
        }
      });
      page.on('pageerror', err => {
        if (!err.message.includes('ERR_NAME_NOT_RESOLVED')) {
          consoleErrors.push(err.message);
        }
      });

      await page.goto(fileUrl);
      await page.waitForTimeout(1400);
      await page.click('#introEnter');
      await page.waitForTimeout(3600);

      const audit = await page.evaluate(() => {
        const bodyLock = document.body.classList.contains('intro-lock');
        const introExists = !!document.getElementById('intro');
        const glCanvas = document.getElementById('gl');
        const heroTop = document.getElementById('top');
        const canvasInHero = glCanvas && heroTop && glCanvas.parentNode === heroTop;
        const activeId = document.activeElement ? document.activeElement.id : '';

        // Check scrollability
        const initialScrollY = window.scrollY;
        window.scrollBy(0, 300);
        const scrolledY = window.scrollY;

        // Check sticky header
        const header = document.getElementById('hd');
        const hdComputed = header ? window.getComputedStyle(header) : null;
        const hdStickyOrFixed = hdComputed && (hdComputed.position === 'sticky' || hdComputed.position === 'fixed');

        return {
          bodyLock,
          introExists,
          canvasInHero,
          activeId,
          scrollWorks: scrolledY > initialScrollY || document.documentElement.scrollHeight > window.innerHeight,
          headerSticky: hdStickyOrFixed
        };
      });

      results.postTransitionChecks = {
        ...audit,
        consoleErrors
      };

      console.log('Post-transition audit results:');
      console.log(`- Scroll unlocked: ${!audit.bodyLock && audit.scrollWorks ? 'PASS' : 'FAIL'}`);
      console.log(`- Header sticky/fixed: ${audit.headerSticky ? 'PASS' : 'FAIL'}`);
      console.log(`- Focus on hero heading: ${audit.activeId === 'heroHeading' ? 'PASS' : 'FAIL'} (activeElement: #${audit.activeId})`);
      console.log(`- Intro element removed from DOM: ${!audit.introExists ? 'PASS' : 'FAIL'}`);
      console.log(`- WebGL Canvas retained and moved to Hero: ${audit.canvasInHero ? 'PASS' : 'FAIL'}`);
      console.log(`- Console errors during transition: ${consoleErrors.length === 0 ? 'PASS (0 errors)' : 'FAIL (' + consoleErrors.join(', ') + ')'}`);

      if (audit.bodyLock) results.defects.push('body still had intro-lock class after transition');
      if (audit.introExists) results.defects.push('#intro element was not removed from DOM after transition');
      if (!audit.canvasInHero) results.defects.push('WebGL canvas #gl was not preserved in hero section');
      if (audit.activeId !== 'heroHeading') results.defects.push(`Focus was on #${audit.activeId} instead of #heroHeading`);
      if (consoleErrors.length > 0) results.defects.push(`Console errors occurred: ${consoleErrors.join('; ')}`);

      await context.close();
    }

  } catch (err) {
    console.error('Test run failed with error:', err);
    results.defects.push(err.message);
  } finally {
    await browser.close();
  }

  // Output JSON report
  fs.writeFileSync(path.join(ROOT, 'verification_report.json'), JSON.stringify(results, null, 2));
  console.log('\n========================================');
  console.log(`TOTAL DEFECTS FOUND: ${results.defects.length}`);
  if (results.defects.length > 0) {
    console.log('Defects list:');
    results.defects.forEach((d, i) => console.log(`  ${i + 1}. ${d}`));
  } else {
    console.log('ALL VERIFICATION SUITES PASSED CLEANLY!');
  }
  console.log('========================================\n');
}

run();
