import { resolveHit } from './rules.js';
import { CONFIG } from '../config.js';
import { clamp, lerp } from '../util/math.js';
import { load, save } from '../util/store.js';
import { packPose } from '../net/remote.js';
import { JOINT_NAMES } from '../vision/landmarks.js';
import { GUARD } from '../render/poses.js';

// «Бой со своей тенью». Во время боя пишем игрока: скелет 15 раз в секунду,
// каждый удар (вид, рука, зона, качество, сила) и то, как он защищался.
// В следующий раз манекен проигрывает эту запись: твои удары, твой темп,
// твои привычки в защите. Хранится одна последняя запись, на этом устройстве.

const KEY = 'ghost';
const POSE_HZ = 15;
const N = JOINT_NAMES.length * 3;

/** Время внутри текущего раунда, мс (паузы не считаются — их учитывает match.timeLeft). */
const roundTime = (m, now) => m.rules.roundSeconds * 1000 - m.timeLeft(now);

export class GhostRecorder {
  constructor({ name, glove, shorts }) {
    this.tape = { v: 1, name, glove, shorts, rounds: [], defense: { none: 1, guard: 1, slip: 1, duck: 1 } };
    this.poseIn = 0;
  }

  #round(m) {
    const i = m.round - 1;
    return (this.tape.rounds[i] ??= { len: 0, poses: [], punches: [] });
  }

  /** Каждый кадр боя: скелет игрока, пока идёт раунд. */
  frame(m, now, dt, frame, def) {
    if (m.phase !== 'round' || m.paused || m.roundOver) return;
    this.poseIn -= dt;
    if (this.poseIn > 0) return;
    this.poseIn = 1 / POSE_HZ;
    const p = packPose(frame, def);
    if (!p) return;
    const r = this.#round(m);
    const t = Math.round(roundTime(m, now));
    if (r.poses.length && t <= r.poses.at(-1)[0]) return;
    r.poses.push([t, ...p.j, p.l, p.d]);
    r.len = Math.max(r.len, t);
  }

  punch(m, attack, now) {
    if (m.phase !== 'round') return;
    const { kind, side, zone, quality, power, window } = attack;
    this.#round(m).punches.push({ t: Math.round(roundTime(m, now)), kind, side, zone, quality: +quality.toFixed(2), power: +power.toFixed(1), window });
  }

  /** Как игрок встретил удар соперника: none / guard / slip / duck. */
  defense(def) {
    if (!def) return;
    const used = def.slip ? 'slip' : def.duck ? 'duck' : def.guard === 'open' ? 'none' : 'guard';
    this.tape.defense[used]++;
  }

  get punches() {
    return this.tape.rounds.reduce((s, r) => s + (r?.punches.length ?? 0), 0);
  }

  /** Сохраняет запись, если в ней есть что проигрывать. true — сохранили. */
  save() {
    const rounds = this.tape.rounds.filter((r) => r && r.len >= 5000 && r.poses.length > 20 && r.punches.length);
    const total = rounds.reduce((s, r) => s + r.len, 0);
    if (this.punches < 8 || total < 20000) return false;
    return saveGhost({ ...this.tape, at: Date.now(), rounds });
  }
}

export function saveGhost(tape) {
  if (save(KEY, tape)) return true;
  // Не влезло в localStorage — прореживаем скелет вдвое и пробуем ещё раз.
  const thin = { ...tape, rounds: tape.rounds.map((r) => ({ ...r, poses: r.poses.filter((_, i) => i % 2 === 0) })) };
  return save(KEY, thin);
}

export function loadGhost() {
  const t = load(KEY, null);
  return t && t.v === 1 && Array.isArray(t.rounds) && t.rounds.length ? t : null;
}

function poseOf(row) {
  const joints = {};
  JOINT_NAMES.forEach((name, i) => {
    joints[name] = { x: row[1 + i * 3] / 100, y: row[2 + i * 3] / 100, z: row[3 + i * 3] / 100 };
  });
  return { joints, lateral: clamp(row[N + 1] / 100, -0.4, 0.4), drop: clamp(row[N + 2] / 100, 0, 0.45) };
}

function lerpRow(a, b, k) {
  const out = [0];
  for (let i = 1; i < a.length; i++) out.push(lerp(a[i], b[i], k));
  return out;
}

/**
 * Твоя тень как соперник (link для Match). Раунд N проигрывает записанный
 * раунд N (если раундов в записи меньше — по кругу); если раунд записи
 * короче (там был нокаут), запись идёт по кругу.
 */
export class GhostLink {
  constructor({ tape, rnd = Math.random }) {
    this.local = true;
    this.tape = tape;
    this.rnd = rnd;
    this.match = null;
    this.timers = [];
    this.seq = 0;
    this.track = null;
    this.fallback = { joints: structuredClone(GUARD), lateral: 0, drop: 0 };
  }

  attach(match) {
    this.match = match;
    match.on('phase', ({ phase, round }) => {
      if (phase === 'round') this.#startRound(round);
    });
  }

  #startRound(round) {
    const rs = this.tape.rounds;
    this.track = { r: rs[(round - 1) % rs.length], lap: 0, i: 0 };
  }

  update(now, dt) {
    for (let i = 0; i < this.timers.length; ) {
      if (this.timers[i].at <= now) this.timers.splice(i, 1)[0].fn(now);
      else i++;
    }
    const m = this.match;
    if (m.phase !== 'round' || m.roundOver || !this.track) return;
    m.foe.regen(dt, now);
    const t = roundTime(m, now);
    const tr = this.track;
    const { punches, len } = tr.r;
    if (!punches.length || len <= 0) return;
    // Все удары записи, чьё время пришло (запись короче раунда — идёт по кругу).
    for (let guard = 0; guard < 8; guard++) {
      const p = punches[tr.i];
      if (tr.lap * len + p.t > t) break;
      this.#throw(p, now);
      if (++tr.i >= punches.length) {
        tr.i = 0;
        tr.lap++;
      }
    }
  }

  #throw(p, now) {
    const attack = {
      id: ++this.seq,
      kind: p.kind,
      side: p.side === 'right' ? 'right' : 'left',
      quality: clamp(p.quality, 0, 1),
      power: clamp(p.power, 0, 16),
      zone: p.zone === 'body' ? 'body' : 'head',
    };
    this.match.incoming(attack, clamp(p.window ?? 700, 450, 900), now);
  }

  shift(d) {
    for (const t of this.timers) t.at += d;
  }

  /** Мой удар по тени: она защищается так же, как защищался ты в записи. */
  sendAttack(attack, now) {
    const def = this.#defend();
    this.timers.push({
      at: now + CONFIG.fight.myProjectileMs,
      fn: (t) => {
        const m = this.match;
        if (m.phase === 'over') return;
        const res = resolveHit(attack, def);
        if (res.damage > 0) m.foe.hurt(res.damage);
        if (res.drain) m.foe.stamina = Math.max(0, m.foe.stamina - res.drain);
        m.landed({ id: attack.id, outcome: res.outcome, damage: res.damage, hp: m.foe.hp }, t);
      },
    });
  }

  sendResult() {}

  #defend() {
    const d = this.tape.defense ?? {};
    const w = { none: d.none ?? 1, guard: d.guard ?? 1, slip: d.slip ?? 1, duck: d.duck ?? 1 };
    let r = this.rnd() * (w.none + w.guard + w.slip + w.duck);
    let choice = 'none';
    for (const k of ['none', 'guard', 'slip', 'duck']) {
      r -= w[k];
      if (r <= 0) {
        choice = k;
        break;
      }
    }
    return { guard: choice === 'guard' ? 'full' : choice === 'none' ? 'open' : 'half', slip: choice === 'slip', duck: choice === 'duck' };
  }

  /** Поза тени сейчас — из записи, между кадрами плавно. */
  poseAt(now) {
    const m = this.match;
    const tr = this.track;
    if (!m || !tr || m.phase !== 'round') return this.fallback;
    const { poses, len } = tr.r;
    if (!poses.length) return this.fallback;
    let t = roundTime(m, now);
    if (len > 0) t %= len;
    let lo = 0;
    let hi = poses.length - 1;
    if (t <= poses[0][0]) return poseOf(poses[0]);
    if (t >= poses[hi][0]) return poseOf(poses[hi]);
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (poses[mid][0] <= t) lo = mid;
      else hi = mid;
    }
    const a = poses[lo];
    const b = poses[hi];
    return poseOf(lerpRow(a, b, (t - a[0]) / Math.max(1, b[0] - a[0])));
  }
}
