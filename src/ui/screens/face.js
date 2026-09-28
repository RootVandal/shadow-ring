import { Screen } from '../screen.js';
import { tile } from './menu.js';
import { h } from '../../util/dom.js';
import { UI } from '../../strings.js';

// «СВОЙ СОПЕРНИК»: фото лица на манекене в спарринге с ботом.
// Фото остаётся в этом браузере: никуда не отправляется и не сохраняется —
// только пока открыта вкладка (переменная last ниже). В онлайн-боях лица нет.
// Как лицо ложится на голову — Avatar.setFace (render/avatar.js).

const OUT_W = 224; // картинка для головы 7:8 — под переднюю часть головы манекена
const OUT_H = 256;

/** Последнее фото за эту сессию — чтобы не загружать заново перед реваншем. */
let last = null; // { img, zoom, ox, oy, name }

export class FaceScreen extends Screen {
  enter() {
    const { app } = this;
    app.stage.setMode('showcase');
    app.cursor.setEnabled(true);
    this.state = last ?? { img: null, zoom: 1.6, ox: 0, oy: -0.1, name: '' };
    this.out = document.createElement('canvas');
    this.out.width = OUT_W;
    this.out.height = OUT_H;

    this.preview = h('canvas.face-preview', { width: OUT_W, height: OUT_H });
    this.hint = h('p.muted', 'Фото пока нет — выбери снимок, где лицо смотрит прямо в камеру.');
    const file = h('input', { type: 'file', accept: 'image/*', onchange: (e) => this.#load(e.target.files?.[0]) });
    file.style.display = 'none';
    const pick = h('button.btn.btn--small', { onclick: () => file.click() }, 'Выбрать фото');
    const slider = (label, key, min, max, step) =>
      h(
        'label.face-slider',
        label,
        h('input', { type: 'range', min, max, step, value: this.state[key], oninput: (e) => this.#set(key, Number(e.target.value)) }),
      );
    this.name = h('input', { type: 'text', maxlength: 18, placeholder: 'Имя соперника', value: this.state.name, oninput: (e) => (this.state.name = e.target.value) });

    this.tiles = h('div.tiles');
    this.mount(
      h(
        'section.screen.menu.shade-left',
        h(
          'div.menu__head',
          h(
            'div',
            h('h1.menu__title', 'Свой соперник'),
            h('p.muted', { style: { marginTop: '10px', maxWidth: '60ch' } }, 'Загрузи фото лица — оно появится на манекене. Только в спарринге с ботом. Фото остаётся на этом устройстве и никуда не отправляется.'),
          ),
        ),
        h(
          'div.face-setup',
          h('div.face-stage', this.preview, h('span.muted', { style: { fontSize: '12px' } }, 'двигай пальцем или мышью')),
          h(
            'div.face-controls',
            h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' } }, pick, file, this.hint),
            slider('Приблизить', 'zoom', 1, 4, 0.05),
            slider('Влево — вправо', 'ox', -1, 1, 0.02),
            slider('Вверх — вниз', 'oy', -1, 1, 0.02),
            h('label.field', 'Как зовут соперника', this.name),
          ),
        ),
        this.tiles,
        h(
          'div.menu__foot',
          h('span.hand-hint', h('i'), 'Фото выбирается мышью или пальцем; уровень — и рукой.'),
          h('button.btn.btn--ghost.btn--small', { dataset: { dwell: '' }, onclick: () => app.go('level') }, UI.back),
        ),
      ),
    );
    this.#drag();
    this.#render();
  }

  #load(f) {
    if (!f) return;
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      this.state.img = img;
      this.#render();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      this.hint.textContent = 'Это не похоже на картинку. Попробуй другой файл (jpg, png).';
    };
    img.src = url;
  }

  #set(key, v) {
    this.state[key] = v;
    this.#render();
  }

  /** Перетаскивание фото пальцем или мышью по превью. */
  #drag() {
    let from = null;
    const c = this.preview;
    c.addEventListener('pointerdown', (e) => {
      from = { x: e.clientX, y: e.clientY, ox: this.state.ox, oy: this.state.oy };
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      if (!from || !this.state.img) return;
      const k = 2 / c.clientWidth / Math.max(1, this.state.zoom - 0.6);
      this.state.ox = Math.max(-1, Math.min(1, from.ox - (e.clientX - from.x) * k));
      this.state.oy = Math.max(-1, Math.min(1, from.oy - (e.clientY - from.y) * k));
      for (const r of this.el.querySelectorAll('.face-slider input')) {
        const key = r.parentElement.textContent.startsWith('Влево') ? 'ox' : r.parentElement.textContent.startsWith('Вверх') ? 'oy' : null;
        if (key) r.value = this.state[key];
      }
      this.#render();
    });
    c.addEventListener('pointerup', () => (from = null));
    c.addEventListener('pointercancel', () => (from = null));
  }

  /** Вырезать лицо 3:4 с мягкими краями и показать; уровни доступны, когда фото есть. */
  #render() {
    const { img, zoom, ox, oy } = this.state;
    const g = this.out.getContext('2d');
    g.clearRect(0, 0, OUT_W, OUT_H);
    if (img) {
      const baseW = Math.min(img.naturalWidth, (img.naturalHeight * OUT_W) / OUT_H);
      const baseH = (baseW * OUT_H) / OUT_W;
      const w = baseW / zoom;
      const hh = baseH / zoom;
      const x = (img.naturalWidth - w) / 2 + (ox * (img.naturalWidth - w)) / 2;
      const y = (img.naturalHeight - hh) / 2 + (oy * (img.naturalHeight - hh)) / 2;
      g.drawImage(img, x, y, w, hh, 0, 0, OUT_W, OUT_H);
      // Мягкий овал: края растворяются в голове манекена.
      g.save();
      g.globalCompositeOperation = 'destination-in';
      g.translate(OUT_W / 2, OUT_H / 2);
      g.scale(1, OUT_H / OUT_W);
      const r = OUT_W / 2;
      const grd = g.createRadialGradient(0, 0, r * 0.72, 0, 0, r);
      grd.addColorStop(0, 'rgba(0,0,0,1)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(-r, -r, 2 * r, 2 * r);
      g.restore();
      this.hint.textContent = 'Сдвинь так, чтобы лицо было в центре овала.';
    }
    const p = this.preview.getContext('2d');
    p.fillStyle = '#1d1e26';
    p.fillRect(0, 0, OUT_W, OUT_H);
    p.drawImage(this.out, 0, 0);
    this.#tiles(!!img);
  }

  #tiles(ready) {
    if (this.ready === ready) return;
    this.ready = ready;
    const go = (level) => () => {
      if (!this.state.img) return;
      last = { ...this.state };
      const face = document.createElement('canvas');
      face.width = OUT_W;
      face.height = OUT_H;
      face.getContext('2d').drawImage(this.out, 0, 0);
      this.app.go('fight', { mode: 'bot', level, face, foeName: this.state.name.trim() || 'Соперник' });
    };
    const L = UI.levels;
    const num = ready ? 'в бой' : 'сначала фото';
    this.tiles.replaceChildren(
      tile({ title: L.easy[0], text: L.easy[1], num: `уровень 1 · ${num}`, accent: '.tile--tape', onclick: go('easy') }),
      tile({ title: L.normal[0], text: L.normal[1], num: `уровень 2 · ${num}`, onclick: go('normal') }),
      tile({ title: L.hard[0], text: L.hard[1], num: `уровень 3 · ${num}`, accent: '.tile--blue', onclick: go('hard') }),
    );
    for (const b of this.tiles.children) b.disabled = !ready;
  }
}
