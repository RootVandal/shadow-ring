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

let polkaMap = null;

function polkaTexture() {
  if (polkaMap) return polkaMap;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#c92a24';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#f4efe4';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      g.beginPath();
      g.arc(x * 32 + (y % 2 ? 16 : 0), y * 32 + 16, 7, 0, Math.PI * 2);
      g.fill();
    }
  }
  polkaMap = new THREE.CanvasTexture(c);
  polkaMap.colorSpace = THREE.SRGBColorSpace;
  polkaMap.wrapS = polkaMap.wrapT = THREE.RepeatWrapping;
  polkaMap.repeat.set(2, 1);
  return polkaMap;
}

/** Shop gloves (game/shop.js); 'classic' takes the corner's color. */
export function gloveMaterialFor(id, corner) {
  const phys = (o) => new THREE.MeshPhysicalMaterial({ roughness: 0.34, clearcoat: 0.7, clearcoatRoughness: 0.3, ...o });
  switch (id) {
    case 'violet':
      return phys({ color: 0x6c2bd9, clearcoat: 1, clearcoatRoughness: 0.15 });
    case 'gold':
      return phys({ color: 0xe0b23a, metalness: 0.55, roughness: 0.25, clearcoat: 1 });
    case 'polka':
      return phys({ map: polkaTexture() });
    case 'legend': {
      const m = rimMaterial({ color: 0x111014, rim: 0xf2c94c, strength: 1.6, power: 2.2, roughness: 0.3 });
      m.emissive = new THREE.Color(0x2a1d00);
      return m;
    }
    default:
      return gloveMaterial(corner);
  }
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
