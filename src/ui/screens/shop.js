import * as THREE from 'three';
import { Screen } from '../screen.js';
import { h, clear } from '../../util/dom.js';
import { GLOVES, gloveById, wallet, buy, equip, redeem, WIN_REWARD } from '../../game/shop.js';
import { gloveMaterialFor, makeGlove, COLORS } from '../../render/materials.js';

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
      if (g) {
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
    this.mount(
      h(
        'section.screen.results',
        h(
          'div',
          { style: { maxWidth: '1180px', width: '100%', margin: '0 auto', display: 'grid', gap: '22px' } },
          h(
            'div.menu__head',
            h('div', h('h1.menu__title', 'Магазин'), h('p.muted', { style: { marginTop: '8px' } }, `${money(WIN_REWARD)} за каждую победу в онлайне. Перчатки видит соперник.`)),
            this.moneyEl,
          ),
          this.grid,
          h(
            'div.menu__foot',
            h('div.code-input', this.promo, h('button.btn.btn--small', { onclick: tryCode }, 'Активировать'), this.promoMsg),
            h('button.btn.btn--ghost.btn--small', { dataset: { dwell: '' }, onclick: () => app.go('menu') }, 'В меню'),
          ),
        ),
        this.detail,
      ),
    );
    this.#render();
  }

  #render() {
    const w = wallet();
    this.moneyEl.textContent = money(w.money);
    this.cards = GLOVES.map((g) => {
      const canvas = h('canvas', { width: 240, height: 240 });
      const status = w.equipped === g.id ? 'надето' : w.owned.includes(g.id) ? 'куплено' : g.code ? 'секретный код' : money(g.price);
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
    const act = () => {
      if (worn) return;
      if (owned) equip(id);
      else {
        const r = buy(id);
        if (!r.ok) {
          msg.textContent = r.reason === 'money' ? `Не хватает ${money(g.price - wallet().money)}. Побеждай онлайн!` : 'Эти перчатки открываются только кодом.';
          return;
        }
        app.sfx.cheer(0.6);
      }
      app.sfx.select();
      this.#render();
      this.#open(id);
    };
    const label = worn ? 'Надето' : owned ? 'Надеть' : g.code ? 'Только по коду' : `Купить за ${money(g.price)}`;
    const msg = h('p.muted');
    this.detail.replaceChildren(
      h(
        'div.glove-detail',
        this.bigCanvas,
        h(
          'div.glove-detail__info',
          h('p.muted.mono', { style: { fontSize: '12px', letterSpacing: '.14em', textTransform: 'uppercase' } }, g.code ? 'секретные' : g.price ? money(g.price) : 'бесплатно'),
          h('h2', g.name),
          h('p', g.desc),
          g.effect ? h('p.badge', { style: { display: 'inline-block', marginTop: '12px' } }, 'особый эффект удара') : null,
          h(
            'div.actions',
            h(`button.tile${worn ? '' : '.tile--tape'}`, { dataset: { dwell: '' }, onclick: act, disabled: worn || (!owned && !!g.code) }, h('span.tile__num', `на счету ${money(w.money)}`), h('div.tile__title', label)),
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
    const cards = this.cards ?? [];
    if (!cards.length || this.app.stage.tier === 'lowest') return;
    if (now < this.next) return;
    this.next = now + 1000 / (CARD_FPS * cards.length);
    this.turn = ((this.turn ?? -1) + 1) % cards.length;
    const c = cards[this.turn];
    this.preview.draw(c.g.id, this.t * 1.2 + this.turn * 1.3, c.canvas);
  }
}
