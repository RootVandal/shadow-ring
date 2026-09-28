import * as THREE from 'three';

export const COLORS = {
  ink: 0x0e0d0c,
  bone: 0xefe8da,
  red: 0xd8342c,
  blue: 0x2f5bd3,
  shadow: 0x17161a,
};

export const cornerColor = (corner) => (corner === 'red' ? COLORS.red : COLORS.blue);

/**
 * A standard material with a Fresnel rim: the fighter reads as a dark figure
 * cut out of the arena by a thin edge of its corner's color — "the shadow".
 */
export function rimMaterial({ color = COLORS.shadow, rim = COLORS.blue, strength = 0.9, power = 2.6, roughness = 0.62, ...rest } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, ...rest });
  const uniforms = {
    uRimColor: { value: new THREE.Color(rim) },
    uRimStrength: { value: strength },
    uRimPower: { value: power },
  };
  m.userData.rim = uniforms;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor;\nuniform float uRimStrength;\nuniform float uRimPower;')
      .replace(
        '#include <opaque_fragment>',
        'float rimF = 1.0 - saturate(dot(normalize(vViewPosition), normal));\noutgoingLight += uRimColor * pow(rimF, uRimPower) * uRimStrength;\n#include <opaque_fragment>',
      );
  };
  m.customProgramCacheKey = () => 'rim';
  return m;
}

export function gloveMaterial(corner) {
  return new THREE.MeshPhysicalMaterial({
    color: cornerColor(corner),
    roughness: 0.34,
    clearcoat: 0.7,
    clearcoatRoughness: 0.3,
  });
}

let gloveGeo = null;

/** A boxing glove: padded fist, cuff, thumb. Its +z is where the knuckles point. */
export function makeGlove(material, cuffMaterial) {
  gloveGeo ??= {
    fist: new THREE.SphereGeometry(0.078, 22, 16),
    thumb: new THREE.CapsuleGeometry(0.024, 0.05, 4, 10),
    cuff: new THREE.CylinderGeometry(0.056, 0.06, 0.08, 18),
  };
  const g = new THREE.Group();
  const fist = new THREE.Mesh(gloveGeo.fist, material);
  fist.scale.set(1, 0.94, 1.22);
  fist.position.z = 0.035;
  const thumb = new THREE.Mesh(gloveGeo.thumb, material);
  thumb.position.set(0.062, -0.012, 0.03);
  thumb.rotation.x = Math.PI / 2.3;
  const cuff = new THREE.Mesh(gloveGeo.cuff, cuffMaterial);
  cuff.rotation.x = Math.PI / 2;
  cuff.position.z = -0.06;
  g.add(fist, thumb, cuff);
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return g;
}
