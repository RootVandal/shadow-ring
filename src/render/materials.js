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

// ── Узоры ранговых перчаток (рисуются один раз на canvas) ───────────────

const texCache = new Map();

function canvasTex(key, draw, repeat = [2, 1]) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  draw(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  texCache.set(key, t);
  return t;
}

/** Предсказуемый «случай», чтобы узор был одинаковым у всех. */
function seeded(seed) {
  let a = seed;
  return () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Платина: светлый металл в мелкие соты. */
const hexTexture = () =>
  canvasTex('hex', (g) => {
    g.fillStyle = '#d7e2e0';
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#8fa9a4';
    g.lineWidth = 2;
    const r = 16;
    const w = Math.sqrt(3) * r;
    for (let row = -1; row < 12; row++) {
      for (let col = -1; col < 11; col++) {
        const cx = col * w + (row % 2 ? w / 2 : 0);
        const cy = row * r * 1.5;
        g.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = Math.PI / 6 + (k * Math.PI) / 3;
          g.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
        }
        g.closePath();
        g.stroke();
      }
    }
  });

/** Алмаз: грани из треугольников в голубых тонах. */
const facetTexture = () =>
  canvasTex('facet', (g) => {
    const rnd = seeded(7);
    const n = 8;
    const step = 256 / n;
    const shades = ['#bfefff', '#8fdcff', '#5cc2f2', '#e8fbff', '#79b8e8', '#a8e6ff'];
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const x0 = x * step;
        const y0 = y * step;
        for (const tri of [
          [x0, y0, x0 + step, y0, x0, y0 + step],
          [x0 + step, y0, x0 + step, y0 + step, x0, y0 + step],
        ]) {
          g.fillStyle = shades[Math.floor(rnd() * shades.length)];
          g.beginPath();
          g.moveTo(tri[0], tri[1]);
          g.lineTo(tri[2], tri[3]);
          g.lineTo(tri[4], tri[5]);
          g.fill();
        }
      }
    }
    g.strokeStyle = 'rgba(255,255,255,0.6)';
    g.lineWidth = 1.5;
    for (let i = 0; i <= n; i++) {
      g.beginPath();
      g.moveTo(i * step, 0);
      g.lineTo(i * step, 256);
      g.moveTo(0, i * step);
      g.lineTo(256, i * step);
      g.stroke();
    }
  });

/** Легенда: языки пламени на чёрном. dark=false — только пламя (для свечения). */
const flameTexture = (glow) =>
  canvasTex(glow ? 'flame-glow' : 'flame', (g) => {
    g.fillStyle = glow ? '#000' : '#140a06';
    g.fillRect(0, 0, 256, 256);
    const rnd = seeded(3);
    for (let i = 0; i < 14; i++) {
      const x = i * 20 + rnd() * 12 - 6;
      const h = 110 + rnd() * 120;
      const grd = g.createLinearGradient(0, 256, 0, 256 - h);
      grd.addColorStop(0, '#ffe14d');
      grd.addColorStop(0.35, '#ff8a1a');
      grd.addColorStop(0.75, '#d9290f');
      grd.addColorStop(1, 'rgba(120,0,0,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(x - 14, 256);
      g.quadraticCurveTo(x - 18 + rnd() * 10, 256 - h * 0.5, x + rnd() * 8 - 4, 256 - h);
      g.quadraticCurveTo(x + 18 - rnd() * 10, 256 - h * 0.45, x + 14, 256);
      g.fill();
    }
  }, [2, 1]);

/** Невозможный: ночное небо — туманности и звёзды. glow=true — только звёзды (для свечения). */
const cosmicTexture = (glow) =>
  canvasTex(glow ? 'cosmic-glow' : 'cosmic', (g) => {
    g.fillStyle = glow ? '#000' : '#0b0620';
    g.fillRect(0, 0, 256, 256);
    const rnd = seeded(11);
    if (!glow) {
      for (const [x, y, r, c] of [
        [70, 80, 90, 'rgba(160,60,255,0.45)'],
        [190, 170, 100, 'rgba(40,120,255,0.4)'],
        [200, 50, 60, 'rgba(255,60,180,0.35)'],
      ]) {
        const grd = g.createRadialGradient(x, y, 0, x, y, r);
        grd.addColorStop(0, c);
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grd;
        g.fillRect(0, 0, 256, 256);
      }
    }
    for (let i = 0; i < 140; i++) {
      const big = rnd() < 0.08;
      g.fillStyle = big ? '#fff' : `rgba(255,255,255,${0.4 + rnd() * 0.6})`;
      g.beginPath();
      g.arc(rnd() * 256, rnd() * 256, big ? 2.2 : 0.6 + rnd() * 0.9, 0, Math.PI * 2);
      g.fill();
    }
  });

// ── Трусы (game/shop.js → SHORTS) ──────────────────────────────────────
// Текстура оборачивается вокруг трусов-цилиндра: центр картинки (x = 256) — спереди.

function shortsTex(key, draw) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  draw(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.offset.x = 0.5; // середина картинки — на животе
  texCache.set(key, t);
  return t;
}

const SHORTS_DRAW = {
  // Кожа манекена, розовые стринги с кружевной кромкой.
  thong(g) {
    g.fillStyle = '#1d1e26';
    g.fillRect(0, 0, 512, 128);
    g.fillStyle = '#ff5fa8';
    g.fillRect(0, 0, 512, 16);
    g.beginPath();
    g.moveTo(206, 16);
    g.lineTo(306, 16);
    g.lineTo(262, 128);
    g.lineTo(250, 128);
    g.closePath();
    g.fill();
    g.fillStyle = '#ffd1e6';
    for (let x = 0; x < 512; x += 10) {
      g.beginPath();
      g.arc(x + 5, 16, 4, 0, Math.PI);
      g.fill();
    }
  },
  // Серые, со слоником спереди: голова, уши, хобот вниз.
  elephant(g) {
    g.fillStyle = '#8e97a3';
    g.fillRect(0, 0, 512, 128);
    g.fillStyle = '#6f7885';
    for (const x of [214, 298]) {
      g.beginPath();
      g.ellipse(x, 58, 30, 36, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#c3cad3';
    g.beginPath();
    g.arc(256, 52, 32, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#c3cad3';
    g.lineWidth = 16;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(256, 70);
    g.quadraticCurveTo(252, 110, 272, 118);
    g.stroke();
    g.fillStyle = '#20242c';
    for (const x of [244, 268]) {
      g.beginPath();
      g.arc(x, 46, 4.5, 0, Math.PI * 2);
      g.fill();
    }
  },
  // Леопард: пятна-розетки на охре.
  leopard(g) {
    g.fillStyle = '#d9a44a';
    g.fillRect(0, 0, 512, 128);
    let a = 5;
    const rnd = () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 70; i++) {
      const x = rnd() * 512;
      const y = rnd() * 128;
      const r = 7 + rnd() * 6;
      g.fillStyle = '#8a5a1c';
      g.beginPath();
      g.ellipse(x, y, r, r * 0.8, rnd() * 3, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#1b120a';
      g.lineWidth = 3.5;
      g.beginPath();
      g.ellipse(x, y, r, r * 0.8, rnd() * 3, 0.3, Math.PI * 1.6);
      g.stroke();
    }
  },
  // Чёрные с белой надписью I'LL WIN и красными лампасами.
  iwin(g) {
    g.fillStyle = '#141416';
    g.fillRect(0, 0, 512, 128);
    g.fillStyle = '#d8342c';
    for (const x of [120, 384]) g.fillRect(x - 6, 0, 12, 128);
    g.fillStyle = '#f5f1e8';
    g.font = '900 34px Arial Black, Impact, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText("I'LL WIN", 256, 66);
  },
  // Красные с белой надписью.
  supreme(g) {
    g.fillStyle = '#d0141e';
    g.fillRect(0, 0, 512, 128);
    g.fillStyle = '#fff';
    for (const x of [120, 384]) g.fillRect(x - 3, 0, 6, 128);
    g.font = 'italic 900 38px Futura, Arial Black, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('Supreme', 256, 66);
  },
};

/** Материал трусов; 'classic' — цвет угла. */
export function shortsMaterialFor(id, corner) {
  const draw = SHORTS_DRAW[id];
  if (!draw) return new THREE.MeshStandardMaterial({ color: cornerColor(corner), roughness: 0.5 });
  return new THREE.MeshStandardMaterial({ map: shortsTex(`shorts-${id}`, draw), roughness: id === 'supreme' ? 0.35 : 0.6 });
}

/** SONIC SPEED: синие молнии на тёмном. glow=true — только молнии (для свечения). */
const boltTexture = (glow) =>
  canvasTex(glow ? 'bolt-glow' : 'bolt', (g) => {
    g.fillStyle = glow ? '#000' : '#071a3a';
    g.fillRect(0, 0, 256, 256);
    const rnd = seeded(21);
    for (let i = 0; i < 9; i++) {
      let x = rnd() * 256;
      let y = -10;
      g.strokeStyle = i % 3 ? '#39b6ff' : '#bff1ff';
      g.lineWidth = i % 3 ? 3 : 5;
      g.shadowColor = '#4fd0ff';
      g.shadowBlur = glow ? 14 : 6;
      g.beginPath();
      g.moveTo(x, y);
      while (y < 266) {
        x += (rnd() - 0.5) * 50;
        y += 14 + rnd() * 22;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  }, [2, 1]);

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
    case 'onehit': {
      const m = rimMaterial({ color: 0x3a0606, rim: 0xff3b1f, strength: 1.8, power: 2, roughness: 0.28 });
      m.emissive = new THREE.Color(0x330300);
      return m;
    }
    case 'sonic':
      return phys({ map: boltTexture(false), emissive: 0xffffff, emissiveMap: boltTexture(true), emissiveIntensity: 1, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05 });
    // Перчатки за рейтинг (game/ranked.js).
    case 'r-silver':
      return phys({ color: 0xd6dbe2, metalness: 0.5, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08 });
    case 'r-gold':
      return phys({ color: 0xffc62e, metalness: 0.6, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08, emissive: 0x2a1a00 });
    case 'r-plat':
      return phys({ map: hexTexture(), metalness: 0.45, roughness: 0.22, clearcoat: 1, sheen: 0.6, sheenColor: 0xdffff8 });
    case 'r-diamond':
      return phys({ map: facetTexture(), roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.02, iridescence: 1, iridescenceIOR: 1.6, emissive: 0x0b2a3a });
    case 'r-legend':
      return phys({ map: flameTexture(false), emissive: 0xffffff, emissiveMap: flameTexture(true), emissiveIntensity: 0.55, roughness: 0.4 });
    case 'r-impossible':
      return phys({ map: cosmicTexture(false), emissive: 0xffffff, emissiveMap: cosmicTexture(true), emissiveIntensity: 0.9, roughness: 0.25, clearcoat: 1, iridescence: 0.6 });
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
