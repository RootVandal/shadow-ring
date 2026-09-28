import { expAlpha } from '../util/math.js';
import { CONFIG } from '../config.js';

// Defensive state: guard (which hands are up), slip (head moved sideways) and
// duck (shoulders dropped). Slip and duck are measured against a neutral head
// position that slowly follows the player, so standing a bit off-center or
// drifting during a round doesn't count as dodging.

/**
 * @typedef {object} DefenseState
 * @property {'full'|'half'|'open'} guard
 * @property {{left:boolean, right:boolean}} hands
 * @property {null|'left'|'right'} slip   the player's own left/right
 * @property {number} slipSince  seconds
 * @property {boolean} duck
 * @property {number} duckSince
 * @property {number} lateral    head offset from neutral, in S (+ = player's right)
 * @property {number} drop       shoulder drop from neutral, in S
 * @property {number} tilt
 */

export class DefenseTracker {
  constructor(cfg = CONFIG) {
    this.cfg = cfg;
    this.neutral = null;
    this.state = idleState();
  }

  /** @param {import('./calibration.js').Baseline} base */
  setBaseline(base) {
    this.neutral = { nose: { ...base.nose }, mid: { ...base.mid } };
    this.state = idleState();
  }

  /**
   * @param {import('./body.js').Body} body
   * @param {{left:boolean, right:boolean}} hands  which fists are in guard
   * @returns {DefenseState}
   */
  update(body, hands) {
    const st = this.state;
    const up = (hands.left ? 1 : 0) + (hands.right ? 1 : 0);
    st.guard = up === 2 ? 'full' : up === 1 ? 'half' : 'open';
    st.hands = { ...hands };
    if (!this.neutral || !body.present) return st;

    const d = this.cfg.dodge;
    const S = body.S;
    const n = this.neutral;
    const lateral = (body.nose.x - n.nose.x) / S;
    const drop = (body.mid.y - n.mid.y) / S;
    const noseDrop = (body.nose.y - n.nose.y) / S;
    st.lateral = lateral;
    st.drop = drop;
    st.tilt = body.tilt;

    const leaning = Math.abs(body.tilt) > d.tiltOn && Math.abs(lateral) > d.tiltAssist && Math.sign(body.tilt) === Math.sign(lateral);
    if (!st.slip) {
      if (Math.abs(lateral) > d.slipOn || leaning) {
        st.slip = lateral > 0 ? 'right' : 'left';
        st.slipSince = body.t;
      }
    } else if (Math.abs(lateral) < d.slipOff && Math.abs(body.tilt) < d.tiltOn * 0.6) {
      st.slip = null;
    }

    if (!st.duck) {
      if (drop > d.duckOn && noseDrop > d.duckOn) {
        st.duck = true;
        st.duckSince = body.t;
      }
    } else if (drop < d.duckOff) {
      st.duck = false;
    }

    // Follow slow drift only while the player is clearly standing neutral.
    if (!st.slip && !st.duck && Math.abs(lateral) < 0.15 && Math.abs(drop) < 0.15) {
      const a = expAlpha(body.dt, d.neutralTau);
      n.nose.x += (body.nose.x - n.nose.x) * a;
      n.nose.y += (body.nose.y - n.nose.y) * a;
      n.mid.x += (body.mid.x - n.mid.x) * a;
      n.mid.y += (body.mid.y - n.mid.y) * a;
    }
    return st;
  }

  /** Defense as it counts at the moment of impact (dodges expire). */
  snapshot(now) {
    const st = this.state;
    const fresh = this.cfg.dodge.freshMs / 1000;
    return {
      guard: st.guard,
      slip: !!st.slip && now - st.slipSince <= fresh,
      duck: st.duck && now - st.duckSince <= fresh,
      slipStale: !!st.slip && now - st.slipSince > fresh,
      duckStale: st.duck && now - st.duckSince > fresh,
      slipDir: st.slip,
    };
  }
}

function idleState() {
  return {
    guard: 'open',
    hands: { left: false, right: false },
    slip: null,
    slipSince: 0,
    duck: false,
    duckSince: 0,
    lateral: 0,
    drop: 0,
    tilt: 0,
  };
}
