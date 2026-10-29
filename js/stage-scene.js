/* The hero product stage: podium, six products, lights, contact shadows and
   the camera fit. Shared by the live hero (js/hero-stage.js) and the poster
   renderer (tools/poster.html) so both always show the same composition.

   EDIT: PRODUCTS below sets which model goes where. x is left/right, z is
   front/back (positive is closer), rotY is in degrees, scale is relative to
   real size, shelf is the shop shelf the chip asks about on WhatsApp. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { fixMaterials } from './stage-materials.js';

export const PODIUM = { radius: 1.4, height: 0.18, riserRadius: 0.6, riserHeight: 0.12 };

export const PRODUCTS = [
  { id: 'perfume',      file: 'perfume',      name: 'Perfume',     shelf: 'Personal Care', x: 0.12,  z: 0.0,   rotY: -20, scale: 1.5, riser: true, lead: true },
  { id: 'compact',      file: 'compact',      name: 'Compact',     shelf: 'Makeup',        x: -0.82, z: -0.5,  rotY: 28,  scale: 1.25 },
  { id: 'nail-polish',  file: 'nail-polish',  name: 'Nail polish', shelf: 'Makeup',        x: 1.02,  z: -0.36, rotY: -30, scale: 1.0 },
  { id: 'cream-jar',    file: 'cream-jar',    name: 'Cream jar',   shelf: 'Skincare',      x: -0.98, z: 0.42,  rotY: 0,   scale: 0.95 },
  { id: 'serum',        file: 'serum',        name: 'Serum',       shelf: 'Skincare',      x: -0.42, z: 0.78,  rotY: 18,  scale: 1.1 },
  { id: 'lipstick',     file: 'lipstick',     name: 'Lipstick',    shelf: 'Makeup',        x: 0.58,  z: 0.8,   rotY: 205, scale: 1.25 },
  { id: 'lipstick-cap', file: 'lipstick-cap', name: 'Lipstick',    shelf: 'Makeup',        x: 1.0,   z: 0.6,   rotY: 0,   scale: 1.25, chipOf: 'lipstick' }
];

export const CAMERA = { fov: 28, pitchDeg: 13, yawDeg: -8, padding: 0.08 };

/* one soft round shadow texture, reused under every object */
function shadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(18,6,8,0.72)');
  grd.addColorStop(0.45, 'rgba(18,6,8,0.38)');
  grd.addColorStop(1, 'rgba(18,6,8,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function shadowPlane(tex, w, d, opacity) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false, toneMapped: false })
  );
  m.renderOrder = 1;
  return m;
}

/* low round podium: ivory top, oak band, a fine gold line at the top edge */
function buildPodium(shadowTex) {
  const P = PODIUM, g = new THREE.Group();
  g.name = 'podium';
  const ivory = new THREE.MeshPhysicalMaterial({ color: '#FBF6F0', roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.3 });
  const oak = new THREE.MeshPhysicalMaterial({ color: '#D8B98E', roughness: 0.55, sheen: 0.3, sheenColor: new THREE.Color('#F2DCC0') });
  const gold = new THREE.MeshStandardMaterial({ color: '#C9A462', metalness: 1, roughness: 0.25 });
  const band = new THREE.LatheGeometry([
    new THREE.Vector2(0, 0), new THREE.Vector2(P.radius - 0.03, 0), new THREE.Vector2(P.radius, 0.03),
    new THREE.Vector2(P.radius, P.height - 0.03), new THREE.Vector2(P.radius - 0.004, P.height - 0.012), new THREE.Vector2(0, P.height - 0.012)
  ], 160);
  g.add(new THREE.Mesh(band, oak));
  const top = new THREE.CylinderGeometry(P.radius - 0.012, P.radius - 0.012, 0.012, 160).translate(0, P.height - 0.006, 0);
  g.add(new THREE.Mesh(top, ivory));
  const line = new THREE.LatheGeometry([
    new THREE.Vector2(P.radius - 0.012, P.height - 0.016), new THREE.Vector2(P.radius + 0.004, P.height - 0.016),
    new THREE.Vector2(P.radius + 0.004, P.height + 0.002), new THREE.Vector2(P.radius - 0.012, P.height + 0.002)
  ], 160);
  g.add(new THREE.Mesh(line, gold));
  /* the lead product stands on a small riser for height and focus */
  const riser = new THREE.LatheGeometry([
    new THREE.Vector2(0, 0), new THREE.Vector2(P.riserRadius, 0), new THREE.Vector2(P.riserRadius, P.riserHeight - 0.02),
    new THREE.Vector2(P.riserRadius - 0.02, P.riserHeight), new THREE.Vector2(0, P.riserHeight)
  ], 128);
  const riserMesh = new THREE.Mesh(riser, ivory);
  riserMesh.position.y = P.height;
  g.add(riserMesh);
  const riserLine = new THREE.Mesh(new THREE.CylinderGeometry(P.riserRadius + 0.003, P.riserRadius + 0.003, 0.012, 128).translate(0, P.height + 0.006, 0), gold);
  g.add(riserLine);
  const rs = shadowPlane(shadowTex, P.riserRadius * 2.5, P.riserRadius * 2.5, 0.5);
  rs.position.y = P.height + 0.002;
  g.add(rs);
  /* soft shade below the podium so it sits in the room, not in the void */
  const under = shadowPlane(shadowTex, P.radius * 2.9, P.radius * 1.3, 0.55);
  under.position.y = -0.01;
  g.add(under);
  return g;
}

export function createRenderer(canvas, { tier, alpha = true, preserve = false }) {
  const renderer = new THREE.WebGLRenderer({
    canvas, alpha, antialias: true, premultipliedAlpha: true,
    powerPreference: 'high-performance', preserveDrawingBuffer: preserve
  });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.debug.checkShaderErrors = false; /* skips a sync GPU read per shader; the shaders are stock */
  renderer.userData = { tier };
  return renderer;
}

/* Builds the whole scene. Resolves once every model is in place. */
export async function buildStage(renderer, { tier = 'high', base = './' } = {}) {
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environment = env;
  scene.environmentIntensity = 0.85;

  /* warm key from the upper left, cool pink rim from behind right, soft fill */
  const key = new THREE.DirectionalLight('#FFE6CF', 2.1);
  key.position.set(-3.2, 5.5, 4.2);
  const rim = new THREE.DirectionalLight('#FFB8C6', 1.7);
  rim.position.set(3.8, 2.6, -4.5);
  const fill = new THREE.HemisphereLight('#FFF4EC', '#3A1B22', 0.45);
  scene.add(key, rim, fill);

  const world = new THREE.Group();     /* drag and scroll rotate this */
  world.name = 'world';
  scene.add(world);
  const shadowTex = shadowTexture();
  const podium = buildPodium(shadowTex);
  world.add(podium);

  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const top = PODIUM.height;
  const items = await Promise.all(PRODUCTS.map(async (p) => {
    const gltf = await loader.loadAsync(base + 'models/' + p.file + '.glb');
    const model = gltf.scene;
    const holder = new THREE.Group();        /* placement */
    const lift = new THREE.Group();          /* hover lift and float */
    holder.name = p.id;
    holder.position.set(p.x, top + (p.riser ? PODIUM.riserHeight : 0), p.z);
    holder.rotation.y = THREE.MathUtils.degToRad(p.rotY);
    holder.scale.setScalar(p.scale);
    lift.add(model);
    holder.add(lift);
    world.add(holder);
    fixMaterials(model, { tier });
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const sh = shadowPlane(shadowTex, Math.max(size.x, size.z) * 1.9, Math.max(size.x, size.z) * 1.9, 0.62);
    sh.position.y = 0.003;
    holder.add(sh);
    model.traverse((o) => { if (o.isMesh) o.userData.productId = p.chipOf || p.id; });
    return { ...p, holder, lift, model, shadow: sh, height: size.y, home: holder.position.clone() };
  }));

  scene.updateMatrixWorld(true);
  /* fit points: every product's box corners plus the podium rim, top and bottom.
     The rim does not change under turntable rotation, so drag cannot push it out. */
  const points = [];
  for (const it of items) {
    const b = new THREE.Box3().setFromObject(it.model);
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) points.push(new THREE.Vector3(x, y, z));
  }
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    for (const y of [-0.01, PODIUM.height]) points.push(new THREE.Vector3(Math.cos(a) * (PODIUM.radius + 0.01), y, Math.sin(a) * (PODIUM.radius + 0.01)));
  }
  const box = new THREE.Box3().setFromPoints(points);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  return { scene, world, podium, items, sphere, points, center: sphere.center.clone(), env };
}

function place(camera, center, dist, yaw, pitch) {
  const yw = THREE.MathUtils.degToRad(CAMERA.yawDeg) + yaw;
  const pt = THREE.MathUtils.degToRad(CAMERA.pitchDeg) + pitch;
  camera.position.set(
    center.x + Math.sin(yw) * Math.cos(pt) * dist,
    center.y + Math.sin(pt) * dist,
    center.z + Math.cos(yw) * Math.cos(pt) * dist
  );
  camera.lookAt(center);
}

/* screen extents of the fit points, in px from the view centre (y up) */
function extents(camera, points, view) {
  camera.updateMatrixWorld(true);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const v = new THREE.Vector3();
  for (const p of points) {
    v.copy(p).project(camera);
    const x = v.x * view.w / 2, y = v.y * view.h / 2;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return { x0, x1, y0, y1, w: x1 - x0, h: y1 - y0 };
}

/* Fit the arrangement inside a region of the canvas (pixel rect) with padding
   on every side. Searches the camera distance at the resting pose, then slides
   the image with setViewOffset so the content centre lands on the region centre. */
export function computeFit(camera, stage, view, region) {
  const pad = CAMERA.padding;
  camera.aspect = view.w / view.h;
  camera.clearViewOffset();
  camera.near = 0.05; camera.far = 400;
  camera.updateProjectionMatrix();
  const maxW = region.w * (1 - 2 * pad), maxH = region.h * (1 - 2 * pad);
  let lo = stage.sphere.radius * 0.5, hi = stage.sphere.radius * 60;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    place(camera, stage.center, mid, 0, 0);
    const m = extents(camera, stage.points, view);
    if (m.w <= maxW && m.h <= maxH) hi = mid; else lo = mid;
  }
  place(camera, stage.center, hi, 0, 0);
  const e = extents(camera, stage.points, view);
  const cx = (e.x0 + e.x1) / 2, cy = (e.y0 + e.y1) / 2;
  return {
    dist: hi, extents: e,
    ox: view.w / 2 + cx - (region.x + region.w / 2),
    oy: view.h / 2 - cy - (region.y + region.h / 2)
  };
}

export function applyFit(camera, stage, view, fit, { yaw = 0, pitch = 0 } = {}) {
  place(camera, stage.center, fit.dist, yaw, pitch);
  camera.aspect = view.w / view.h;
  camera.near = Math.max(0.05, fit.dist - stage.sphere.radius * 2);
  camera.far = fit.dist + stage.sphere.radius * 2;
  camera.setViewOffset(view.w, view.h, fit.ox, fit.oy, view.w, view.h);
  camera.updateProjectionMatrix();
}
