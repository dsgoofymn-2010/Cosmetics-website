/* Builds the hero products as GLB files.
   Run: node tools/build-models.mjs
   Units: 1 = 10 cm, so a 12 cm perfume is 1.2 tall. Every model sits on y = 0.
   Geometry comes from Three.js generators (lathe profiles with filleted corners,
   bevelled extrusions); materials are glTF PBR with transmission, volume, IOR,
   clearcoat, sheen and specular extensions. Output is meshopt compressed. */
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Document, NodeIO } from '@gltf-transform/core';
import {
  ALL_EXTENSIONS, KHRMaterialsTransmission, KHRMaterialsVolume, KHRMaterialsIOR,
  KHRMaterialsClearcoat, KHRMaterialsSheen, KHRMaterialsSpecular, EXTMeshoptCompression
} from '@gltf-transform/extensions';
import { dedup, prune, quantize, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { deflateSync } from 'node:zlib';
import { mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = new URL('../models/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const SEG = 128;

/* ---------------- geometry helpers ---------------- */

/* Polyline of [x, y, radius]; every interior corner with a radius becomes an arc,
   so no profile has a hard edge unless asked for. */
function fillet(pts, steps = 8) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const [x, y, r = 0] = pts[i];
    if (i === 0 || i === pts.length - 1 || r <= 0) { out.push(new THREE.Vector2(x, y)); continue; }
    const P = new THREE.Vector2(x, y);
    const A = new THREE.Vector2(pts[i - 1][0], pts[i - 1][1]);
    const B = new THREE.Vector2(pts[i + 1][0], pts[i + 1][1]);
    const v1 = A.clone().sub(P), v2 = B.clone().sub(P);
    const l1 = v1.length(), l2 = v2.length();
    v1.normalize(); v2.normalize();
    const ang = Math.acos(THREE.MathUtils.clamp(v1.dot(v2), -1, 1));
    if (ang > Math.PI - 1e-4) { out.push(P); continue; }
    let t = r / Math.tan(ang / 2);
    t = Math.min(t, l1 * 0.5, l2 * 0.5);
    const rr = t * Math.tan(ang / 2);
    const T1 = P.clone().addScaledVector(v1, t);
    const T2 = P.clone().addScaledVector(v2, t);
    const bis = v1.clone().add(v2).normalize();
    const C = P.clone().addScaledVector(bis, rr / Math.sin(ang / 2));
    const a1 = Math.atan2(T1.y - C.y, T1.x - C.x);
    let d = Math.atan2(T2.y - C.y, T2.x - C.x) - a1;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    for (let k = 0; k <= steps; k++) {
      const a = a1 + d * (k / steps);
      out.push(new THREE.Vector2(C.x + Math.cos(a) * rr, C.y + Math.sin(a) * rr));
    }
  }
  return out;
}

function lathe(pts, segs = SEG, steps = 8) {
  return new THREE.LatheGeometry(fillet(pts, steps), segs);
}

/* faceted look: split every triangle so normals go flat */
function facet(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  return g;
}

/* smooth an extrusion: weld on position only, then rebuild normals and box UVs */
function smoothWeld(geo) {
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  const g = mergeVertices(geo, 1e-5);
  g.computeVertexNormals();
  boxUV(g);
  return g;
}

function boxUV(g) {
  g.computeBoundingBox();
  const b = g.boundingBox, s = new THREE.Vector3(); b.getSize(s);
  const p = g.attributes.position, n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = (p.getX(i) - b.min.x) / s.x; v = (p.getZ(i) - b.min.z) / s.z; }
    else if (ax >= az) { u = (p.getZ(i) - b.min.z) / s.z; v = (p.getY(i) - b.min.y) / s.y; }
    else { u = (p.getX(i) - b.min.x) / s.x; v = (p.getY(i) - b.min.y) / s.y; }
    uv[i * 2] = u; uv[i * 2 + 1] = v;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/* liquid depth cue: deeper tone at the bottom, lighter toward the surface */
function gradient(geo, bottomHex, topHex) {
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox, p = geo.attributes.position;
  const a = new THREE.Color(bottomHex), b = new THREE.Color(topHex), c = new THREE.Color();
  const col = new Float32Array(p.count * 4);
  for (let i = 0; i < p.count; i++) {
    const t = Math.pow((p.getY(i) - min.y) / (max.y - min.y || 1), 0.8);
    c.copy(a).lerp(b, t);
    col.set([c.r, c.g, c.b, 1], i * 4);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  return geo;
}

function roundedRectShape(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/* rounded box standing on y = 0. Cross-section w x d with corner radius r,
   height h, every edge bevelled by b. */
function roundedBox(w, d, h, r, b) {
  const shape = roundedRectShape(w - 2 * b, d - 2 * b, Math.max(0.001, r - b));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: h - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b,
    bevelSegments: 10, curveSegments: 40
  });
  g.rotateX(-Math.PI / 2);         /* extrusion axis becomes +y */
  g.translate(0, b, 0);
  return smoothWeld(g);
}

/* rounded slab facing the camera: front silhouette w x h with corner radius r,
   depth d, every edge bevelled by b. Stands on y = 0, centred in x and z. */
function frontBox(w, h, d, r, b) {
  const g = new THREE.ExtrudeGeometry(roundedRectShape(w - 2 * b, h - 2 * b, Math.max(0.001, r - b)), {
    depth: d - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b,
    bevelSegments: 10, curveSegments: 40
  });
  g.translate(0, h / 2, -(d - 2 * b) / 2);
  return smoothWeld(g);
}

/* ---------------- procedural textures ---------------- */

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/* pressed powder: concentric ridges plus a soft petal ripple, as a tangent-space normal map */
function powderNormalMap(size = 160) {
  const H = (u, v) => {
    const x = u * 2 - 1, y = v * 2 - 1, d = Math.hypot(x, y), a = Math.atan2(y, x);
    if (d > 0.98) return 0;
    const ring = Math.cos(d * Math.PI * 2 * 7 + Math.sin(a * 6) * 0.35 * d);
    const edge = (1 - THREE.MathUtils.smoothstep(d, 0.9, 0.98)) * THREE.MathUtils.smoothstep(d, 0.0, 0.12);
    return ring * edge;
  };
  const buf = Buffer.alloc(size * size * 3), e = 1 / size, k = 2.2;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const u = (i + 0.5) / size, v = (j + 0.5) / size;
    const dx = (H(u + e, v) - H(u - e, v)) * k, dy = (H(u, v + e) - H(u, v - e)) * k;
    const n = new THREE.Vector3(-dx, -dy, 1).normalize();
    const o = (j * size + i) * 3;
    buf[o] = Math.round((n.x * 0.5 + 0.5) * 255);
    buf[o + 1] = Math.round((n.y * 0.5 + 0.5) * 255);
    buf[o + 2] = Math.round((n.z * 0.5 + 0.5) * 255);
  }
  return png(size, size, buf);
}

/* ---------------- materials ---------------- */

const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; }; /* Color() converts sRGB hex to linear */

const M = {
  gold:      { color: '#C9A462', metal: 1, rough: 0.22 },
  goldSoft:  { color: '#C9A462', metal: 1, rough: 0.3 },
  mirror:    { color: '#F4F1EC', metal: 1, rough: 0.03 },
  glass:     { color: '#FFFFFF', rough: 0.04, transmission: 1, thickness: 0.6, ior: 1.5, atten: '#F6E7E1', attenDist: 2.4, spec: 1 },
  glassAmber:{ color: '#E9B07A', rough: 0.16, transmission: 1, thickness: 0.5, ior: 1.5, atten: '#A9561A', attenDist: 0.35, spec: 1 },
  glassFrost:{ color: '#FFFFFF', rough: 0.1, transmission: 1, thickness: 0.25, ior: 1.5, atten: '#EFE3D8', attenDist: 2, spec: 1 },
  glassClear:{ color: '#FFFFFF', rough: 0.03, transmission: 1, thickness: 0.5, ior: 1.5, atten: '#F7F2EE', attenDist: 3, spec: 1 },
  /* three.js cannot show a transmissive mesh inside another one, so the polish is
     a glossy opaque liquid seen through the clear transmissive bottle */
  polish:    { color: '#FFFFFF', rough: 0.08, clearcoat: 1, ccRough: 0.03 },
  roseLiquid:{ color: '#FFFFFF', rough: 0.02, clearcoat: 1, ccRough: 0.03 },
  amberLiquid:{ color: '#FFFFFF', rough: 0.3 },
  /* #B3262E brand red, set a touch deeper because ACES tone mapping lifts reds toward coral */
  bullet:    { color: '#A21F28', rough: 0.35, clearcoat: 0.6, ccRough: 0.2 },
  rubber:    { color: '#2A2523', rough: 0.6, sheen: 0.4, sheenColor: '#6E5A52', sheenRough: 0.5 },
  capBlack:  { color: '#141012', rough: 0.22, clearcoat: 1, ccRough: 0.06 },
  pipette:   { color: '#E9E2DA', rough: 0.06, clearcoat: 1, ccRough: 0.03 },
  cream:     { color: '#E9CDBB', rough: 0.55, sheen: 0.3, sheenColor: '#FFFFFF', sheenRough: 0.6 },
  powder:    { color: '#EBC9B6', rough: 0.85, sheen: 0.4, sheenColor: '#F7E4D8', sheenRough: 0.7, normalMap: 'powder' },
  brush:     { color: '#2A2523', rough: 0.45 }
};

function makeDoc() {
  const doc = new Document();
  doc.createBuffer();
  const ext = {
    tr: doc.createExtension(KHRMaterialsTransmission),
    vol: doc.createExtension(KHRMaterialsVolume),
    ior: doc.createExtension(KHRMaterialsIOR),
    cc: doc.createExtension(KHRMaterialsClearcoat),
    sh: doc.createExtension(KHRMaterialsSheen),
    sp: doc.createExtension(KHRMaterialsSpecular)
  };
  const cache = new Map();
  doc.mat = (key) => {
    if (cache.has(key)) return cache.get(key);
    const o = M[key];
    const m = doc.createMaterial(key)
      .setBaseColorFactor([...lin(o.color), 1])
      .setMetallicFactor(o.metal ?? 0)
      .setRoughnessFactor(o.rough ?? 0.5);
    if (o.transmission) {
      m.setExtension('KHR_materials_transmission', ext.tr.createTransmission().setTransmissionFactor(o.transmission));
      m.setExtension('KHR_materials_volume', ext.vol.createVolume()
        .setThicknessFactor(o.thickness).setAttenuationColor(lin(o.atten)).setAttenuationDistance(o.attenDist));
    }
    if (o.ior) m.setExtension('KHR_materials_ior', ext.ior.createIOR().setIOR(o.ior));
    if (o.spec) m.setExtension('KHR_materials_specular', ext.sp.createSpecular().setSpecularFactor(o.spec));
    if (o.clearcoat) m.setExtension('KHR_materials_clearcoat', ext.cc.createClearcoat()
      .setClearcoatFactor(o.clearcoat).setClearcoatRoughnessFactor(o.ccRough ?? 0.1));
    if (o.sheen) m.setExtension('KHR_materials_sheen', ext.sh.createSheen()
      .setSheenColorFactor(lin(o.sheenColor).map((v) => v * o.sheen)).setSheenRoughnessFactor(o.sheenRough ?? 0.5));
    if (o.normalMap === 'powder') {
      const tex = doc.createTexture('powder-normal').setMimeType('image/png').setImage(powderNormalMap());
      m.setNormalTexture(tex).setNormalScale(1);
    }
    /* compression rescales mesh space, so the viewer re-applies these in world units */
    if (o.transmission) m.setExtras({ thickness: o.thickness, attenuationDistance: o.attenDist });
    cache.set(key, m);
    return m;
  };
  return doc;
}

function addPart(doc, parent, name, geo, matKey) {
  const g = geo.index ? geo : (() => { const x = geo; const idx = []; for (let i = 0; i < x.attributes.position.count; i++) idx.push(i); x.setIndex(idx); return x; })();
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) boxUV(g);
  const buffer = doc.getRoot().listBuffers()[0];
  const acc = (arr, type) => doc.createAccessor().setArray(arr).setType(type).setBuffer(buffer);
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', acc(new Float32Array(g.attributes.position.array), 'VEC3'))
    .setAttribute('NORMAL', acc(new Float32Array(g.attributes.normal.array), 'VEC3'))
    .setAttribute('TEXCOORD_0', acc(new Float32Array(g.attributes.uv.array), 'VEC2'))
    .setIndices(acc(new Uint32Array(g.index.array), 'SCALAR'))
    .setMaterial(doc.mat(matKey));
  if (g.attributes.color) prim.setAttribute('COLOR_0', acc(new Float32Array(g.attributes.color.array), 'VEC4'));
  const mesh = doc.createMesh(name).addPrimitive(prim);
  parent.addChild(doc.createNode(name).setMesh(mesh));
}

/* ---------------- the products ---------------- */

/* 1. Perfume flacon, about 12.5 cm with cap */
function perfume() {
  const W = 0.74, D = 0.36, H = 0.78;
  const parts = [];
  parts.push(['glass-body', frontBox(W, H, D, 0.17, 0.05), 'glass']);
  /* liquid: visible inner volume above a thick glass base, about 70% full */
  parts.push(['liquid', gradient(frontBox(W - 0.1, H * 0.62, D - 0.09, 0.13, 0.035), '#A9554F', '#E9AFA3').translate(0, 0.09, 0), 'roseLiquid']);
  /* dip tube from the collar down into the liquid */
  parts.push(['dip-tube', new THREE.CylinderGeometry(0.011, 0.011, H - 0.17, 24).translate(0, 0.13 + (H - 0.17) / 2, 0), 'pipette']);
  /* gold collar; the spray actuator sits under the cap */
  parts.push(['collar', lathe([[0, H - 0.01], [0.13, H - 0.01, 0.01], [0.135, H + 0.05, 0.012], [0.1, H + 0.075, 0.01], [0, H + 0.075]]), 'gold']);
  /* faceted gold cap: eight facets with a chamfered crown, seated on the collar */
  const capBase = H + 0.06;
  parts.push(['cap', facet(lathe([[0, capBase], [0.19, capBase, 0.015], [0.205, capBase + 0.05], [0.205, capBase + 0.27], [0.165, capBase + 0.315], [0, capBase + 0.315]], 8, 1)), 'gold']);
  return parts;
}

/* 2. Lipstick, open: tube with ribbed rings, sleeve, slanted satin bullet */
function lipstick() {
  const R = 0.105, parts = [];
  const prof = [[0, 0], [R - 0.004, 0, 0.004], [R, 0.012, 0.004]];
  for (let y = 0.05; y < 0.3; y += 0.042) {
    prof.push([R, y, 0.003], [R - 0.008, y + 0.007, 0.003], [R - 0.008, y + 0.013, 0.003], [R, y + 0.02, 0.003]);
  }
  prof.push([R, 0.34, 0.006], [R - 0.012, 0.345, 0.003], [0, 0.345]);
  parts.push(['tube', lathe(prof, SEG, 4), 'gold']);
  parts.push(['sleeve', lathe([[0, 0.34], [0.092, 0.34], [0.092, 0.49, 0.004], [0.084, 0.495, 0.003], [0, 0.495]]), 'goldSoft']);
  /* bullet: rounded cylinder, then the top sheared into the classic slanted cut */
  const r = 0.078, h = 0.33, c = 0.016, base = 0.47, slope = 0.95;
  const bullet = lathe([[0, 0], [r, 0], [r, h, c], [0, h]], SEG, 10);
  const p = bullet.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y > h - c - 0.02 - 1e-6) {
      const x = p.getX(i);
      p.setY(i, y - slope * (x + r));
    }
  }
  bullet.deleteAttribute('normal');
  bullet.deleteAttribute('uv');
  const bw = mergeVertices(bullet, 1e-6);
  bw.computeVertexNormals();
  boxUV(bw);
  bw.translate(0, base, 0);
  parts.push(['bullet', bw, 'bullet']);
  return parts;
}

function lipstickCap() {
  const R = 0.113, H = 0.56;
  return [
    ['cap', lathe([[0, 0], [R, 0], [R, H - 0.03, 0.02], [R - 0.02, H, 0.02], [0, H]]), 'gold'],
    ['band', lathe([[0, 0.05], [R + 0.004, 0.05, 0.003], [R + 0.004, 0.075, 0.003], [0, 0.075]]), 'goldSoft']
  ];
}

/* 3. Serum dropper: frosted amber body, liquid, ribbed collar, bulb, pipette */
function serum() {
  const R = 0.17, H = 0.62, N = 0.075, parts = [];
  parts.push(['glass-body', lathe([[0, 0], [R, 0, 0.035], [R, H - 0.12, 0.09], [N, H - 0.03, 0.03], [N, H], [0, H]]), 'glassAmber']);
  parts.push(['liquid', gradient(lathe([[0, 0.06], [R - 0.03, 0.06, 0.02], [R - 0.03, 0.36], [0, 0.36]]), '#4A1C08', '#8A4416'), 'amberLiquid']);
  const cp = [[0, H - 0.01], [0.098, H - 0.01, 0.006]];
  for (let y = H + 0.005; y < H + 0.12; y += 0.018) cp.push([0.098, y, 0.002], [0.091, y + 0.006, 0.002], [0.098, y + 0.012, 0.002]);
  cp.push([0.098, H + 0.135, 0.008], [0.06, H + 0.14], [0, H + 0.14]);
  parts.push(['collar', lathe(cp, SEG, 3), 'gold']);
  const B = H + 0.14;
  parts.push(['bulb', lathe([[0, B], [0.064, B, 0.01], [0.064, B + 0.07, 0.03], [0.07, B + 0.16, 0.06], [0.055, B + 0.27, 0.05], [0, B + 0.29]], SEG, 10), 'rubber']);
  /* glass pipette, with its tapered tip inside the liquid */
  parts.push(['pipette', lathe([[0, 0.1], [0.008, 0.11], [0.02, 0.2, 0.01], [0.02, H + 0.02], [0, H + 0.02]], 48), 'pipette']);
  return parts;
}

/* 4. Powder compact, open: lid hinged at about 110 degrees, mirror inside, embossed pan */
function compact() {
  const R = 0.4, Hb = 0.085, Rin = 0.33, parts = [];
  parts.push(['base', lathe([[0, 0], [R - 0.02, 0, 0.012], [R, 0.02, 0.012], [R, Hb, 0.012], [Rin + 0.02, Hb, 0.006], [Rin, Hb - 0.012], [0, Hb - 0.012]]), 'gold']);
  const pan = new THREE.CylinderGeometry(Rin - 0.006, Rin - 0.006, 0.02, SEG, 1);
  pan.translate(0, Hb - 0.02, 0);
  parts.push(['powder', pan, 'powder']);
  /* lid built closed on top of the base, then swung open about the hinge axis */
  const Hl = 0.05;
  const lid = lathe([[0, Hb], [R - 0.004, Hb, 0.006], [R, Hb + 0.01, 0.01], [R, Hb + Hl - 0.012, 0.02], [R - 0.05, Hb + Hl, 0.03], [0, Hb + Hl]]);
  const mirror = new THREE.CircleGeometry(Rin - 0.004, SEG).rotateX(Math.PI / 2).translate(0, Hb - 0.003, 0);
  /* rim is a ring around the mirror, not a disc over it */
  const rim = lathe([[Rin - 0.006, Hb + 0.001], [Rin - 0.006, Hb - 0.006, 0.002], [Rin + 0.026, Hb - 0.006, 0.003], [Rin + 0.026, Hb + 0.001]]);
  const open = new THREE.Matrix4()
    .makeTranslation(0, Hb, -R)
    .multiply(new THREE.Matrix4().makeRotationX(THREE.MathUtils.degToRad(-110)))
    .multiply(new THREE.Matrix4().makeTranslation(0, -Hb, R));
  parts.push(['lid', lid.applyMatrix4(open), 'gold']);
  parts.push(['mirror-rim', rim.applyMatrix4(open), 'goldSoft']);
  parts.push(['mirror', mirror.applyMatrix4(open), 'mirror']);
  parts.push(['hinge', new THREE.CylinderGeometry(0.022, 0.022, 0.16, 32).rotateZ(Math.PI / 2).translate(0, Hb, -R - 0.006), 'goldSoft']);
  return parts;
}

/* 5. Nail polish: square glass bottle, deep red transmissive liquid, faceted black cap, brush */
function nailPolish() {
  const S = 0.36, H = 0.4, parts = [];
  parts.push(['glass-body', roundedBox(S, S, H, 0.07, 0.035), 'glassClear']);
  parts.push(['liquid', gradient(roundedBox(S - 0.07, S - 0.07, H * 0.72, 0.05, 0.02), '#4E0810', '#8E1420').translate(0, 0.045, 0), 'polish']);
  parts.push(['neck', lathe([[0, H - 0.01], [0.075, H - 0.01], [0.075, H + 0.05, 0.006], [0, H + 0.05]], 64), 'capBlack']);
  parts.push(['cap', facet(lathe([[0, H + 0.04], [0.1, H + 0.04, 0.006], [0.1, H + 0.34], [0.085, H + 0.37], [0, H + 0.37]], 8, 1)), 'capBlack']);
  parts.push(['brush-stem', new THREE.CylinderGeometry(0.01, 0.01, 0.3, 20).translate(0, 0.25, 0), 'brush']);
  parts.push(['brush-tip', lathe([[0, 0.05], [0.004, 0.05], [0.022, 0.09, 0.01], [0.02, 0.12], [0, 0.12]], 32), 'brush']);
  return parts;
}

/* 6. Cream jar: thick frosted glass, visible heavy base, gold lid */
function creamJar() {
  const R = 0.42, H = 0.29, parts = [];
  parts.push(['glass-body', lathe([[0, 0], [R - 0.01, 0, 0.03], [R, H - 0.03, 0.03], [R - 0.035, H], [0, H]]), 'glassFrost']);
  parts.push(['cream', lathe([[0, 0.12], [R - 0.06, 0.12, 0.02], [R - 0.06, H - 0.015], [0, H - 0.015]]), 'cream']);
  parts.push(['lid', lathe([[0, H - 0.005], [R + 0.012, H - 0.005, 0.006], [R + 0.012, H + 0.12, 0.03], [R - 0.06, H + 0.135, 0.06], [0, H + 0.135]]), 'gold']);
  return parts;
}

const PRODUCTS = {
  perfume, lipstick, 'lipstick-cap': lipstickCap, serum, compact, 'nail-polish': nailPolish, 'cream-jar': creamJar
};

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder
});
await MeshoptEncoder.ready;

let total = 0;
for (const [name, build] of Object.entries(PRODUCTS)) {
  const doc = makeDoc();
  const scene = doc.createScene(name);
  const root = doc.createNode(name);
  scene.addChild(root);
  for (const [part, geo, mat] of build()) addPart(doc, root, part, geo, mat);
  await doc.transform(dedup(), prune(), quantize({ quantizeNormal: 12, quantizePosition: 16, quantizeTexcoord: 12 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const file = fileURLToPath(new URL(name + '.glb', OUT));
  await io.write(file, doc);
  const kb = statSync(file).size / 1024;
  total += kb;
  console.log(name.padEnd(14), kb.toFixed(1).padStart(7), 'KB');
}
console.log('total'.padEnd(14), total.toFixed(1).padStart(7), 'KB');
