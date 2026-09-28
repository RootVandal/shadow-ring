import { Screen } from '../screen.js';
import { tile } from './menu.js';
import { h } from '../../util/dom.js';
import { verdict } from '../../game/coach.js';
import { recordFight, scoreOf } from '../../game/records.js';
import { PoseAnimator } from '../../render/animator.js';
import { KIND } from '../../strings.js';

const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);

/** Verdict, numbers and — most important — what to work on next time. */
export class ResultsScreen extends Screen {
  enter() {
    const { app, params } = this;
    const { report, result, mode, level, foeName, round, secondsLeft, koSeconds, myHp, foeHp, link } = params;
    app.stage.setMode('showcase');
    app.cursor.setEnabled(true);
    app.tracker.warnGuard = false;

    // The Shadow stays down after a knockout, or celebrates a win.
    const pose = new PoseAnimator();
    if (result.winner === 'me' && result.method === 'ko') pose.knockout();
    else if (result.winner === 'foe') pose.celebrate();
    app.foeDriver = (now, dt) => pose.update(dt);

    const modeKey = mode === 'online' ? 'online' : `bot:${level}`;
    const outcome = { ...result, secondsLeft };
    const score = scoreOf(report, outcome, modeKey);
    const win = result.winner === 'me';
    const saved = recordFight({
      at: Date.now(),
      mode: modeKey,
      opponent: foeName,
      result: win ? 'win' : result.winner === 'foe' ? 'loss' : 'draw',
      method: result.method,
      score,
      technique: report.technique,
      accuracy: report.accuracy,
      dealt: Math.round(report.dealt),
      taken: Math.round(report.taken),
      koSeconds: win && result.method === 'ko' ? Math.round(koSeconds) : null,
    });
    const v = verdict(report);

    const title = result.winner === 'draw' ? 'Ничья' : win ? 'Победа' : 'Поражение';
    const how =
      result.method === 'ko'
        ? `${win ? 'нокаутом' : 'нокаут'} в ${round}-м раунде`
        : result.method === 'forfeit'
          ? win
            ? 'соперник покинул ринг'
            : 'бой остановлен'
          : `по очкам · ${Math.ceil(myHp)} : ${Math.ceil(Math.max(0, foeHp))} HP`;
    const badges = {
      score: 'новый рекорд очков',
      technique: 'лучшая техника',
      ko: 'самый быстрый нокаут',
    };

    const stat = (value, label) => h('div.stat', h('b', value), h('span', label));
    const kinds = Object.entries(report.kinds).filter(([, k]) => k.thrown > 0);

    this.mount(
      h(
        'section.screen.results',
        h(
          'div.results__grid',
          h(
            'div',
            h('p.muted.mono', { style: { fontSize: '13px', letterSpacing: '.12em', textTransform: 'uppercase' } }, `${app.settings.name} vs ${foeName}`),
            h(`h1.verdict${win ? '.is-win' : result.winner === 'foe' ? '.is-loss' : ''}`, title),
            h('p.verdict__how', how),
            h(
              'div.score',
              h('div.grade', v.grade),
              h('div', h('div.score__num', score.toLocaleString('ru-RU')), h('div.score__label', 'очков · оценка техники слева')),
            ),
            saved.broke.length ? h('div.badges', saved.broke.map((b) => h('span.badge', badges[b]))) : null,
            h(
              'div.actions',
              tile({ title: 'Реванш', num: 'ещё раз', accent: '.tile--tape', onclick: () => this.#rematch() }),
              tile({ title: 'Меню', num: 'выход', onclick: () => this.#leave('menu') }),
              tile({ title: 'Рекорды', num: 'прогресс', accent: '.tile--blue', onclick: () => this.#leave('records') }),
            ),
          ),
          h(
            'div',
            { style: { display: 'grid', gap: '26px', alignContent: 'start' } },
            h(
              'div.stats',
              stat(`${report.landed}/${report.thrown}`, 'удары в цель'),
              stat(pct(report.accuracy), 'точность'),
              stat(pct(report.technique), 'техника'),
              stat(Math.round(report.dealt), 'урон нанесён'),
              stat(Math.round(report.taken), 'урон получен'),
              stat(report.defenseRate == null ? '—' : pct(report.defenseRate), 'защита сработала'),
            ),
            h(
              'div',
              h('h3.section-title', 'Над чем работать'),
              v.work.length
                ? h(
                    'ol.work',
                    v.work.map((w) => h('li', w.text, ' ', h('small', `×${w.count}`))),
                  )
                : h('p.muted', 'Тренеру не к чему придраться. Попробуй уровень сложнее.'),
              v.unused.length ? h('p.muted', { style: { marginTop: '10px', fontSize: '14px' } }, `Ни разу не использовал: ${v.unused.join(', ')}.`) : null,
            ),
            kinds.length
              ? h(
                  'div',
                  h('h3.section-title', 'Удары'),
                  h(
                    'table.kinds',
                    h('tr', h('th', 'удар'), h('th', 'брошено'), h('th', 'в цель'), h('th', 'техника')),
                    kinds.map(([k, s]) =>
                      h(
                        'tr',
                        h('td', KIND[k]),
                        h('td', String(s.thrown)),
                        h('td', String(s.landed)),
                        h('td', pct(s.technique), h('span.qbar', h('i', { style: { width: pct(s.technique) } }))),
                      ),
                    ),
                  ),
                )
              : null,
          ),
        ),
      ),
    );
    app.voice.say(`${title}. ${v.work[0] ? `Работай над этим: ${v.work[0].text}` : 'Отличная техника.'}`, { interrupt: true });

    this.link = link;
    if (link) {
      this.listen(link, 'again', () => {
        this.peerAgain = true;
        this.#maybeRestart();
      });
      this.listen(link, 'gone', () => {
        this.linkGone = true;
      });
    }
  }

  #rematch() {
    const { app, params } = this;
    if (params.mode !== 'online') {
      app.go('fight', { mode: 'bot', level: params.level });
      return;
    }
    if (this.linkGone || !this.link?.open) {
      app.go('lobby');
      return;
    }
    this.meAgain = true;
    this.link.sendAgain();
    this.el.querySelector('.actions .tile')?.replaceChildren(h('span.tile__num', 'ждём соперника'), h('div.tile__title', 'Реванш?'));
    this.#maybeRestart();
  }

  #maybeRestart() {
    if (!this.meAgain || !this.peerAgain) return;
    const { params } = this;
    this.keepLink = true;
    this.app.go('fight', { mode: 'online', link: this.link, role: params.role, foeName: params.foeName });
  }

  #leave(to) {
    this.app.go(to);
  }

  exit() {
    super.exit();
    this.app.foeDriver = null;
    if (this.link && !this.keepLink) this.link.close();
  }
}
