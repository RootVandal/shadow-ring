import { Screen } from '../screen.js';
import { h } from '../../util/dom.js';
import { history, leaderboard, bests } from '../../game/records.js';

const MODE = { 'bot:easy': 'Тень · лёгкий', 'bot:normal': 'Тень · средний', 'bot:hard': 'Тень · жёсткий', online: 'онлайн' };
const RESULT = { win: 'победа', loss: 'поражение', draw: 'ничья' };
const SVG = 'http://www.w3.org/2000/svg';

function svg(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  el.append(...kids);
  return el;
}

/**
 * Technique over the last fights: a quiet line, the latest fight marked in the
 * accent, every point hoverable. One series, so no legend — the heading names it.
 */
function sparkline(points) {
  const W = 520;
  const H = 140;
  const pad = { l: 34, r: 16, t: 12, b: 20 };
  const x = (i) => pad.l + (points.length < 2 ? (W - pad.l - pad.r) / 2 : (i / (points.length - 1)) * (W - pad.l - pad.r));
  const y = (v) => pad.t + (1 - v) * (H - pad.t - pad.b);
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'spark', role: 'img', 'aria-label': 'Техника по боям, от старых к новым' });
  for (const v of [0.5, 1]) {
    root.append(
      svg('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), stroke: 'rgba(239,232,218,0.12)', 'stroke-width': 1 }),
      svg('text', { x: pad.l - 8, y: y(v) + 4, 'text-anchor': 'end', fill: '#948b7c', 'font-size': 11, 'font-family': 'JetBrains Mono, monospace' }, `${v * 100}%`),
    );
  }
  root.append(svg('line', { x1: pad.l, x2: W - pad.r, y1: y(0), y2: y(0), stroke: 'rgba(239,232,218,0.3)', 'stroke-width': 1 }));
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');
  root.append(svg('path', { d, fill: 'none', stroke: 'rgba(239,232,218,0.5)', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  points.forEach((p, i) => {
    const last = i === points.length - 1;
    const g = svg('g', {}, svg('title', {}, p.label));
    g.append(svg('circle', { cx: x(i), cy: y(p.v), r: 12, fill: 'transparent' }));
    g.append(svg('circle', { cx: x(i), cy: y(p.v), r: last ? 5 : 3, fill: last ? '#f2c94c' : '#cfc6b4', stroke: '#171513', 'stroke-width': 2 }));
    root.append(g);
  });
  const lastPt = points.at(-1);
  if (lastPt) {
    root.append(
      svg(
        'text',
        { x: Math.min(W - pad.r, x(points.length - 1)), y: Math.max(pad.t + 10, y(lastPt.v) - 12), 'text-anchor': 'end', fill: '#efe8da', 'font-size': 12, 'font-family': 'JetBrains Mono, monospace', 'font-weight': 700 },
        `${Math.round(lastPt.v * 100)}%`,
      ),
    );
  }
  return root;
}

export class RecordsScreen extends Screen {
  static covers = true;

  enter() {
    const { app } = this;
    app.stage.setMode('showcase');
    app.cursor.setEnabled(true);
    const all = history();
    const board = leaderboard(all);
    const best = bests(all);
    const withTech = all.filter((e) => e.technique != null).slice(-20);
    const avgPrev = withTech.length > 1 ? withTech.slice(0, -1).reduce((s, e) => s + e.technique, 0) / (withTech.length - 1) : null;
    const lastTech = withTech.at(-1)?.technique ?? null;
    const delta = lastTech != null && avgPrev != null ? Math.round((lastTech - avgPrev) * 100) : null;
    const date = (t) => new Date(t).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
    const stat = (value, label) => h('div.stat', h('b', value), h('span', label));
    const right = { style: { textAlign: 'right' } };

    this.mount(
      h(
        'section.screen.results',
        h(
          'div.results__grid',
          h(
            'div',
            h('h1.menu__title', 'Рекорды'),
            h('p.muted', { style: { margin: '10px 0 22px' } }, 'Хранятся на этом устройстве. Очки считают урон, чистые попадания, защиту и — больше всего — технику.'),
            board.length
              ? h(
                  'table.board',
                  h('tr', h('th', '#'), h('th', 'дата'), h('th', 'соперник'), h('th', 'итог'), h('th', right, 'техника'), h('th', right, 'очки')),
                  board.map((e, i) =>
                    h(
                      'tr',
                      h('td.num', String(i + 1)),
                      h('td', date(e.at)),
                      h('td', `${e.opponent ?? '—'}`, h('small.muted', ` ${MODE[e.mode] ?? ''}`)),
                      h('td', `${RESULT[e.result] ?? e.result}${e.method === 'ko' && e.result === 'win' ? ' · КО' : ''}`),
                      h('td.num', e.technique != null ? `${Math.round(e.technique * 100)}%` : '—'),
                      h('td.num', e.score.toLocaleString('ru-RU')),
                    ),
                  ),
                )
              : h('p', 'Пока ни одного боя. Самое время начать.'),
            h(
              'div.actions',
              h('button.tile.tile--tape', { dataset: { dwell: '' }, onclick: () => app.go('level') }, h('span.tile__num', 'в бой'), h('div.tile__title', 'Спарринг')),
              h('button.tile', { dataset: { dwell: '' }, onclick: () => app.go('menu') }, h('span.tile__num', 'назад'), h('div.tile__title', 'Меню')),
            ),
          ),
          h(
            'div',
            { style: { display: 'grid', gap: '26px', alignContent: 'start' } },
            h(
              'div.stats',
              stat(`${best.wins}/${best.fights}`, 'побед / боёв'),
              stat(best.score != null ? best.score.toLocaleString('ru-RU') : '—', 'лучший счёт'),
              stat(best.koSeconds != null ? `${best.koSeconds} с` : '—', 'самый быстрый нокаут'),
            ),
            h(
              'div',
              h('h3.section-title', 'Техника по боям'),
              withTech.length
                ? h(
                    'div',
                    h(
                      'p',
                      { style: { margin: '0 0 8px', fontSize: '15px' } },
                      h('b', { style: { fontSize: '32px', fontWeight: 700, marginRight: '10px' } }, `${Math.round(lastTech * 100)}%`),
                      h('span.muted', delta == null ? 'последний бой' : `последний бой · ${delta >= 0 ? '+' : '−'}${Math.abs(delta)} п.п. к среднему`),
                    ),
                    sparkline(
                      withTech.map((e, i) => ({
                        v: e.technique,
                        label: `Бой ${all.length - withTech.length + i + 1} · ${date(e.at)} · техника ${Math.round(e.technique * 100)}% · ${RESULT[e.result] ?? ''}`,
                      })),
                    ),
                  )
                : h('p.muted', 'Появится после первого боя.'),
            ),
          ),
        ),
      ),
    );
  }
}
