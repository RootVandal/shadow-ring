import { GUARD, LOW, BLOCK, VICTORY, PUNCH_POSES, mirror } from './poses.js';
import { clamp, expAlpha, lerp, smooth01 } from '../util/math.js';

// Procedural animation for the Shadow (and for the coach's demos). Layers, in
// order: stance (guard ↔ low, breathing, bounce) → arm actions (load, strike,
// return) → defense (slip / duck / block) → hit reaction → KO or celebration.
// The output is the same JointSet a remote player's pose arrives as, so one
// avatar renders both.

const KEYS = Object.keys(GUARD);
const ARM_KEYS = { l: ['lEl', 'lWr', 'lIdx', 'lSh', 'rSh', 'nose'], r: ['rEl', 'rWr', 'rIdx', 'rSh', 'lSh', 'nose'] };
const easeOut = (u) => 1 - (1 - u) * (1 - u);

function envelope(tau, dur, attack = 0.12, release = 0.22) {
  if (tau < 0 || tau > dur) return 0;
  if (tau < attack) return easeOut(tau / attack);
  if (tau > dur - release) return smooth01((dur - tau) / release);
  return 1;
}

function rotateZ(p, a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c, z: p.z };
}

function rotateX(p, b) {
  const c = Math.cos(b);
  const s = Math.sin(b);
  return { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c };
}

export class PoseAnimator {
  constructor() {
    this.reset();
  }

  reset() {
    this.t = 0;
    this.guardLevel = 1;
    this.guardTarget = 1;
    this.arms = { l: null, r: null };
    this.dodge = null;
    this.hitAmt = 0;
    this.hitLean = 0;
    this.flash = 0;
    this.koStart = null;
    this.celebrateStart = null;
  }

  /** kind: jab | cross | hook | upper; side: 'left' | 'right' (the fighter's own). */
  punch(kind, side, windupMs = 300) {
    const type = kind === 'jab' || kind === 'cross' ? 'straight' : kind;
    const s = side === 'right' ? 'r' : 'l';
    const poses = PUNCH_POSES[type];
    const wind = s === 'l' ? poses.wind : mirror(poses.wind);
    const hit = s === 'l' ? poses.hit : mirror(poses.hit);
    const w = windupMs / 1000;
    const strike = type === 'straight' ? 0.11 : 0.15;
    this.arms[s] = {
      start: this.t,
      frames: [
        [0, null],
        [w, wind],
        [w + strike, hit],
        [w + strike + 0.1, hit],
        [w + strike + 0.36, null],
      ],
    };
  }

  slip(dir) {
    this.dodge = { kind: 'slip', dir: dir < 0 ? -1 : 1, start: this.t, dur: 0.6 };
  }

  duck() {
    this.dodge = { kind: 'duck', start: this.t, dur: 0.65 };
  }

  block() {
    this.dodge = { kind: 'block', start: this.t, dur: 0.75 };
  }

  blocked() {
    this.block();
    this.flash = Math.max(this.flash, 0.35);
  }

  /** A landed punch: the head snaps back (hooks also twist it sideways). */
  hit(strength = 0.6, attack = null) {
    this.hitAmt = Math.min(1.2, this.hitAmt + strength);
    this.hitLean = attack?.kind === 'hook' ? (attack.side === 'left' ? 1 : -1) * 0.8 : (Math.random() - 0.5) * 0.4;
    this.flash = 1;
    this.arms.l = this.arms.r = null;
  }

  setGuard(level) {
    this.guardTarget = clamp(level, 0, 1);
  }

  knockout() {
    this.koStart = this.t;
  }

  celebrate() {
    this.celebrateStart = this.t;
  }

  /**
   * @returns {{joints: object, drop: number, lateral: number, fall: number, flash: number}}
   */
  update(dt) {
    this.t += dt;
    const t = this.t;
    this.guardLevel += (this.guardTarget - this.guardLevel) * expAlpha(dt, 0.15);
    this.hitAmt *= Math.exp(-dt / 0.2);
    this.flash *= Math.exp(-dt / 0.12);

    // Stance.
    const j = {};
    const low = 1 - this.guardLevel;
    for (const k of KEYS) {
      const g = GUARD[k];
      const l = LOW[k] ?? g;
      j[k] = { x: lerp(g.x, l.x, low), y: lerp(g.y, l.y, low), z: lerp(g.z, l.z, low) };
    }

    // Arm actions.
    for (const s of ['l', 'r']) {
      const a = this.arms[s];
      if (!a) continue;
      const tau = t - a.start;
      const f = a.frames;
      if (tau >= f[f.length - 1][0]) {
        this.arms[s] = null;
        continue;
      }
      let i = 1;
      while (i < f.length - 1 && tau > f[i][0]) i++;
      const [t0, p0] = f[i - 1];
      const [t1, p1] = f[i];
      const u = t1 > t0 ? clamp((tau - t0) / (t1 - t0), 0, 1) : 1;
      const eased = i === 2 ? easeOut(u) : smooth01(u);
      for (const k of ARM_KEYS[s]) {
        const a0 = p0?.[k] ?? j[k];
        const a1 = p1?.[k] ?? j[k];
        if (a0 === j[k] && a1 === j[k]) continue;
        j[k] = { x: lerp(a0.x, a1.x, eased), y: lerp(a0.y, a1.y, eased), z: lerp(a0.z, a1.z, eased) };
      }
    }

    // Defense.
    let lean = 0.022 * Math.sin(t * 1.1);
    let tilt = 0;
    let drop = 0.012 * (0.5 + 0.5 * Math.sin(t * 6.2));
    let lateral = 0.025 * Math.sin(t * 0.8);
    const d = this.dodge;
    if (d) {
      const e = envelope(t - d.start, d.dur);
      if (t - d.start > d.dur) this.dodge = null;
      if (d.kind === 'slip') {
        lean += d.dir * 0.34 * e;
        lateral += d.dir * 0.12 * e;
      } else if (d.kind === 'duck') {
        drop += 0.3 * e;
        tilt += 0.28 * e;
      } else if (d.kind === 'block') {
        for (const [k, p] of Object.entries(BLOCK)) j[k] = { x: lerp(j[k].x, p.x, e), y: lerp(j[k].y, p.y, e), z: lerp(j[k].z, p.z, e) };
      }
    }

    // Hit reaction: head and shoulders snap back.
    tilt -= 0.3 * this.hitAmt;
    lean += this.hitLean * 0.3 * this.hitAmt;

    // KO / celebration override the rest.
    let fall = 0;
    if (this.koStart !== null) {
      const k = clamp((t - this.koStart) / 0.9, 0, 1);
      fall = k * k;
      for (const [key, p] of Object.entries(LOW)) j[key] = { x: lerp(j[key].x, p.x * 1.6, k), y: lerp(j[key].y, p.y, k), z: lerp(j[key].z, p.z, k) };
      tilt -= 0.35 * k;
    } else if (this.celebrateStart !== null) {
      const k = smooth01(clamp((t - this.celebrateStart) / 0.5, 0, 1));
      for (const [key, p] of Object.entries(VICTORY)) j[key] = { x: lerp(j[key].x, p.x, k), y: lerp(j[key].y, p.y + 0.03 * Math.sin(t * 9), k), z: lerp(j[key].z, p.z, k) };
    }

    if (lean || tilt) {
      for (const k of KEYS) {
        if (k === 'lHip' || k === 'rHip') continue;
        j[k] = rotateX(rotateZ(j[k], -lean), tilt);
      }
    }
    return { joints: j, drop, lateral, fall, flash: this.flash };
  }
}
