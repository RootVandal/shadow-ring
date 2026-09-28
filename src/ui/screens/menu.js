import { Screen } from '../screen.js';
import { Pip } from '../pip.js';
import { openSettings } from '../settings.js';
import { h } from '../../util/dom.js';
import { UI } from '../../strings.js';

export function tile({ key = null, title, text, num, accent = '', onclick }) {
  const [t, d] = key ? UI.modes[key] : [title, text];
  return h(
    `button.tile${accent}`,
    { dataset: { dwell: '' }, onclick },
    h('span.tile__num', num),
    h('div', h('div.tile__title', t), d && h('p.tile__text', d)),
  );
}

export class MenuScreen extends Screen {
  enter() {
    const { app } = this;
    app.stage.setMode('showcase');
    app.cursor.setEnabled(true);
    app.foeDriver = null;
    app.tracker.warnGuard = false;
    this.pip = new Pip({ label: 'ты' });
    this.mount(
      h(
        'section.screen.menu.shade-left',
        h(
          'div.menu__head',
          h('div', h('p.muted.mono', { style: { fontSize: '13px', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: '10px' } }, `боец: ${app.settings.name}`), h('h1.menu__title', UI.menuTitle)),
          h('div.menu-pip', this.pip.el),
        ),
        h(
          'div.tiles',
          tile({ key: 'train', num: '01 · 2 мин', accent: '.tile--tape', onclick: () => app.go('tutorial') }),
          tile({ key: 'bot', num: '02 · 3 раунда', onclick: () => app.go('level') }),
          tile({ key: 'online', num: '03 · pvp', accent: '.tile--blue', onclick: () => app.go('lobby') }),
          tile({ key: 'records', num: '04', onclick: () => app.go('records') }),
          tile({ title: 'Магазин', text: 'Перчатки, которые видит соперник. Деньги — за победы онлайн.', num: '05', accent: '.tile--tape', onclick: () => app.go('shop') }),
        ),
        h(
          'div.menu__foot',
          h('span.hand-hint', h('i'), UI.handHint),
          h(
            'div',
            { style: { display: 'flex', gap: '10px', flexWrap: 'wrap' } },
            h('button.btn.btn--ghost.btn--small', { onclick: () => openSettings(app) }, UI.settings),
            h('button.btn.btn--ghost.btn--small', { dataset: { dwell: '' }, onclick: () => app.go('calibrate') }, 'Перекалибровать стойку'),
          ),
        ),
      ),
    );
  }

  frame(now, dt) {
    const { app } = this;
    this.pip.draw({ video: app.input?.video, body: app.tracker.body, hands: app.tracker.hands, dt });
  }
}

export class LevelScreen extends Screen {
  enter() {
    const { app } = this;
    app.stage.setMode('showcase');
    app.cursor.setEnabled(true);
    const go = (level) => () => app.go('fight', { mode: 'bot', level });
    const L = UI.levels;
    this.mount(
      h(
        'section.screen.menu.shade-left',
        h('div.menu__head', h('h1.menu__title', 'Спарринг с Тенью')),
        h(
          'div.tiles.tiles--3',
          tile({ title: L.easy[0], text: L.easy[1], num: 'уровень 1', accent: '.tile--tape', onclick: go('easy') }),
          tile({ title: L.normal[0], text: L.normal[1], num: 'уровень 2', onclick: go('normal') }),
          tile({ title: L.hard[0], text: L.hard[1], num: 'уровень 3', accent: '.tile--blue', onclick: go('hard') }),
        ),
        h(
          'div.menu__foot',
          h('span.hand-hint', h('i'), 'Тень бьёт с замахом — смотри, откуда летит удар, и защищайся.'),
          h('button.btn.btn--ghost.btn--small', { dataset: { dwell: '' }, onclick: () => app.go('menu') }, UI.back),
        ),
      ),
    );
  }
}
