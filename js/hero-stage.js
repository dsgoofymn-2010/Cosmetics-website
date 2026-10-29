/* Live hero stage. Shows the poster first, swaps to the WebGL scene once every
   model is ready, and falls back to the poster for no WebGL, reduced motion or
   any error. The chips are real links in the HTML, so the WhatsApp enquiry
   works by keyboard and without this script. */
import * as THREE from 'three';
import { createRenderer, buildStage, computeFit, applyFit, PODIUM } from './stage-scene.js';

const html = document.documentElement;
const hero = document.getElementById('top');
const stageEl = document.getElementById('heroStage');
const regionEl = document.getElementById('heroStageRegion');
const canvas = document.getElementById('heroCanvas');
const posterEl = document.getElementById('heroPoster');
const chips = Array.from(document.querySelectorAll('.stage-chip'));
const chipById = Object.fromEntries(chips.map((c) => [c.dataset.product, c]));

if (posterEl) {
  const done = () => stageEl && stageEl.classList.add('poster-in');
  if (posterEl.complete && posterEl.naturalWidth) done(); else posterEl.addEventListener('load', done, { once: true });
}

const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const COARSE = matchMedia('(pointer: coarse)').matches;
const narrow = () => innerWidth < 768;
const LOW = COARSE || narrow() || (navigator.deviceMemory && navigator.deviceMemory <= 4);
const DPR_CAP = LOW ? 1.5 : 1.75;

/* ---------- static mode: poster plus chips placed from the poster's own anchors ---------- */
let anchors = null, boxes = [];
async function loadAnchors() {
  try {
    const r = await fetch('images/hero-poster.json');
    const j = await r.json();
    anchors = j.anchors;
    boxes = j.boxes || [];
    posterAspect = j.width / j.height;
  } catch { anchors = null; }
}

let posterAspect = 1;
/* the poster's drawn rect inside the stage, same maths as object-fit: contain */
function posterRect() {
  const sr = stageEl.getBoundingClientRect();
  const rr = regionEl.getBoundingClientRect();
  const k = Math.min(rr.width / posterAspect, rr.height);
  const w = k * posterAspect, h = k;
  return { left: rr.left - sr.left + (rr.width - w) / 2, top: rr.top - sr.top + (rr.height - h) / 2, w, h, sr };
}
function placeChipsFromPoster() {
  if (!anchors) return;
  const { left, top, w, h } = posterRect();
  for (const c of chips) {
    const a = anchors[c.dataset.product];
    if (!a) continue;
    c.style.transform = `translate(${(left + a[0] * w).toFixed(1)}px, ${(top + a[1] * h).toFixed(1)}px) translate(-50%, -100%)`;
  }
}

function staticMode() {
  stageEl.classList.add('is-static');
  loadAnchors().then(placeChipsFromPoster);
  addEventListener('resize', placeChipsFromPoster, { passive: true });
  /* hover or tap a product on the poster to reveal its chip, as in the live scene */
  const hitAt = (e) => {
    const r = posterRect();
    const u = (e.clientX - r.sr.left - r.left) / r.w, v = (e.clientY - r.sr.top - r.top) / r.h;
    const hit = boxes.find((b) => u >= b[1] && u <= b[3] && v >= b[2] && v <= b[4]);
    return hit ? hit[0] : null;
  };
  const show = (id) => chips.forEach((c) => c.classList.toggle('on', c.dataset.product === id || c === document.activeElement));
  regionEl.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') show(hitAt(e)); }, { passive: true });
  regionEl.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') show(null); }, { passive: true });
  regionEl.addEventListener('click', (e) => {
    const id = hitAt(e);
    if (!id) return show(null);
    if (matchMedia('(pointer: fine)').matches && chipById[id]) chipById[id].click(); else show(id);
  });
  chips.forEach((c) => {
    c.addEventListener('focus', () => c.classList.add('on'));
    c.addEventListener('blur', () => c.classList.remove('on'));
  });
}

function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch { return false; }
}

if (!stageEl || !canvas) {
  /* markup missing: nothing to do */
} else if (RM || !webglOK()) {
  staticMode();
} else {
  start().catch((err) => {
    if (location.search.indexOf('debug=1') !== -1) console.error(err);
    stageEl.classList.remove('is-live');
    staticMode();
  });
}

async function start() {
  const tier = LOW ? 'low' : 'high';
  const renderer = createRenderer(canvas, { tier });
  const stage = await buildStage(renderer, { tier, base: './' });
  const { scene, world, items } = stage;
  /* products are cut at the podium surface, so while they wait to rise they
     are hidden inside the podium instead of hanging below it */
  renderer.localClippingEnabled = true;
  const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), -PODIUM.height);
  items.forEach((it) => it.model.traverse((o) => { if (o.isMesh) o.material.clippingPlanes = [floor]; }));
  let fit = null;
  const anchor = new THREE.Vector3();
  const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
  let visible = true, raf = 0, last = performance.now(), dirty = true;
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  const view = { w: 1, h: 1 }, region = { x: 0, y: 0, w: 1, h: 1 };

  function measure() {
    const sr = stageEl.getBoundingClientRect();
    const rr = regionEl.getBoundingClientRect();
    view.w = Math.max(1, Math.round(sr.width));
    view.h = Math.max(1, Math.round(sr.height));
    region.x = rr.left - sr.left; region.y = rr.top - sr.top;
    region.w = Math.max(1, rr.width); region.h = Math.max(1, rr.height);
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, DPR_CAP));
    renderer.setSize(view.w, view.h, false);
    fit = computeFit(camera, stage, view, region);
  }
  measure();
  const ro = new ResizeObserver(() => { measure(); dirty = true; });
  ro.observe(stageEl);
  ro.observe(regionEl);

  /* ---------- interaction state ---------- */
  const S = {
    px: 0, py: 0, yaw: 0, pitch: 0,             /* camera parallax, radians */
    drag: null, dragYaw: 0, dragTarget: 0,      /* arrangement rotation */
    scroll: 0, hover: null, focus: null
  };
  const LIM = THREE.MathUtils.degToRad(35);
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pickables = [];
  items.forEach((it) => it.model.traverse((o) => { if (o.isMesh) pickables.push(o); }));

  function pick(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pickables, false)[0];
    return hit ? hit.object.userData.productId : null;
  }

  function setHover(id) {
    if (S.hover === id) return;
    S.hover = id;
    canvas.style.cursor = id ? 'pointer' : (COARSE ? '' : 'grab');
    chips.forEach((c) => c.classList.toggle('on', c.dataset.product === id));
  }

  if (!COARSE) {
    canvas.style.cursor = 'grab';
    hero.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = hero.getBoundingClientRect();
      S.px = ((e.clientX - r.left) / r.width) * 2 - 1;
      S.py = ((e.clientY - r.top) / r.height) * 2 - 1;
    }, { passive: true });
    hero.addEventListener('pointerleave', () => { S.px = 0; S.py = 0; }, { passive: true });
  }

  canvas.addEventListener('pointerdown', (e) => {
    S.drag = { x: e.clientX, y: e.clientY, base: S.dragTarget, moved: false, type: e.pointerType };
    if (e.pointerType === 'mouse') { e.preventDefault(); canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; } /* no text selection while dragging */
  });
  canvas.addEventListener('pointermove', (e) => {
    if (S.drag && S.drag.type === 'mouse') {
      const dx = e.clientX - S.drag.x;
      if (Math.abs(dx) > 4) S.drag.moved = true;
      S.dragTarget = THREE.MathUtils.clamp(S.drag.base + dx * 0.006, -LIM, LIM);
      return;
    }
    if (e.pointerType === 'mouse') setHover(pick(e.clientX, e.clientY));
  }, { passive: true });
  const endDrag = (e) => {
    const d = S.drag;
    S.drag = null;
    if (!d) return;
    if (d.type === 'mouse') canvas.style.cursor = S.hover ? 'pointer' : 'grab';
    const still = Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8;
    if (!still || d.moved) return;
    const id = pick(e.clientX, e.clientY);
    if (d.type === 'mouse') {
      if (id && chipById[id]) chipById[id].click();
    } else {
      /* touch: first tap lifts the product and shows its chip; the chip opens WhatsApp */
      setHover(id && S.hover !== id ? id : null);
    }
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', () => { S.drag = null; });
  canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !S.drag) setHover(null); });
  chips.forEach((c) => {
    c.addEventListener('focus', () => { S.focus = c.dataset.product; c.classList.add('on'); });
    c.addEventListener('blur', () => { S.focus = null; if (S.hover !== c.dataset.product) c.classList.remove('on'); });
    c.addEventListener('pointerenter', () => setHover(c.dataset.product));
  });

  /* ---------- scroll story: orbit, separate, lift; never pins ---------- */
  if (window.gsap && window.ScrollTrigger) {
    window.ScrollTrigger.create({
      trigger: hero, start: 'top top', end: () => '+=' + Math.round(hero.offsetHeight * 1.2),
      scrub: 0.8, onUpdate: (self) => { S.scroll = self.progress; }
    });
  } else {
    addEventListener('scroll', () => {
      S.scroll = THREE.MathUtils.clamp(scrollY / (hero.offsetHeight * 1.2), 0, 1);
    }, { passive: true });
  }

  /* ---------- reveal: rise from the podium if the hero is still covered, else crossfade ---------- */
  const revealed = () => !document.getElementById('intro') && !html.classList.contains('bn-transition-active');
  const riseFrom = (it) => -(it.height + 0.08);
  let rising = false;
  if (!revealed()) {
    rising = true;
    items.forEach((it) => { it.lift.position.y = riseFrom(it); it.shadow.material.opacity = 0; });
  }
  stageEl.classList.add('is-live');
  render(performance.now());
  requestAnimationFrame(() => stageEl.classList.add('is-ready'));

  if (rising) {
    const go = () => {
      items.forEach((it, i) => {
        const delay = 0.15 + i * 0.11;
        if (window.gsap) {
          window.gsap.to(it.lift.position, { y: 0, duration: 1.25, delay, ease: 'power3.out' });
          window.gsap.to(it.shadow.material, { opacity: 0.62, duration: 1.1, delay: delay + 0.2, ease: 'power2.out' });
        } else { it.lift.position.y = 0; it.shadow.material.opacity = 0.62; }
      });
      window.setTimeout(() => { rising = false; }, 2600);
    };
    const mo = new MutationObserver(() => { if (revealed()) { mo.disconnect(); go(); } });
    mo.observe(html, { attributes: true, attributeFilter: ['class'] });
    mo.observe(document.body, { childList: true });
  }

  /* ---------- render loop, only while the hero is on screen and the tab is visible ---------- */
  new IntersectionObserver((en) => { visible = en[0].isIntersecting; kick(); }, { threshold: 0 }).observe(hero);
  document.addEventListener('visibilitychange', kick);
  function kick() { if (!raf && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(loop); } }


  function render(now) {
    const t = now / 1000;
    /* rAF timestamps can trail performance.now(); a negative step would make the damping blow up */
    const dt = THREE.MathUtils.clamp((now - last) / 1000, 0, 0.05);
    last = Math.max(last, now);
    const s = S.scroll;

    /* camera: pointer parallax on desktop, scripted drift on touch, slow orbit on scroll */
    /* small enough to stay inside the 8% padding */
    const driftYaw = COARSE ? Math.sin(t * 0.21) * THREE.MathUtils.degToRad(1.5) : 0;
    const driftPitch = COARSE ? Math.sin(t * 0.13 + 1) * THREE.MathUtils.degToRad(0.6) : 0;
    S.yaw = damp(S.yaw, -S.px * THREE.MathUtils.degToRad(4) + driftYaw - s * THREE.MathUtils.degToRad(4), 3, dt); /* orbit away from the text column */
    S.pitch = damp(S.pitch, S.py * THREE.MathUtils.degToRad(2.5) + driftPitch + s * THREE.MathUtils.degToRad(4), 3, dt);
    applyFit(camera, stage, view, fit, { yaw: S.yaw, pitch: S.pitch });

    S.dragYaw = damp(S.dragYaw, S.dragTarget, 6, dt);
    world.rotation.y = S.dragYaw;
    world.position.y = s * 0.14;
    floor.constant = -(world.position.y + PODIUM.height - 0.002);

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const active = (S.hover && (it.chipOf || it.id) === S.hover) || (S.focus && (it.chipOf || it.id) === S.focus);
      const spread = 1 + s * 0.05;
      it.holder.position.x = it.home.x * spread;
      it.holder.position.z = it.home.z * spread;
      if (!rising) {
        const period = 6 + (i * 0.53) % 3;                       /* 6 to 9 s */
        const float = Math.sin((t / period) * Math.PI * 2 + i * 1.7) * 0.012;
        it.lift.position.y = damp(it.lift.position.y, float + (active ? 0.07 : 0), 7, dt);
      }
      if (it.lead) it.lift.rotation.y += dt * (Math.PI * 2 / 70); /* one turn in 70 s */
      else it.lift.rotation.y = damp(it.lift.rotation.y, active ? 0.25 : 0, 5, dt);
    }

    renderer.render(scene, camera);

    /* chips follow the top of their product */
    const sr = canvas.getBoundingClientRect();
    for (const it of items) {
      if (it.chipOf) continue;
      const c = chipById[it.id];
      if (!c) continue;
      it.lift.getWorldPosition(anchor);
      anchor.y += it.height + 0.1;
      anchor.project(camera);
      const x = (anchor.x * 0.5 + 0.5) * sr.width, y = (-anchor.y * 0.5 + 0.5) * sr.height;
      c.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
    }
    dirty = false;
  }

  function loop(now) {
    raf = 0;
    if (!visible || document.hidden) return;
    render(now);
    raf = requestAnimationFrame(loop);
  }
  kick();

  /* QA hook: projected product boxes in canvas pixels */
  window.bnStage = {
    boxes() {
      const out = {};
      const r = canvas.getBoundingClientRect();
      for (const it of items) {
        const b = new THREE.Box3().setFromObject(it.model);
        const pts = [];
        for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) pts.push(new THREE.Vector3(x, y, z).project(camera));
        const xs = pts.map((p) => (p.x * 0.5 + 0.5) * r.width), ys = pts.map((p) => (-p.y * 0.5 + 0.5) * r.height);
        out[it.id] = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
      }
      return { canvas: { w: r.width, h: r.height }, region: { ...region }, boxes: out };
    },
    tier, renderer, state: S, items
  };
}
