import { load, save } from '../util/store.js';

// Fight history and personal records, kept in localStorage on this device.

const HISTORY = 'history';
const MODE_BONUS = { 'bot:easy': 0.8, 'bot:normal': 1, 'bot:hard': 1.3, online: 1.25 };

/**
 * Points for the leaderboard: damage and clean hits, technique (a big share —
 * that's the point of the game), defense, and the result itself.
 */
export function scoreOf(report, outcome, mode) {
  const { winner, method, secondsLeft = 0 } = outcome;
  let s = report.dealt * 10 + report.landed * 12 + (report.dodges + report.blocks) * 15 + (report.technique ?? 0) * 400;
  s -= report.taken * 3;
  if (winner === 'me') s += 800 + (method === 'ko' ? 500 + secondsLeft * 8 : 0);
  return Math.max(0, Math.round(s * (MODE_BONUS[mode] ?? 1)));
}

export function history() {
  const h = load(HISTORY, []);
  return Array.isArray(h) ? h : [];
}

/** Saves a finished fight; returns which personal bests it broke. */
export function recordFight(entry) {
  const h = history();
  const prev = bests(h);
  h.push(entry);
  while (h.length > 60) h.shift();
  save(HISTORY, h);
  const broke = [];
  if (entry.score > (prev.score ?? -1)) broke.push('score');
  if (entry.technique != null && entry.technique > (prev.technique ?? -1)) broke.push('technique');
  if (entry.result === 'win' && entry.method === 'ko' && entry.koSeconds != null && entry.koSeconds < (prev.koSeconds ?? Infinity)) broke.push('ko');
  return { broke, rank: leaderboard(h).findIndex((e) => e === entry) + 1 };
}

export function bests(h = history()) {
  const out = { score: null, technique: null, koSeconds: null, wins: 0, fights: h.length };
  for (const e of h) {
    if (out.score === null || e.score > out.score) out.score = e.score;
    if (e.technique != null && (out.technique === null || e.technique > out.technique)) out.technique = e.technique;
    if (e.result === 'win') out.wins++;
    if (e.result === 'win' && e.method === 'ko' && e.koSeconds != null && (out.koSeconds === null || e.koSeconds < out.koSeconds)) out.koSeconds = e.koSeconds;
  }
  return out;
}

export function leaderboard(h = history(), limit = 10) {
  return [...h].sort((a, b) => b.score - a.score).slice(0, limit);
}
