import { PREVIEW_BONES } from '../vision/landmarks.js';
import { guardTarget } from '../motion/posture.js';

// The player's mirror: camera image, the skeleton the game sees, and — when the
// coach has something to say — the fix drawn right on the body: the faulty joint
// turns red and an arrow points to where it should be.

const BONE = '#efe8da';
const RED = '#d8342c';
const OK = '#8cc56f';
const TAPE = '#f2c94c';

// The camera gives ~30 frames a second; redrawing the preview more often only burns time.
const MIN_FRAME_MS = 1000 / 30 - 2;

export class Pip {
  /** Resolution cap for every preview, set by the graphics tier (app.js). */
  static maxDpr = 2;

  constructor({ label = 'ТЫ' } = {}) {
    this.el = document.createElement('div');
    this.el.className = 'pip';
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.el.append(this.canvas);
    if (label) {
      const tag = document.createElement('span');
      tag.className = 'pip__label';
      tag.textContent = label;
      this.el.append(tag);
    }
    this.flash = { left: 0, right: 0 };
    this.lastDraw = 0;
  }

  /** Lights up an arm for a moment — the punch was recognized. */
  punch(side) {
    this.flash[side] = 1;
  }

  /**
   * @param {object} o
   * @param {HTMLVideoElement|null} o.video
   * @param {import('../motion/body.js').Body|null} o.body
   * @param {{left:boolean,right:boolean}} [o.hands]  which fists are in guard
   * @param {object|null} [o.focus]  coach focus: {joint, side, to}
   * @param {boolean} [o.targets]    draw the guard targets
   */
  draw({ video, body, hands = null, focus = null, targets = false }) {
    const now = performance.now();
    if (now - this.lastDraw < MIN_FRAME_MS) return;
    const dt = Math.min(0.1, (now - this.lastDraw) / 1000);
    this.lastDraw = now;
    const c = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, Pip.maxDpr);
    const cw = Math.round(this.el.clientWidth * dpr);
    const ch = Math.round(this.el.clientHeight * dpr);
    if (!cw || !ch) return;
    if (c.width !== cw || c.height !== ch) {
      c.width = cw;
      c.height = ch;
    }
    const g = this.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#0b0a09';
    g.fillRect(0, 0, cw, ch);

    const vw = video?.videoWidth || body?.width || 640;
    const vh = video?.videoHeight || body?.height || 480;
    const s = Math.max(cw / vw, ch / vh);
    const ox = (cw - vw * s) / 2;
    const oy = (ch - vh * s) / 2;
    if (video?.videoWidth) {
      g.setTransform(-s, 0, 0, s, cw - ox, oy);
      g.globalAlpha = 0.92;
      g.drawImage(video, 0, 0);
      g.globalAlpha = 1;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = 'rgba(14,13,12,0.28)';
      g.fillRect(0, 0, cw, ch);
    } else {
      g.strokeStyle = 'rgba(239,232,218,0.06)';
      g.lineWidth = 1;
      for (let x = 0; x < cw; x += 24 * dpr) g.strokeRect(x, 0, 0, ch);
    }
    if (!body?.present) return;

    const P = (p) => [ox + p.x * s, oy + p.y * s];
    const lw = Math.max(2, 3.2 * dpr * Math.min(1, cw / (420 * dpr)) + 1);
    const pts = body.img;
    for (const k of ['left', 'right']) this.flash[k] = Math.max(0, this.flash[k] - dt * 3);

    // Guard targets: where the fists belong.
    const wantTargets = targets || focus?.to === 'guard';
    if (wantTargets) {
      for (const side of ['left', 'right']) {
        const t = guardTarget(side, body);
        const [x, y] = P(t);
        const bad = focus && (focus.side === side || focus.side === 'both') && focus.to === 'guard';
        g.setLineDash([6 * dpr, 6 * dpr]);
        g.lineWidth = 2 * dpr;
        g.strokeStyle = bad ? TAPE : 'rgba(239,232,218,0.55)';
        g.beginPath();
        g.arc(x, y, t.r * s, 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
      }
    }

    // Skeleton.
    const armOf = (i) => (i === 13 || i === 15 || i === 17 || i === 19 ? 'left' : i === 14 || i === 16 || i === 18 || i === 20 ? 'right' : null);
    for (const [a, b] of PREVIEW_BONES) {
      const pa = pts[a];
      const pb = pts[b];
      if (!pa || !pb || pa.v < 0.3 || pb.v < 0.3) continue;
      const side = armOf(b) ?? armOf(a);
      const [x1, y1] = P(pa);
      const [x2, y2] = P(pb);
      g.lineCap = 'round';
      g.lineWidth = lw + 3 * dpr;
      g.strokeStyle = 'rgba(0,0,0,0.45)';
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke();
      const f = side ? this.flash[side] : 0;
      g.lineWidth = lw;
      g.strokeStyle = f > 0.05 ? mix(BONE, RED, f) : BONE;
      g.stroke();
    }

    // Fists: green when in guard.
    for (const side of ['left', 'right']) {
      const w = body.arms[side].wrist;
      if (w.v < 0.3) continue;
      const [x, y] = P(w);
      g.fillStyle = hands?.[side] ? OK : BONE;
      g.beginPath();
      g.arc(x, y, lw * 1.9, 0, Math.PI * 2);
      g.fill();
    }

    if (focus) this.#focus(g, body, focus, P, s, dpr, lw);
  }

  #focus(g, body, focus, P, s, dpr, lw) {
    const sides = focus.side === 'both' ? ['left', 'right'] : [focus.side ?? 'left'];
    const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 110);
    for (const side of sides) {
      const arm = body.arms[side];
      if (!arm) continue;
      const joint = focus.joint === 'elbow' ? arm.elbow : arm.wrist;
      const [x, y] = P(joint);
      g.lineWidth = 3 * dpr;
      g.strokeStyle = RED;
      g.fillStyle = `rgba(216,52,44,${0.35 * pulse})`;
      g.beginPath();
      g.arc(x, y, lw * 4.2, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      let to = null;
      if (focus.to === 'guard') {
        const t = guardTarget(side, body);
        to = P(t);
      } else if (focus.to === 'up') to = [x, y - 0.45 * body.S * s];
      else if (focus.to === 'down') to = [x, y + 0.45 * body.S * s];
      if (to) arrow(g, x, y, to[0], to[1], TAPE, 4 * dpr);
    }
  }
}

function arrow(g, x1, y1, x2, y2, color, w) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len < 8) return;
  const head = Math.min(18, len * 0.4) * (w / 4);
  const ex = x2 - Math.cos(a) * 4;
  const ey = y2 - Math.sin(a) * 4;
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = w;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(ex - Math.cos(a) * head * 0.6, ey - Math.sin(a) * head * 0.6);
  g.stroke();
  g.beginPath();
  g.moveTo(ex, ey);
  g.lineTo(ex - Math.cos(a - 0.45) * head, ey - Math.sin(a - 0.45) * head);
  g.lineTo(ex - Math.cos(a + 0.45) * head, ey - Math.sin(a + 0.45) * head);
  g.closePath();
  g.fill();
}

function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
