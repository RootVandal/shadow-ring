import { Emitter } from '../util/emitter.js';
import { clamp, lerp } from '../util/math.js';
import { JOINTS, JOINT_NAMES } from '../vision/landmarks.js';
import { GUARD } from '../render/poses.js';
import { PUNCH_KINDS } from '../game/rules.js';
import { VideoLink } from './video.js';
import { CONFIG } from '../config.js';

// The remote player as a Match link. What travels over the wire:
//   pose  13 skeleton joints in cm + slip/duck offsets, 20× per second
//   video the webcam itself goes as a WebRTC track, if the player allows it (net/video.js)
//   atk   my punch (kind, power, how long the defender has to react)
//   res   how their punch landed on me (I'm the authority over my own HP)
//   st    my HP and stamina, 5× per second
//   ph    round clock (host → guest), end — the verdict, ready / again — handshakes

const flipWinner = (w) => (w === 'me' ? 'foe' : w === 'foe' ? 'me' : w);
const count = (n) => clamp(Math.floor(Number(n)) || 0, 0, 9);
/** Round score as the other side sent it ({me, foe} from their seat) → ours. */
const flipWins = (w) => (w && typeof w === 'object' ? { me: count(w.foe), foe: count(w.me) } : undefined);
const flip = (r) => ({ ...r, winner: flipWinner(r.winner), ...(r.wins ? { wins: flipWins(r.wins) } : {}) });

function flipLast(last) {
  if (!last || typeof last !== 'object') return undefined;
  const winner = ['me', 'foe', 'draw'].includes(last.winner) ? flipWinner(last.winner) : 'draw';
  return { winner, method: last.method === 'ko' ? 'ko' : 'points' };
}

/** Skeleton → compact integers (cm), in avatar space. */
export function packPose(frame, def = {}) {
  if (!frame?.world) return null;
  const j = [];
  for (const name of JOINT_NAMES) {
    const p = frame.world[JOINTS[name]];
    j.push(Math.round(p.x * 100), Math.round(-p.y * 100), Math.round(-p.z * 100));
  }
  // Slips and ducks move the whole body; MediaPipe's world space is hip-centered
  // and wouldn't show them, so they travel separately (S ≈ 0.38 m of shoulder width).
  return { j, l: Math.round(-(def.lateral ?? 0) * 38), d: Math.round(clamp(def.drop ?? 0, 0, 1.5) * 34) };
}

export function unpackPose(m) {
  const joints = {};
  JOINT_NAMES.forEach((name, i) => {
    joints[name] = { x: (m.j[i * 3] ?? 0) / 100, y: (m.j[i * 3 + 1] ?? 0) / 100, z: (m.j[i * 3 + 2] ?? 0) / 100 };
  });
  return { joints, lateral: clamp((m.l ?? 0) / 100, -0.4, 0.4), drop: clamp((m.d ?? 0) / 100, 0, 0.45) };
}

function lerpPose(a, b, k) {
  const joints = {};
  for (const name of JOINT_NAMES) {
    const p = a.joints[name];
    const q = b.joints[name];
    joints[name] = { x: lerp(p.x, q.x, k), y: lerp(p.y, q.y, k), z: lerp(p.z, q.z, k) };
  }
  return { joints, lateral: lerp(a.lateral, b.lateral, k), drop: lerp(a.drop, b.drop, k) };
}

/** Never trust numbers from the other side more than the rules allow. */
function sanitizeAttack(a) {
  if (!a || !PUNCH_KINDS.includes(a.kind)) return null;
  return {
    id: Math.floor(Number(a.id)) || 0,
    kind: a.kind,
    side: a.side === 'right' ? 'right' : 'left',
    quality: clamp(Number(a.quality) || 0, 0, 1),
    // Перчатки «Ваншот» (соперник видит их на экране) — единственное исключение из лимита.
    power: a.onehit === true ? 400 : clamp(Number(a.power) || 0, 0, 16),
    zone: a.zone === 'body' ? 'body' : 'head',
    window: clamp(Number(a.window) || 700, 450, 900),
    sonic: a.sonic === true && a.onehit === true,
  };
}

export class RemoteLink extends Emitter {
  /** @param {{wire: import('./peer.js').Wire, role: 'host'|'guest', stream?: MediaStream|null}} o */
  constructor({ wire, role, stream = null }) {
    super();
    this.local = false;
    this.wire = wire;
    this.role = role;
    this.match = null;
    this.buffer = [];
    this.peerReady = false;
    this.readyWaiters = [];
    this.gone = false;
    this.fallback = { joints: structuredClone(GUARD), lateral: 0, drop: 0 };
    this.video = new VideoLink({ wire, polite: role === 'guest', stream });

    const now = () => performance.now();
    wire.on('atk', (m) => {
      const a = sanitizeAttack(m.a);
      if (a) this.match?.incoming(a, a.window, now());
    });
    wire.on('res', (m) => {
      if (!m.r) return;
      const outcome = ['hit', 'crit', 'blocked', 'slipped', 'ducked'].includes(m.r.outcome) ? m.r.outcome : 'hit';
      this.match?.landed({ id: Number(m.r.id), outcome, damage: clamp(Number(m.r.damage) || 0, 0, 30), hp: clamp(Number(m.r.hp), 0, 100) }, now());
    });
    wire.on('st', (m) => this.match?.foeState({ hp: clamp(Number(m.hp), 0, 100), stamina: clamp(Number(m.stamina), 0, 100) }));
    wire.on('ph', (m) =>
      this.match?.applyPhase({ phase: m.phase, round: m.round, ms: clamp(Number(m.ms) || 0, 0, 120000), wins: flipWins(m.wins), last: flipLast(m.last) }, now()),
    );
    wire.on('end', (m) => m.r && this.match?.finishRemote(flip(m.r), now()));
    wire.on('pose', (m) => this.#pose(m));
    wire.on('ready', () => {
      this.peerReady = true;
      this.readyWaiters.splice(0).forEach((fn) => fn());
    });
    wire.on('again', () => this.emit('again'));
    wire.on('bye', () => this.#gone());
    wire.on('close', () => this.#gone());
  }

  get rtt() {
    return this.wire.rtt;
  }

  get open() {
    return this.wire.open && !this.gone;
  }

  attach(match) {
    this.match = match;
  }

  sendAttack(a) {
    this.wire.send('atk', { a: { id: a.id, kind: a.kind, side: a.side, quality: a.quality, power: a.power, window: a.window, zone: a.zone, onehit: a.onehit === true, sonic: a.sonic === true } });
  }

  sendResult(r) {
    this.wire.send('res', { r });
  }

  sendState(s) {
    this.wire.send('st', s);
  }

  sendPhase(p) {
    this.wire.send('ph', p);
  }

  sendEnd(r) {
    this.wire.send('end', { r });
    this.peerReady = false;
  }

  sendReady() {
    this.wire.send('ready');
  }

  whenPeerReady() {
    return this.peerReady ? Promise.resolve() : new Promise((resolve) => this.readyWaiters.push(resolve));
  }

  sendAgain() {
    this.wire.send('again');
  }

  sendPose(frame, def) {
    const p = packPose(frame, def);
    if (p) this.wire.send('pose', p);
  }

  #pose(m) {
    if (!Array.isArray(m.j) || m.j.length !== JOINT_NAMES.length * 3) return;
    this.buffer.push({ at: performance.now(), pose: unpackPose(m) });
    if (this.buffer.length > 16) this.buffer.shift();
  }

  /** The opponent's pose slightly in the past, interpolated between packets. */
  poseAt(now) {
    const b = this.buffer;
    if (!b.length) return this.fallback;
    const t = now - CONFIG.net.renderDelayMs;
    if (t <= b[0].at) return b[0].pose;
    for (let i = b.length - 1; i > 0; i--) {
      if (b[i - 1].at <= t) {
        const a = b[i - 1];
        const c = b[i];
        if (t >= c.at) return c.pose;
        return lerpPose(a.pose, c.pose, (t - a.at) / (c.at - a.at));
      }
    }
    return b.at(-1).pose;
  }

  #gone() {
    if (this.gone) return;
    this.gone = true;
    this.match?.foeLeft(performance.now());
    this.emit('gone');
  }

  close() {
    this.gone = true;
    this.wire.close();
  }
}
