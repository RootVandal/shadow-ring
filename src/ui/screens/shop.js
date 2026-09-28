import * as THREE from 'three';
import { Screen } from '../screen.js';
import { h, clear } from '../../util/dom.js';
import { GLOVES, gloveById, wallet, buy, equip, redeem, WIN_REWARD, TITLES, buyTitle, wearTitle, SHORTS, buyShorts, wearShorts } from '../../game/shop.js';
import { titleTag } from '../title.js';
import { gloveMaterialFor, makeGlove, COLORS, shortsMaterialFor } from '../../render/materials.js';

const money = (n) => `$${n.toLocaleString('ru-RU')}`;

/**
 * One tiny three.js scene that renders a spinning glove into any 2D canvas.
 * A single instance for the whole game: every WebGL context is expensive, and
 * browsers drop the oldest ones (the arena!) after ~16 — so it is never recreated.
 */
class GlovePreview {
  constructor() {
    this.size = 0;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.01, 10);
    this.camera.position.set(0, 0.05, 0.8);
    this.camera.lookAt(0, 0, 0);
    this.scene.add(new THREE.HemisphereLight(0xfff4e0, 0x1a1512, 1.2));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(0.6, 0.8, 1);
    const rim = new THREE.DirectionalLight(0x8fb0ff, 1.6);
    rim.position.set(-1, 0.4, -0.8);
    this.scene.add(key, rim);
    this.trim = new THREE.MeshStandardMaterial({ color: COLORS.bone, roughness: 0.6 });
    this.mats = new Map();
    this.glove = makeGlove(this.#mat('classic'), this.trim);
    this.glove.rotation.x = -0.35;
    this.scene.add(this.glove);
    // Трусы для вкладки «Трусы»: те же формы, что у манекена (render/avatar.js).
    this.shortsMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.21, 0.27, 32), this.#shortsMat('classic'));
    this.shortsMesh.scale.z = 0.74;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.193, 0.193, 0.055, 32), this.trim);
    band.scale.z = 0.74;
    band.position.y = 0.13;
    // Кусочек бойца — торс сверху и ноги снизу, чтобы было видно, что это трусы.
    const skin = new THREE.MeshStandardMaterial({ color: 0x2a2c36, roughness: 0.55 });
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.12, 32), skin);
    torso.scale.z = 0.7;
    torso.position.y = 0.21;
    const legs = [-0.095, 0.095].map((x) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.068, 0.16, 20), skin);
      leg.position.set(x, -0.2, 0);
      return leg;
    });
    this.shorts = new THREE.Group();
    this.shorts.add(this.shortsMesh, band, torso, ...legs);
    this.shorts.rotation.x = 0.08;
    this.shorts.scale.setScalar(0.72);
    this.shorts.visible = false;
    this.scene.add(this.shorts);
  }

  #shortsMat(id) {
    const key = `shorts:${id}`;
    if (!this.mats.has(key)) this.mats.set(key, shortsMaterialFor(id, 'red'));
    return this.mats.get(key);
  }

  /** Крутящиеся трусы в canvas (вкладка «Трусы»). */
  drawShorts(id, angle, canvas) {
    this.shortsMesh.material = this.#shortsMat(id);
    this.shorts.rotation.y = Math.sin(angle * 0.6) * 0.9; // покачиваются, показывая перед
    this.glove.visible = false;
    this.shorts.visible = true;
    this.#paint(canvas);
    this.shorts.visible = false;
    this.glove.visible = true;
  }

  #mat(id) {
    if (!this.mats.has(id)) this.mats.set(id, gloveMaterialFor(id, 'red'));
    return this.mats.get(id);
  }

  draw(id, angle, canvas) {
    if (this.size !== canvas.width) {
      this.size = canvas.width;
      this.renderer.setSize(this.size, this.size, false);
    }
    const m = this.#mat(id);
    this.glove.traverse((o) => o.isMesh && o.material !== this.trim && (o.material = m));
    this.glove.rotation.y = angle;
    this.glove.position.y = Math.sin(angle * 1.3) * 0.01;
    this.#paint(canvas);
  }

  #paint(canvas) {
    if (this.size !== canvas.width) {
      this.size = canvas.width;
      this.renderer.setSize(this.size, this.size, false);
    }
    this.renderer.render(this.scene, this.camera);
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.drawImage(this.renderer.domElement, 0, 0, canvas.width, canvas.height);
  }

}

let preview = null;
const glovePreview = () => (preview ??= new GlovePreview());

const CARD_FPS = 12; // the cards turn slowly, one card per frame
const DETAIL_FPS = 30;

export class ShopScreen extends Screen {
  static covers = true;

  enter() {
    const { app } = this;
    app.stage.setMode('showcase');
    app.cursor.setEnabled(true);
    this.preview = glovePreview();
    this.t = 0;
    this.next = 0;
    this.lastDetail = 0;
    this.moneyEl = h('div.money');
    this.grid = h('div.shop');
    this.promo = h('input', { maxlength: 20, placeholder: 'промокод', autocomplete: 'off', spellcheck: false });
    this.promoMsg = h('span.muted', '');
    const tryCode = () => {
      const g = redeem(this.promo.value);
      if (g && 'pack' in g) {
        this.promo.value = '';
        this.promoMsg.textContent = g.fresh ? `Открыто перчаток: ${g.fresh}! Смотри внизу списка.` : 'Все эти перчатки у тебя уже есть';
        if (g.fresh) app.sfx.cheer(1);
        this.#render();
      } else if (g && 'money' in g) {
        this.promo.value = '';
        this.promoMsg.textContent = g.used ? 'Этот код уже активирован' : `+${money(g.money)}!`;
        if (!g.used) app.sfx.cheer(1);
        this.#render();
      } else if (g) {
        app.sfx.bell(1);
        this.promoMsg.textContent = `Открыто: ${g.name}!`;
        this.promo.value = '';
        this.#render();
        this.#open(g.id);
      } else {
        this.promoMsg.textContent = 'Такого кода нет';
      }
    };
    this.promo.addEventListener('keydown', (e) => e.key === 'Enter' && tryCode());
    this.detail = h('div');
    // Вкладки «Перчатки | Титулы»: переключают, какая сетка видна.
    this.tab = 'gloves';
    this.titleGrid = h('div.shop', { style: { display: 'none' } });
    this.titleMsg = h('p.muted', { style: { minHeight: '1.45em' } });
    this.titleBox = h('div', { style: { display: 'none', gap: '12px' } }, this.titleMsg, this.titleGrid);
    const tabBtn = (id, label) => h('button.shop-tab', { dataset: { dwell: '', tab: id }, onclick: () => this.#setTab(id) }, label);
    this.tabs = h('div.shop-tabs', tabBtn('gloves', 'Перчатки'), tabBtn('titles', 'Титулы'), tabBtn('shorts', 'Трусы'));
    this.shortsGrid = h('div.shop');
    this.shortsMsg = h('p.muted', { style: { minHeight: '1.45em' } });
    this.shortsBox = h('div', { style: { display: 'none', gap: '12px' } }, this.shortsMsg, this.shortsGrid);
    this.mount(
      h(
        'section.screen.results',
        h(
          'div',
          { style: { maxWidth: '1180px', width: '100%', margin: '0 auto', display: 'grid', gap: '22px' } },
          h(
            'div.menu__head',
            h('div', h('h1.menu__title', 'Магазин'), h('p.muted', { style: { marginTop: '8px' } }, `${money(WIN_REWARD)} за каждую победу в онлайне. Перчатки видит соперник.`)),
            h(
              'div',
              { style: { display: 'grid', gap: '10px', justifyItems: 'end' } },
              this.moneyEl,
              h('div.code-input', this.promo, h('button.btn.btn--small', { onclick: tryCode }, 'Активировать')),
              this.promoMsg,
            ),
          ),
          this.tabs,
          this.grid,
          this.titleBox,
          this.shortsBox,
          h('div.menu__foot', h('span'), h('button.btn.btn--ghost.btn--small', { dataset: { dwell: '' }, onclick: () => app.go('menu') }, 'В меню')),
        ),
        this.detail,
      ),
    );
    this.#render();
    this.#setTab('gloves');
  }

  #setTab(id) {
    this.tab = id;
    for (const b of this.tabs.children) b.classList.toggle('is-on', b.dataset.tab === id);
    this.grid.style.display = id === 'gloves' ? '' : 'none';
    this.titleBox.style.display = id === 'titles' ? 'grid' : 'none';
    this.titleGrid.style.display = id === 'titles' ? '' : 'none';
    this.shortsBox.style.display = id === 'shorts' ? 'grid' : 'none';
    if (id === 'titles') this.#renderTitles();
    if (id === 'shorts') this.#renderShorts();
  }

  /** Вкладка «Трусы»: нажал — купил и надел; купленные надеваются нажатием. */
  #renderShorts(msg = '') {
    const { app } = this;
    const w = wallet();
    this.moneyEl.textContent = money(w.money);
    this.shortsMsg.textContent = msg || 'Трусы видны на твоём бойце — соперник онлайн их увидит.';
    this.shortsCards = SHORTS.map((s) => {
      const owned = w.shortsOwned.includes(s.id);
      const worn = w.shorts === s.id;
      const act = () => {
        if (worn) return;
        if (owned) {
          wearShorts(s.id);
          app.sfx.select();
          return this.#renderShorts(`Надеты «${s.name}».`);
        }
        const r = buyShorts(s.id);
        if (!r.ok) return this.#renderShorts(`На «${s.name}» не хватает ${money(s.price - wallet().money)}. Побеждай онлайн!`);
        app.sfx.cheer(0.6);
        this.#renderShorts(`Куплены и надеты «${s.name}»!`);
      };
      const canvas = h('canvas', { width: 240, height: 240 });
      const el = h(
        `button.glove-card${worn ? '.is-on' : ''}`,
        { dataset: { dwell: '' }, onclick: act, title: s.desc },
        canvas,
        h('b', s.name),
        h('span', worn ? 'надеты' : owned ? 'куплено · надеть' : money(s.price)),
      );
      return { g: s, canvas, el, shorts: true };
    });
    clear(this.shortsGrid).append(...this.shortsCards.map((c) => c.el));
    for (const [i, c] of this.shortsCards.entries()) this.preview.drawShorts(c.g.id, i * 1.3, c.canvas);
  }

  /** Вкладка «Титулы»: карточка — как титул выглядит над твоим ником, цена и действие. */
  #renderTitles(msg = '') {
    const { app } = this;
    const w = wallet();
    this.moneyEl.textContent = money(w.money);
    this.titleMsg.textContent = msg || (w.title ? '' : 'Титул пишется над ником — в меню и в бою, его видит соперник.');
    clear(this.titleGrid).append(
      ...TITLES.map((t) => {
        const owned = w.titles.includes(t.id);
        const worn = w.title === t.id;
        const act = () => {
          if (worn) {
            wearTitle(null);
            app.sfx.select();
            return this.#renderTitles(`Титул «${t.name}» снят.`);
          }
          if (owned) {
            wearTitle(t.id);
            app.sfx.select();
            return this.#renderTitles(`Надет титул «${t.name}».`);
          }
          const r = buyTitle(t.id);
          if (!r.ok) return this.#renderTitles(`На «${t.name}» не хватает ${money(t.price - wallet().money)}. Побеждай онлайн!`);
          app.sfx.cheer(0.6);
          this.#renderTitles(`Куплен и надет титул «${t.name}»!`);
        };
        return h(
          `button.title-card${worn ? '.is-on' : ''}`,
          { dataset: { dwell: '' }, onclick: act },
          h('div.title-card__preview', titleTag(t.id), h('b', app.settings.name)),
          h('p', t.desc),
          h('span.title-card__price', worn ? 'надето · нажми, чтобы снять' : owned ? 'куплено · надеть' : money(t.price)),
        );
      }),
    );
  }

  #render() {
    const w = wallet();
    this.moneyEl.textContent = money(w.money);
    // Скрытые перчатки видны только тому, кто уже ввёл их код.
    this.cards = GLOVES.filter((g) => !g.hidden || w.owned.includes(g.id)).map((g) => {
      const canvas = h('canvas', { width: 240, height: 240 });
      const status = w.equipped === g.id ? 'надето' : w.owned.includes(g.id) ? (g.rank ? 'получено' : 'куплено') : g.code ? 'секретный код' : g.rank ? `за ранг ${g.rank}` : money(g.price);
      const el = h(
        `button.glove-card${w.equipped === g.id ? '.is-on' : ''}`,
        { dataset: { dwell: '' }, onclick: () => this.#open(g.id) },
        canvas,
        h('b', g.name),
        h('span', status),
      );
      return { g, canvas, el };
    });
    clear(this.grid).append(...this.cards.map((c) => c.el));
    // Every card gets a first picture right away; after that they turn in turns.
    for (const [i, c] of this.cards.entries()) this.preview.draw(c.g.id, i * 1.3, c.canvas);
  }

  #open(id) {
    const { app } = this;
    const g = gloveById(id);
    const w = wallet();
    const owned = w.owned.includes(id);
    const worn = w.equipped === id;
    this.bigCanvas = h('canvas.glove-detail__canvas', { width: 560, height: 560 });
    this.openId = id;
    // Скрытые перчатки можно снять прямо здесь — вернуться к классике.
    const canTakeOff = worn && g.hidden;
    const act = () => {
      if (canTakeOff) {
        equip('classic');
        app.sfx.select();
        this.#render();
        this.#open(id);
        return;
      }
      if (worn) return;
      if (owned) equip(id);
      else {
        const r = buy(id);
        if (!r.ok) {
          msg.textContent = r.reason === 'money' ? `Не хватает ${money(g.price - wallet().money)}. Побеждай онлайн!` : r.reason === 'rank' ? `Выдаются за ранг ${g.rank} в рейтинговых матчах.` : 'Эти перчатки открываются только кодом.';
          return;
        }
        app.sfx.cheer(0.6);
      }
      app.sfx.select();
      this.#render();
      this.#open(id);
    };
    const label = canTakeOff ? 'Снять' : worn ? 'Надето' : owned ? 'Надеть' : g.code ? 'Только по коду' : g.rank ? `За ранг ${g.rank}` : `Купить за ${money(g.price)}`;
    const msg = h('p.muted');
    this.detail.replaceChildren(
      h(
        'div.glove-detail',
        this.bigCanvas,
        h(
          'div.glove-detail__info',
          h('p.muted.mono', { style: { fontSize: '12px', letterSpacing: '.14em', textTransform: 'uppercase' } }, g.code || g.hidden ? 'секретные' : g.rank ? `рейтинг · ранг ${g.rank}` : g.price ? money(g.price) : 'бесплатно'),
          h('h2', g.name),
          h('p', g.desc),
          g.effect ? h('p.badge', { style: { display: 'inline-block', marginTop: '12px' } }, 'особый эффект удара') : null,
          h(
            'div.actions',
            h(`button.tile${worn && !canTakeOff ? '' : '.tile--tape'}`, { dataset: { dwell: '' }, onclick: act, disabled: (worn && !canTakeOff) || (!owned && (!!g.code || !!g.rank)) }, h('span.tile__num', `на счету ${money(w.money)}`), h('div.tile__title', label)),
            h('button.tile', { dataset: { dwell: '' }, onclick: () => this.#close() }, h('span.tile__num', 'назад'), h('div.tile__title', 'Закрыть')),
          ),
          msg,
        ),
      ),
    );
  }

  #close() {
    this.openId = null;
    this.detail.replaceChildren();
  }

  frame(now, dt) {
    this.t += dt;
    // The open glove turns smoothly; the cards behind it wait.
    if (this.openId && this.bigCanvas?.isConnected) {
      if (now - this.lastDetail >= 1000 / DETAIL_FPS - 2) {
        this.lastDetail = now;
        this.preview.draw(this.openId, this.t * 0.8, this.bigCanvas);
      }
      return;
    }
    const cards = this.tab === 'gloves' ? this.cards ?? [] : this.tab === 'shorts' ? this.shortsCards ?? [] : [];
    if (!cards.length || this.app.stage.tier === 'lowest') return;
    if (now < this.next) return;
    this.next = now + 1000 / (CARD_FPS * cards.length);
    this.turn = ((this.turn ?? -1) + 1) % cards.length;
    const c = cards[this.turn];
    if (c.shorts) this.preview.drawShorts(c.g.id, this.t * 1.2 + this.turn * 1.3, c.canvas);
    else this.preview.draw(c.g.id, this.t * 1.2 + this.turn * 1.3, c.canvas);
  }
}
