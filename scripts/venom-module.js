
/* ================= VENOM GOO — OriginKit "Venom Button", ported to vanilla =
   Real source: originkit `add venom-button` → components/originkit/ui/venom-button.tsx.
   This is a dependency-free port of that component, same behaviour:
   idle → seek → grow → hold → snap state machine, verlet strand ropes,
   one distance-field shader drawing pill + strands + spikes + droplets as a
   single smooth union shaded like black lacquer (fresnel environment, two
   glints), a glove cursor painted in 2D, a ghost hand demonstrating on its
   own, dirty-rect drawing with adaptive resolution, and a glossy gradient
   pill as the same fallback the original uses when WebGL is unavailable.
   EDIT: brand colours in VEN, feel in ADV, timings stay stock. */
(function () {
  'use strict';

  var stage = document.getElementById('venomStage');
  var btn = document.getElementById('introEnter');
  var cv = document.getElementById('venomGoo');
  var hc = document.getElementById('venomHand');
  if (!stage || !btn || !cv || !hc) { return; }
  var hx = hc.getContext('2d');
  if (!hx) { return; }

  var reduced = false;
  try { reduced = !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  if (reduced) { return; } /* the intro module takes the overlay apart for RM anyway */

  /* EDIT: brand config. gooColor is the lacquer body; shine (in ADV) paints
     its caustic highlights — blush reads as a wet rim on the wine-black goo. */
  var VEN = { gooColor: '#160608', strands: 7, reach: 140, cursor: 'glove', autoplay: true };
  /* EDIT: the component's `advanced` deck, stock values. */
  var ADV = {
    hover: 50, grain: 0, vignette: 0, sense: 290, release: 215, shine: '#EBC9B6',
    rim: 100, glint: 100, shadow: 20, gloveScale: 155, pressScale: 96,
    strandWidth: 100, pulse: 24, stretchThin: 50, gravity: 260, damping: 92,
    snapDamping: 86, sway: 14, dart: 28, lungeMs: 300, coil: 13, coilAngle: 468,
    mound: 100, recoil: 90, spikes: 100, drops: 0, skinInMs: 2000, skinOutMs: 700,
    lingerMs: 1700, fingerLift: 52, ghostDelayMs: 2500, hairs: true, webs: true
  };

  function num(v, fb, lo, hi) {
    var n = typeof v === 'number' && isFinite(v) ? v : fb;
    return Math.max(lo, Math.min(hi, n));
  }
  function parseRgb(raw) {
    if (typeof raw !== 'string') { return null; }
    var s = raw.trim();
    var hex = /^#([0-9a-fA-F]{3,8})$/.exec(s);
    if (hex) {
      var h = hex[1];
      if (h.length === 3 || h.length === 4) { h = h.slice(0, 3).split('').map(function (c) { return c + c; }).join(''); }
      if (h.length < 6) { return null; }
      return [0, 2, 4].map(function (i) { return parseInt(h.slice(i, i + 2), 16) / 255; });
    }
    var fn = /^rgba?\(([^)]*)\)$/i.exec(s);
    if (fn) {
      var p = fn[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
      if (p.length >= 3 && isFinite(p[0]) && isFinite(p[1]) && isFinite(p[2])) {
        return [p[0] / 255, p[1] / 255, p[2] / 255];
      }
    }
    return null;
  }
  function toRgb(input, fallback) {
    var hit = parseRgb(input);
    return hit || fallback;
  }
  var mixRgb = function (a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; };
  var cssRgb = function (c, a) { return 'rgba(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ',' + (a === undefined ? 1 : a) + ')'; };
  function shadowShows(bg) { /* the shader drop shadow only shows on non-solid dark bgs; ours is transparent */
    if (typeof bg !== 'string') { return true; }
    var s = bg.trim().toLowerCase();
    if (s === 'transparent') { return true; }
    var c = parseRgb(s) || [0, 0, 0];
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] > 0.03;
  }

  var GOO_FALLBACK = [0.008, 0.008, 0.01];
  var SHINE_FALLBACK = [0.93, 0.94, 0.97];

  /* ---- glove cursor source (the component's own SVG paths, verbatim) ---- */
  var GLOVE = 'M9 14V3.6a2.5 2.5 0 0 1 5 0V12.2a2.2 2.2 0 0 1 4.4 0.4a2.2 2.2 0 0 1 4.4 0.8a2.2 2.2 0 0 1 4.2 1.6V22c0 4-2.6 7-6 7H14.6c-3 0-5.4-1.8-6.6-4.4L4.1 18.6a2.3 2.3 0 0 1 3.6-2.8L9 17.4Z';
  var GLOVE_LINES = 'M18.4 12.6V17.2M22.8 13.4V17.6M14 12.2V16.6';
  var CUFF = 'M12.6 28.6h12.2a1.6 1.6 0 0 1 1.6 1.6v3.4a1.6 1.6 0 0 1-1.6 1.6H12.6a1.6 1.6 0 0 1-1.6-1.6v-3.4a1.6 1.6 0 0 1 1.6-1.6Z';
  var CUFF_LINES = 'M15.4 29.2v5.4M18.7 29.2v5.4M22 29.2v5.4';
  var HOT_X = 11.5, HOT_Y = 1;
  var GRIPS = [[11.5, 3.6], [16.2, 13.2], [20.6, 14], [24.9, 15.8], [5.6, 18], [11.5, 10], [18.5, 22], [18.7, 31.6]];
  var BANDS = [[0, 5.6], [0, 4.6], [0, 4.6], [0, 4.4], [Math.PI / 4, 4.8], [0, 5.6], [0.08, 11], [0, 15]];
  var ARROW = 'M1.5 1.5V23.2L6.6 18.4L10.1 26.4L13.6 24.9L10.2 17.1H17.3Z';
  var ARROW_HOT_X = 1.5, ARROW_HOT_Y = 1.5;
  var ARROW_GRIPS = [[2.6, 4.2], [2.4, 10], [6.5, 7.5], [11.5, 12.5], [2.4, 17.5], [14.5, 16], [11.5, 24.2], [6.8, 17.5]];
  var ARROW_BANDS = [[0, 4], [0, 4], [-Math.PI / 4, 4], [-Math.PI / 4, 4], [0, 4], [Math.PI / 2, 4], [-0.42, 4], [0.8, 4]];
  var NATIVE_GRIPS = [[0, 0], [5, 7], [-4, 6], [8, 13], [-2, 12], [3, 3], [6, 18], [0, 16]];
  var NATIVE_BANDS = [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]];

  var MS = 7, NP = 12, MSPK = 8, MDROP = 6; /* shader loop caps — keep in step with FRAG below */
  var VERT = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
  /* verbatim FRAG from the component: MS=7, NP-1=11, MSPK=8, MDROP=6 baked in.
     One deliberate tweak: uCount is a float here (the original declared it
     int and drove it with uniform1f, which most drivers reject). */
  var FRAG = 'precision highp float;\n' +
    'uniform vec2 uRes;\n' +
    'uniform float uDpr;\n' +
    'uniform vec4 uPill;\n' +
    'uniform vec4 uPts[84];\n' +
    'uniform vec4 uBox[7];\n' +
    'uniform float uCount;\n' +
    'uniform vec4 uSpk[8];\n' +
    'uniform vec4 uSpkR[8];\n' +
    'uniform vec4 uDrop[6];\n' +
    'uniform vec4 uMound;\n' +
    'uniform vec2 uMoundR;\n' +
    'uniform float uLean;\n' +
    'uniform vec3 uBase;\n' +
    'uniform vec3 uShine;\n' +
    'uniform float uRim;\n' +
    'uniform float uGlint;\n' +
    'uniform float uShadow;\n' +
    '\n' +
    'vec2 smin(vec2 a, vec2 b, float k){\n' +
    '  float h = clamp(0.5 + 0.5 * (b.x - a.x) / k, 0.0, 1.0);\n' +
    '  return vec2(mix(b.x, a.x, h) - k * h * (1.0 - h), mix(b.y, a.y, h));\n' +
    '}\n' +
    '\n' +
    'float cone(vec2 p, vec2 a, vec2 b, float ra, float rb, out float r){\n' +
    '  vec2 pb = b - a;\n' +
    '  p -= a;\n' +
    '  float h = dot(pb, pb);\n' +
    '  float t = clamp(dot(p, pb) / (h + 1e-4), 0.0, 1.0);\n' +
    '  r = mix(ra, rb, t);\n' +
    '  float bb = ra - rb;\n' +
    '  if (h <= bb * bb + 1e-3) {\n' +
    '    return ra > rb ? length(p) - ra : length(p - pb) - rb;\n' +
    '  }\n' +
    '  vec2 q = vec2(dot(p, vec2(pb.y, -pb.x)), dot(p, pb)) / h;\n' +
    '  q.x = abs(q.x);\n' +
    '  vec2 c = vec2(sqrt(h - bb * bb), bb);\n' +
    '  float k = c.x * q.y - c.y * q.x;\n' +
    '  float m = dot(c, q);\n' +
    '  float n = dot(q, q);\n' +
    '  if (k < 0.0) return sqrt(h * n) - ra;\n' +
    '  if (k > c.x) return sqrt(h * (n + 1.0 - 2.0 * q.y)) - rb;\n' +
    '  return m - ra;\n' +
    '}\n' +
    'vec2 field(vec2 p){\n' +
    '  float rr = uPill.w * 0.5;\n' +
    '  vec2 c = vec2(uPill.x + uPill.z * 0.5, uPill.y + rr);\n' +
    '  float a = max(0.0, uPill.z * 0.5 - rr);\n' +
    '  vec2 q = p - c;\n' +
    '  vec2 body = vec2(length(q - vec2(clamp(q.x, -a, a), 0.0)) - rr, rr);\n' +
    '  float r;\n' +
    '  if (uMoundR.x > 0.01) {\n' +
    '    float dm = cone(p, uMound.xy, uMound.zw, uMoundR.x, uMoundR.y, r);\n' +
    '    body = smin(body, vec2(dm, rr), 14.0);\n' +
    '  }\n' +
    '\n' +
    '  vec2 st = vec2(1e5, 2.0);\n' +
    '  for (int s = 0; s < 7; s++) {\n' +
    '    if (float(s) >= uCount) break;\n' +
    '\n' +
    '    vec4 bx = uBox[s];\n' +
    '    vec2 ob = max(max(bx.xy - p, p - bx.zw), 0.0);\n' +
    '    if (dot(ob, ob) > 400.0) continue;\n' +
    '\n' +
    '    vec2 one = vec2(1e5, 2.0);\n' +
    '    for (int i = 0; i < 11; i++) {\n' +
    '      vec4 A = uPts[s * 12 + i];\n' +
    '      vec4 B = uPts[s * 12 + i + 1];\n' +
    '\n' +
    '      if (length(p - (A.xy + B.xy) * 0.5) - 0.5 * length(B.xy - A.xy) - max(A.z, B.z) > one.x) continue;\n' +
    '      float d = cone(p, A.xy, B.xy, A.z, B.z, r);\n' +
    '      if (d < one.x) one = vec2(d, r + 0.3);\n' +
    '    }\n' +
    '\n' +
    '    st = smin(st, one, 3.5);\n' +
    '  }\n' +
    '  for (int k = 0; k < 8; k++) {\n' +
    '    if (uSpkR[k].y < 0.5) continue;\n' +
    '    float d = cone(p, uSpk[k].xy, uSpk[k].zw, uSpkR[k].x, 0.35, r);\n' +
    '    st = smin(st, vec2(d, r + 1.0), 3.0);\n' +
    '  }\n' +
    '  for (int k = 0; k < 6; k++) {\n' +
    '    if (uDrop[k].w < 0.5) continue;\n' +
    '    st = smin(st, vec2(length(p - uDrop[k].xy) - uDrop[k].z, uDrop[k].z), 5.0);\n' +
    '  }\n' +
    '  vec2 res = smin(body, st, 11.0);\n' +
    '\n' +
    '  res.y = max(res.y, body.y * clamp(-body.x / 6.0, 0.0, 1.0));\n' +
    '  return res;\n' +
    '}\n' +
    'float dist(vec2 p){ return field(p).x; }\n' +
    '\n' +
    'float env(vec3 R){\n' +
    '  R.x += uLean * 0.18;\n' +
    '  float up = -R.y;\n' +
    '  float e = 0.015;\n' +
    '  e += smoothstep(0.3, 0.5, up) * smoothstep(0.75, 0.55, up) * smoothstep(0.8, 0.5, abs(R.x)) * 2.6;\n' +
    '  e += smoothstep(0.8, 0.95, up) * 0.6;\n' +
    '  e += smoothstep(-0.5, -0.7, R.x) * smoothstep(0.5, 0.25, abs(R.y))\n' +
    '       * 1.1;\n' +
    '  e += smoothstep(0.6, 0.85, R.x) * smoothstep(0.6, 0.2, abs(R.y)) * 0.5;\n' +
    '  e += smoothstep(0.25, 0.7, R.y) * 1.25;\n' +
    '  return e;\n' +
    '}\n' +
    '\n' +
    'void main(){\n' +
    '  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;\n' +
    '  vec2 f = field(p);\n' +
    '  float d = f.x;\n' +
    '  float aa = clamp(0.5 - d * uDpr, 0.0, 1.0);\n' +
    '\n' +
    '  float sh = 0.0;\n' +
    '  if (aa < 1.0 && uShadow > 0.0 && d < 30.0) {\n' +
    '    float ds = dist(p - vec2(2.0, 9.0));\n' +
    '    sh = (1.0 - smoothstep(-4.0, 16.0, ds)) * uShadow;\n' +
    '  }\n' +
    '\n' +
    '  vec3 col = vec3(0.0);\n' +
    '  if (aa > 0.0) {\n' +
    '    float B = max(f.y, 0.8);\n' +
    '    float s = clamp(-d, 0.0, B);\n' +
    '    float z = sqrt(max(1e-3, s * (2.0 * B - s)));\n' +
    '    float slope = min((B - s) / z, 6.0);\n' +
    '    float e = 0.5;\n' +
    '    vec2 g = vec2(dist(p + vec2(e, 0.0)) - d, dist(p + vec2(0.0, e)) - d);\n' +
    '    g = length(g) > 1e-6 ? normalize(g) : vec2(0.0);\n' +
    '    vec3 n = normalize(vec3(g * slope, 1.0));\n' +
    '    vec3 R = reflect(vec3(0.0, 0.0, -1.0), n);\n' +
    '    float fres = 0.05 + 0.95 * pow(1.0 - max(n.z, 0.0), 3.0);\n' +
    '    col = uBase + min(env(R) * fres * uRim, 1.0) * uShine;\n' +
    '    col += pow(max(dot(R, normalize(vec3(-0.35, -0.75, 0.56))), 0.0), 70.0) * 1.2 * uGlint;\n' +
    '    col += pow(max(dot(R, normalize(vec3(0.55, -0.35, 0.76))), 0.0), 140.0) * 0.55 * uGlint;\n' +
    '  }\n' +
    '  float alpha = aa + (1.0 - aa) * sh;\n' +
    '  gl_FragColor = vec4(col * aa, alpha);\n' +
    '}';

  /* ---- GL up. Any failure drops the stage onto its gradient-pill fallback,
     the same picture the component paints with setFallback(true). ---- */
  stage.classList.add('venom-live');
  var gl = null;
  try {
    gl = cv.getContext('webgl', { premultipliedAlpha: true, antialias: false, alpha: true }) ||
      cv.getContext('experimental-webgl', { premultipliedAlpha: true, antialias: false, alpha: true });
  } catch (err) { gl = null; }

  var shaders = [], prog = null, quad = null, U = null;
  function disposeGL() {
    if (!gl) { return; }
    if (quad) { gl.deleteBuffer(quad); quad = null; }
    if (prog) { gl.deleteProgram(prog); prog = null; }
    for (var i = 0; i < shaders.length; i++) { gl.deleteShader(shaders[i]); }
    shaders.length = 0;
  }
  function sh(t, src) {
    var s = gl.createShader(t);
    if (!s) { return null; }
    shaders.push(s);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  }
  if (gl) {
    var vsx = sh(gl.VERTEX_SHADER, VERT), fsx = sh(gl.FRAGMENT_SHADER, FRAG);
    var p2 = gl.createProgram();
    if (p2) {
      if (vsx && fsx) { gl.attachShader(p2, vsx); gl.attachShader(p2, fsx); gl.linkProgram(p2); }
      if (vsx && fsx && gl.getProgramParameter(p2, gl.LINK_STATUS)) { prog = p2; }
      else { gl.deleteProgram(p2); }
    }
  }
  if (gl && prog) {
    gl.useProgram(prog);
    var names = ['uRes', 'uDpr', 'uPill', 'uPts', 'uBox', 'uCount', 'uSpk', 'uSpkR', 'uDrop', 'uMound', 'uMoundR', 'uLean', 'uBase', 'uShine', 'uRim', 'uGlint', 'uShadow'];
    U = {};
    for (var un = 0; un < names.length; un++) {
      var loc = gl.getUniformLocation(prog, names[un]);
      if (!loc) { U = null; break; }
      U[names[un]] = loc;
    }
  }
  if (!gl || !prog || !U || !window.Path2D || !window.ResizeObserver) {
    disposeGL();
    stage.classList.remove('venom-live');
    return;
  }
  quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  var aLoc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(aLoc);
  gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);
  var quadData = new Float32Array(8);
  var pts = new Float32Array(MS * NP * 4), box = new Float32Array(MS * 4);
  var spk = new Float32Array(MSPK * 4), spkR = new Float32Array(MSPK * 4), drp = new Float32Array(MDROP * 4);

  var w = 0, h = 0, dpr = 1;
  var glScale = 1, slow = 16, slowN = 0, lastGlKey = '';
  var ovDirty = true;

  /* ---- pill geometry: measured from the real <button>, press included ---- */
  var pressed = false;
  var press = 1, pressV = 0;
  var pill = { x: 0, y: 0, w: 0, h: 0, r: 0, ls: 0, P: 1 };
  function measure() {
    var bw = btn.offsetWidth, bh = btn.offsetHeight;
    pill.w = bw * press; pill.h = bh * press;
    pill.x = btn.offsetLeft + (bw - pill.w) / 2; pill.y = btn.offsetTop + (bh - pill.h) / 2;
    pill.r = pill.h / 2;
    pill.ls = Math.max(0, pill.w - pill.h);
    pill.P = 2 * pill.ls + 2 * Math.PI * pill.r || 1;
  }
  function at(s) {
    var x = pill.x, W = pill.w, H = pill.h, r = pill.r, ls = pill.ls, P = pill.P;
    s = ((s % P) + P) % P;
    if (s < ls) { return { x: x + r + s, y: pill.y, nx: 0, ny: -1 }; }
    s -= ls;
    if (s < Math.PI * r) {
      var a = -Math.PI / 2 + s / r;
      return { x: x + W - r + Math.cos(a) * r, y: pill.y + r + Math.sin(a) * r, nx: Math.cos(a), ny: Math.sin(a) };
    }
    s -= Math.PI * r;
    if (s < ls) { return { x: x + W - r - s, y: pill.y + H, nx: 0, ny: 1 }; }
    s -= ls;
    var a2 = Math.PI / 2 + s / r;
    return { x: x + r + Math.cos(a2) * r, y: pill.y + r + Math.sin(a2) * r, nx: Math.cos(a2), ny: Math.sin(a2) };
  }
  function nearest(qx, qy) {
    var cy = pill.y + pill.r;
    var cx = Math.max(pill.x + pill.r, Math.min(pill.x + pill.w - pill.r, qx));
    var dist = Math.hypot(qx - cx, qy - cy) - pill.r;
    var a, s;
    if (qx > pill.x + pill.w - pill.r) { s = pill.ls + (Math.atan2(qy - cy, qx - cx) + Math.PI / 2) * pill.r; }
    else if (qx < pill.x + pill.r) {
      a = Math.atan2(qy - cy, qx - cx);
      if (a < -Math.PI / 2) { a += Math.PI * 2; }
      s = 2 * pill.ls + Math.PI * pill.r + (a - Math.PI / 2) * pill.r;
    } else { s = qy < cy ? qx - (pill.x + pill.r) : pill.ls + Math.PI * pill.r + (pill.x + pill.w - pill.r - qx); }
    return { s: s, dist: dist };
  }
  function loopDiff(a, b) {
    var P = pill.P, d = (b - a) % P;
    if (d > P / 2) { d -= P; }
    if (d < -P / 2) { d += P; }
    return d;
  }

  function fit() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = stage.offsetWidth; h = stage.offsetHeight;
    hc.width = Math.max(1, Math.round(w * dpr)); hc.height = Math.max(1, Math.round(h * dpr));
    cv.width = Math.max(1, Math.round(w * dpr * glScale)); cv.height = Math.max(1, Math.round(h * dpr * glScale));
    gl.viewport(0, 0, cv.width, cv.height);
    lastGlKey = '';
    measure();
  }

  /* ---- pointer bookkeeping: glove replaces the cursor over the stage ---- */
  var touchOnly = false;
  try { touchOnly = !!window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches; } catch (e) {}
  var ptr = { x: -999, y: -999, inside: false, last: 0, touch: false, down: false, upAt: 0 };
  var touched = false;
  function place(e) {
    var x = 0, y = 0;
    if (e.target === btn) {
      var k = pill.w / (btn.offsetWidth || 1);
      x = pill.x + e.offsetX * k; y = pill.y + e.offsetY * k;
    } else if (e.target === stage) {
      x = e.offsetX; y = e.offsetY;
    } else { return; }
    ptr.x = x; ptr.y = y;
    ptr.inside = ptr.x >= 0 && ptr.y >= 0 && ptr.x <= w && ptr.y <= h;
    if (ptr.inside) { touched = true; ptr.last = performance.now(); }
  }
  function onMove(e) {
    if (e.pointerType === 'touch') {
      if (!ptr.down || !e.isPrimary) { return; }
      ptr.touch = true;
    } else { ptr.touch = false; }
    place(e);
  }
  function onDown(e) {
    if (e.target === btn && !reduced) { pressed = true; }
    if (e.pointerType !== 'touch' || !e.isPrimary) { return; }
    ptr.touch = true;
    ptr.down = true;
    place(e);
  }
  function onUp(e) {
    pressed = false;
    if (e.pointerType !== 'touch' || !e.isPrimary || !ptr.down) { return; }
    ptr.down = false;
    ptr.upAt = performance.now();
    if (e.type === 'pointercancel') { ptr.inside = false; ptr.last = ptr.upAt; }
  }
  function onLeave() { if (!ptr.touch) { ptr.inside = false; } }
  function onKeyDown(e) { if ((e.key === ' ' || e.key === 'Enter') && !reduced) { pressed = true; } }
  function onKeyUp() { pressed = false; }
  stage.addEventListener('pointermove', onMove, { passive: true });
  stage.addEventListener('pointerdown', onDown, { passive: true });
  stage.addEventListener('pointerleave', onLeave);
  window.addEventListener('pointerup', onUp, { passive: true });
  window.addEventListener('pointercancel', onUp, { passive: true });
  btn.addEventListener('keydown', onKeyDown);
  btn.addEventListener('keyup', onKeyUp);
  btn.addEventListener('blur', onKeyUp);

  /* ---- ghost autoplay hand: Catmull-Rom over the component's own waypoint
     list until a real pointer takes over ---- */
  var GHOST = [
    [0.5, 0.8, 1.1], [0.36, 0.74, 1.0], [0.6, 0.82, 0.9], [0.8, 0.64, 0.55], [0.98, 0.97, 1.4],
    [0.86, 0.28, 1.1], [0.7, 0.18, 1.0], [0.5, 0.12, 1.0], [0.3, 0.2, 0.55], [0.03, 0.04, 1.4],
    [0.16, 0.58, 1.1], [0.32, 0.86, 1.0]
  ];
  var ghostTotal = 0, gi2;
  for (gi2 = 0; gi2 < GHOST.length; gi2++) { ghostTotal += GHOST[gi2][2]; }
  function cr(a, b, c, d, e2) {
    return 0.5 * (2 * b + (-a + c) * e2 + (2 * a - 5 * b + 4 * c - d) * e2 * e2 + (-a + 3 * b - 3 * c + d) * e2 * e2 * e2);
  }
  function ghostAt(t) {
    var u = t % ghostTotal, i = 0;
    while (u > GHOST[i][2]) { u -= GHOST[i][2]; i++; }
    var f = u / GHOST[i][2];
    var kk = function (n) { return GHOST[(n + GHOST.length) % GHOST.length]; };
    var p0 = kk(i - 1), p1 = kk(i), p2b = kk(i + 1), p3 = kk(i + 2);
    var e2 = f * f * (3 - 2 * f);
    var gw = Math.min(w, 840), gh = Math.min(h, 420);
    return {
      x: (w - gw) / 2 + cr(p0[0], p1[0], p2b[0], p3[0], e2) * gw,
      y: (h - gh) / 2 + cr(p0[1], p1[1], p2b[1], p3[1], e2) * gh
    };
  }

  /* ---- state machine + strands ---- */
  var mode = 'idle', violentSnap = false, grow = 0, seekF = 0;
  var list = [], webs = [];
  var spikes = [], drops = [];
  var near = { s: 0, dist: 999 };
  var hand = { x: -999, y: -999 };
  var anchor = { x: 0, y: 0 };
  var stretch = 0;
  var mound = 0, moundV = 0, moundS = 0;
  var moundDir = { x: 0, y: 1 };
  var lean = 0;
  var sc = 1.55;
  var drawn = true;
  var SHAPES = null;
  var gloveP = new Path2D(GLOVE), gloveL = new Path2D(GLOVE_LINES), cuffP = new Path2D(CUFF), cuffL = new Path2D(CUFF_LINES);
  var handClip = new Path2D();
  handClip.addPath(gloveP);
  handClip.addPath(cuffP);
  var arrowP = new Path2D(ARROW);
  SHAPES = {
    glove: {
      shadow: [gloveP, cuffP], fill: [cuffP, gloveP],
      stroke: [[cuffP, 1.9], [cuffL, 1.1], [gloveP, 1.9], [gloveL, 1.1]], clip: handClip,
      grips: GRIPS, bands: BANDS, hot: [HOT_X, HOT_Y], mid: [16, 18], creep: [17, 20]
    },
    arrow: {
      shadow: [arrowP], fill: [arrowP], stroke: [[arrowP, 1.5]], clip: arrowP,
      grips: ARROW_GRIPS, bands: ARROW_BANDS, hot: [ARROW_HOT_X, ARROW_HOT_Y], mid: [7.5, 14], creep: [7, 14]
    }
  };
  var shape = SHAPES.glove, grips = GRIPS, bands = BANDS;
  var coat = new Float32Array(GRIPS.length);
  function gripAt(g) {
    if (drawn) { return { x: hand.x + (g[0] - shape.hot[0]) * sc, y: hand.y + (g[1] - shape.hot[1]) * sc }; }
    return { x: hand.x + g[0], y: hand.y + g[1] };
  }

  function spawn() {
    list = [];
    var main = Math.max(2, Math.min(MS, Math.round(num(VEN.strands, 7, 2, MS))));
    var total = main * 2 - 1;
    var root = at(near.s);
    for (var k = 0; k < total; k++) {
      var hair = k % 2 === 1;
      var mi = Math.floor(k / 2);
      var g;
      if (hair) {
        g = [(grips[mi % grips.length][0] + grips[(mi + 1) % grips.length][0]) / 2, (grips[mi % grips.length][1] + grips[(mi + 1) % grips.length][1]) / 2];
      } else {
        g = grips[mi % grips.length];
      }
      list.push({
        x: new Float32Array(NP).fill(root.x), y: new Float32Array(NP).fill(root.y),
        px: new Float32Array(NP).fill(root.x), py: new Float32Array(NP).fill(root.y),
        spread: (k / (total - 1)) * 2 - 1 + (Math.random() - 0.5) * 0.15,
        s: near.s,
        slack: 1.02 + Math.random() * (hair ? 0.2 : 0.12),
        width: hair ? 0.5 : 0.8 + Math.random() * 0.45,
        grip: g,
        band: hair ? [0, 0] : bands[mi % bands.length],
        gi: hair ? -1 : mi % grips.length,
        reachK: hair ? 0.35 : 0.55 + Math.random() * 0.4,
        ex: root.x, ey: root.y,
        follow: 9 + Math.random() * 8,
        seg: 0, phase: Math.random() * 10, hair: hair
      });
    }
    webs = [];
    for (var k2 = 0; k2 < list.length - 1; k2++) {
      var count = 1 + Math.floor(Math.random() * 2);
      for (var c2 = 0; c2 < count; c2++) {
        var i2 = 3 + Math.floor(Math.random() * (NP - 5));
        var j2 = Math.max(2, Math.min(NP - 2, i2 + Math.round((Math.random() - 0.5) * 3)));
        webs.push([k2, k2 + 1, i2, j2, (Math.random() - 0.5) * 5]);
      }
    }
    grow = 0;
    mode = 'seek';
  }
  function snap(violent) {
    if (mode === 'idle' || mode === 'snap') { return; }
    mode = 'snap';
    violentSnap = violent;
    if (!violent) { return; }
    moundV -= num(ADV.recoil, 90, 0, 400);
    var spikeK = num(ADV.spikes, 100, 0, 300) / 100;
    var dropP = num(ADV.drops, 60, 0, 100) / 100;
    var seen = {};
    for (var q = 0; q < list.length; q++) {
      var st = list[q];
      if (st.hair) { continue; }
      var key = Math.round(st.s / 8);
      if (seen[key] || spikes.length >= MSPK) { continue; }
      seen[key] = true;
      if (spikeK > 0) {
        spikes.push({ s: st.s, tilt: (Math.random() - 0.5) * 0.8, len: (10 + Math.random() * 16) * spikeK, age: 0, life: 1.1 + Math.random() * 0.6 });
      }
      if (Math.random() < dropP && drops.length < MDROP) {
        var i3 = 4 + Math.floor(Math.random() * 4);
        var root2 = at(st.s);
        drops.push({ x: st.x[i3], y: st.y[i3], vx: (root2.x - st.x[i3]) * 2, vy: (root2.y - st.y[i3]) * 2 - 40, r: 2 + Math.random() * 2.2, age: 0 });
      }
    }
  }

  /* ---- the frame: physics, uniforms, dirty-rect draw, glove paint ---- */
  var raf = 0, prev = -1, t0 = -1, alive = true;
  function draw(now) {
    if (!alive) { return; }
    var dt = prev < 0 ? 0 : Math.min(0.033, (now - prev) / 1000);
    var frameMs = prev < 0 ? 16 : now - prev;
    prev = now;
    if (t0 < 0) { t0 = now; }
    if (!w || !h) { return; }
    var A = ADV;
    drawn = VEN.cursor !== 'native' && !reduced;
    shape = VEN.cursor === 'arrow' ? SHAPES.arrow : SHAPES.glove;
    grips = drawn ? shape.grips : NATIVE_GRIPS;
    bands = drawn ? shape.bands : NATIVE_BANDS;
    sc = num(A.gloveScale, 155, 50, 400) / 100;
    var hk = num(A.hover, 50, 0, 100) / 50;
    var goo = toRgb(VEN.gooColor, GOO_FALLBACK);
    var shine = toRgb(A.shine, SHINE_FALLBACK);
    var thinK = num(A.stretchThin, 50, 0, 90) / 100;
    var widthK = num(A.strandWidth, 100, 20, 300) / 100;

    /* the button press: stock spring (420 stiffness, -18 damping) */
    var pressTo = pressed ? num(A.pressScale, 96, 50, 100) / 100 : 1;
    for (var pi4 = 0; pi4 < 4; pi4++) {
      var q4 = dt / 4;
      pressV += (420 * (pressTo - press) - 18 * pressV) * q4;
      press += pressV * q4;
    }
    if (Math.abs(press - 1) < 1e-4 && Math.abs(pressV) < 1e-3) { press = 1; pressV = 0; }
    var transform = press === 1 ? '' : 'scale(' + press + ')';
    if (btn.style.transform !== transform) { btn.style.transform = transform; }
    measure();
    var time = (now - t0) / 1000;

    if (ptr.touch && !ptr.down && ptr.inside && now - ptr.upAt > num(A.lingerMs, 1700, 0, 10000)) { ptr.inside = false; ptr.last = now; }
    var ghostOn = !!VEN.autoplay;
    var ghost = ghostOn && !reduced && !ptr.down && (!touched || (!ptr.inside && now - ptr.last > num(A.ghostDelayMs, 2500, 0, 30000)));
    var present = ptr.inside;
    if (ghost) { hand = ghostAt(time); present = true; } else { hand = { x: ptr.x, y: ptr.touch ? ptr.y - num(A.fingerLift, 52, 0, 200) : ptr.y }; }
    var stageCursor = drawn && !ghost && present ? 'none' : '';
    if (stage.style.cursor !== stageCursor) { stage.style.cursor = stageCursor; }
    var btnCursor = drawn ? 'none' : 'pointer';
    if (btn.style.cursor !== btnCursor) { btn.style.cursor = btnCursor; }

    anchor = drawn
      ? { x: hand.x + (shape.mid[0] - shape.hot[0]) * sc, y: hand.y + (shape.mid[1] - shape.hot[1]) * sc }
      : { x: hand.x, y: hand.y };
    near = nearest(anchor.x, anchor.y);
    var D = Math.max(0, near.dist);

    var dk = ptr.touch || (touchOnly && ghost) ? Math.max(0.55, Math.min(1, w / 560)) : 1;
    var sn = num(A.sense, 290, 0, 2000) * dk * hk, rc = num(VEN.reach, 140, 0, 2000) * hk, rl = num(A.release, 215, 0, 2000) * hk;
    var cx = pill.x + pill.w / 2;
    lean += ((present ? Math.max(-1, Math.min(1, (hand.x - cx) / (pill.w * 1.5))) * Math.min(1, hk) : 0) - lean) * Math.min(1, dt * 4);

    if (!reduced) {
      if (mode === 'idle' && present && D < sn) { spawn(); }
      else if (mode === 'snap' && !violentSnap && present && D < sn) { mode = 'seek'; }
      else if (mode === 'seek' && (!present || D > sn + 25)) { snap(false); }
      else if (mode === 'seek' && D < rc) { mode = 'grow'; grow = 0; }
      else if ((mode === 'grow' || mode === 'hold') && (!present || D > rl)) { snap(true); }
    }
    var holding = mode === 'hold' || mode === 'grow';
    var seeking = mode === 'seek';

    var fT = seeking ? Math.max(0, Math.min(1, (sn - D) / Math.max(1, sn - rc))) : holding ? 1 : 0;
    seekF += (fT - seekF) * Math.min(1, dt * 5);
    stretch = holding ? Math.min(1, D / Math.max(1, rl)) : 0;
    if (mode === 'grow') {
      grow = Math.min(1, grow + dt / (num(A.lungeMs, 300, 50, 3000) / 1000));
      if (grow >= 1) { mode = 'hold'; }
    }

    var gravity = num(A.gravity, 260, 0, 2000);
    var swayAmp = num(A.sway, 14, 0, 100);
    var dartK = num(A.dart, 28, 0, 100) / 100;
    var coilPx = num(A.coil, 13, 0, 60);
    var coilRad = (num(A.coilAngle, 468, 0, 1440) * Math.PI) / 180;
    var spreadPx = Math.max(14, Math.min(pill.w * 0.3, D * 0.4 + 14)) * (seeking ? 0.65 : 1);
    var sAlive = 0;
    for (var li = 0; li < list.length; li++) {
      var st = list[li];
      var target = near.s + st.spread * spreadPx;
      st.s += loopDiff(st.s, target) * Math.min(1, dt * (mode === 'snap' ? 1.5 : 6));
      var root = at(st.s);
      var rx = root.x - root.nx * 3, ry = root.y - root.ny * 3;
      var pinTip = false;
      var gp = gripAt(st.grip);
      if (seeking) {
        var vx = gp.x - rx, vy = gp.y - ry;
        var vl = Math.hypot(vx, vy) || 1;
        var ease = seekF * seekF * (3 - 2 * seekF);
        var dart = Math.pow(Math.max(0, Math.sin(time * 1.9 + st.phase * 3.1)), 10) * dartK;
        var len = Math.max(3, vl * st.reachK * 0.85 * ease * (1 + dart));
        var sway = Math.sin(time * 2.7 + st.phase) * (3 + 9 * ease) + Math.sin(time * 5.3 + st.phase * 2) * 2 * ease;
        var tx = rx + (vx / vl) * len - (vy / vl) * sway;
        var ty = ry + (vy / vl) * len + (vx / vl) * sway;
        var k9 = 1 - Math.exp(-dt * 6);
        st.ex += (tx - st.ex) * k9;
        st.ey += (ty - st.ey) * k9;
        pinTip = true;
        st.seg = (Math.hypot(st.ex - rx, st.ey - ry) * (st.slack + 0.06)) / (NP - 1);
      } else if (holding) {
        var gx = gp.x, gy = gp.y;
        if (mode === 'grow') {
          var coil = Math.pow(1 - grow, 1.6) * (st.hair ? coilPx * 0.54 : coilPx);
          var ang2 = st.phase + grow * coilRad;
          gx += Math.cos(ang2) * coil;
          gy += Math.sin(ang2) * coil * 0.8;
        }
        var k10 = 1 - Math.exp(-dt * (mode === 'grow' ? 20 + st.follow : st.follow * 1.4));
        st.ex += (gx - st.ex) * k10;
        st.ey += (gy - st.ey) * k10;
        pinTip = true;
        st.seg = (Math.hypot(st.ex - rx, st.ey - ry) * st.slack) / (NP - 1);
      } else {
        st.seg *= Math.exp(-dt * 5.5);
        if (st.seg * (NP - 1) > 1.5) { sAlive++; }
      }
      var damp = mode === 'snap' ? num(A.snapDamping, 86, 0, 99) / 100 : num(A.damping, 92, 0, 99) / 100;
      for (var i4 = 1; i4 < NP; i4++) {
        var nvx = (st.x[i4] - st.px[i4]) * damp, nvy = (st.y[i4] - st.py[i4]) * damp;
        st.px[i4] = st.x[i4]; st.py[i4] = st.y[i4];
        var mid = Math.sin((i4 / (NP - 1)) * Math.PI);
        var wx = Math.sin(time * 1.6 + st.phase + i4 * 0.55) * swayAmp * mid;
        var wy = Math.cos(time * 1.3 + st.phase * 1.3 + i4 * 0.45) * swayAmp * mid;
        st.x[i4] += nvx + wx * dt * dt;
        st.y[i4] += nvy + (gravity + wy) * dt * dt;
      }
      st.x[0] = st.px[0] = rx; st.y[0] = st.py[0] = ry;
      if (pinTip) { st.x[NP - 1] = st.ex; st.y[NP - 1] = st.ey; }
      var segLen = Math.max(0.01, st.seg);
      for (var it = 0; it < 14; it++) {
        for (var i5 = 0; i5 < NP - 1; i5++) {
          var dx2 = st.x[i5 + 1] - st.x[i5], dy2 = st.y[i5 + 1] - st.y[i5];
          var d2 = Math.hypot(dx2, dy2) || 0.0001;
          var diff = (d2 - segLen) / d2;
          var aa2 = i5 === 0 ? 0 : 0.5;
          var bb2 = pinTip && i5 + 1 === NP - 1 ? 0 : i5 === 0 ? 1 : 0.5;
          var m2 = aa2 + bb2 || 1;
          st.x[i5] += dx2 * diff * (aa2 / m2); st.y[i5] += dy2 * diff * (aa2 / m2);
          st.x[i5 + 1] -= dx2 * diff * (bb2 / m2); st.y[i5 + 1] -= dy2 * diff * (bb2 / m2);
        }
      }
      for (var pass = 0; pass < 2; pass++) {
        for (var i6 = 1; i6 < NP - 1; i6++) {
          if (pinTip && i6 === NP - 1) { continue; }
          st.x[i6] += ((st.x[i6 - 1] + st.x[i6 + 1]) / 2 - st.x[i6]) * 0.22;
          st.y[i6] += ((st.y[i6 - 1] + st.y[i6 + 1]) / 2 - st.y[i6]) * 0.22;
        }
      }
      if (!isFinite(st.x[NP - 1])) { st.x.fill(rx); st.y.fill(ry); st.px.fill(rx); st.py.fill(ry); }
    }
    if (mode === 'snap' && sAlive === 0) { mode = 'idle'; list = []; webs = []; }

    var moundK = num(A.mound, 100, 0, 300) / 100;
    var moundTarget = (holding ? 5 + 16 * stretch : seeking ? 3 + 9 * seekF : 0) * moundK;
    moundV += ((moundTarget - mound) * 150 - moundV * 9) * dt;
    mound += moundV * dt;
    if (holding || seeking) {
      moundS += loopDiff(moundS, near.s) * Math.min(1, dt * 6);
      var me = at(moundS);
      var tdx = anchor.x - me.x, tdy = anchor.y - me.y, tl = Math.hypot(tdx, tdy) || 1;
      moundDir = { x: me.nx * 0.55 + (tdx / tl) * 0.45, y: me.ny * 0.55 + (tdy / tl) * 0.45 };
    }

    for (var sq = spikes.length - 1; sq >= 0; sq--) { spikes[sq].age += dt; if (spikes[sq].age > spikes[sq].life) { spikes.splice(sq, 1); } }
    for (var dq = drops.length - 1; dq >= 0; dq--) {
      var dD = drops[dq];
      dD.age += dt;
      dD.vy += 520 * dt;
      dD.vx *= Math.exp(-dt * 2); dD.vy *= Math.exp(-dt * 1);
      dD.x += dD.vx * dt; dD.y += dD.vy * dt;
      dD.r *= Math.exp(-dt * 1.5);
      if (dD.age > 0.9 || nearest(dD.x, dD.y).dist < -dD.r) { drops.splice(dq, 1); }
    }

    var thin = 1 - thinK * stretch;
    var pulseK = num(A.pulse, 24, 0, 100) / 100;
    var mains = [];
    for (var f1 = 0; f1 < list.length && mains.length < MS; f1++) { if (!list[f1].hair) { mains.push(list[f1]); } }
    var minX = pill.x, minY = pill.y, maxX = pill.x + pill.w, maxY = pill.y + pill.h;
    var grow2 = seeking ? 0.55 + 0.45 * seekF : 1;
    for (var si = 0; si < mains.length; si++) {
      var stm = mains[si];
      var bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
      for (var i7 = 0; i7 < NP; i7++) {
        var f2 = i7 / (NP - 1);
        var rr2 = stm.width * (3.0 - 1.9 * f2) * thin * grow2 * widthK;
        if (holding) { rr2 *= 1 + pulseK * Math.sin(f2 * 9 - time * 6 + stm.phase) * Math.sin(f2 * Math.PI); }
        if (mode === 'snap') { rr2 *= 1.15; }
        var o2 = (si * NP + i7) * 4;
        var rrM = Math.max(0.55, rr2);
        pts[o2] = stm.x[i7]; pts[o2 + 1] = stm.y[i7]; pts[o2 + 2] = rrM; pts[o2 + 3] = 1;
        if (stm.x[i7] - rrM < bx0) { bx0 = stm.x[i7] - rrM; }
        if (stm.x[i7] + rrM > bx1) { bx1 = stm.x[i7] + rrM; }
        if (stm.y[i7] - rrM < by0) { by0 = stm.y[i7] - rrM; }
        if (stm.y[i7] + rrM > by1) { by1 = stm.y[i7] + rrM; }
      }
      box[si * 4] = bx0; box[si * 4 + 1] = by0; box[si * 4 + 2] = bx1; box[si * 4 + 3] = by1;
      if (bx0 < minX) { minX = bx0; }
      if (bx1 > maxX) { maxX = bx1; }
      if (by0 < minY) { minY = by0; }
      if (by1 > maxY) { maxY = by1; }
    }
    spk.fill(0); spkR.fill(0);
    for (var sk = 0; sk < spikes.length; sk++) {
      var sp = spikes[sk];
      var pp = sp.age / sp.life;
      var up = pp < 0.15 ? 1 - Math.pow(1 - pp / 0.15, 3) : pp > 0.45 ? Math.max(0, 1 - (pp - 0.45) / 0.55) : 1;
      var sl = sp.len * (pp > 0.45 ? up * up * (3 - 2 * up) : up);
      var b2 = at(sp.s);
      var sway2 = Math.sin(sp.age * 14) * Math.exp(-sp.age * 3) * 0.35;
      var ang3 = Math.atan2(b2.ny, b2.nx) + sp.tilt + sway2;
      var tx3 = b2.x + Math.cos(ang3) * sl, ty3 = b2.y + Math.sin(ang3) * sl;
      spk[sk * 4] = b2.x - b2.nx * 2; spk[sk * 4 + 1] = b2.y - b2.ny * 2; spk[sk * 4 + 2] = tx3; spk[sk * 4 + 3] = ty3;
      spkR[sk * 4] = 2.6 * Math.min(1, up + 0.2); spkR[sk * 4 + 1] = sl > 0.6 ? 1 : 0;
      if (tx3 < minX) { minX = tx3; }
      if (tx3 > maxX) { maxX = tx3; }
      if (ty3 < minY) { minY = ty3; }
      if (ty3 > maxY) { maxY = ty3; }
    }
    drp.fill(0);
    for (var dk2 = 0; dk2 < drops.length; dk2++) {
      var dD2 = drops[dk2];
      drp[dk2 * 4] = dD2.x; drp[dk2 * 4 + 1] = dD2.y; drp[dk2 * 4 + 2] = dD2.r; drp[dk2 * 4 + 3] = 1;
      if (dD2.x < minX) { minX = dD2.x; }
      if (dD2.x > maxX) { maxX = dD2.x; }
      if (dD2.y < minY) { minY = dD2.y; }
      if (dD2.y > maxY) { maxY = dD2.y; }
    }
    var me2 = at(moundS);
    var mlen = Math.max(0, mound);
    var mr = Math.max(0, mound) > 0.3 ? (9 + spreadPx * 0.32) * Math.min(1, mound / 6) : 0;
    var mtx = me2.x + moundDir.x * mlen, mty = me2.y + moundDir.y * mlen;

    var rim = num(A.rim, 100, 0, 300) / 100, glint = num(A.glint, 100, 0, 300) / 100;
    var shadowK = shadowShows('transparent') ? num(A.shadow, 20, 0, 100) / 100 : 0;

    var still = mode === 'idle' && spikes.length === 0 && drops.length === 0 && mr === 0;

    if (!still && frameMs < 250) {
      slow += (frameMs - slow) * 0.08;
      if (++slowN > 45 && slow > 38 && dpr * glScale * 0.75 >= 0.8) {
        glScale *= 0.75;
        slow = 16; slowN = 0;
        fit();
      }
    }
    var glKey = still
      ? [w, h, glScale, pill.x, pill.y, pill.w, pill.h, lean.toFixed(3), goo.join(','), shine.join(','), rim, glint, shadowK].join('|')
      : '';
    if (!still || glKey !== lastGlKey) {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(U.uRes, cv.width, cv.height);
      gl.uniform1f(U.uDpr, dpr * glScale);
      gl.uniform4f(U.uPill, pill.x, pill.y, pill.w, pill.h);
      gl.uniform4fv(U.uPts, pts);
      gl.uniform4fv(U.uBox, box);
      gl.uniform1f(U.uCount, mains.length);
      gl.uniform4fv(U.uSpk, spk);
      gl.uniform4fv(U.uSpkR, spkR);
      gl.uniform4fv(U.uDrop, drp);
      gl.uniform4f(U.uMound, me2.x - me2.nx * 6, me2.y - me2.ny * 6, mtx, mty);
      gl.uniform2f(U.uMoundR, mr, mr * 0.45);
      gl.uniform1f(U.uLean, lean);
      gl.uniform3f(U.uBase, goo[0], goo[1], goo[2]);
      gl.uniform3f(U.uShine, shine[0], shine[1], shine[2]);
      gl.uniform1f(U.uRim, rim);
      gl.uniform1f(U.uGlint, glint);
      gl.uniform1f(U.uShadow, shadowK);
      var pad2 = 34;
      var x0 = Math.max(0, minX - pad2), x1 = Math.min(w, maxX + pad2), y0 = Math.max(0, minY - pad2), y1 = Math.min(h, maxY + pad2 + 10);
      var X = function (v) { return (v / w) * 2 - 1; };
      var Y = function (v) { return 1 - (v / h) * 2; };
      quadData.set([X(x0), Y(y0), X(x1), Y(y0), X(x0), Y(y1), X(x1), Y(y1)]);
      gl.bufferData(gl.ARRAY_BUFFER, quadData, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    lastGlKey = glKey;

    /* skin: tips that reached their grips slowly coat the glove */
    var skinIn = 1000 / num(A.skinInMs, 2000, 100, 20000);
    var skinOut = 1000 / num(A.skinOutMs, 700, 50, 20000);
    for (var cg = 0; cg < coat.length; cg++) {
      var caught = false;
      if (holding) {
        for (var q3 = 0; q3 < list.length; q3++) {
          var stq = list[q3];
          if (stq.gi === cg && Math.hypot(stq.ex - gripAt(stq.grip).x, stq.ey - gripAt(stq.grip).y) < 6) { caught = true; break; }
        }
      }
      coat[cg] = caught ? Math.min(1, coat[cg] + dt * skinIn) : Math.max(0, coat[cg] - dt * skinOut);
    }

    var ovDraw = list.length > 0 || (drawn && present);
    if (ovDraw || ovDirty) {
      hx.setTransform(dpr, 0, 0, dpr, 0, 0);
      hx.clearRect(0, 0, w, h);
    }
    ovDirty = ovDraw;
    hx.lineCap = 'round';
    hx.lineJoin = 'round';
    if (list.length && (holding || mode === 'snap')) {
      if (A.hairs !== false) {
        hx.strokeStyle = cssRgb(mixRgb(goo, shine, 0.01), 0.9);
        for (var h1 = 0; h1 < list.length; h1++) {
          var st2 = list[h1];
          if (!st2.hair) { continue; }
          hx.lineWidth = 0.7 * thin * widthK;
          hx.beginPath();
          hx.moveTo(st2.x[0], st2.y[0]);
          for (var i8 = 1; i8 < NP - 1; i8++) { hx.quadraticCurveTo(st2.x[i8], st2.y[i8], (st2.x[i8] + st2.x[i8 + 1]) / 2, (st2.y[i8] + st2.y[i8 + 1]) / 2); }
          hx.lineTo(st2.x[NP - 1], st2.y[NP - 1]);
          hx.stroke();
        }
      }
      if (mode === 'hold' && A.webs !== false) {
        hx.strokeStyle = cssRgb(mixRgb(goo, shine, 0.03), 0.6);
        hx.lineWidth = 0.5;
        for (var wq = 0; wq < webs.length; wq++) {
          var wb = webs[wq];
          var As = list[wb[0]], Bs = list[wb[1]];
          if (!As || !Bs) { continue; }
          hx.beginPath();
          hx.moveTo(As.x[wb[2]], As.y[wb[2]]);
          hx.lineTo((As.x[wb[2]] + Bs.x[wb[3]]) / 2 + wb[4], (As.y[wb[2]] + Bs.y[wb[3]]) / 2 - Math.abs(wb[4]) * 0.4);
          hx.lineTo(Bs.x[wb[3]], Bs.y[wb[3]]);
          hx.stroke();
        }
      }
    }

    if (drawn && present) {
      hx.save();
      hx.translate(hand.x - shape.hot[0] * sc, hand.y - shape.hot[1] * sc);
      hx.scale(sc, sc);
      hx.save();
      hx.translate(2.5, 4.5);
      hx.fillStyle = 'rgba(0,0,0,0.15)';
      for (var sp2 = 0; sp2 < shape.shadow.length; sp2++) { hx.fill(shape.shadow[sp2]); }
      hx.restore();
      hx.fillStyle = '#ffffff';
      for (var fp = 0; fp < shape.fill.length; fp++) { hx.fill(shape.fill[fp]); }

      var coatOn = false;
      for (var c4 = 0; c4 < coat.length; c4++) { if (coat[c4] > 0.01) { coatOn = true; break; } }
      if (coatOn) {
        var skinHi = cssRgb(mixRgb(goo, shine, 0.33)), skinMid = cssRgb(mixRgb(goo, shine, 0.06)), skinLo = cssRgb(goo);
        hx.save();
        hx.clip(shape.clip);
        for (var g2 = 0; g2 < coat.length; g2++) {
          var c5 = coat[g2];
          if (c5 < 0.01) { continue; }
          var e3 = c5 * c5 * (3 - 2 * c5);
          var gx0 = shape.grips[g2][0], gy0 = shape.grips[g2][1];
          var cx0 = gx0 + (shape.creep[0] - gx0) * e3 * 0.35, cy0 = gy0 + (shape.creep[1] - gy0) * e3 * 0.35;
          var R2 = 2.4 + e3 * 7.5;
          hx.beginPath();
          for (var k4 = 0; k4 <= 28; k4++) {
            var a4 = (k4 / 28) * Math.PI * 2;
            var rr4 = R2 * (1 + 0.17 * Math.sin(4 * a4 + g2 * 1.7 + time * 2.2) + 0.08 * Math.sin(7 * a4 - time * 3.1 + g2));
            var xx = cx0 + Math.cos(a4) * rr4, yy = cy0 + Math.sin(a4) * rr4;
            if (k4 === 0) { hx.moveTo(xx, yy); } else { hx.lineTo(xx, yy); }
          }
          hx.closePath();
          var grad = hx.createRadialGradient(cx0 - R2 * 0.35, cy0 - R2 * 0.4, 0, cx0, cy0, R2 * 1.15);
          grad.addColorStop(0, skinHi);
          grad.addColorStop(0.28, skinMid);
          grad.addColorStop(1, skinLo);
          hx.fillStyle = grad;
          hx.fill();
        }
        hx.restore();
      }
      hx.strokeStyle = '#0b0b0b';
      hx.lineJoin = 'round';
      for (var stq2 = 0; stq2 < shape.stroke.length; stq2++) {
        hx.lineWidth = shape.stroke[stq2][1];
        hx.stroke(shape.stroke[stq2][0]);
      }
      hx.restore();
    }
    if (holding && list.length) {
      hx.lineCap = 'round';
      hx.lineJoin = 'round';
      hx.strokeStyle = cssRgb(mixRgb(goo, shine, 0.005));
      for (var h2 = 0; h2 < list.length; h2++) {
        var st3 = list[h2];
        var gp3 = gripAt(st3.grip);
        var gap = Math.hypot(st3.ex - gp3.x, st3.ey - gp3.y);
        var on = Math.max(0, Math.min(1, 1 - gap / 14));
        if (on <= 0) { continue; }
        var from = NP - 4;
        hx.globalAlpha = on;
        for (var i9 = from; i9 < NP - 1; i9++) {
          var f3 = i9 / (NP - 1);
          hx.lineWidth = Math.max(0.6, st3.width * (3.0 - 1.9 * f3) * thin * 2 * widthK) * (st3.hair ? 0.45 : 1);
          var x02 = i9 === from ? st3.x[i9] : (st3.x[i9 - 1] + st3.x[i9]) / 2, y02 = i9 === from ? st3.y[i9] : (st3.y[i9 - 1] + st3.y[i9]) / 2;
          var last = i9 === NP - 2;
          hx.beginPath();
          hx.moveTo(x02, y02);
          hx.quadraticCurveTo(st3.x[i9], st3.y[i9], last ? st3.x[NP - 1] : (st3.x[i9] + st3.x[i9 + 1]) / 2, last ? st3.y[NP - 1] : (st3.y[i9] + st3.y[i9 + 1]) / 2);
          hx.stroke();
        }
        hx.globalAlpha = 1;
      }
    }
  }

  function frame(now) {
    if (!alive) { return; }
    raf = requestAnimationFrame(frame);
    draw(now);
  }

  /* ---- teardown: the intro's finish() calls this through bnVenomStop ---- */
  function stop() {
    alive = false;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    ro.disconnect();
    stage.removeEventListener('pointermove', onMove);
    stage.removeEventListener('pointerdown', onDown);
    stage.removeEventListener('pointerleave', onLeave);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    btn.removeEventListener('keydown', onKeyDown);
    btn.removeEventListener('keyup', onKeyUp);
    btn.removeEventListener('blur', onKeyUp);
    cv.removeEventListener('webglcontextlost', onContextLost);
    stage.style.cursor = '';
    btn.style.cursor = '';
    btn.style.transform = '';
    stage.classList.remove('venom-live');
    disposeGL();
  }
  var ro = new ResizeObserver(function () { fit(); });
  ro.observe(stage);
  ro.observe(btn);
  function onContextLost(e) {
    e.preventDefault();
    stop();
  }
  cv.addEventListener('webglcontextlost', onContextLost);
  fit();
  raf = requestAnimationFrame(frame);
  window.bnVenomStop = stop;
})();
