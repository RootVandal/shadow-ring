import { Screen } from '../screen.js';
import { Pip } from '../pip.js';
import { openSettings } from '../settings.js';
import { h } from '../../util/dom.js';
import { UI } from '../../strings.js';
import { wallet } from '../../game/shop.js';
import { titleTag } from '../title.js';
import { rankBadge } from '../rank.js';
import { ranked, unlocked } from '../../game/ranked.js';
import { isNewbie, isNew, progress, markSeen } from '../../game/progress.js';
import { loadGhost } from '../../game/ghost.js';

export function tile({ key = null, title, text, num, accent = '', badge = null, onclick }) {
  const [t, d] = key ? UI.modes[key] : [title, text];
  return h(
    `button.tile${accent}`,
    { dataset: { dwell: '' }, onclick },
    badge ? h('span.tile__new', badge) : null,
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
    // Новичку — только три кнопки и подсказка, с чего начать (game/progress.js).
    const newbie = isNewbie();
    this.mount(
      h(
        'section.screen.menu.shade-left',
        h(
          'div.menu__head',
          h(
            'div',
            titleTag(wallet().title),
            h(
              'p.muted.mono',
              { style: { fontSize: '13px', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } },
              `боец: ${app.settings.name}`,
              unlocked() ? rankBadge(ranked().step, true) : null,
            ),
            h('h1.menu__title', UI.menuTitle),
          ),
          h('div.menu-pip', this.pip.el),
        ),
        h(
          'div.tiles',
          tile({ key: 'train', num: newbie ? '01 · начни отсюда' : '01 · 2 мин', accent: '.tile--tape', badge: newbie && !progress().tutorial ? 'старт' : null, onclick: () => app.go('tutorial') }),
          tile({ key: 'bot', num: '02 · 3 раунда', onclick: () => app.go('level') }),
          tile({ key: 'online', num: '03 · pvp', accent: '.tile--blue', onclick: () => app.go('lobby') }),
          newbie ? null : tile({ key: 'records', num: '04', badge: isNew('records') ? 'новое' : null, onclick: () => app.go('records') }),
          newbie ? null : tile({ title: 'Магазин', text: 'Перчатки, которые видит соперник. Деньги — за победы онлайн.', num: '05', accent: '.tile--tape', badge: isNew('shop') ? 'новое' : null, onclick: () => app.go('shop') }),
        ),
        newbie ? h('p.menu__note', 'Начни с разминки: за 2 минуты тренер покажет все удары и защиту. Рекорды, магазин и бой со своей тенью откроются после первого боя.') : null,
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
    const tape = loadGhost();
    const ghost = () => {
      if (!tape) {
        app.voice.say('Сначала проведи бой. Тень запомнит, как ты боксируешь.', { interrupt: true });
        return;
      }
      markSeen('ghost');
      app.go('fight', { mode: 'ghost' });
    };
    this.mount(
      h(
        'section.screen.menu.shade-left',
        h('div.menu__head', h('h1.menu__title', 'Спарринг с Тенью')),
        h(
          'div.tiles',
          tile({ title: L.easy[0], text: L.easy[1], num: 'уровень 1', accent: '.tile--tape', onclick: go('easy') }),
          tile({ title: L.normal[0], text: L.normal[1], num: 'уровень 2', onclick: go('normal') }),
          tile({ title: L.hard[0], text: L.hard[1], num: 'уровень 3', accent: '.tile--blue', onclick: go('hard') }),
          tile({ title: 'Свой соперник', text: 'Загрузи фото лица — и оно появится на манекене.', num: 'фото', onclick: () => app.go('face') }),
          tile({
            title: 'Твоя тень',
            text: tape ? 'Ты сам из прошлого боя: твои удары, твой темп, твоя защита. Победи себя.' : 'Проведи любой бой — и Тень запомнит, как ты боксируешь.',
            num: tape ? 'бой с собой' : 'после первого боя',
            accent: tape ? '.tile--blue' : '.tile--blue.tile--locked',
            badge: tape && isNew('ghost') ? 'новое' : null,
            onclick: ghost,
          }),
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
