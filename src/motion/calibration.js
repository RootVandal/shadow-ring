import { guardIssue } from './posture.js';
import { dist2 } from '../util/math.js';
import { CONFIG } from '../config.js';

// Calibration = "hold your guard for a second". Everything the recognizer
// measures later is relative to this pose, which is what makes it work for
// tall and short players, near and far cameras, wide and narrow lenses.

/**
 * @typedef {object} ArmBaseline
 * @property {number} angle
 * @property {number} reach
 * @property {number} compact
 * @property {number} hand
 * @property {{x:number,y:number}} rel
 *
 * @typedef {object} Baseline
 * @property {number} S
 * @property {{x:number,y:number}} nose
 * @property {{x:number,y:number}} mid
 * @property {{left: ArmBaseline, right: ArmBaseline}} arms
 */

export class Calibrator {
  constructor(cfg = CONFIG) {
    this.cfg = cfg;
    this.reset();
  }

  reset() {
    this.held = 0;
    this.samples = [];
    this.prev = null;
  }

  /**
   * @param {import('./body.js').Body} body
   * @returns {{progress:number, issue:string|null, side?:string, baseline?:Baseline}}
   */
  update(body) {
    const c = this.cfg.calibration;
    if (!body.present) {
      this.#setback(body.dt || 0.033);
      return { progress: this.held / c.holdSeconds, issue: 'no_person' };
    }
    const problem = calibrationIssue(body, this.cfg);
    const speed = this.prev ? wristSpeed(this.prev, body) : 0;
    this.prev = body;
    if (problem) {
      this.#setback(body.dt);
      return { progress: this.held / c.holdSeconds, ...problem };
    }
    if (speed > c.maxWristSpeed) {
      this.#setback(body.dt * 0.5);
      return { progress: this.held / c.holdSeconds, issue: 'hold_still' };
    }
    this.held += body.dt;
    this.samples.push(snapshot(body));
    if (this.samples.length > 40) this.samples.shift();
    if (this.held >= c.holdSeconds) {
      return { progress: 1, issue: null, baseline: averageBaseline(this.samples) };
    }
    return { progress: this.held / c.holdSeconds, issue: null };
  }

  #setback(dt) {
    this.held = Math.max(0, this.held - dt * 2);
    if (this.held === 0) this.samples.length = 0;
  }
}

/** What is wrong with the guard, if anything — the preview turns it into a hint. */
export function calibrationIssue(body, cfg = CONFIG) {
  for (const side of ['left', 'right']) {
    const arm = body.arms[side];
    const issue = guardIssue(arm, body, 0, cfg);
    if (issue) return { issue: `guard_${issue}_${side}`, side };
    // A guard has the forearm up: the elbow sits below the fist.
    if (arm.elbow.y < arm.wrist.y + 0.08 * body.S) return { issue: `guard_elbow_${side}`, side };
  }
  return null;
}

function wristSpeed(a, b) {
  const dt = Math.max(0.001, b.t - a.t);
  const s = b.S;
  return Math.max(dist2(a.arms.left.wrist, b.arms.left.wrist), dist2(a.arms.right.wrist, b.arms.right.wrist)) / s / dt;
}

function snapshot(body) {
  const arm = (a) => ({ angle: a.angle, reach: a.reach, compact: a.compact, hand: a.hand, rel: { ...a.rel } });
  return {
    S: body.S,
    nose: { x: body.nose.x, y: body.nose.y },
    mid: { ...body.mid },
    arms: { left: arm(body.arms.left), right: arm(body.arms.right) },
  };
}

/** @returns {Baseline} */
export function averageBaseline(samples) {
  const n = samples.length;
  const avg = (get) => samples.reduce((s, x) => s + get(x), 0) / n;
  const arm = (side) => ({
    angle: avg((x) => x.arms[side].angle),
    reach: avg((x) => x.arms[side].reach),
    compact: avg((x) => x.arms[side].compact),
    hand: avg((x) => x.arms[side].hand),
    rel: { x: avg((x) => x.arms[side].rel.x), y: avg((x) => x.arms[side].rel.y) },
  });
  return {
    S: avg((x) => x.S),
    nose: { x: avg((x) => x.nose.x), y: avg((x) => x.nose.y) },
    mid: { x: avg((x) => x.mid.x), y: avg((x) => x.mid.y) },
    arms: { left: arm('left'), right: arm('right') },
  };
}
