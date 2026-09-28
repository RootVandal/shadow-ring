import { PUNCHES } from './rules.js';
import { CONFIG } from '../config.js';

/** HP and stamina of one side of the ring. */
export class Fighter {
  constructor({ name, corner, maxHp = CONFIG.fight.maxHp }) {
    this.name = name;
    this.corner = corner;
    this.maxHp = maxHp;
    this.reset();
  }

  reset() {
    this.hp = this.maxHp;
    this.stamina = CONFIG.fight.stamina.max;
    this.lastSpend = -Infinity;
  }

  /**
   * Pays for a punch. Out of stamina the punch still goes out, at half power —
   * flailing is allowed, it just doesn't work.
   * @returns {{tired:boolean}}
   */
  spend(kind, now) {
    const cost = PUNCHES[kind].cost;
    const tired = this.stamina < cost;
    this.stamina = Math.max(0, this.stamina - cost);
    this.lastSpend = now;
    return { tired };
  }

  regen(dt, now) {
    const s = CONFIG.fight.stamina;
    if (now - this.lastSpend > s.regenDelayMs) this.stamina = Math.min(s.max, this.stamina + s.regen * dt);
  }

  hurt(damage) {
    this.hp = Math.max(0, this.hp - damage);
    return this.hp;
  }

  heal(amount) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  get down() {
    return this.hp <= 0;
  }
}
