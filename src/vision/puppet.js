import { LANDMARK_COUNT, LM } from './landmarks.js';
import { clamp, expAlpha, mulberry32, smooth01 } from '../util/math.js';

// A forward-kinematic stand-in for a person in front of a webcam. It produces
// MediaPipe-shaped landmarks (image + world), so the whole motion pipeline can be
// driven without a camera: unit tests replay scripted punches through it, and
// ?input=puppet lets you play the game from the keyboard.
//
// Body frame: origin at the hip center, x → the person's LEFT (the image's right),
// y down, z away from the camera. Meters, like MediaPipe world landmarks.

const v = (x, y, z) => ({ x, y, z });

// Keyframes for the LEFT arm; the right arm mirrors x.
// el / wr are elbow and wrist, idx / pky / thb are hand points relative to the wrist.
const KEYS = {
  guard: { el: v(0.2, -0.29, -0.2), wr: v(0.1, -0.56, -0.2), idx: v(-0.03, -0.07, -0.03), pky: v(0.03, -0.065, -0.02), thb: v(-0.035, -0.04, -0.05) },
  low: { el: v(0.23, -0.22, -0.02), wr: v(0.25, 0.04, -0.06), idx: v(0, 0.08, -0.02), pky: v(0.03, 0.075, 0), thb: v(-0.02, 0.05, -0.03) },
  cursor: { el: v(0.4, -0.66, -0.1), wr: v(0.42, -0.94, -0.14), idx: v(0, -0.08, -0.02), pky: v(0.03, -0.07, 0), thb: v(-0.03, -0.05, -0.02) },
  jab: { el: v(0.13, -0.53, -0.3), wr: v(0.06, -0.57, -0.57), idx: v(-0.035, 0, -0.07), pky: v(0.03, 0.01, -0.065), thb: v(-0.04, -0.02, -0.04) },
  hookLoad: { el: v(0.43, -0.46, -0.13), wr: v(0.38, -0.56, -0.4), idx: v(-0.02, -0.02, -0.07), pky: v(0.02, 0.02, -0.07), thb: v(-0.03, -0.04, -0.04) },
  hookEnd: { el: v(0.3, -0.48, -0.25), wr: v(0.03, -0.55, -0.35), idx: v(-0.07, -0.01, -0.02), pky: v(-0.06, 0.03, 0.02), thb: v(-0.05, -0.03, -0.03) },
  swingLoad: { el: v(0.45, -0.5, -0.1), wr: v(0.66, -0.52, -0.28), idx: v(0.06, 0, -0.04), pky: v(0.05, 0.03, 0), thb: v(0.03, -0.03, -0.04) },
  swingEnd: { el: v(0.08, -0.5, -0.27), wr: v(-0.1, -0.52, -0.46), idx: v(-0.06, 0, -0.04), pky: v(-0.05, 0.03, 0), thb: v(-0.04, -0.03, -0.03) },
  hookLowLoad: { el: v(0.24, -0.22, -0.12), wr: v(0.4, -0.4, -0.3), idx: v(0.02, -0.04, -0.06), pky: v(0.04, 0, -0.05), thb: v(0, -0.05, -0.04) },
  hookLowEnd: { el: v(0.2, -0.28, -0.2), wr: v(-0.02, -0.46, -0.32), idx: v(-0.07, -0.02, -0.02), pky: v(-0.06, 0.02, 0.02), thb: v(-0.05, -0.04, -0.03) },
  upperLoad: { el: v(0.22, -0.22, -0.1), wr: v(0.12, -0.3, -0.35), idx: v(-0.02, -0.06, -0.04), pky: v(0.02, -0.06, -0.02), thb: v(-0.03, -0.03, -0.05) },
  upperEnd: { el: v(0.16, -0.36, -0.26), wr: v(0.06, -0.66, -0.3), idx: v(-0.02, -0.07, -0.02), pky: v(0.03, -0.065, -0.01), thb: v(-0.035, -0.04, -0.04) },
  upperStraight: { el: v(0.3, -0.7, -0.12), wr: v(0.36, -0.95, -0.2), idx: v(0.01, -0.08, -0.02), pky: v(0.04, -0.07, 0), thb: v(-0.02, -0.06, -0.03) },
};
KEYS.jabShort = blendKey(KEYS.guard, KEYS.jab, 0.45);
// Low punches (to the body).
KEYS.jabBody = { el: v(0.14, -0.36, -0.26), wr: v(0.07, -0.3, -0.52), idx: v(-0.035, 0.01, -0.07), pky: v(0.03, 0.02, -0.065), thb: v(-0.04, -0.01, -0.04) };
KEYS.hookBodyLoad = { el: v(0.4, -0.3, -0.13), wr: v(0.36, -0.32, -0.4), idx: v(-0.02, -0.02, -0.07), pky: v(0.02, 0.02, -0.07), thb: v(-0.03, -0.04, -0.04) };
KEYS.hookBodyEnd = { el: v(0.28, -0.32, -0.25), wr: v(0.03, -0.3, -0.35), idx: v(-0.07, -0.01, -0.02), pky: v(-0.06, 0.03, 0.02), thb: v(-0.05, -0.03, -0.03) };

/** Scripted arm motions: [time s, key]. "guard" is replaced by the arm's base pose. */
export const CLIPS = {
  jab: [[0, 'guard'], [0.17, 'jab'], [0.24, 'jab'], [0.46, 'guard']],
  jabShort: [[0, 'guard'], [0.13, 'jabShort'], [0.2, 'jabShort'], [0.38, 'guard']],
  jabBody: [[0, 'guard'], [0.18, 'jabBody'], [0.25, 'jabBody'], [0.48, 'guard']],
  hookBody: [[0, 'guard'], [0.13, 'hookBodyLoad'], [0.31, 'hookBodyEnd'], [0.37, 'hookBodyEnd'], [0.6, 'guard']],
  noReturn: [[0, 'guard'], [0.17, 'jab'], [2.2, 'jab'], [2.5, 'guard']],
  hook: [[0, 'guard'], [0.13, 'hookLoad'], [0.31, 'hookEnd'], [0.37, 'hookEnd'], [0.6, 'guard']],
  swing: [[0, 'guard'], [0.16, 'swingLoad'], [0.36, 'swingEnd'], [0.42, 'swingEnd'], [0.66, 'guard']],
  hookLow: [[0, 'guard'], [0.13, 'hookLowLoad'], [0.31, 'hookLowEnd'], [0.37, 'hookLowEnd'], [0.6, 'guard']],
  upper: [[0, 'guard'], [0.14, 'upperLoad'], [0.3, 'upperEnd'], [0.36, 'upperEnd'], [0.6, 'guard']],
  upperStraight: [[0, 'guard'], [0.14, 'upperLoad'], [0.32, 'upperStraight'], [0.38, 'upperStraight'], [0.62, 'guard']],
};

const SHOULDER = v(0.19, -0.5, 0);
const HEAD = {
  [LM.NOSE]: v(0, -0.72, -0.1),
  [LM.L_EYE_IN]: v(0.015, -0.75, -0.09), [LM.L_EYE]: v(0.035, -0.755, -0.085), [LM.L_EYE_OUT]: v(0.05, -0.75, -0.075),
  [LM.R_EYE_IN]: v(-0.015, -0.75, -0.09), [LM.R_EYE]: v(-0.035, -0.755, -0.085), [LM.R_EYE_OUT]: v(-0.05, -0.75, -0.075),
  [LM.L_EAR]: v(0.075, -0.73, 0), [LM.R_EAR]: v(-0.075, -0.73, 0),
  [LM.L_MOUTH]: v(0.025, -0.67, -0.085), [LM.R_MOUTH]: v(-0.025, -0.67, -0.085),
};
const LOWER = {
  [LM.L_HIP]: v(0.12, 0, 0), [LM.R_HIP]: v(-0.12, 0, 0),
  [LM.L_KNEE]: v(0.13, 0.45, -0.03), [LM.R_KNEE]: v(-0.13, 0.45, -0.03),
  [LM.L_ANKLE]: v(0.14, 0.88, 0.02), [LM.R_ANKLE]: v(-0.14, 0.88, 0.02),
  [LM.L_HEEL]: v(0.14, 0.92, 0.06), [LM.R_HEEL]: v(-0.14, 0.92, 0.06),
  [LM.L_FOOT]: v(0.15, 0.93, -0.1), [LM.R_FOOT]: v(-0.15, 0.93, -0.1),
};
const ARM_IDX = {
  left: { sh: LM.L_SHOULDER, el: LM.L_ELBOW, wr: LM.L_WRIST, idx: LM.L_INDEX, pky: LM.L_PINKY, thb: LM.L_THUMB },
  right: { sh: LM.R_SHOULDER, el: LM.R_ELBOW, wr: LM.R_WRIST, idx: LM.R_INDEX, pky: LM.R_PINKY, thb: LM.R_THUMB },
};

function blendKey(a, b, t) {
  const out = {};
  for (const k of Object.keys(a)) {
    out[k] = v(a[k].x + (b[k].x - a[k].x) * t, a[k].y + (b[k].y - a[k].y) * t, a[k].z + (b[k].z - a[k].z) * t);
  }
  return out;
}

export class Puppet {
  /**
   * @param {object} [o]
   * @param {number} [o.width]  frame size, px
   * @param {number} [o.height]
   * @param {number} [o.hfov]   horizontal field of view, degrees
   * @param {number} [o.distance] hips-to-camera distance, m
   * @param {number} [o.noise]  jitter multiplier (0 = perfect data)
   * @param {number} [o.seed]
   */
  constructor({ width = 640, height = 480, hfov = 62, distance = 1.7, noise = 1, seed = 7 } = {}) {
    this.width = width;
    this.height = height;
    this.focal = width / 2 / Math.tan((hfov * Math.PI) / 360);
    this.origin = v(0, 0.3, distance);
    this.noise = noise;
    this.rnd = mulberry32(seed);
    this.base = { left: 'guard', right: 'guard' };
    this.clips = { left: null, right: null };
    // Body pose: targets are set by scripts/keyboard, current values chase them.
    this.target = { shift: 0, lean: 0, drop: 0, x: 0 };
    this.body = { ...this.target };
    this.lastT = null;
    this.visible = true;
  }

  /** Starts an arm clip at time t0 (s). `speed` < 1 plays it slower. */
  play(side, clip, t0, speed = 1) {
    this.clips[side] = { frames: CLIPS[clip], t0, speed };
  }

  setBase(side, key) {
    this.base[side] = key;
  }

  /** dir: -1 = the person's right, +1 = left, 0 = center. */
  slip(dir) {
    this.target.shift = 0.17 * dir;
    this.target.lean = 0.21 * dir;
  }

  duck(on) {
    this.target.drop = on ? 0.22 : 0;
  }

  /** Moves the whole person sideways (m) — for framing tests. */
  stepTo(x) {
    this.target.x = x;
  }

  #armPose(side, t) {
    const base = KEYS[this.base[side]];
    const clip = this.clips[side];
    if (!clip) return base;
    const local = (t - clip.t0) * clip.speed;
    const frames = clip.frames;
    if (local < 0) return base;
    if (local >= frames[frames.length - 1][0]) {
      this.clips[side] = null;
      return base;
    }
    const key = (name) => (name === 'guard' ? base : KEYS[name]);
    for (let i = 1; i < frames.length; i++) {
      const [tb, kb] = frames[i];
      if (local <= tb) {
        const [ta, ka] = frames[i - 1];
        return blendKey(key(ka), key(kb), smooth01((local - ta) / (tb - ta)));
      }
    }
    return base;
  }

  #updateBody(t) {
    const dt = this.lastT === null ? 0 : clamp(t - this.lastT, 0, 0.2);
    this.lastT = t;
    const a = dt === 0 ? 1 : expAlpha(dt, 0.06);
    for (const k of Object.keys(this.target)) this.body[k] += (this.target[k] - this.body[k]) * a;
  }

  /** Body-frame positions of all 33 landmarks at time t. */
  #bodyPoints(t) {
    const pts = new Array(LANDMARK_COUNT);
    for (const [i, p] of Object.entries(HEAD)) pts[i] = { ...p };
    for (const [i, p] of Object.entries(LOWER)) pts[i] = { ...p };
    for (const side of ['left', 'right']) {
      const s = side === 'left' ? 1 : -1;
      const k = this.#armPose(side, t);
      const idx = ARM_IDX[side];
      const m = (p) => v(p.x * s, p.y, p.z);
      pts[idx.sh] = m(SHOULDER);
      pts[idx.el] = m(k.el);
      pts[idx.wr] = m(k.wr);
      pts[idx.idx] = v((k.wr.x + k.idx.x) * s, k.wr.y + k.idx.y, k.wr.z + k.idx.z);
      pts[idx.pky] = v((k.wr.x + k.pky.x) * s, k.wr.y + k.pky.y, k.wr.z + k.pky.z);
      pts[idx.thb] = v((k.wr.x + k.thb.x) * s, k.wr.y + k.thb.y, k.wr.z + k.thb.z);
    }

    // Upper body: lean (rotation in the image plane around the hips), shift, duck.
    const { shift, lean, drop, x } = this.body;
    const c = Math.cos(lean);
    const sn = Math.sin(lean);
    const duckLean = (drop / 0.22) * 0.08;
    for (let i = 0; i <= 22; i++) {
      const p = pts[i];
      const rx = p.x * c - p.y * sn;
      const ry = p.x * sn + p.y * c;
      p.x = rx + shift + x;
      p.y = ry + drop;
      p.z -= duckLean;
    }
    for (let i = 23; i < LANDMARK_COUNT; i++) {
      pts[i].x += x;
      if (i <= 24) pts[i].y += drop * 0.55;
    }
    return pts;
  }

  /** A detector-shaped frame at time t (seconds). */
  frame(t) {
    this.#updateBody(t);
    if (!this.visible) return { image: null, world: null, width: this.width, height: this.height, t: t * 1000 };
    const pts = this.#bodyPoints(t);
    const n = () => (this.rnd() - 0.5) * 2 * this.noise;
    const image = [];
    const world = [];
    for (let i = 0; i < LANDMARK_COUNT; i++) {
      const p = pts[i];
      const cx = this.origin.x + p.x;
      const cy = this.origin.y + p.y;
      const cz = this.origin.z + p.z;
      const x = (this.width / 2 + (this.focal * cx) / cz) / this.width;
      const y = (this.height / 2 + (this.focal * cy) / cz) / this.height;
      const inside = x > 0 && x < 1 && y > 0 && y < 1;
      image.push({
        x: x + n() * 0.002,
        y: y + n() * 0.002,
        z: p.z * 0.5,
        visibility: inside ? 0.98 : 0.08,
      });
      world.push({ x: p.x + n() * 0.006, y: p.y + n() * 0.006, z: p.z + n() * 0.008, visibility: inside ? 0.98 : 0.08 });
    }
    return { image, world, width: this.width, height: this.height, t: t * 1000 };
  }
}
