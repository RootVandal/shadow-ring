import { OneEuro } from '../util/one-euro.js';
import { CONFIG } from '../config.js';
import { clamp } from '../util/math.js';

// Menus without a mouse: raise a hand and a glove-cursor follows it; hold it
// over a button and a ring fills up; full ring = click. The hand's reach is
// mapped from a comfortable box around its own shoulder, not the whole camera
// frame, so every corner of the screen is reachable without stretching.

const R = 26;
const C = 2 * Math.PI * R;
const SVG = `<svg viewBox="-32 -32 64 64" aria-hidden="true">
  <circle class="ring-bg" r="${R}" fill="none" stroke-width="5"/>
  <circle class="ring" r="${R}" fill="none" stroke-width="5" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}" transform="rotate(-90)"/>
  <path d="M-11 -4c0-8 5-12 12-12s12 5 12 12v7c0 6-3 9-7 10v5h-12v-6c-3-1-5-4-5-8z" fill="#d8342c" stroke="#efe8da" stroke-width="2"/>
  <rect x="-5" y="13" width="10" height="3" fill="#f2c94c"/>
  <path d="M-11 0c2-3 6-3 8 0" stroke="#efe8da" stroke-width="2" fill="none" stroke-linecap="round"/>
</svg>`;

export class HandCursor {
  constructor(cfg = CONFIG.cursor) {
    this.cfg = cfg;
    this.el = document.createElement('div');
    this.el.className = 'hand-cursor';
    this.el.innerHTML = SVG;
    this.ring = this.el.querySelector('.ring');
    document.body.append(this.el);
    this.fx = new OneEuro({ minCutoff: 1.1, beta: 0.012, dCutoff: 1 });
    this.fy = new OneEuro({ minCutoff: 1.1, beta: 0.012, dCutoff: 1 });
    this.enabled = false;
    this.hand = null;
    this.target = null;
    this.since = 0;
    this.cooldownUntil = 0;
    this.onSelect = null;
    this.targets = [];
    this.scannedAt = -Infinity;
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.#hide();
  }

  /** @param {import('../motion/body.js').Body|null} body */
  update(body, now) {
    if (!this.enabled || !body?.present) return this.#hide();
    const S = body.S;
    const lift = (side) => (body.arms[side].shoulder.y - body.arms[side].wrist.y) / S;
    const l = lift('left');
    const r = lift('right');
    if (!this.hand || lift(this.hand) < 0.05) this.hand = r > 0.3 && r >= l ? 'right' : l > 0.3 ? 'left' : null;
    if (!this.hand) return this.#hide();

    const a = body.arms[this.hand];
    const out = this.hand === 'left' ? -1 : 1;
    const x0 = a.shoulder.x + (out < 0 ? -1.5 : -0.8) * S;
    const x1 = a.shoulder.x + (out < 0 ? 0.8 : 1.5) * S;
    const y0 = a.shoulder.y - 1.55 * S;
    const y1 = a.shoulder.y + 0.05 * S;
    const nx = clamp((a.wrist.x - x0) / (x1 - x0), 0, 1);
    const ny = clamp((a.wrist.y - y0) / (y1 - y0), 0, 1);
    const t = now / 1000;
    const x = this.fx.filter(nx * window.innerWidth, t);
    const y = this.fy.filter(ny * window.innerHeight, t);
    this.el.style.transform = `translate(${x}px, ${y}px)`;
    this.el.classList.add('is-on');
    this.#dwell(x, y, now);
  }

  #dwell(x, y, now) {
    let best = null;
    let bestD = Infinity;
    const m = this.cfg.magnetPx;
    // Measuring every button forces a layout; buttons don't move that often.
    if (now - this.scannedAt > 250) {
      this.scannedAt = now;
      this.targets = [...document.querySelectorAll('[data-dwell]')].map((el) => ({ el, b: el.getBoundingClientRect() }));
    }
    for (const { el, b } of this.targets) {
      if (el.disabled || !el.isConnected || !b.width) continue;
      const dx = Math.max(b.left - x, 0, x - b.right);
      const dy = Math.max(b.top - y, 0, y - b.bottom);
      if (dx > m || dy > m) continue;
      const d = Math.hypot(x - (b.left + b.width / 2), y - (b.top + b.height / 2));
      if (d < bestD) {
        bestD = d;
        best = el;
      }
    }
    if (now < this.cooldownUntil) best = null;
    if (best !== this.target) {
      this.#release();
      this.target = best;
      this.since = now;
      if (best) {
        best.classList.add('is-hover');
        this.onHover?.(best);
      }
    }
    const p = best ? clamp((now - this.since) / this.cfg.dwellMs, 0, 1) : 0;
    this.ring.style.strokeDashoffset = String(C * (1 - p));
    if (best) best.style.setProperty('--dwell', p.toFixed(3));
    if (best && p >= 1) {
      this.#release();
      this.target = null;
      this.cooldownUntil = now + this.cfg.cooldownMs;
      this.onSelect?.(best);
      best.click();
    }
  }

  #release() {
    if (this.target) {
      this.target.classList.remove('is-hover');
      this.target.style.setProperty('--dwell', '0');
    }
  }

  #hide() {
    this.el.classList.remove('is-on');
    this.#release();
    this.target = null;
    this.hand = null;
    this.fx.reset();
    this.fy.reset();
  }
}
