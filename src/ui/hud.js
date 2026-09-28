import { h, mmss } from '../util/dom.js';
import { KIND } from '../strings.js';

// Fight overlay in TV-broadcast style: nameplates with HP and stamina, round
// clock, the coach's note, the incoming-punch telegraph and hit popups.

const TG_R = 52;
const TG_C = 2 * Math.PI * TG_R;

export class Hud {
  constructor({ me, foe, online = false }) {
    const plate = (f, cls) => {
      const hp = h('i');
      const lag = h('b');
      const sta = h('i');
      const num = h('span.plate__hp', '100');
      const el = h(
        `div.plate${cls}`,
        h('div.plate__row', h('span.plate__name', f.name), num),
        h('div.bar', lag, hp),
        h('div.bar.bar--sta', sta),
      );
      return { el, hp, lag, sta, num, staBar: sta.parentElement };
    };
    this.red = plate(me, '');
    this.blue = plate(foe, '.plate--blue');
    this.round = h('div.clock__round', '—');
    this.time = h('div.clock__time', '0:00');
    this.clock = h('div.clock', this.round, this.time);
    this.net = h('div.hud__net', online ? 'соединение…' : '');
    this.coachTag = h('span.coach__tag', 'тренер');
    this.coachText = h('p.coach__text');
    this.coach = h('div.coach', this.coachTag, this.coachText);
    this.pipSlot = h('div.hud-pip');
    this.chips = { guard: h('span.chip', 'блок'), slip: h('span.chip', 'уклон'), duck: h('span.chip', 'нырок') };
    this.readoutKind = h('div.readout__kind');
    this.readoutBar = h('i');
    this.readoutNote = h('div.readout__note');
    this.readout = h('div.readout', this.readoutKind, h('div.readout__q', this.readoutBar), this.readoutNote);
    this.telegraph = h('div.telegraph');
    this.popups = h('div.popups');
    this.redEdge = h('div.red-edge');
    this.calloutBox = h('div.callout');
    this.cornerBox = h('div');
    this.el = h(
      'section.hud',
      this.redEdge,
      this.popups,
      this.telegraph,
      h('div.hud__top', this.red.el, h('div', this.clock, this.net), this.blue.el),
      this.readout,
      h(
        'div.hud__bottom',
        h('div', this.coach),
        h('div', this.pipSlot, h('div.defense-row', this.chips.guard, this.chips.slip, this.chips.duck)),
      ),
      this.calloutBox,
      this.cornerBox,
    );
    this.tgs = new Map();
    this.written = new Map();
    this.readoutUntil = 0;
    this.calloutUntil = 0;
  }

  // ── per-frame ─────────────────────────────────────────────────────────

  /** Writes to the DOM only when the value changed — every write costs a style pass. */
  #put(el, key, value) {
    let seen = this.written.get(el);
    if (!seen) this.written.set(el, (seen = {}));
    if (seen[key] === value) return;
    seen[key] = value;
    if (key === 'text') el.textContent = value;
    else if (key.startsWith('--')) el.style.setProperty(key, value);
    else el.style[key] = value;
  }

  update(now, { match, defense, redFlash, rtt }) {
    const put = (el, key, value) => this.#put(el, key, value);
    const set = (p, f) => {
      const v = (Math.max(0, f.hp) / f.maxHp).toFixed(3);
      put(p.hp, '--v', v);
      put(p.lag, '--v', v);
      put(p.num, 'text', String(Math.ceil(Math.max(0, f.hp))));
      const s = (f.stamina ?? 100) / 100;
      put(p.sta, '--v', s.toFixed(2));
      p.staBar.classList.toggle('is-low', s < 0.25);
    };
    set(this.red, match.me);
    set(this.blue, match.foe);
    const phase = match.phase;
    const left = match.timeLeft(now) / 1000;
    const roundText =
      phase === 'round' ? `раунд ${match.round} / ${match.rules.rounds}${match.rules.roundKo ? ` · ${match.wins.me}:${match.wins.foe}` : ''}` : phase === 'break' ? 'угол' : phase === 'intro' ? 'представление' : phase === 'over' ? 'бой окончен' : 'ждём';
    put(this.round, 'text', roundText);
    put(this.time, 'text', phase === 'waiting' || phase === 'over' ? '—' : mmss(left));
    this.clock.classList.toggle('is-last', phase === 'round' && left <= 10);
    if (rtt != null) put(this.net, 'text', `пинг ${Math.round(rtt / 10) * 10} мс`);

    this.chips.guard.classList.toggle('is-ok', defense.guard === 'full');
    put(this.chips.guard, 'text', defense.guard === 'half' ? 'полблока' : 'блок');
    this.chips.slip.classList.toggle('is-ok', !!defense.slip);
    put(this.chips.slip, 'text', defense.slip ? `уклон ${defense.slip === 'left' ? '←' : '→'}` : 'уклон');
    this.chips.duck.classList.toggle('is-ok', !!defense.duck);

    // A full-screen blurred shadow: keep it out of compositing while it's invisible.
    const edge = redFlash > 0.01 ? Math.min(1, redFlash).toFixed(2) : '0';
    put(this.redEdge, 'opacity', edge);
    put(this.redEdge, 'visibility', edge === '0' ? 'hidden' : 'visible');
    if (now > this.readoutUntil) this.readout.classList.remove('is-on');
    if (this.calloutUntil && now > this.calloutUntil) {
      this.calloutBox.replaceChildren();
      this.calloutUntil = 0;
    }

    for (const [id, tg] of this.tgs) {
      const k = Math.min(1, (now - tg.start) / (tg.end - tg.start));
      tg.ring.style.strokeDashoffset = String(TG_C * k);
      tg.el.style.transform = `scale(${1.5 - 0.5 * k})`;
      if (now > tg.end + 250) this.#dropTelegraph(id);
    }
  }

  // ── events ────────────────────────────────────────────────────────────

  /** A punch is coming: a closing ring where it will land, with its name. */
  showTelegraph(attack, start, end, hint) {
    const ring = svgCircle(TG_R, 'ring');
    const svg = svg2(ring, svgCircle(22, 'target'));
    const label = h('div.tg__label', KIND[attack.kind], hint && h('span.tg__hint', hint));
    const el = h('div.tg', svg, label);
    // The ring sits where the punch comes from: hooks from the side, uppercuts from below.
    const fromViewerRight = attack.side === 'left';
    const dx = attack.kind === 'hook' ? (fromViewerRight ? 1 : -1) * Math.min(260, window.innerWidth * 0.2) : 0;
    const dy = attack.kind === 'upper' ? Math.min(160, window.innerHeight * 0.16) : 0;
    el.style.left = `${dx}px`;
    el.style.top = `${dy}px`;
    this.telegraph.append(el);
    this.tgs.set(attack.id, { el, ring, start, end });
  }

  resolveTelegraph(id, outcome) {
    const tg = this.tgs.get(id);
    if (!tg) return;
    tg.el.style.transition = 'opacity .2s';
    tg.el.style.opacity = '0';
    tg.ring.style.stroke = outcome === 'slipped' || outcome === 'ducked' || outcome === 'blocked' ? '#8cc56f' : '#d8342c';
    setTimeout(() => this.#dropTelegraph(id), 220);
  }

  #dropTelegraph(id) {
    this.tgs.get(id)?.el.remove();
    this.tgs.delete(id);
  }

  clearTelegraphs() {
    for (const id of [...this.tgs.keys()]) this.#dropTelegraph(id);
  }

  popup(text, x, y, cls = 'popup--dmg', small = null) {
    const el = h(`div.popup.${cls}`, text, small && h('small', small));
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    this.popups.append(el);
    setTimeout(() => el.remove(), 950);
  }

  callout(text, small = null, ms = 1200, now = performance.now()) {
    this.calloutBox.replaceChildren(h('div.callout__text', text, small && h('small', small)));
    this.calloutUntil = ms ? now + ms : 0;
  }

  showTip(tip) {
    if (!tip) {
      this.coach.classList.remove('is-on');
      return;
    }
    this.coachText.textContent = tip.text;
    this.coach.classList.toggle('is-lesson', tip.kind === 'lesson');
    this.coach.classList.toggle('is-praise', tip.kind === 'praise');
    this.coachTag.textContent = tip.kind === 'lesson' ? 'разбор' : tip.kind === 'praise' ? 'красиво' : 'тренер';
    this.coach.classList.add('is-on');
  }

  showPunch(kind, quality, note, now) {
    this.readoutKind.textContent = `${KIND[kind]} · ${Math.round(quality * 100)}%`;
    this.readoutBar.parentElement.style.setProperty('--q', quality.toFixed(2));
    this.readoutBar.parentElement.style.setProperty('--q-color', quality >= 0.8 ? '#8cc56f' : quality >= 0.55 ? '#f2c94c' : '#d8342c');
    this.readoutNote.textContent = note ?? '';
    this.readout.classList.add('is-on');
    this.readoutUntil = now + 1400;
  }

  showCorner(talk, endsAt) {
    this.cornerEnds = endsAt;
    this.cornerTime = h('span.corner__time', '');
    this.cornerBox.replaceChildren(
      h(
        'div.corner',
        h(
          'div.corner__card',
          h('div.corner__head', h('h2', talk.title), this.cornerTime),
          h('div.corner__say', talk.headline),
          h(
            'ul',
            talk.lines.map((l) => h('li', l)),
          ),
        ),
      ),
    );
  }

  updateCorner(now) {
    if (this.cornerTime) this.cornerTime.textContent = mmss((this.cornerEnds - now) / 1000);
  }

  hideCorner() {
    this.cornerBox.replaceChildren();
    this.cornerTime = null;
  }
}

function svgCircle(r, cls) {
  const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  c.setAttribute('cx', '75');
  c.setAttribute('cy', '75');
  c.setAttribute('r', String(r));
  c.setAttribute('class', cls);
  if (cls === 'ring') {
    c.setAttribute('stroke-dasharray', String(TG_C));
    c.setAttribute('transform', 'rotate(-90 75 75)');
  }
  return c;
}

function svg2(...children) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 150 150');
  s.append(...children);
  return s;
}
