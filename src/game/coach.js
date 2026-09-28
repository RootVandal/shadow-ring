import { Emitter } from '../util/emitter.js';
import { TIPS, TIP_FOCUS, KIND } from '../strings.js';

// The corner coach. Everything the recognizer notices ends up here, and the
// coach decides what is worth saying *now*: one tip at a time, the most
// important one, never the same thing twice in a row. Being told "your elbow
// is low" ten times per round teaches nothing.

const PRIORITY = { praise: 1, info: 2, attempt: 3, fault: 3, guard: 3, lesson: 4, framing: 5 };
const REPEAT_MS = { praise: 9000, default: 4500 };

export const format = (s, params = {}) => s.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? '');

export class Coach extends Emitter {
  /** @param {{voice?: {say(text:string, o?:object):void}}} [o] */
  constructor({ voice = null } = {}) {
    super();
    this.voice = voice;
    this.current = null;
    this.last = new Map();
    this.lastSpoken = -Infinity;
    this.muted = false;
  }

  /**
   * Offers a tip. Returns true if the coach actually said it.
   * @param {string} code  key in TIPS (or any id, when `text` is given)
   * @param {{kind?:string, now?:number, params?:object, side?:string, text?:string}} [o]
   */
  tip(code, { kind = 'fault', now = performance.now(), params, side, text } = {}) {
    if (this.muted || (!TIPS[code] && !text)) return false;
    const priority = PRIORITY[kind] ?? 2;
    const cur = this.current;
    if (cur && now < cur.until && cur.priority > priority && now - cur.at < 1500) return false;
    if (now - (this.last.get(code) ?? -Infinity) < (REPEAT_MS[kind] ?? REPEAT_MS.default)) return false;
    this.last.set(code, now);
    const focus = TIP_FOCUS[code] ? { ...TIP_FOCUS[code], side: TIP_FOCUS[code].side ?? side } : null;
    this.current = {
      code,
      kind,
      priority,
      text: text ?? format(TIPS[code], params),
      at: now,
      until: now + (priority >= 4 ? 3400 : 2700),
      focus,
    };
    this.emit('tip', this.current);
    if (this.voice && priority >= 3 && now - this.lastSpoken > 2200) {
      this.voice.say(this.current.text, { interrupt: priority >= 4 });
      this.lastSpoken = now;
    }
    return true;
  }

  update(now) {
    if (this.current && now > this.current.until) this.clear();
  }

  clear() {
    this.current = null;
    this.emit('tip', null);
  }
}

/** What the coach says in the corner between rounds. */
export function roundTalk(sum, round) {
  const lines = [];
  lines.push(`Ударов ${sum.thrown}, в цель ${sum.landed}${sum.thrown ? ` — ${Math.round(sum.accuracy * 100)}%` : ''}`);
  if (sum.incoming) lines.push(`Защита: ушёл ${sum.dodges}, заблокировал ${sum.blocks}, пропустил ${sum.hitsTaken}`);
  if (sum.technique != null) lines.push(`Техника ударов: ${Math.round(sum.technique * 100)}%`);

  const top = sum.topFaults.find((f) => TIPS[f.code] && f.count >= 2) ?? sum.topFaults.find((f) => TIPS[f.code]);
  let headline;
  let focus = null;
  if (!sum.thrown) {
    headline = 'Ты не бросил ни одного удара. Очки сами себя не наберут — работай джебом.';
  } else if (top) {
    focus = top.code;
    headline = `${TIPS[top.code]}${top.count > 1 ? ` (×${top.count})` : ''}`;
  } else if (sum.accuracy < 0.35) {
    headline = 'Бей, когда соперник открыт: сразу после его удара руки у него внизу.';
  } else {
    headline = 'Чистый раунд. Держи темп и не опускай руки.';
  }
  return { title: `Раунд ${round} позади`, headline, focus, lines };
}

const GRADES = [
  [0.9, 'S'],
  [0.8, 'A'],
  [0.7, 'B'],
  [0.6, 'C'],
  [0, 'D'],
];

/** The post-fight breakdown: grade, best/worst punch and what to work on. */
export function verdict(report) {
  const tech = report.technique ?? 0;
  const grade = report.thrown ? GRADES.find(([min]) => tech >= min)[1] : '—';

  const kinds = Object.entries(report.kinds).filter(([, k]) => k.thrown > 0 && k.technique != null);
  kinds.sort((a, b) => b[1].technique - a[1].technique);
  const best = kinds[0] ? { kind: kinds[0][0], label: KIND[kinds[0][0]], technique: kinds[0][1].technique } : null;
  const worst = kinds.length > 1 ? { kind: kinds.at(-1)[0], label: KIND[kinds.at(-1)[0]], technique: kinds.at(-1)[1].technique } : null;

  const work = [];
  for (const f of report.topFaults) {
    if (!TIPS[f.code] || work.length >= 3) continue;
    work.push({ code: f.code, text: TIPS[f.code], count: f.count });
  }
  if (report.defenseRate != null && report.defenseRate < 0.4 && work.length < 3) {
    work.push({ code: 'defense', text: 'Больше защиты: от прямого и апперкота — уклон, от хука — нырок.', count: report.hitsTaken });
  }
  const unused = Object.entries(report.kinds)
    .filter(([, k]) => k.thrown === 0)
    .map(([kind]) => KIND[kind].toLowerCase());
  return { grade, best, worst, work, unused };
}
