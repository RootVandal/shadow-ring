import qrcode from 'qrcode';
import { Screen } from '../screen.js';
import { tile } from './menu.js';
import { h, clear, mmss } from '../../util/dom.js';
import { hostRoom, joinRoom, quickMatch } from '../../net/peer.js';
import { RemoteLink } from '../../net/remote.js';

const ERRORS = {
  lib: 'Не загрузился сетевой модуль. Проверь интернет и обнови страницу.',
  server: 'Сервер соединения не отвечает. Проверь интернет или попробуй через минуту.',
  timeout: 'Соединение не установилось. Бывает в строгих сетях (офис, VPN) — попробуй другую сеть.',
  nobody: 'Комната не найдена: друг ещё не создал её или уже вышел.',
  busy: 'В этой комнате уже идёт бой.',
  version: 'У соперника другая версия игры — обновите страницы.',
  full: 'Все места поиска заняты. Попробуй ещё раз или позови друга по ссылке.',
  peer: 'Соединение оборвалось.',
  taken: 'Не удалось создать комнату. Попробуй ещё раз.',
};

/** Online: random opponent, private room (link + QR), or a code from a friend. */
export class LobbyScreen extends Screen {
  enter() {
    const { app, params } = this;
    app.stage.setMode('showcase');
    app.cursor.setEnabled(true);
    this.abort = new AbortController();
    this.body = h('div', { style: { display: 'grid', gap: '22px', alignContent: 'start' } });
    this.mount(
      h(
        'section.screen.menu.shade-left',
        h(
          'div.menu__head',
          h(
            'div',
            h('h1.menu__title', 'Онлайн-бой'),
            h('p.muted', { style: { marginTop: '10px', maxWidth: '60ch' } }, app.settings.shareCam
                ? 'Три раунда, у обоих по 100 HP. Соперник видит твою камеру — выключить можно в настройках.'
                : 'Три раунда, у обоих по 100 HP. Камера скрыта: сопернику уходит только скелет — 13 точек.'),
          ),
        ),
        this.body,
        h('div.menu__foot', h('span.hand-hint', h('i'), 'Для рук: подними ладонь и задержи на кнопке.'), h('button.btn.btn--ghost.btn--small', { dataset: { dwell: '' }, onclick: () => app.go('menu') }, 'В меню')),
      ),
    );
    if (params.join) this.#join(params.join);
    else this.#choose();
  }

  #view(...children) {
    clear(this.body).append(...children);
  }

  #choose() {
    this.#view(
      h(
        'div.tiles.tiles--3',
        tile({ title: 'Случайный соперник', text: 'Первый, кто сейчас ищет бой, — где бы он ни был.', num: 'поиск', accent: '.tile--blue', onclick: () => this.#quick() }),
        tile({ title: 'Позвать друга', text: 'Комната со ссылкой и QR-кодом — можно драться с телефона.', num: 'комната', accent: '.tile--tape', onclick: () => this.#room() }),
        tile({ title: 'Ввести код', text: 'Друг уже создал комнату и прислал код.', num: 'код', onclick: () => this.#codeForm() }),
      ),
    );
  }

  #status(text, extra = null) {
    this.statusText = h('span', text);
    this.#view(h('div.lobby__room', { style: { gridTemplateColumns: '1fr' } }, h('div.status-line', h('i.spinner'), this.statusText), extra));
  }

  async #quick() {
    const started = performance.now();
    const cancel = h('button.btn.btn--ghost.btn--small', { dataset: { dwell: '' }, onclick: () => this.#reset() }, 'Отмена');
    this.#status('Ищем соперника…', h('div', { style: { display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' } }, cancel, h('span.muted', 'Никого? Позови друга ссылкой — так быстрее.')));
    this.tick = () => {
      if (this.statusText) this.statusText.textContent = `Ищем соперника… ${mmss((performance.now() - started) / 1000)}`;
    };
    try {
      const r = await quickMatch({ name: this.app.settings.name, signal: this.abort.signal });
      this.#connected(r);
    } catch (e) {
      this.#fail(e);
    }
  }

  async #room() {
    this.#status('Создаём комнату…');
    try {
      const room = await hostRoom({ name: this.app.settings.name });
      this.hosting = room;
      const qr = qrcode(0, 'M');
      qr.addData(room.link);
      qr.make();
      const qrBox = h('div.qr', { html: qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true }) });
      const copy = h(
        'button.btn.btn--small',
        {
          onclick: async () => {
            try {
              await navigator.clipboard.writeText(room.link);
              copy.textContent = 'Скопировано';
            } catch {
              copy.textContent = 'Выдели и скопируй';
            }
          },
        },
        'Копировать ссылку',
      );
      this.#view(
        h(
          'div.lobby__room',
          qrBox,
          h(
            'div',
            h('p.muted.mono', { style: { fontSize: '12px', letterSpacing: '.12em', textTransform: 'uppercase' } }, 'код комнаты'),
            h('div.room-code', room.code),
            h('div.link-row', h('code', room.link), copy),
            h('div.status-line', { style: { marginTop: '18px' } }, h('i.spinner'), 'Ждём соперника. Отсканируй QR телефоном или отправь ссылку.'),
          ),
        ),
      );
      this.#connected(await room.guest);
    } catch (e) {
      this.#fail(e);
    }
  }

  #codeForm() {
    const input = h('input', { maxlength: 8, placeholder: 'ABCDE', autocomplete: 'off', spellcheck: false });
    const go = () => {
      const code = input.value.trim().toUpperCase();
      if (code.length >= 4) this.#join(code);
    };
    input.addEventListener('keydown', (e) => e.key === 'Enter' && go());
    this.#view(
      h(
        'div.lobby__room',
        { style: { gridTemplateColumns: '1fr' } },
        h('p', 'Код комнаты от друга:'),
        h('div.code-input', input, h('button.btn.btn--small', { onclick: go }, 'Войти')),
        h('p.muted', { style: { fontSize: '14px' } }, 'Проще — открыть ссылку, которую прислал друг: код подставится сам.'),
      ),
    );
    setTimeout(() => input.focus(), 50);
  }

  async #join(code) {
    this.#status(`Подключаемся к комнате ${code}…`);
    try {
      this.#connected(await joinRoom(code, { name: this.app.settings.name }));
    } catch (e) {
      this.#fail(e);
    } finally {
      this.app.pendingRoom = null;
      if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    }
  }

  #connected({ wire, hello, role }) {
    const { app } = this;
    this.handedOff = true;
    this.tick = null;
    const stream = app.settings.shareCam ? (app.input?.cam?.stream ?? null) : null;
    const link = new RemoteLink({ wire, role, stream });
    const foeName = String(hello.name || 'Соперник').slice(0, 18);
    app.sfx.bell(1);
    this.#view(
      h(
        'div.lobby__room',
        { style: { gridTemplateColumns: '1fr', borderTopColor: 'var(--red)' } },
        h('p.muted.mono', { style: { fontSize: '12px', letterSpacing: '.12em', textTransform: 'uppercase' } }, 'соперник найден'),
        h('div.room-code', { style: { letterSpacing: '0' } }, foeName),
        h('p', role === 'host' ? 'Ты в красном углу. Выходим на ринг…' : 'Выходим на ринг…'),
      ),
    );
    app.voice.say(`Соперник найден: ${foeName}`);
    this.later(1800, () => app.go('fight', { mode: 'online', link, role, foeName }));
  }

  #fail(e) {
    if (e?.code === 'aborted') return;
    console.warn(e);
    this.tick = null;
    this.#view(
      h(
        'div.error-card',
        h('h2', 'Не соединились'),
        h('p', ERRORS[e?.code] ?? `${ERRORS.peer} ${e?.message ?? ''}`),
        h(
          'div',
          { style: { display: 'flex', gap: '12px', flexWrap: 'wrap' } },
          h('button.btn.btn--small', { dataset: { dwell: '' }, onclick: () => this.#reset() }, 'Ещё раз'),
          h('button.btn.btn--ghost.btn--small', { dataset: { dwell: '' }, onclick: () => this.app.go('level') }, 'Пока — с Тенью'),
        ),
      ),
    );
  }

  #reset() {
    this.abort.abort();
    this.hosting?.cancel();
    this.hosting = null;
    this.abort = new AbortController();
    this.tick = null;
    this.#choose();
  }

  frame() {
    this.tick?.();
  }

  exit() {
    super.exit();
    if (!this.handedOff) {
      this.abort.abort();
      this.hosting?.cancel();
    }
  }
}
