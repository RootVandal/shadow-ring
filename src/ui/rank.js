import { h } from '../util/dom.js';
import { rankOf } from '../game/ranked.js';

/**
 * Значок ранга: щит цвета ранга с номером ступени (1–3).
 * withLabel — ещё и подпись «Золото 2» рядом. Нет ранга (null) — ничего.
 * Цвета — .rank--<id> в css/app.css.
 */
export function rankBadge(step, withLabel = false) {
  if (step == null || !Number.isFinite(Number(step))) return null;
  const { rank, div, label } = rankOf(Number(step));
  const badge = h(`span.rank-badge.rank--${rank.id}`, { title: label }, String(div));
  return withLabel ? h('span.rank-line', badge, h('span.rank-label', label)) : badge;
}
