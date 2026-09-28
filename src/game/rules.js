import { CONFIG } from '../config.js';

// Combat rules. Every punch has a counter, which is what makes defense a skill
// and not a coin flip:
//
//                 guard (both hands)   slip        duck
//   jab / cross   25% damage           miss        miss
//   hook          30%                  HIT +15%    miss
//   uppercut      70% (splits guard)   miss        CRIT ×1.5
//
// Straights are slipped, hooks are ducked, uppercuts are slipped — and ducking
// into an uppercut is the worst thing you can do.

// base damage is tuned so an average fight against the normal bot reaches
// round 2–3: a knockout has to be earned, not found in the first 20 seconds.
export const PUNCHES = {
  jab: { base: 5, cost: 8 },
  cross: { base: 7, cost: 11 },
  hook: { base: 8.5, cost: 13 },
  upper: { base: 9.5, cost: 14 },
};

export const PUNCH_KINDS = Object.keys(PUNCHES);

/** The defense that beats each punch — the coach and the telegraph teach it. */
export const COUNTER = { jab: 'slip', cross: 'slip', hook: 'duck', upper: 'slip' };

/** Time the defender gets between seeing a punch coming and impact, ms. */
export const WINDOW = { jab: 650, cross: 700, hook: 760, upper: 760 };

const GUARD = {
  full: { straight: 0.25, hook: 0.3, upper: 0.7 },
  half: { straight: 0.6, hook: 0.65, upper: 0.85 },
  open: { straight: 1, hook: 1, upper: 1 },
};

const group = (kind) => (kind === 'jab' || kind === 'cross' ? 'straight' : kind);

/**
 * Damage before defense. Technique matters: a clean punch hits ~70% harder
 * than a sloppy one, a tired one does half.
 */
export function attackPower({ kind, quality, tired = false, counter = false }) {
  const technique = 0.55 + 0.6 * quality; // quality 0.2 → 0.67, 1 → 1.15
  return PUNCHES[kind].base * technique * (tired ? 0.5 : 1) * (counter ? CONFIG.fight.counterBonus : 1);
}

/**
 * @typedef {{guard:'full'|'half'|'open', slip:boolean, duck:boolean, slipStale?:boolean, duckStale?:boolean}} Defense
 * @typedef {{outcome:'hit'|'crit'|'blocked'|'slipped'|'ducked', damage:number, lesson:string|null}} Resolution
 */

/**
 * What happens when `attack` lands on someone defending with `def`.
 * `lesson` names the coaching tip for the defender when they did it wrong.
 * @returns {Resolution}
 */
export function resolveHit(attack, def) {
  const { kind, power, quality = 0.8 } = attack;
  const g = group(kind);
  if (def.slip) {
    if (g === 'hook') return { outcome: 'hit', damage: power * 1.15, lesson: 'hit_hook_slipped' };
    return { outcome: 'slipped', damage: 0, lesson: null };
  }
  if (def.duck) {
    if (g === 'upper') return { outcome: 'crit', damage: power * 1.5, lesson: 'hit_upper_ducked' };
    return { outcome: 'ducked', damage: 0, lesson: null };
  }
  const stale = def.slipStale ? 'slip_stale' : def.duckStale ? 'duck_stale' : null;
  const mult = GUARD[def.guard][g];
  if (def.guard === 'open') {
    const crit = quality >= 0.85;
    return { outcome: crit ? 'crit' : 'hit', damage: power * (crit ? 1.25 : 1), lesson: stale ?? `hit_${g}_open` };
  }
  if (g === 'upper') {
    return { outcome: 'hit', damage: power * mult, lesson: stale ?? 'hit_upper_guard' };
  }
  if (def.guard === 'half') {
    return { outcome: 'hit', damage: power * mult, lesson: stale ?? 'hit_half_guard' };
  }
  return { outcome: 'blocked', damage: power * mult, lesson: null };
}

export const isMiss = (outcome) => outcome === 'slipped' || outcome === 'ducked';
export const isLanded = (outcome) => outcome === 'hit' || outcome === 'crit';
