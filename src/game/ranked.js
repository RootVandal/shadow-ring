import { load, save } from '../util/store.js';
import { CONFIG } from '../config.js';
import { grant } from './shop.js';

// РЕЙТИНГ: 7 рангов по 3 ступени (Бронза 1 → … → Невозможный 3), всего 21 ступень.
// Ступень номер step (0…20). Чтобы подняться, нужно набрать побед: чем выше, тем
// больше (CONFIG.ranked). Поражение отнимает победы, но ниже текущей ступени не
// опускает. За первый вход в новый ранг (Серебро 1, Золото 1, …) — перчатки.
// Хранится в этом браузере, как деньги и рекорды.

export const RANKS = [
  { id: 'bronze', name: 'Бронза', glove: null },
  { id: 'silver', name: 'Серебро', glove: 'r-silver' },
  { id: 'gold', name: 'Золото', glove: 'r-gold' },
  { id: 'platinum', name: 'Платина', glove: 'r-plat' },
  { id: 'diamond', name: 'Алмаз', glove: 'r-diamond' },
  { id: 'legend', name: 'Легенда', glove: 'r-legend' },
  { id: 'impossible', name: 'Невозможный', glove: 'r-impossible' },
];

export const DIVISIONS = 3;
export const TOP = RANKS.length * DIVISIONS - 1; // последняя ступень — Невозможный 3

/** Ступень → ранг, номер внутри ранга (1…3) и подпись «Золото 2». */
export function rankOf(step) {
  const s = Math.min(TOP, Math.max(0, Math.floor(step) || 0));
  const rank = RANKS[Math.floor(s / DIVISIONS)];
  const div = (s % DIVISIONS) + 1;
  return { step: s, rank, div, label: `${rank.name} ${div}` };
}

/** Сколько побед нужно на ступени step, чтобы подняться на следующую. */
export const winsToNext = (step) => CONFIG.ranked.winsBase + step * CONFIG.ranked.winsStep;

function read() {
  const r = load('ranked', null);
  return {
    step: Number.isInteger(r?.step) ? Math.min(TOP, Math.max(0, r.step)) : 0,
    stars: Number.isInteger(r?.stars) ? Math.max(0, r.stars) : 0,
    quick: Number.isInteger(r?.quick) ? r.quick : 0, // сыграно боёв со случайными соперниками
    played: Number.isInteger(r?.played) ? r.played : 0, // рейтинговых боёв
  };
}

export const ranked = () => read();
export const unlocked = (r = read()) => r.quick >= CONFIG.ranked.unlockAfter;

/** Бой со случайным соперником закончился — считаем для открытия рейтинга. */
export function countQuick() {
  const r = read();
  r.quick++;
  save('ranked', r);
  return r;
}

/**
 * Итог рейтингового боя. Чистая функция: принимает состояние, возвращает новое
 * и что произошло (для экрана результатов и тестов).
 * @returns {{state:object, before:number, after:number, promoted:boolean, reward:string|null}}
 */
export function nextState(r, win) {
  const state = { ...r, played: r.played + 1 };
  const before = r.step;
  let promoted = false;
  if (win) {
    state.stars = r.stars + 1;
    if (state.step < TOP && state.stars >= winsToNext(state.step)) {
      state.step++;
      state.stars = 0;
      promoted = true;
    }
  } else {
    state.stars = Math.max(0, r.stars - CONFIG.ranked.lossStars);
  }
  const { rank, div } = rankOf(state.step);
  const reward = promoted && div === 1 ? rank.glove : null;
  return { state, before, after: state.step, promoted, reward };
}

/** Записать итог рейтингового боя. */
export function applyResult(win) {
  const res = nextState(read(), win);
  save('ranked', res.state);
  return res;
}

/** Только для проверки на своём компьютере (?debug): поставить ступень. */
export function setStep(step, quick = CONFIG.ranked.unlockAfter) {
  const r = read();
  const s = rankOf(step).step;
  save('ranked', { ...r, step: s, stars: 0, quick: Math.max(r.quick, quick) });
  for (const rank of RANKS.slice(0, Math.floor(s / DIVISIONS) + 1)) if (rank.glove) grant(rank.glove);
  return read();
}
