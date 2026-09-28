import * as THREE from 'three';
import { cornerColor, makeGlove } from './materials.js';
import { impactTexture } from './textures.js';
import { clamp } from '../util/math.js';

// Punches in flight and what happens when they arrive.
//
// Fighters are far apart, so a punch travels to the other ring as a "shadow
// fist": it leaves the thrower's glove, flies along a path that tells you what
// it is — straight line, arc from the side (hook), rise from below (uppercut) —
// and lands exactly at the moment the defender's pose is judged. The flight is
// the reaction window; dodging it is the game.

const TRAIL = 3;

/** Color of a punch in flight, by the thrower's shop gloves. */
const GLOVE_COLOR = { violet: 0x6c2bd9, gold: 0xd9a92c, polka: 0xc92a24, legend: 0xf2c94c };

function ringTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 70, 128, 128, 126);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.55, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.7, 'rgba(255,255,255,1)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  return t;
}

export class Fx {
  constructor(scene) {
    this.scene = scene;
    this.flying = [];
    this.bursts = [];
    this.drops = [];
    this.shake = 0;
    this.redFlash = 0;
    this.impactMap = impactTexture();
    this.cuff = new THREE.MeshBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.8, depthWrite: false });
    this.dropGeo = new THREE.SphereGeometry(0.012, 6, 5);
    this.dropMat = new THREE.MeshBasicMaterial({ color: 0xdfe8f2, transparent: true, opacity: 0.8, depthWrite: false });
    this.goldMat = new THREE.MeshBasicMaterial({ color: 0xffcf4a, transparent: true, opacity: 0.95, depthWrite: false });
  }

  /**
   * @param {object} o
   * @param {string|number} o.id
   * @param {'jab'|'cross'|'hook'|'upper'} o.kind
   * @param {THREE.Vector3} o.from
   * @param {THREE.Vector3} o.to
   * @param {number} o.start  ms
   * @param {number} o.end    ms — the moment of impact
   * @param {'red'|'blue'} o.corner
   * @param {number} [o.hookSide]  +1 / -1: which side a hook comes around from
   */
  launch({ id, kind, from, to, start, end, corner, hookSide = 1, glove = 'classic' }) {
    const color = GLOVE_COLOR[glove] ?? cornerColor(corner);
    const mats = [];
    const meshes = [];
    for (let i = 0; i <= TRAIL; i++) {
      const m = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.25,
        roughness: 0.4,
        transparent: true,
        opacity: i === 0 ? 0.92 : 0.28 - i * 0.07,
        depthWrite: i === 0,
      });
      const glove = makeGlove(m, i === 0 ? this.cuff : m);
      glove.scale.setScalar(i === 0 ? 1.15 : 1.1 - i * 0.08);
      glove.traverse((o) => (o.castShadow = false));
      glove.visible = false;
      this.scene.add(glove);
      mats.push(m);
      meshes.push(glove);
    }
    const mid = from.clone().lerp(to, 0.5);
    const ctrl =
      kind === 'hook'
        ? mid.clone().add(new THREE.Vector3(hookSide * 0.95, 0.05, 0))
        : kind === 'upper'
          ? mid.clone().add(new THREE.Vector3(0, -0.75, 0))
          : mid;
    this.flying.push({ id, kind, from: from.clone(), ctrl, to: to.clone(), start, end, meshes, mats, fate: null, fateAt: 0, legend: glove === 'legend' });
  }

  /** «Легенда»: a clean hit bursts into a golden shockwave. */
  legend(pos, now, scale = 1) {
    this.ringMap ??= ringTexture();
    for (const [delay, size] of [
      [0, 1.3],
      [90, 0.9],
    ]) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.ringMap, color: 0xf2c94c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.position.copy(pos);
      s.visible = false;
      this.scene.add(s);
      this.bursts.push({ s, start: now + delay, dur: 420, scale: size * scale, ring: true });
    }
    this.burst(pos, { scale: 0.8 * scale, now, tint: 0xffd873 });
    this.sweat(pos, now, 22, this.goldMat);
  }

  /** The impact was judged: hit / crit / blocked burst at the target, a miss flies past. */
  resolve(id, outcome, now, at = null) {
    const p = this.flying.find((f) => f.id === id);
    if (!p) return;
    p.fate = outcome;
    p.fateAt = now;
    const where = at ?? p.to;
    if ((outcome === 'hit' || outcome === 'crit') && p.legend) {
      this.legend(where, now, at ? 1 : 0.45);
      this.shake = Math.max(this.shake, 0.5);
    } else if (outcome === 'hit' || outcome === 'crit') {
      this.burst(where, { scale: outcome === 'crit' ? 0.75 : 0.5, now });
      this.sweat(where, now, outcome === 'crit' ? 16 : 10);
    } else if (outcome === 'blocked') {
      this.burst(where, { scale: 0.3, now, tint: 0x9fb6ff });
    }
  }

  /** Something hit the player: camera shake and a red edge flash. */
  hurt(amount) {
    this.shake = Math.max(this.shake, clamp(amount, 0, 1));
    this.redFlash = Math.max(this.redFlash, clamp(amount * 1.2, 0, 1));
  }

  burst(pos, { scale = 0.5, now = performance.now(), tint = 0xfff2d8 } = {}) {
    const mat = new THREE.SpriteMaterial({ map: this.impactMap, color: tint, transparent: true, depthWrite: false, rotation: Math.random() * Math.PI });
    const s = new THREE.Sprite(mat);
    s.position.copy(pos);
    this.scene.add(s);
    this.bursts.push({ s, start: now, dur: 170, scale });
  }

  sweat(pos, now, n = 10, mat = this.dropMat) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.dropGeo, mat);
      m.position.copy(pos);
      const v = new THREE.Vector3((Math.random() - 0.5) * 2.2, Math.random() * 1.6 + 0.4, (Math.random() - 0.5) * 1.6 - 0.4);
      this.scene.add(m);
      this.drops.push({ m, v, start: now, dur: 500 + Math.random() * 250 });
    }
  }

  update(now, dt) {
    this.shake *= Math.exp(-dt / 0.12);
    this.redFlash *= Math.exp(-dt / 0.25);

    for (let i = this.flying.length - 1; i >= 0; i--) {
      const p = this.flying[i];
      const span = Math.max(1, p.end - p.start);
      let u = (now - p.start) / span;
      const done = p.fate && (p.fate === 'slipped' || p.fate === 'ducked' ? now - p.fateAt > 220 : true);
      if (done || u > 1.6) {
        for (const m of p.meshes) this.scene.remove(m);
        for (const m of p.mats) m.dispose();
        this.flying.splice(i, 1);
        continue;
      }
      // Accelerate into the target, like a real punch.
      for (let k = 0; k < p.meshes.length; k++) {
        const uk = Math.max(0, u - k * 0.045);
        const e = Math.pow(Math.min(uk, 1), 1.6) + Math.max(0, uk - 1) * 1.6;
        const pos = bezier(p.from, p.ctrl, p.to, e);
        const ahead = bezier(p.from, p.ctrl, p.to, e + 0.02);
        const g = p.meshes[k];
        g.visible = uk > 0;
        g.position.copy(pos);
        g.lookAt(ahead);
        if (p.fate) p.mats[k].opacity *= 0.8;
      }
    }

    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      const k = (now - b.start) / b.dur;
      if (k < 0) continue;
      b.s.visible = true;
      if (b.ring) {
        if (k >= 1) {
          this.scene.remove(b.s);
          b.s.material.dispose();
          this.bursts.splice(i, 1);
          continue;
        }
        b.s.scale.setScalar(b.scale * (0.2 + 1.4 * Math.sqrt(k)));
        b.s.material.opacity = (1 - k) * 0.95;
        continue;
      }
      if (k >= 1) {
        this.scene.remove(b.s);
        b.s.material.dispose();
        this.bursts.splice(i, 1);
        continue;
      }
      b.s.scale.setScalar(b.scale * (0.4 + k));
      b.s.material.opacity = 1 - k * k;
    }

    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      if (now - d.start > d.dur) {
        this.scene.remove(d.m);
        this.drops.splice(i, 1);
        continue;
      }
      d.v.y -= 6 * dt;
      d.m.position.addScaledVector(d.v, dt);
    }
  }

  clear() {
    for (const p of this.flying) for (const m of p.meshes) this.scene.remove(m);
    for (const b of this.bursts) this.scene.remove(b.s);
    for (const d of this.drops) this.scene.remove(d.m);
    this.flying = [];
    this.bursts = [];
    this.drops = [];
  }
}

/** Quadratic Bézier, extrapolated linearly past t = 1 (a missed punch flies on). */
function bezier(a, c, b, t) {
  if (t > 1) {
    const end = bezier(a, c, b, 1);
    const tangent = b.clone().sub(c).normalize();
    return end.addScaledVector(tangent, (t - 1) * a.distanceTo(b));
  }
  const u = 1 - t;
  return new THREE.Vector3(
    u * u * a.x + 2 * u * t * c.x + t * t * b.x,
    u * u * a.y + 2 * u * t * c.y + t * t * b.y,
    u * u * a.z + 2 * u * t * c.z + t * t * b.z,
  );
}
