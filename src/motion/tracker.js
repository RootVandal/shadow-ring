import { Emitter } from '../util/emitter.js';
import { BodyReader } from './body.js';
import { Calibrator } from './calibration.js';
import { PunchTracker } from './punch-tracker.js';
import { DefenseTracker } from './defense.js';
import { extension, guardIssue } from './posture.js';
import { framingIssue } from './framing.js';
import { CONFIG, SENSITIVITY } from '../config.js';

const SIDES = ['left', 'right'];
const other = (side) => (side === 'left' ? 'right' : 'left');

/** A recognized straight becomes a jab or a cross depending on the stance. */
export function punchKind(type, side, stance = 'orthodox') {
  if (type !== 'straight') return type;
  const lead = stance === 'southpaw' ? 'right' : 'left';
  return side === lead ? 'jab' : 'cross';
}

/**
 * Landmarks in → game-level events out.
 *
 * Events:
 *   frame        (Body)                       every processed frame
 *   presence     ({present})                  player entered / left the frame
 *   framing      (issue|null)                 framing problem changed
 *   calibration  ({progress, issue, baseline?})
 *   punch        (PunchEvent & {kind})        kind: jab | cross | hook | upper
 *   attempt      (AttemptEvent & {kind})      looked like a punch, wasn't one
 *   fault        ({code, side, t})            technique problems outside punches
 *   dodge        ({kind:'slip'|'duck', dir?, t})
 */
export class MotionTracker extends Emitter {
  constructor({ cfg = CONFIG, stance = 'orthodox', sensitivity = 'normal' } = {}) {
    super();
    this.cfg = cfg;
    this.stance = stance;
    this.reader = new BodyReader(cfg);
    this.calibrator = new Calibrator(cfg);
    this.punch = { left: new PunchTracker('left', cfg), right: new PunchTracker('right', cfg) };
    this.defense = new DefenseTracker(cfg);
    this.baseline = null;
    this.mode = 'idle'; // idle | calibrate | active
    this.warnGuard = false;
    this.body = null;
    this.luma = null;
    this.E = { left: 0, right: 0 };
    this.F = { left: 0, right: 0 };
    this.parts = { left: null, right: null };
    this.hands = { left: false, right: false };
    this.guardOut = { left: 0, right: 0 };
    this.framing = { issue: 'no_person', candidate: 'no_person', since: 0 };
    this.present = false;
    this.absentSince = 0;
    this.setSensitivity(sensitivity);
  }

  setSensitivity(name) {
    const k = SENSITIVITY[name] ?? 1;
    for (const s of SIDES) this.punch[s].setSensitivity(k);
  }

  setMode(mode) {
    this.mode = mode;
    if (mode === 'calibrate') this.calibrator.reset();
    for (const s of SIDES) this.punch[s].reset();
    this.guardOut = { left: 0, right: 0 };
  }

  setBaseline(baseline) {
    this.baseline = baseline;
    for (const s of SIDES) this.punch[s].setBaseline(baseline.arms[s]);
    this.defense.setBaseline(baseline);
  }

  get calibrated() {
    return this.baseline !== null;
  }

  /** Defense as it counts right now; `nowMs` on the performance.now() clock. */
  defenseAt(nowMs) {
    return this.defense.snapshot(nowMs / 1000);
  }

  process(frame) {
    this.lastFrame = frame;
    const body = this.reader.read(frame);
    this.body = body;
    this.#presence(body);
    this.#framing(body);
    if (!body.present) {
      this.emit('frame', body);
      return;
    }

    if (this.mode === 'calibrate') {
      const r = this.calibrator.update(body);
      if (r.baseline) {
        this.setBaseline(r.baseline);
        this.mode = 'active';
      }
      this.emit('calibration', r);
    }

    if (this.baseline) {
      for (const side of SIDES) {
        const arm = body.arms[side];
        const { E, F, parts } = extension(arm, this.baseline.arms[side], this.cfg);
        this.E[side] = E;
        this.F[side] = F;
        this.parts[side] = parts;
        this.hands[side] = guardIssue(arm, body, E, this.cfg) === null;
      }
      if (this.mode === 'active') {
        for (const side of SIDES) {
          const ctx = { E: this.E[side], F: this.F[side], inGuard: this.hands[side], otherGuard: this.hands[other(side)] };
          for (const ev of this.punch[side].update(body.arms[side], body, ctx)) this.#dispatch(ev);
        }
      }
      const before = { slip: this.defense.state.slip, duck: this.defense.state.duck };
      const st = this.defense.update(body, this.hands);
      if (st.slip && st.slip !== before.slip) this.emit('dodge', { kind: 'slip', dir: st.slip, t: body.t });
      if (st.duck && !before.duck) this.emit('dodge', { kind: 'duck', t: body.t });
      if (this.mode === 'active' && this.warnGuard) this.#guardWarnings(body);
    }
    this.emit('frame', body);
  }

  #dispatch(ev) {
    if (ev.kind === 'fault') {
      this.emit('fault', ev);
      return;
    }
    const named = { ...ev, kind: punchKind(ev.type, ev.side, this.stance), event: ev.kind };
    this.emit(ev.kind === 'punch' ? 'punch' : 'attempt', named);
  }

  #guardWarnings(body) {
    const limit = this.cfg.guard.dropWarnMs / 1000;
    const st = this.defense.state;
    const dodging = !!st.slip || st.duck;
    for (const side of SIDES) {
      const idle = this.punch[side].state === 'ready';
      this.guardOut[side] = !this.hands[side] && idle && !dodging ? this.guardOut[side] + body.dt : 0;
    }
    if (this.guardOut.left > limit && this.guardOut.right > limit) {
      this.emit('fault', { code: 'guard_open', side: null, t: body.t });
      this.guardOut.left = this.guardOut.right = -limit;
      return;
    }
    for (const side of SIDES) {
      if (this.guardOut[side] > limit) {
        const issue = guardIssue(body.arms[side], body, this.E[side], this.cfg) ?? 'low';
        this.emit('fault', { code: `guard_${issue}_${side}`, side, t: body.t });
        this.guardOut[side] = -limit;
      }
    }
  }

  #presence(body) {
    if (body.present) {
      this.absentSince = 0;
      if (!this.present) {
        this.present = true;
        this.emit('presence', { present: true });
      }
    } else if (this.present) {
      if (!this.absentSince) this.absentSince = body.t;
      if (body.t - this.absentSince > 0.6) {
        this.present = false;
        this.emit('presence', { present: false });
      }
    }
  }

  #framing(body) {
    const f = this.framing;
    const issue = framingIssue(body, this.luma, this.cfg);
    if (issue !== f.candidate) {
      f.candidate = issue;
      f.since = body.t;
    }
    if (f.issue !== f.candidate && (body.t - f.since) * 1000 >= this.cfg.framing.persistMs) {
      f.issue = f.candidate;
      this.emit('framing', f.issue);
    }
  }

  /** Live numbers for the debug panel. */
  debug() {
    const arm = (side) => ({
      E: this.E[side],
      parts: this.parts[side],
      state: this.punch[side].state,
      live: this.punch[side].live,
      guard: this.hands[side],
    });
    return { mode: this.mode, framing: this.framing.issue, left: arm('left'), right: arm('right'), defense: this.defense.state, S: this.body?.S };
  }
}
