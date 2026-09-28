import { clamp, percentile } from '../util/math.js';
import { CONFIG } from '../config.js';

// Per-arm punch recognizer.
//
//   ready ──(fast motion)──▶ strike ──(motion stops)──▶ recover ──(back in guard)──▶ ready
//                              │                            │
//                              └─ classify + grade          └─ re-arm early for double jabs
//
// While a strike is open we follow three channels:
//   E      — extension toward the camera   → straight (jab / cross)
//   inward — travel across the body        → hook
//   up     — travel upward                 → uppercut
// Each channel's travel is measured from its lowest point before its peak, so the
// load of a hook (fist drawn out) or an uppercut (fist dipped) counts even when
// the strike opened mid-load. The channel that went furthest past its gate wins;
// the elbow angle breaks ties (straights end with a straight arm, hooks and
// uppercuts don't). The same measurements then grade the technique — every
// shortfall becomes a named fault with a penalty, which is what the coach says.

export const PUNCH_TYPES = ['straight', 'hook', 'upper'];
const CHANNEL = { straight: 'E', hook: 'inward', upper: 'up' };

/**
 * @typedef {object} PunchEvent
 * @property {'punch'} kind
 * @property {'left'|'right'} side
 * @property {'straight'|'hook'|'upper'} type
 * @property {number} quality  0.2..1
 * @property {{code:string, penalty:number}[]} faults  worst first
 * @property {number} ms       duration from start of motion to full extension
 * @property {number} speed    goodMs / ms (≥ 1 is crisp)
 * @property {number} reach
 * @property {'head'|'body'} zone  where the fist was at full extension
 * @property {number} t
 *
 * @typedef {object} AttemptEvent  a movement that looked like a punch but wasn't one
 * @property {'attempt'} kind
 * @property {'left'|'right'} side
 * @property {'straight'|'hook'|'upper'} type  what it resembled most
 * @property {'short'|'slow'} reason
 * @property {number} t
 */

export class PunchTracker {
  constructor(side, cfg = CONFIG) {
    this.side = side;
    this.cfg = cfg;
    this.sens = 1;
    this.base = null;
    this.hist = [];
    this.refs = { straight: [], hook: [], upper: [] };
    this.reset();
  }

  reset() {
    this.hist.length = 0;
    this.state = 'ready';
    this.strike = null;
    this.recover = null;
    this.lowFist = false; // after a body shot the fist rises back — that's not an uppercut
    this.live = { E: 0, vE: 0, vIn: 0, vUp: 0 };
  }

  /** @param {import('./calibration.js').ArmBaseline} base */
  setBaseline(base) {
    this.base = base;
    this.reset();
  }

  setSensitivity(k) {
    this.sens = k;
  }

  /**
   * @param {import('./body.js').Arm} arm
   * @param {import('./body.js').Body} body
   * @param {{E:number, F:number, inGuard:boolean, otherGuard:boolean}} ctx
   * @returns {Array<PunchEvent|AttemptEvent|{kind:'fault', side:string, code:string, t:number}>}
   */
  update(arm, body, ctx) {
    const t = body.t;
    const s = {
      t,
      E: ctx.E,
      F: ctx.F,
      inward: arm.inward,
      up: arm.up,
      angle: arm.angle,
      lift: arm.elbowLift,
      otherGuard: ctx.otherGuard,
    };
    this.hist.push(s);
    const keep = t - this.cfg.punch.historyMs / 1000;
    while (this.hist.length > 2 && this.hist[0].t < keep) this.hist.shift();

    // Velocity over two frames — one-frame differences are too noisy at 30 fps.
    const ref = this.hist[Math.max(0, this.hist.length - 3)];
    const dt = t - ref.t;
    const vE = dt > 0 ? (s.E - ref.E) / dt : 0;
    const vIn = dt > 0 ? (s.inward - ref.inward) / dt : 0;
    const vUp = dt > 0 ? (s.up - ref.up) / dt : 0;
    this.live = { E: s.E, vE, vIn, vUp };

    const out = [];
    const reliable = arm.vis >= 0.3;
    // Back at guard height and no longer rising: from here an upward move is a real uppercut again.
    if (this.lowFist && this.base && arm.up > -this.base.rel.y - 0.1 && vUp < this.cfg.punch.trigger.vUp * 0.5) this.lowFist = false;
    if (this.state === 'ready') {
      if (reliable && this.#triggered(vE, vIn, vUp)) this.#open(s);
    } else if (this.state === 'strike') {
      this.#track(s);
      const k = this.strike;
      const cfg = this.cfg.punch;
      // Settled = no new maximum for a moment AND nothing is still accelerating
      // toward one (a hook's load → sweep turn has a pause in progress, not in motion).
      const tr = cfg.trigger;
      const pushing = vE > tr.vE * 0.6 || vIn > tr.vIn * 0.6 || vUp > tr.vUp * 0.6;
      if (((t - k.tLast) * 1000 > cfg.settleMs && !pushing) || (t - k.t0) * 1000 > cfg.maxStrikeMs) {
        const ev = this.#close(t);
        if (ev) out.push(ev);
      }
    } else if (this.state === 'recover') {
      this.#recover(s, ctx, reliable, vE, vIn, vUp, out);
    }
    return out;
  }

  #triggered(vE, vIn, vUp) {
    const tr = this.cfg.punch.trigger;
    const k = this.sens;
    return vE > tr.vE * k || vIn > tr.vIn * k || (!this.lowFist && vUp > tr.vUp * k);
  }

  #open(s) {
    // The motion started a little before the trigger fired, and hooks and
    // uppercuts are loaded before that — seed the lows from recent history.
    const lo = { E: Infinity, F: Infinity, inward: Infinity, up: Infinity };
    for (const h of this.hist) {
      if (h.t < s.t - 0.4) continue;
      for (const key in lo) lo[key] = Math.min(lo[key], h[key]);
    }
    this.strike = {
      t0: s.t,
      tLast: s.t,
      start: s,
      lo,
      peak: { E: -Infinity, inward: -Infinity, up: -Infinity },
      loAtPeak: { E: 0, F: 0, inward: 0, up: 0 },
      at: { E: s, inward: s, up: s },
      frames: 0,
      otherDropped: 0,
      lowFist: this.lowFist,
    };
    this.state = 'strike';
    this.#track(s);
  }

  #track(s) {
    const k = this.strike;
    const grow = 0.025; // ignore jitter-sized "progress"
    k.frames++;
    if (!s.otherGuard) k.otherDropped++;
    for (const key in k.lo) k.lo[key] = Math.min(k.lo[key], s[key]);
    for (const key of ['E', 'inward', 'up']) {
      if (s[key] > k.peak[key] + grow) {
        if (k.peak[key] !== -Infinity) k.tLast = s.t;
        k.peak[key] = s[key];
        k.at[key] = s;
        k.loAtPeak[key] = k.lo[key];
        if (key === 'E') k.loAtPeak.F = k.lo.F;
      }
    }
  }

  #close(t) {
    const k = this.strike;
    const c = this.cfg.punch;
    const sens = this.sens;
    const gain = {
      straight: k.peak.E - k.loAtPeak.E,
      hook: k.peak.inward - k.loAtPeak.inward,
      upper: k.peak.up - k.loAtPeak.up,
    };
    const angle = { straight: k.at.E.angle, hook: k.at.inward.angle, upper: k.at.up.angle };
    const score = {};
    for (const ty of PUNCH_TYPES) score[ty] = gain[ty] / (c[ty].gate * sens);
    if (k.lowFist || (this.base && -this.base.rel.y - k.loAtPeak.up > c.upper.maxDip)) score.upper = 0;

    // A straight must actually come toward the camera, and not by dropping the
    // hand to the hip (the elbow straightens then too).
    const forward = k.at.E.F - k.loAtPeak.F;
    const dropped = k.at.E.up - k.start.up < -c.straight.maxDrop;
    const minF = c.straight.minForward * sens;
    if (forward < minF || (dropped && forward < minF * c.bodyForward)) score.straight = 0;

    const weighted = {
      straight: score.straight * (angle.straight >= c.straight.straightAngle ? 1.3 : 0.8),
      hook: score.hook * (angle.hook <= c.hook.bentAngle ? 1.2 : 0.9) * (gain.hook > 0.9 ? 1.5 : 1),
      upper: score.upper * (angle.upper <= c.upper.bentAngle ? 1.2 : 0.8),
    };
    let type = null;
    for (const ty of PUNCH_TYPES) {
      if (score[ty] >= 1 && (!type || weighted[ty] > weighted[type])) type = ty;
    }

    this.state = 'recover';
    this.recover = { tEnd: t, strike: k, type, gain, warned: false };

    if (!type) {
      let near = null;
      for (const ty of PUNCH_TYPES) {
        if (score[ty] >= c.nearMiss && (!near || score[ty] > score[near])) near = ty;
      }
      if (!near) return null;
      const slow = this.#duration(near) * 1000 > c[near].maxMs / sens;
      return { kind: 'attempt', side: this.side, type: near, reason: slow ? 'slow' : 'short', t };
    }

    const ms = this.#duration(type) * 1000;
    const spec = c[type];
    if (ms > spec.maxMs / sens) {
      return { kind: 'attempt', side: this.side, type, reason: 'slow', t };
    }

    const zone = this.#zone(type, k);
    if (zone === 'body') this.lowFist = true;
    const faults = [];
    const reach = type === 'straight' ? k.peak.E : gain[type];
    const expected = this.#reference(type) * c.shortRatio;
    if (reach < expected) {
      faults.push({ code: `${type}_short`, penalty: Math.min(0.35, ((expected - reach) / expected) * 1.4) });
    }
    const goodMs = spec.goodMs / sens;
    const slowMs = spec.slowMs / sens;
    if (ms > goodMs) {
      faults.push({ code: `${type}_slow`, penalty: Math.min(0.3, (0.3 * (ms - goodMs)) / (slowMs - goodMs)) });
    }
    if (type === 'hook') {
      if (angle.hook > spec.bentAngle) faults.push({ code: 'hook_straight_arm', penalty: 0.3 });
      // A body hook is thrown with the elbow low on purpose.
      if (zone === 'head' && k.at.inward.lift < spec.minElbowLift) faults.push({ code: 'hook_low_elbow', penalty: 0.25 });
    }
    if (type === 'upper' && angle.upper > spec.bentAngle) {
      faults.push({ code: 'upper_straight_arm', penalty: 0.3 });
    }
    if (k.frames >= 3 && k.otherDropped / k.frames > c.otherHandDropRatio) {
      faults.push({ code: 'other_hand_dropped', penalty: 0.15 });
    }
    faults.sort((a, b) => b.penalty - a.penalty);
    this.#remember(type, reach);
    const quality = clamp(1 - faults.reduce((sum, f) => sum + f.penalty, 0), 0.2, 1);
    return { kind: 'punch', side: this.side, type, quality, faults, ms, speed: goodMs / ms, reach, zone, t };
  }

  /** Head or body: how far below its own guard height the fist was at the peak. */
  #zone(type, k) {
    if (type === 'upper' || !this.base) return 'head';
    const guardUp = -this.base.rel.y;
    const up = k.at[CHANNEL[type]].up;
    return guardUp - up > this.cfg.punch.bodyDrop ? 'body' : 'head';
  }

  /** Seconds from the moment the fist left its low point to the peak, for one channel. */
  #duration(type) {
    const k = this.strike;
    const key = CHANNEL[type];
    const peakSample = k.at[key];
    const lo = k.loAtPeak[key];
    const threshold = lo + 0.12 * (k.peak[key] - lo);
    let i = this.hist.lastIndexOf(peakSample);
    if (i < 0) return 0;
    let start = peakSample.t;
    for (; i >= 0; i--) {
      if (this.hist[i][key] <= threshold) break;
      start = this.hist[i].t;
    }
    return peakSample.t - start;
  }

  #recover(s, ctx, reliable, vE, vIn, vUp, out) {
    const r = this.recover;
    const k = r.strike;
    const c = this.cfg.punch;
    const since = (s.t - r.tEnd) * 1000;
    const back = {
      straight: k.peak.E - s.E,
      hook: k.peak.inward - s.inward,
      upper: k.peak.up - s.up,
    };
    const returned = r.type ? back[r.type] >= 0.55 * r.gain[r.type] : true;
    if (since >= c.minRecoverMs && (ctx.inGuard || returned)) {
      this.state = 'ready';
      return;
    }
    // Double jab: the arm came back halfway and fires again.
    const half = !r.type || back[r.type] >= 0.35 * r.gain[r.type];
    if (since >= c.rearmMs && half && reliable && this.#triggered(vE, vIn, vUp)) {
      this.#open(s);
      return;
    }
    if (!r.warned && r.type && since > c.returnTimeoutMs) {
      r.warned = true;
      out.push({ kind: 'fault', side: this.side, code: 'no_return', t: s.t });
    }
    if (since > 3000) this.state = 'ready';
  }

  /** What this player's punch of this type usually reaches (75th percentile). */
  #reference(type) {
    const c = this.cfg.punch;
    const vals = this.refs[type];
    if (vals.length < 3) return c.refDefault[type];
    return clamp(percentile(vals, 0.75), c.refFloor[type], 1.3);
  }

  #remember(type, reach) {
    const vals = this.refs[type];
    vals.push(reach);
    if (vals.length > 12) vals.shift();
  }
}
