/* Shared material setup for the product models (hero stage and previews).
   The GLBs carry the PBR values; this restores glass thickness in world units
   (mesh compression rescales local space) and swaps in cheap glass on the
   mobile tier, where real transmission costs an extra full scene pass. */
import * as THREE from 'three';

export function fixMaterials(root, { tier = 'high' } = {}) {
  root.updateMatrixWorld(true);
  const s = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    o.castShadow = false;
    o.receiveShadow = false;
    if (m.transmission > 0) {
      const want = m.userData || {};
      if (tier === 'low') {
        o.material = fakeGlass(m);
        m.dispose();
        return;
      }
      o.getWorldScale(s);
      const k = (s.x + s.y + s.z) / 3 || 1;
      if (want.thickness) m.thickness = want.thickness / k;
      if (want.attenuationDistance) m.attenuationDistance = want.attenuationDistance / k;
      m.specularIntensity = 1;
      m.envMapIntensity = 1.15;
    } else if (m.metalness > 0.9) {
      m.envMapIntensity = 1.25;
    }
  });
}

/* transparent glass with a fresnel edge: reads as glass, renders in one pass */
function fakeGlass(src) {
  const tint = src.attenuationColor ? src.attenuationColor.clone() : new THREE.Color(1, 1, 1);
  const dense = (src.userData && src.userData.attenuationDistance) < 0.2;
  const m = new THREE.MeshPhysicalMaterial({
    color: dense ? tint.clone().multiplyScalar(1.4) : tint.clone().lerp(new THREE.Color(1, 1, 1), 0.55),
    roughness: Math.min(0.5, src.roughness),
    metalness: 0,
    transparent: true,
    opacity: dense ? 0.92 : 0.32,
    depthWrite: false,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.4,
    side: THREE.FrontSide
  });
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
       float fres = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 2.5);
       gl_FragColor.a = clamp(gl_FragColor.a + fres * 0.55, 0.0, 1.0);`
    );
  };
  return m;
}
