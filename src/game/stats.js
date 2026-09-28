import { PUNCH_KINDS, isLanded, isMiss } from './rules.js';

const blank = () => ({
  thrown: 0,
  landed: 0,
  blocked: 0,
  missed: 0,
  dealt: 0,
  incoming: 0,
  taken: 0,
  hitsTaken: 0,
  dodges: 0,
  blocks: 0,
  attempts: 0,
  counters: 0,
  quality: [],
  kinds: Object.fromEntries(PUNCH_KINDS.map((k) => [k, { thrown: 0, landed: 0, quality: [] }])),
  faults: {},
});

const bump = (faults, code) => (faults[code] = (faults[code] ?? 0) + 1);
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

/** Everything that happened in a fight, per round and in total. */
export class MatchStats {
  constructor() {
    this.rounds = [];
    this.cur = blank();
    this.all = blank();
    this.combo = 0;
    this.bestCombo = 0;
  }

  #both(fn) {
    fn(this.cur);
    fn(this.all);
  }

  /** A recognized punch that the match accepted, with its technique grade. */
  punch(ev) {
    this.#both((s) => {
      s.quality.push(ev.quality);
      s.kinds[ev.kind].quality.push(ev.quality);
      for (const f of ev.faults) bump(s.faults, f.code);
    });
  }

  attempt(ev) {
    this.#both((s) => {
      s.attempts++;
      bump(s.faults, `attempt_${ev.type}_${ev.reason}`);
    });
  }

  fault(code) {
    this.#both((s) => bump(s.faults, code));
  }

  thrown(attack) {
    this.#both((s) => {
      s.thrown++;
      s.kinds[attack.kind].thrown++;
      if (attack.counter) s.counters++;
      if (attack.tired) bump(s.faults, 'tired');
    });
  }

  landed({ attack, outcome, damage }) {
    this.#both((s) => {
      s.dealt += damage;
      if (isLanded(outcome)) {
        s.landed++;
        s.kinds[attack.kind].landed++;
      } else if (outcome === 'blocked') s.blocked++;
      else s.missed++;
    });
    if (isLanded(outcome)) {
      this.combo++;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
    } else this.combo = 0;
  }

  defended({ outcome, damage, lesson }) {
    this.#both((s) => {
      s.incoming++;
      s.taken += damage;
      if (isMiss(outcome)) s.dodges++;
      else if (outcome === 'blocked') s.blocks++;
      else s.hitsTaken++;
      if (lesson) bump(s.faults, lesson);
    });
    if (isLanded(outcome)) this.combo = 0;
  }

  endRound() {
    this.rounds.push(this.cur);
    this.cur = blank();
  }

  static summarize(s) {
    return {
      thrown: s.thrown,
      landed: s.landed,
      accuracy: s.thrown ? s.landed / s.thrown : 0,
      technique: avg(s.quality),
      dealt: s.dealt,
      taken: s.taken,
      incoming: s.incoming,
      dodges: s.dodges,
      blocks: s.blocks,
      hitsTaken: s.hitsTaken,
      defenseRate: s.incoming ? (s.dodges + s.blocks) / s.incoming : null,
      attempts: s.attempts,
      counters: s.counters,
      kinds: Object.fromEntries(
        PUNCH_KINDS.map((k) => [k, { thrown: s.kinds[k].thrown, landed: s.kinds[k].landed, technique: avg(s.kinds[k].quality) }]),
      ),
      topFaults: Object.entries(s.faults)
        .sort((a, b) => b[1] - a[1])
        .map(([code, count]) => ({ code, count })),
    };
  }

  roundSummary() {
    return MatchStats.summarize(this.cur);
  }

  report() {
    const rounds = this.cur.thrown || this.cur.incoming ? [...this.rounds, this.cur] : this.rounds;
    return { ...MatchStats.summarize(this.all), bestCombo: this.bestCombo, rounds: rounds.map(MatchStats.summarize) };
  }
}
