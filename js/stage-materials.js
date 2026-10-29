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

/* transparent glass with a fresnel edge: reads as glass, renders in one pass.
   Coloured glass keeps its tint (base colour times attenuation colour); clear
   glass stays nearly invisible in the middle and catches light at the edges. */
function fakeGlass(src) {
  const atten = src.attenuationColor ? src.attenuationColor.clone() : new THREE.Color(1, 1, 1);
  const tint = src.color.clone().multiply(atten);
  const hsl = {}; tint.getHSL(hsl);
  const coloured = hsl.s > 0.25 && hsl.l < 0.75;
  if (coloured) {
    const m = new THREE.MeshPhysicalMaterial({
      color: tint, roughness: Math.min(0.35, src.roughness), metalness: 0,
      transparent: true, opacity: 0.62, depthWrite: false,
      clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.2
    });
    m.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
         float fres = pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 3.0);
         gl_FragColor.a = clamp(gl_FragColor.a + fres * 0.3, 0.0, 1.0);`
      );
    };
    return m;
  }
  /* clear glass: no body colour, only reflections added over what is behind,
     strongest at grazing angles. On a dark field that is how glass reads. */
  const m = new THREE.MeshPhysicalMaterial({
    color: 0x000000, roughness: 0.04, metalness: 0,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.8, specularIntensity: 1
  });
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
       float fres = pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 2.0);
       gl_FragColor.rgb *= 0.45 + fres * 1.6;`
    );
  };
  return m;
}
