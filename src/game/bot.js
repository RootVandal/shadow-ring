import { attackPower, resolveHit, isLanded, COUNTER } from './rules.js';
import { randRange, weightedPick } from '../util/math.js';
import { CONFIG } from '../config.js';

const BASE_WEIGHTS = { jab: 0.34, cross: 0.26, hook: 0.2, upper: 0.2 };

/**
 * «Тень» — the sparring partner, plugged into a Match as its link.
 * It plays by the player's rules: telegraphs every punch (a visible load, then
 * the punch flies for `window` ms), defends with a level-dependent chance, opens
 * its guard after punching and — the part that teaches — reads the player's
 * habits: someone who always ducks starts eating uppercuts.
 *
 * The animator (render/animator.js) is optional so the logic runs in tests.
 */
export class BotLink {
  constructor({ level = 'normal', animator = null, rnd = Math.random } = {}) {
    this.local = true;
    this.level = level;
    this.p = CONFIG.bot[level];
    this.animator = animator;
    this.rnd = rnd;
    this.match = null;
    this.timers = [];
    this.seq = 0;
    this.nextAttackAt = 0;
    this.stunnedUntil = 0;
    this.guardUp = true;
    this.guardUntil = 0;
    this.comboLeft = 0;
    this.habits = { slip: 1, duck: 1, guard: 1, none: 1 };
  }

  attach(match) {
    this.match = match;
    match.on('phase', ({ phase }) => {
      if (phase === 'round') this.nextAttackAt = 0;
      if (phase === 'break') this.animator?.setGuard(0.4);
    });
    match.on('over', (r) => {
      if (r.winner === 'me') this.animator?.knockout(r.method === 'ko');
      else if (r.winner === 'foe') this.animator?.celebrate();
    });
  }

  update(now, dt) {
    for (let i = 0; i < this.timers.length; ) {
      if (this.timers[i].at <= now) this.timers.splice(i, 1)[0].fn(now);
      else i++;
    }
    const m = this.match;
    if (m.phase !== 'round') return;
    if (!this.nextAttackAt) this.nextAttackAt = now + randRange(900, 1600, this.rnd);
    m.foe.regen(dt, now);
    if (now > this.guardUntil) {
      this.guardUp = this.rnd() < this.p.guardUp;
      this.guardUntil = now + randRange(900, 2200, this.rnd);
      this.animator?.setGuard(this.guardUp ? 1 : 0.2);
    }
    if (now >= this.nextAttackAt && now >= this.stunnedUntil) this.#attack(now);
  }

  /** Pause support: push every scheduled moment into the future. */
  shift(d) {
    for (const t of this.timers) t.at += d;
    this.nextAttackAt += d;
    this.stunnedUntil += d;
    this.guardUntil += d;
  }

  // ── the player punches the bot ────────────────────────────────────────

  sendAttack(attack, now) {
    const def = this.#defend(attack, now);
    this.#at(now + CONFIG.fight.myProjectileMs, (t) => {
      const m = this.match;
      if (m.phase === 'over') return;
      const res = resolveHit(attack, def);
      if (res.damage > 0) m.foe.hurt(res.damage);
      if (res.drain) m.foe.stamina = Math.max(0, m.foe.stamina - res.drain);
      if (isLanded(res.outcome)) {
        this.animator?.hit(res.outcome === 'crit' ? 1 : 0.6, attack);
        if (res.outcome === 'crit' || res.damage >= 10) this.stunnedUntil = t + this.p.stunMs;
      } else if (res.outcome === 'blocked') {
        this.animator?.blocked(attack);
      }
      // It defended — the good ones punish right away, while your guard is open.
      if (!isLanded(res.outcome) && m.phase === 'round' && this.rnd() < this.p.counter) {
        this.nextAttackAt = Math.min(this.nextAttackAt, t + 120);
        this.countering = true;
      }
      m.landed({ id: attack.id, outcome: res.outcome, damage: res.damage, hp: m.foe.hp }, t);
    });
  }

  /** How the player defended against the bot's punch — the bot remembers. */
  sendResult(result) {
    const h = this.habits;
    for (const k in h) h[k] *= 0.96;
    h[result.defense] = (h[result.defense] ?? 0) + 1;
  }

  // ── internals ─────────────────────────────────────────────────────────

  #at(at, fn) {
    this.timers.push({ at, fn });
  }

  #defend(attack, now) {
    const p = this.p;
    const stunned = now < this.stunnedUntil;
    let choice = 'none';
    if (!stunned && this.rnd() < p.defend) {
      // Against a body shot the only thing that helps is the guard.
      const best = attack.zone === 'body' && attack.kind !== 'upper' ? 'guard' : COUNTER[attack.kind];
      choice = this.rnd() < p.smart ? best : ['guard', 'slip', 'duck'][Math.floor(this.rnd() * 3)];
    }
    if (choice === 'slip') this.animator?.slip(this.rnd() < 0.5 ? -1 : 1);
    else if (choice === 'duck') this.animator?.duck();
    else if (choice === 'guard') this.animator?.block();
    return {
      guard: choice === 'guard' ? 'full' : this.guardUp && !stunned ? 'half' : 'open',
      slip: choice === 'slip',
      duck: choice === 'duck',
    };
  }

  /** Base mix, pulled toward whatever beats the player's favourite defense. */
  #chooseKind() {
    const h = this.habits;
    const total = h.slip + h.duck + h.guard + h.none;
    const r = this.p.reads;
    const w = { ...BASE_WEIGHTS };
    w.hook += r * 0.6 * (h.slip / total);
    w.upper += r * 0.6 * ((h.duck + h.guard) / total);
    w.jab += r * 0.3 * (h.none / total);
    return weightedPick(w, this.rnd);
  }

  #attack(now) {
    const kind = this.#chooseKind();
    const side = kind === 'jab' ? 'left' : kind === 'cross' ? 'right' : this.rnd() < 0.5 ? 'left' : 'right';
    // A counter comes with a shorter load: that's what makes it hard to read.
    const windup = Math.round(this.p.windup * (this.countering ? 0.6 : 1));
    this.countering = false;
    this.animator?.punch(kind, side, windup);
    // Punching opens the guard for a moment — that's the player's chance.
    this.guardUp = false;
    this.guardUntil = now + windup + 650;
    this.animator?.setGuard(0.35);
    this.#at(now + windup, (t) => {
      const m = this.match;
      if (m.phase !== 'round' || t < this.stunnedUntil) return; // a hit interrupted the load
      const quality = randRange(...this.p.quality, this.rnd);
      const attack = { id: ++this.seq, kind, side, quality, power: attackPower({ kind, quality }) * this.p.damage };
      m.incoming(attack, this.p.window, t);
    });
    if (this.comboLeft > 0) {
      this.comboLeft--;
      this.nextAttackAt = now + windup + randRange(320, 480, this.rnd);
    } else {
      this.comboLeft = this.rnd() < this.p.combo ? 1 + Math.floor(this.rnd() * this.p.comboMax) : 0;
      const [a, b] = this.p.interval;
      // Smells blood: when you're low, the hard Shadow doesn't let you breathe.
      const pressure = this.p.finisher && this.match.me.hp < 40 ? 0.65 : 1;
      this.nextAttackAt = now + windup + randRange(a, b, this.rnd) * 1000 * pressure;
    }
  }
}
