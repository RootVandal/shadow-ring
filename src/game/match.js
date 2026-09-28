import { Emitter } from '../util/emitter.js';
import { clamp } from '../util/math.js';
import { attackPower, resolveHit, isMiss, WINDOW } from './rules.js';
import { CONFIG } from '../config.js';

/**
 * One fight, from the intro to the verdict. It doesn't know who the opponent
 * is: `link` is either the bot (game/bot.js) or a remote player (net/remote.js).
 *
 * Each side is the authority over its own HP: I resolve punches that land on
 * me (using my real pose at the moment of impact) and report the result back.
 * That keeps both screens consistent without trusting anyone's clock.
 *
 * Link → match:   incoming(attack, windowMs, now)  their punch is on its way
 *                 landed(result, now)               how my punch landed
 *                 foeState({hp, stamina})
 *                 applyPhase(phase, now)            round clock (follower)
 *                 finishRemote(result, now)         their KO / verdict / forfeit
 * Match → link:   sendAttack, sendResult, sendState, sendPhase, sendEnd, update, shift
 *
 * With `rules.roundKo` (online) a knockout ends only the round: the authority
 * scores it, and after the break both sides start again at full HP
 * (`rules.resetHp`). The fight goes the distance and most rounds won takes it.
 *
 * Events: phase, knock, outgoing, incoming, defended, landed, pause, over
 */
export class Match extends Emitter {
  /**
   * @param {object} o
   * @param {import('./fighter.js').Fighter} o.me
   * @param {import('./fighter.js').Fighter} o.foe
   * @param {object} o.link
   * @param {boolean} [o.authority]  runs the round clock (bot fights, online host)
   * @param {(now:number) => import('./rules.js').Defense} o.defense  my defense right now
   */
  constructor({ me, foe, link, authority = true, defense, rules = CONFIG.fight }) {
    super();
    this.me = me;
    this.foe = foe;
    this.link = link;
    this.authority = authority;
    this.defense = defense;
    this.rules = rules;
    this.phase = 'waiting';
    this.round = 0;
    this.endsAt = 0;
    this.seq = 0;
    this.pending = new Map();
    this.incomingQ = [];
    this.lastDodgeAt = -Infinity;
    this.paused = false;
    this.pausedAt = 0;
    this.knocked = false;
    this.stateIn = 0;
    this.result = null;
    this.wins = { me: 0, foe: 0 };
    this.lastRound = null; // {winner, method} of the round that just ended
    this.roundOver = false; // someone is down, waiting for the bell
    link.attach(this);
  }

  start(now) {
    if (this.authority) this.#enter('intro', 0, now);
  }

  timeLeft(now) {
    return Math.max(0, this.endsAt - (this.paused ? this.pausedAt : now));
  }

  update(now, dt) {
    if (this.phase === 'over' || this.paused) return;
    this.link.update?.(now, dt);
    if (this.phase === 'round') this.me.regen(dt, now);

    for (let i = 0; i < this.incomingQ.length; ) {
      const inc = this.incomingQ[i];
      if (now >= inc.impactAt) {
        this.incomingQ.splice(i, 1);
        this.#impact(inc, now);
        if (this.phase === 'over') return;
      } else i++;
    }

    if (this.phase === 'round' && !this.knocked && this.endsAt - now <= this.rules.knockMs) {
      this.knocked = true;
      this.emit('knock');
    }
    if (this.authority && this.phase !== 'waiting' && now >= this.endsAt) this.#advance(now);

    this.stateIn -= dt;
    if (this.stateIn <= 0) {
      this.stateIn = 1 / CONFIG.net.stateHz;
      this.link.sendState?.({ hp: this.me.hp, stamina: this.me.stamina });
    }
  }

  /**
   * My recognized punch goes out. Faster punches leave the defender less time.
   * @param {{kind:string, side:string, quality:number, speed?:number}} ev
   */
  throwPunch(ev, now) {
    if (this.phase !== 'round' || this.paused || this.roundOver) return null;
    const { tired } = this.me.spend(ev.kind, now);
    const counter = now - this.lastDodgeAt <= this.rules.counterWindowMs;
    if (counter) this.lastDodgeAt = -Infinity;
    const attack = {
      id: ++this.seq,
      kind: ev.kind,
      side: ev.side,
      quality: ev.quality,
      power: attackPower({ kind: ev.kind, quality: ev.quality, tired, counter }),
      counter,
      tired,
      window: Math.round(WINDOW[ev.kind] - clamp(((ev.speed ?? 1) - 1) * 150, 0, 120)),
    };
    this.pending.set(attack.id, { attack, at: now });
    this.link.sendAttack(attack, now);
    this.emit('outgoing', attack);
    return attack;
  }

  // ── called by the link ────────────────────────────────────────────────

  incoming(attack, windowMs, now) {
    if (this.phase !== 'round' || this.roundOver) return;
    const impactAt = now + windowMs;
    this.incomingQ.push({ attack, impactAt });
    this.emit('incoming', { attack, impactAt, windowMs });
  }

  landed(result, now) {
    const p = this.pending.get(result.id);
    if (!p) return;
    this.pending.delete(result.id);
    // A late result must not undo the HP reset of the next round.
    if (this.rules.resetHp && this.phase !== 'round') return;
    if (Number.isFinite(result.hp)) this.foe.hp = result.hp;
    this.emit('landed', { attack: p.attack, ...result });
    if (result.hp <= 0) this.#knockout('me', now);
  }

  foeState({ hp, stamina }) {
    if (Number.isFinite(hp)) this.foe.hp = hp;
    if (Number.isFinite(stamina)) this.foe.stamina = stamina;
  }

  applyPhase({ phase, round, ms, wins, last }, now) {
    if (this.authority || this.phase === 'over') return;
    if (wins) this.wins = { me: wins.me, foe: wins.foe };
    if (last) this.lastRound = last;
    const lag = (this.link.rtt ?? 0) / 2;
    this.#enter(phase, round, now, Math.max(0, ms - lag));
  }

  finishRemote(result, now) {
    this.#finish(result, now);
  }

  // ── local controls ────────────────────────────────────────────────────

  setPaused(paused, now) {
    if (paused === this.paused || this.phase === 'over') return;
    if (paused) {
      this.pausedAt = now;
    } else {
      const d = now - this.pausedAt;
      this.endsAt += d;
      for (const inc of this.incomingQ) inc.impactAt += d;
      this.link.shift?.(d);
    }
    this.paused = paused;
    this.emit('pause', paused);
  }

  forfeit(now) {
    this.#finish({ winner: 'foe', method: 'forfeit' }, now);
  }

  foeLeft(now) {
    this.#finish({ winner: 'me', method: 'forfeit' }, now);
  }

  // ── internals ─────────────────────────────────────────────────────────

  #impact(inc, now) {
    const def = this.defense(now);
    const res = resolveHit(inc.attack, def);
    if (isMiss(res.outcome)) this.lastDodgeAt = now;
    if (res.damage > 0) this.me.hurt(res.damage);
    const used = def.slip ? 'slip' : def.duck ? 'duck' : def.guard === 'open' ? 'none' : 'guard';
    this.link.sendResult({ id: inc.attack.id, outcome: res.outcome, damage: res.damage, hp: this.me.hp, defense: used }, now);
    this.emit('defended', { attack: inc.attack, ...res, def, hp: this.me.hp });
    if (this.me.down) this.#knockout('foe', now);
  }

  #knockout(winner, now) {
    if (!this.rules.roundKo) {
      this.#finish({ winner, method: 'ko' }, now);
      return;
    }
    if (this.phase !== 'round' || this.roundOver) return;
    this.roundOver = true;
    this.incomingQ.length = 0;
    // The follower waits for the host's bell; the host scores the round.
    if (this.authority) this.#endRound(winner, 'ko', now);
  }

  #endRound(winner, method, now) {
    if (winner === 'me' || winner === 'foe') this.wins[winner]++;
    this.lastRound = { winner, method };
    if (this.round < this.rules.rounds) this.#enter('break', this.round, now);
    else this.#decide(now);
  }

  #advance(now) {
    if (this.phase === 'intro') this.#enter('round', 1, now);
    else if (this.phase === 'round') {
      if (this.rules.roundKo) this.#endRound(this.#hpLeader(), 'points', now);
      else if (this.round < this.rules.rounds) this.#enter('break', this.round, now);
      else this.#decide(now);
    } else if (this.phase === 'break') this.#enter('round', this.round + 1, now);
  }

  #enter(phase, round, now, msOverride) {
    const seconds = { intro: this.rules.introSeconds, round: this.rules.roundSeconds, break: this.rules.breakSeconds }[phase];
    const ms = msOverride ?? seconds * 1000;
    this.phase = phase;
    this.round = round;
    this.endsAt = now + ms;
    this.knocked = false;
    this.roundOver = false;
    if (phase === 'break') {
      this.incomingQ.length = 0;
      if (!this.rules.resetHp) {
        this.me.heal(this.rules.breakHeal);
        if (this.link.local) this.foe.heal(this.rules.breakHeal);
      }
      this.me.stamina = CONFIG.fight.stamina.max;
    }
    if (phase === 'round' && this.rules.resetHp && round > 1) {
      this.me.reset();
      this.foe.reset();
    }
    if (this.authority) {
      const extra = this.rules.roundKo ? { wins: { ...this.wins }, last: this.lastRound } : {};
      this.link.sendPhase?.({ phase, round, ms, ...extra });
    }
    this.emit('phase', { phase, round, endsAt: this.endsAt, ms, wins: { ...this.wins }, last: this.lastRound });
  }

  #hpLeader() {
    const a = Math.round(this.me.hp);
    const b = Math.round(this.foe.hp);
    return a > b ? 'me' : a < b ? 'foe' : 'draw';
  }

  #decide(now) {
    if (this.rules.roundKo) {
      const { me, foe } = this.wins;
      this.#finish({ winner: me > foe ? 'me' : me < foe ? 'foe' : 'draw', method: 'rounds', wins: { ...this.wins } }, now);
      return;
    }
    this.#finish({ winner: this.#hpLeader(), method: 'points' }, now);
  }

  #finish(result, now) {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.result = result;
    this.endsAt = now;
    this.incomingQ.length = 0;
    this.link.sendEnd?.(result);
    this.emit('over', result);
  }
}
