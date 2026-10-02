import { h } from '../util/dom.js';
import { JOINT_NAMES } from '../vision/landmarks.js';
import { KIND } from '../strings.js';

// «Лучший удар боя» на экране итогов: скелет игрока в замедлении, рука,
// которой он бил, подсвечена, за кулаком тянется след. Кадры пишет экран боя
// (ui/screens/fight.js) — те же 13 точек, что уходят сопернику онлайн.

const SLOW = 0.3;
const HOLD = 500; // мс (реального времени) пауза в конце, прежде чем повторить
const YAW = 0.6; // поворот камеры повтора: прямой удар в камеру виден сбоку
const I = Object.fromEntries(JOINT_NAMES.map((n, i) => [n, i]));
const BONES = [
  ['lSh', 'rSh'], ['lSh', 'lHip'], ['rSh', 'rHip'], ['lHip', 'rHip'],
  ['lSh', 'lEl'], ['lEl', 'lWr'], ['lWr', 'lIdx'],
  ['rSh', 'rEl'], ['rEl', 'rWr'], ['rWr', 'rIdx'],
];

const pt = (j, name) => ({ x: j[I[name] * 3] / 100, y: j[I[name] * 3 + 1] / 100, z: j[I[name] * 3 + 2] / 100 });

/** Самая высокая скорость кулака в клипе, м/с (кадры с шагом от 15 мс, иначе шум). */
export function fistSpeed(frames, side) {
  const wr = side === 'right' ? 'rWr' : 'lWr';
  let best = 0;
  for (let i = 1; i < frames.length; i++) {
    const dt = (frames[i].t - frames[i - 1].t) / 1000;
    if (dt < 0.015) continue;
    const a = pt(frames[i - 1].j, wr);
    const b = pt(frames[i].j, wr);
    best = Math.max(best, Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / dt);
  }
  return best;
}

export class PunchReplay {
  /** @param {{kind:string, side:string, quality:number, ms:number, frames:{t:number, j:number[]}[]}} best */
  constructor(best) {
    this.best = best;
    this.t = 0;
    this.trail = [];
    const speed = fistSpeed(best.frames, best.side);
    this.canvas = h('canvas.replay__canvas');
    this.ctx = this.canvas.getContext('2d');
    const facts = [`техника ${Math.round(best.quality * 100)}%`];
    if (best.ms) facts.push(`удар за ${best.ms} мс`);
    if (speed > 1.5 && speed < 20) facts.push(`кулак до ${speed.toFixed(1).replace('.', ',')} м/с`);
    this.el = h(
      'div.replay',
      this.canvas,
      h(
        'div.replay__text',
        h('h3.section-title', 'Лучший удар боя'),
        h('b.replay__kind', `${KIND[best.kind]}, ${best.side === 'left' ? 'левой' : 'правой'}`),
        h('p.muted', facts.join(' · ')),
        h('p.replay__note', `повтор ×${SLOW.toString().replace('.', ',')} — так тебя видел соперник`),
      ),
    );
    const f = best.frames;
    this.start = f[0].t;
    this.end = f.at(-1).t;
  }

  draw(dt) {
    const { canvas, ctx, best } = this;
    const css = canvas.clientWidth || 220;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(css * dpr)) {
      canvas.width = Math.round(css * dpr);
      canvas.height = Math.round(css * dpr);
    }
    const W = canvas.width;
    const span = this.end - this.start;
    this.t += dt * 1000 * SLOW;
    if (this.t > span + HOLD * SLOW) {
      this.t = 0;
      this.trail = [];
    }
    const now = this.start + Math.min(this.t, span);
    const j = this.#poseAt(now);

    // Вид: поворот вокруг вертикали, масштаб по ширине плеч, плечи на трети высоты.
    const c = Math.cos(YAW);
    const s = Math.sin(YAW);
    const ls = pt(j, 'lSh');
    const rs = pt(j, 'rSh');
    const sw = Math.max(0.15, Math.hypot(ls.x - rs.x, ls.z - rs.z));
    const k = (W * 0.27) / sw;
    const mx = (ls.x + rs.x) / 2;
    const my = (ls.y + rs.y) / 2;
    const mz = (ls.z + rs.z) / 2;
    const P = (p) => {
      const x = (p.x - mx) * c + (p.z - mz) * s;
      return [W / 2 + x * k, W * 0.34 - (p.y - my) * k];
    };

    ctx.clearRect(0, 0, W, W);
    ctx.fillStyle = 'rgba(14, 13, 12, 0.9)';
    ctx.fillRect(0, 0, W, W);
    ctx.strokeStyle = 'rgba(239, 232, 218, 0.08)';
    ctx.lineWidth = 1;
    for (let g = 0; g <= W; g += W / 8) {
      ctx.beginPath();
      ctx.moveTo(g, 0);
      ctx.lineTo(g, W);
      ctx.moveTo(0, g);
      ctx.lineTo(W, g);
      ctx.stroke();
    }

    const hit = best.side === 'right' ? 'r' : 'l';
    const fist = P(pt(j, `${hit}Wr`));
    this.trail.push(fist);
    if (this.trail.length > 40) this.trail.shift();
    ctx.lineCap = 'round';
    for (let i = 1; i < this.trail.length; i++) {
      ctx.strokeStyle = `rgba(242, 201, 76, ${(i / this.trail.length) * 0.6})`;
      ctx.lineWidth = W * 0.012 * (i / this.trail.length);
      ctx.beginPath();
      ctx.moveTo(...this.trail[i - 1]);
      ctx.lineTo(...this.trail[i]);
      ctx.stroke();
    }

    for (const [a, b] of BONES) {
      const strike = a.startsWith(hit) && b.startsWith(hit) && !b.endsWith('Hip'); // рука, которой бил
      ctx.strokeStyle = strike ? '#f2c94c' : '#efe8da';
      ctx.lineWidth = W * (strike ? 0.028 : 0.018);
      ctx.beginPath();
      ctx.moveTo(...P(pt(j, a)));
      ctx.lineTo(...P(pt(j, b)));
      ctx.stroke();
    }
    // Голова: по носу и ушам.
    const head = P(pt(j, 'nose'));
    const le = P(pt(j, 'lEar'));
    const re = P(pt(j, 'rEar'));
    const neck = P({ x: mx, y: my, z: mz });
    const hc = [(le[0] + re[0]) / 2, (le[1] + re[1]) / 2 - 0.02 * k];
    ctx.strokeStyle = '#efe8da';
    ctx.lineWidth = W * 0.018;
    ctx.beginPath();
    ctx.moveTo(...neck);
    ctx.lineTo(hc[0], hc[1] + 0.1 * k);
    ctx.stroke();
    ctx.lineWidth = W * 0.014;
    ctx.beginPath();
    ctx.arc(...hc, 0.1 * k, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#d8342c';
    ctx.beginPath();
    ctx.arc(...head, W * 0.012, 0, Math.PI * 2);
    ctx.fill();
    // Кулаки.
    for (const side of ['l', 'r']) {
      ctx.fillStyle = side === hit ? '#f2c94c' : '#d8342c';
      ctx.beginPath();
      ctx.arc(...P(pt(j, `${side}Wr`)), W * (side === hit ? 0.04 : 0.03), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(239, 232, 218, 0.6)';
    ctx.font = `700 ${Math.round(W * 0.055)}px "JetBrains Mono", monospace`;
    ctx.fillText(`×${SLOW}`, W * 0.05, W * 0.09);
    // Момент удара — короткая вспышка в конце траектории.
    if (now >= -20 && now <= 80) {
      ctx.strokeStyle = 'rgba(242, 201, 76, 0.9)';
      ctx.lineWidth = W * 0.01;
      ctx.beginPath();
      ctx.arc(...fist, W * 0.08, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  #poseAt(t) {
    const f = this.best.frames;
    if (t <= f[0].t) return f[0].j;
    for (let i = 1; i < f.length; i++) {
      if (f[i].t >= t) {
        const a = f[i - 1];
        const b = f[i];
        const u = (t - a.t) / Math.max(1, b.t - a.t);
        return a.j.map((v, n) => v + (b.j[n] - v) * u);
      }
    }
    return f.at(-1).j;
  }
}
