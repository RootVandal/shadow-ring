import * as THREE from 'three';
import { mulberry32 } from '../util/math.js';

// Everything in the arena is drawn procedurally — no image assets to load or license.

const DISPLAY = '"Dela Gothic One", "Arial Black", Impact, sans-serif';

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(c, { srgb = true, repeat = null } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}

/** The ring canvas: worn off-white cloth with the emblem in the middle. */
export function ringCanvasTexture() {
  const [c, g] = canvas(1024);
  const rnd = mulberry32(42);
  g.fillStyle = '#e6dece';
  g.fillRect(0, 0, 1024, 1024);
  // Cloth grain and scuffs from a thousand footsteps.
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(60,48,32,${rnd() * 0.05})`;
    g.fillRect(rnd() * 1024, rnd() * 1024, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  for (let i = 0; i < 26; i++) {
    const x = 120 + rnd() * 780;
    const y = 120 + rnd() * 780;
    const r = 30 + rnd() * 90;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(70,55,40,${0.05 + rnd() * 0.06})`);
    grd.addColorStop(1, 'rgba(70,55,40,0)');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Emblem.
  g.save();
  g.translate(512, 512);
  g.strokeStyle = 'rgba(20,18,16,0.38)';
  g.lineWidth = 5;
  g.beginPath();
  g.arc(0, 0, 250, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 2;
  g.beginPath();
  g.arc(0, 0, 232, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = 'rgba(20,18,16,0.72)';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `96px ${DISPLAY}`;
  g.fillText('БОЙ', 0, -78);
  g.font = `64px ${DISPLAY}`;
  g.fillText('С ТЕНЬЮ', 0, 12);
  g.fillStyle = 'rgba(216,52,44,0.85)';
  g.fillRect(-120, 70, 116, 12);
  g.fillStyle = 'rgba(47,91,211,0.85)';
  g.fillRect(4, 70, 116, 12);
  g.fillStyle = 'rgba(20,18,16,0.55)';
  g.font = '600 22px "Onest", "Segoe UI", sans-serif';
  g.fillText('SHADOW RING · ONLINE', 0, 122);
  g.restore();
  // The canvas edge, where it tucks under the ropes.
  g.strokeStyle = 'rgba(20,18,16,0.3)';
  g.lineWidth = 10;
  g.strokeRect(22, 22, 980, 980);
  return toTexture(c);
}

/** The skirt around the ring platform. */
export function apronTexture() {
  const [c, g] = canvas(1024, 128);
  g.fillStyle = '#141312';
  g.fillRect(0, 0, 1024, 128);
  g.fillStyle = '#b8342b';
  g.fillRect(0, 0, 1024, 6);
  g.fillStyle = 'rgba(239,232,218,0.82)';
  g.font = `54px ${DISPLAY}`;
  g.textBaseline = 'middle';
  g.fillText('БОЙ С ТЕНЬЮ', 40, 68);
  g.fillStyle = 'rgba(239,232,218,0.35)';
  g.font = '600 26px "Onest", "Segoe UI", sans-serif';
  g.fillText('КАМЕРА ВМЕСТО ДЖОЙСТИКА', 560, 68);
  return toTexture(c, { repeat: [1, 1] });
}

/** A soft round blob — camera flashes, haze, light pools. */
export function blobTexture() {
  const [c, g] = canvas(128);
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return toTexture(c, { srgb: false });
}

/** A jagged impact star, the classic "POW" shape without the letters. */
export function impactTexture() {
  const [c, g] = canvas(256);
  const rnd = mulberry32(9);
  g.translate(128, 128);
  const spikes = 14;
  g.beginPath();
  for (let i = 0; i <= spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? 100 + rnd() * 24 : 44 + rnd() * 14;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  g.fillStyle = 'rgba(255,245,220,1)';
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = 'rgba(255,200,120,0.9)';
  g.stroke();
  return toTexture(c);
}

/** Vertical gradient for the light-cone haze. */
export function coneTexture() {
  const [c, g] = canvas(64, 256);
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 256);
  return toTexture(c, { srgb: false });
}
