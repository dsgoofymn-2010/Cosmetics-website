/* ================= INTRO MODULE - brand-name cinematic, about 3.4 s =========
   Plays once per tab. Skip button + Esc work from t=0. If WebGL or a library
   fails, a CSS-only version shows the same arch with the name. A watchdog
   makes it impossible for the intro to ever trap the page.
   EDIT: the tagline copy lives in the intro markup above this script. */
(function () {
  'use strict';

  /* ---- 1) WATCHDOG FIRST: nothing else runs until this is set up ---- */
  window.setTimeout(function () {
    if (!document.getElementById('intro')) { return; }
    var h = document.documentElement;
    h.classList.add('bn-no-intro');
    document.body.classList.remove('intro-lock');
    h.style.overflowY = '';
    var seen = document.querySelectorAll('.rv,.rv-hold,.curtain,.rv-now');
    for (var i = 0; i < seen.length; i++) { seen[i].classList.add('in'); }
    var o = document.getElementById('intro');
    if (o && o.parentNode) { o.parentNode.removeChild(o); }
  }, 9000);

  var html = document.documentElement;
  var RM = false;
  try { RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  var SESS_KEY = 'bn-intro-played';
  var played = false;
  try { played = sessionStorage.getItem(SESS_KEY) === '1'; } catch (e) {}

  var overlay = document.getElementById('intro');
  var skipBtn = document.getElementById('introSkip');
  var numEl = document.getElementById('introNum');
  var lineEl = overlay ? overlay.querySelector('.intro-line') : null;
  var mainEl = document.getElementById('main');

  if (RM || !window.requestAnimationFrame || !overlay) {
    html.classList.add('bn-no-intro');
    if (overlay && overlay.parentNode) { overlay.parentNode.removeChild(overlay); }
    return;
  }

  var lockStyle = document.createElement('style');
  lockStyle.textContent = 'body.intro-lock{overflow:hidden}';
  document.head.appendChild(lockStyle);
  function lock(on) { document.body.classList.toggle('intro-lock', on); }

  var done = false;
  function finish(fast) {
    if (done) { return; }
    done = true;
    lock(false);
    try { sessionStorage.setItem(SESS_KEY, '1'); } catch (e) {}
    html.classList.add('bn-intro-done');
    try { window.scrollTo(0, 0); } catch (e) {}
    if (overlay) {
      overlay.classList.add('out');
      overlay.setAttribute('aria-hidden', 'true');
      window.setTimeout(function () {
        if (overlay.parentNode) { overlay.parentNode.removeChild(overlay); }
        if (mainEl) {
          mainEl.setAttribute('tabindex', '-1');
          try { mainEl.focus({ preventScroll: true }); } catch (e) { mainEl.focus(); }
        }
      }, fast ? 240 : 520);
    }
  }

  function onSkip(e) {
    if (e && e.type === 'keydown' && e.key !== 'Escape') { return; }
    teardown();
    finish(true);
  }
  if (skipBtn) {
    skipBtn.addEventListener('click', onSkip);
    window.addEventListener('keydown', onSkip);
    try { skipBtn.focus({ preventScroll: true }); } catch (e) { skipBtn.focus(); }
  }

  /* seen this tab already: no cinematic, just a quick fade */
  if (played) {
    html.classList.add('bn-no-intro');
    overlay.classList.add('out');
    window.setTimeout(function () { if (overlay.parentNode) { overlay.parentNode.removeChild(overlay); } }, 300);
    return;
  }

  /* ---- live progress number (libs above are blocking, so they are real) ---- */
  var shown = 0, target = 0;
  var bar = document.createElement('b');
  if (lineEl) { lineEl.appendChild(bar); }
  function setTarget(t) { target = t; }
  function tickNum() {
    shown += (target - shown) * 0.18;
    var s = Math.round(Math.min(100, shown));
    if (numEl) { numEl.textContent = s; }
    if (bar) { bar.style.width = s + '%'; }
    if (Math.abs(target - shown) > 0.5 || target < 100) { window.requestAnimationFrame(tickNum); }
  }
  setTarget(24); tickNum();

  /* split the tagline into letters so it can rise once the name has landed */
  var wordEl = overlay.querySelector('.intro-word');
  if (wordEl) {
    var wtxt = wordEl.textContent;
    wordEl.setAttribute('aria-label', wtxt.replace(/\s+/g, ' ').trim());
    wordEl.innerHTML = '';
    for (var wi = 0; wi < wtxt.length; wi++) {
      var ch = wtxt.charAt(wi);
      var sp = document.createElement('span');
      if (ch === ' ' || ch === '\u00A0') { sp.innerHTML = '&nbsp;'; } else { sp.textContent = ch; }
      sp.setAttribute('aria-hidden', 'true');
      sp.style.setProperty('--i', String(wi));
      wordEl.appendChild(sp);
    }
  }

  if (window.gsap) { setTarget(42); } else { setTarget(30); }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { setTarget(56); });
  }
  window.setTimeout(function () { setTarget(70); }, 500);

  overlay.classList.add('live');
  lock(true);
  html.classList.remove('bn-no-intro');

  function cssFallback() {
    html.classList.add('bn-fallback');
    setTarget(100);
    window.setTimeout(function () { finish(false); }, 3000);
  }

  var hasThree = !!window.THREE;
  var supportsWebGL = hasThree && (function () {
    try {
      var c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  })();

  if (!supportsWebGL) { cssFallback(); return; }

  /* ---------- WebGL scene: red arch + the brand name in 3D ---------- */
  var THREE_ = window.THREE;
  var canvas = document.getElementById('gl');
  var renderer = null, scene = null, camera = null;
  var arch = null, arcTop = null, legL = null, legR = null, nameMesh = null, particles = null;
  var disposed = false, frame = 0, failed = false;

  function buildNameTexture() {
    /* the name is drawn on an offscreen canvas that lives inside the 3D scene,
       so it floats in the same space as the arch and the dust */
    var c = document.createElement('canvas');
    c.width = 2048; c.height = 512;
    var g = c.getContext('2d');
    g.clearRect(0, 0, 2048, 512);
    var serif = '"Cormorant Garamond", Georgia, serif';
    g.textBaseline = 'middle';
    function spaced(text, font, x, y, gap) {
      g.font = font;
      var w = 0;
      for (var i = 0; i < text.length; i++) { w += g.measureText(text.charAt(i)).width; }
      var extra = gap * (text.length - 1);
      var px = x - (w + extra) / 2;
      for (var j = 0; j < text.length; j++) {
        var chx = text.charAt(j);
        g.fillText(chx, px, y);
        px += g.measureText(chx).width + gap;
      }
    }
    g.shadowColor = 'rgba(235,201,182,.4)';
    g.shadowBlur = 28;
    g.fillStyle = '#FBF6F0';
    spaced('BEAUTE&NUTRIE', '600 218px ' + serif, 1024, 205, -8);
    g.shadowBlur = 0;
    g.fillStyle = '#EBC9B6';
    spaced('COSMETICS BOUTIQUE', '400 52px "DM Sans", "Segoe UI", sans-serif', 1024, 405, 10);
    var tx = new THREE_.CanvasTexture(c);
    tx.encoding = THREE_.sRGBEncoding;
    tx.anisotropy = 4;
    return tx;
  }

  function initGL() {
    renderer = new THREE_.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE_.sRGBEncoding;
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    scene = new THREE_.Scene();
    camera = new THREE_.PerspectiveCamera(38, window.innerWidth / Math.max(1, window.innerHeight), 0.1, 60);
    camera.position.set(0, 0.1, 7);

    scene.add(new THREE_.AmbientLight(0xFFE9D9, 0.5));
    var key = new THREE_.DirectionalLight(0xFFEEDD, 1.1); key.position.set(2.4, 3.4, 4.5); scene.add(key);
    var rim = new THREE_.PointLight(0xB3262E, 0.9, 30); rim.position.set(-3.4, 1.2, 2.2); scene.add(rim);
    var fill = new THREE_.PointLight(0xEBC9B6, 0.4, 24); fill.position.set(0.4, -1.8, 3.2); scene.add(fill);

    /* the shop's own door, drawn stroke by stroke */
    arch = new THREE_.Group();
    var redArcMat = new THREE_.MeshStandardMaterial({ color: 0xB3262E, emissive: 0x521016, emissiveIntensity: 0.5, roughness: 0.4, metalness: 0.3 });
    var arcGeo = new THREE_.TorusGeometry(1.62, 0.05, 10, 64, Math.PI);
    arcTop = new THREE_.Mesh(arcGeo, redArcMat); arcTop.position.y = 0.62; arch.add(arcTop);
    var legGeo = new THREE_.CylinderGeometry(0.05, 0.05, 1.5, 10);
    legL = new THREE_.Mesh(legGeo, redArcMat); legL.position.set(-1.62, -0.13, 0);
    legR = new THREE_.Mesh(legGeo, redArcMat); legR.position.set(1.62, -0.13, 0);
    arch.add(legL); arch.add(legR);
    arch.position.z = -1.15;
    scene.add(arch);

    /* the name in 3D: drawn immediately with the serif fallback, then
       re-drawn with the site type once fonts are ready */
    nameMesh = new THREE_.Mesh(new THREE_.PlaneGeometry(5.6, 1.4), new THREE_.MeshBasicMaterial({ transparent: true, opacity: 0 }));
    nameMesh.position.set(0, 0.06, 0.4);
    nameMesh.rotation.x = -0.03;
    scene.add(nameMesh);
    function putName() {
      if (disposed || !nameMesh) { return; }
      nameMesh.material.map = buildNameTexture();
      nameMesh.material.needsUpdate = true;
      nameMesh.material.opacity = 1;
    }
    putName();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { window.setTimeout(putName, 60); });
    }

    /* golden dust with round sprites */
    var pGeo = new THREE_.BufferGeometry();
    var N = 240, arr = new Float32Array(N * 3);
    for (var p = 0; p < N; p++) {
      arr[p * 3] = (Math.random() - 0.5) * 9;
      arr[p * 3 + 1] = (Math.random() - 0.4) * 5.4;
      arr[p * 3 + 2] = (Math.random() - 0.5) * 5;
    }
    pGeo.setAttribute('position', new THREE_.BufferAttribute(arr, 3));
    var dotC = document.createElement('canvas'); dotC.width = dotC.height = 32;
    var dctx = dotC.getContext('2d');
    var dg = dctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    dg.addColorStop(0, 'rgba(251,246,240,1)');
    dg.addColorStop(0.45, 'rgba(251,246,240,.55)');
    dg.addColorStop(1, 'rgba(251,246,240,0)');
    dctx.fillStyle = dg; dctx.fillRect(0, 0, 32, 32);
    particles = new THREE_.Points(pGeo, new THREE_.PointsMaterial({
      color: 0xEBC9B6, size: 0.13, map: new THREE_.CanvasTexture(dotC),
      transparent: true, opacity: 0, depthWrite: false, blending: THREE_.AdditiveBlending
    }));
    scene.add(particles);

    window.addEventListener('resize', onResize, { passive: true });
    onResize();

    setTarget(92);
    window.setTimeout(function () { setTarget(100); }, 700);
  }

  function onResize() {
    if (!renderer || disposed) { return; }
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
    camera.updateProjectionMatrix();
  }

  function teardown() {
    if (disposed) { return; }
    disposed = true;
    window.removeEventListener('resize', onResize);
    window.cancelAnimationFrame(frame);
    if (renderer) { renderer.dispose(); renderer = null; }
  }

  var T = { a: 950, b: 1450, c: 1000 };
  var t0 = 0, running = false;
  function easeOutCubic(x) { x = x < 0 ? 0 : x > 1 ? 1 : x; return 1 - Math.pow(1 - x, 3); }
  function easeInOut(x) { x = x < 0 ? 0 : x > 1 ? 1 : x; return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function lerp(a, b, k) { return a + (b - a) * k; }

  function phaseFrame(now) {
    if (disposed) { return; }
    if (!running) { running = true; t0 = now; }
    var t = now - t0;

    /* A: the arch draws, the name lands */
    var kA = Math.min(1, t / T.a);
    var idx = Math.floor(arcTop.geometry.index.count * easeOutCubic(kA));
    arcTop.geometry.setDrawRange(0, Math.max(2, idx - (idx % 2)));
    legL.visible = legR.visible = easeOutCubic(kA) > 0.92;
    nameMesh.scale.setScalar(lerp(0.88, 1, easeOutCubic(kA)));
    if (nameMesh.material.opacity < 1) { nameMesh.material.opacity = Math.min(1, kA * 1.2); }

    /* B: hold and breathe, the tagline letters rise */
    if (t > 900 && wordEl && !wordEl.classList.contains('rise')) { wordEl.classList.add('rise'); }

    /* C: the door opens, the camera passes through, the name glides by */
    var kC = t < T.a + T.b ? 0 : Math.min(1, (t - T.a - T.b) / T.c);
    if (kC > 0) {
      var ec = easeInOut(kC);
      camera.position.z = lerp(7, -0.8, ec);
      arch.rotation.y = ec * 0.5;
      legL.position.z = ec * -1.15; legR.position.z = ec * 1.15;
      nameMesh.position.z = lerp(0.4, 2.6, ec);
      nameMesh.material.opacity = 1 - ec * 0.9;
    }
    if (particles) {
      particles.material.opacity = 0.5 * easeOutCubic(kA) * (1 - kC * 0.8);
      particles.rotation.y += 0.0008;
    }
    renderer.render(scene, camera);
    if (kC >= 1) { teardown(); finish(false); return; }
    frame = window.requestAnimationFrame(phaseFrameSafe);
  }

  function phaseFrameSafe(now) {
    try { phaseFrame(now); } catch (err) {
      if (!failed) { failed = true; teardown(); cssFallback(); }
    }
  }

  try { initGL(); } catch (err) {
    failed = true;
    teardown();
    cssFallback();
    return;
  }
  window.setTimeout(function () {
    if (!disposed) { frame = window.requestAnimationFrame(phaseFrameSafe); }
  }, 50);
})();

