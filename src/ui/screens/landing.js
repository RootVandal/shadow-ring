import { Screen } from '../screen.js';
import { h } from '../../util/dom.js';
import { UI } from '../../strings.js';

export class LandingScreen extends Screen {
  enter() {
    const { app } = this;
    app.stage.setMode('showcase');
    app.cursor.setEnabled(false);
    const room = app.pendingRoom;
    this.progress = h('span.muted.mono', { style: { fontSize: '13px' } });
    this.mount(
      h(
        'section.screen.poster.shade-left',
        h('div.poster__top', h('span', h('b', 'Бой с тенью'), ' · камера вместо джойстика'), h('span', 'красный угол · синий угол')),
        h(
          'div',
          room && h('span.invite', `Тебя позвали на бой · комната ${room}`),
          h('div.poster__brand', h('img.poster__mark', { src: 'img/mark.svg', alt: '' }), h('h1.poster__title', h('span', 'Бой'), h('span.sub', 'с тенью'))),
          h('div.corner-bars', h('i'), h('i')),
          h('p.poster__tagline', UI.tagline),
          h(
            'div.poster__cta',
            h('button.btn', { onclick: () => this.#start(), autofocus: true }, room ? 'Принять вызов' : UI.start),
            this.progress,
          ),
        ),
        h(
          'div',
          { style: { display: 'grid', gap: '18px' } },
          h(
            'div.steps',
            UI.howTo.map(([n, title, text]) => h('div.step', h('b', n), h('strong', title), h('span', text))),
          ),
          h('p.privacy', UI.privacy),
        ),
      ),
    );
  }

  #start() {
    this.app.sfx.unlock();
    this.app.sfx.select();
    this.app.go('setup');
  }

  frame() {
    const p = this.app.loadProgress;
    if (this.app.inputKind === 'puppet') this.progress.textContent = 'режим без камеры: клавиатура';
    else if (p.error) this.progress.textContent = '';
    else if (p.done) this.progress.textContent = 'трекинг загружен ✓';
    else if (p.total) this.progress.textContent = `трекинг ${(p.loaded / 1e6).toFixed(1)} / ${(p.total / 1e6).toFixed(1)} МБ`;
  }
}
