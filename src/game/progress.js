import { load, save } from '../util/store.js';
import { history } from './records.js';

// Первые шаги. Новичок видит в меню три кнопки: разминка, спарринг, онлайн.
// Рекорды, магазин и «Твоя тень» открываются после первого боя, с плашкой
// «новое», пока игрок их не откроет. ?newbie в адресе показывает игру глазами
// новичка, ничего не стирая (для показа).

const KEY = 'progress';

const forced = () => /[?&]newbie\b/.test(globalThis.location?.search ?? '');

export function progress() {
  const p = load(KEY, {});
  return { offered: false, tutorial: false, seen: {}, ...(p && typeof p === 'object' ? p : {}) };
}

export function markProgress(patch) {
  if (forced()) return progress();
  const p = { ...progress(), ...patch };
  save(KEY, p);
  return p;
}

export function markSeen(what) {
  const p = progress();
  markProgress({ seen: { ...p.seen, [what]: true } });
}

/** Сколько боёв уже за плечами. */
export const fightsDone = () => (forced() ? 0 : history().length);

export const isNewbie = () => fightsDone() === 0;

/** Ещё не открывал этот раздел после того, как он появился. */
export const isNew = (what) => !forced() && !progress().seen[what];

/** Сразу после первой калибровки новичка ведём в разминку (один раз). */
export function shouldOfferTutorial() {
  const p = progress();
  return isNewbie() && (forced() || (!p.offered && !p.tutorial));
}
