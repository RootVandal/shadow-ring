import { Screen } from '../screen.js';
import { Hud } from '../hud.js';
import { tile } from './menu.js';
import { h, clear } from '../../util/dom.js';
import { findBroadcasts } from '../../net/broadcast.js';
import { unpackPose } from '../../net/remote.js';
import { JOINT_NAMES } from '../../vision/landmarks.js';
import { GUARD } from '../../render/poses.js';
import { wallet, spend, earn } from '../../game/shop.js';
import { CONFIG } from '../../config.js';

// ЗРИТЕЛЬ: список идущих онлайн-боёв → просмотр одного из них → ставка.
// Данные приходят от хоста боя (net/broadcast.js). Зритель в бой ничего не
// отправляет. Ставки — игровые деньги из магазина: угадал победителя —
// получаешь ставку × CONFIG.spectate.payout, ничья или обрыв трансляции — возврат.

const money = (n) => `$${n.toLocaleString('ru-RU')}`;
const PHASE = { waiting: 'ждём начала', intro: 'представление', round: 'раунд', break: 'перерыв', over: 'бой окончен' };
const guardPose = () => ({ joints: structuredClone(GUARD), lateral: 0, drop: 0 });
const validPose = (m) => Array.isArray(m?.j) && m.j.length === JOINT_NAMES.length * 3;

export class WatchScreen extends Screen {
  static covers = false;

  enter() {
    const { app } = this;
    app.stage.setMode('showcase');
    app.cursor.setEnabled(true);
    app.tracker.warnGuard = false;
    this.entries = new Map(); // slot → {wire, info, tv}
    this.#showList();
    this.#scan();
  }

  // ── список боёв ───────────────────────────────────────────────────────

  #showList() {
    const { app } = this;
    this.status = h('p.muted', 'Ищем бои…');
    this.list = h('div.tiles');
    this.mount(
      h(
        'section.screen.menu.shade-left',
        h('div.menu__head', h('div', h('h1.menu__title', 'Смотреть бои'), h('p.muted', { style: { marginTop: '8px' } }, `Онлайн-бои, которые идут прямо сейчас. Угадай победителя — получишь ставку × ${CONFIG.spectate.payout}.`))),
        this.status,
        this.list,
        h(
          'div.menu__foot',
          h('button.btn.btn--ghost.btn--small', { dataset: { dwell: '' }, onclick: () => this.#rescan() }, 'Обновить'),
          h('button.btn.btn--ghost.btn--small', { dataset: { dwell: '' }, onclick: () => app.go('menu') }, 'В меню'),
        ),
      ),
    );
  }

  async #scan() {
    try {
      this.finder = await findBroadcasts((e) => {
        if (this.exited || this.watching) return e.wire.close();
        this.entries.set(e.slot, { ...e, tv: null });
        this.listen(e.wire, 'tv', (m) => {
          const x = this.entries.get(e.slot);
          if (x) x.tv = m;
        });
        this.listen(e.wire, 'close', () => {
          this.entries.delete(e.slot);
          this.#renderList();
        });
        this.#renderList();
      });
      if (this.exited) return this.finder.stop();
      await this.finder.done;
      if (!this.exited && !this.watching) this.#renderList(true);
    } catch {
      if (!this.exited) this.status.textContent = 'Нет связи с сервером онлайна. Проверь интернет и нажми «Обновить».';
    }
  }

  #rescan() {
    this.finder?.stop();
    this.finder = null;
    this.entries.clear();
    clear(this.list);
    this.status.textContent = 'Ищем бои…';
    this.#scan();
  }

  #renderList(done = false) {
    if (this.watching || !this.list) return;
    const n = this.entries.size;
    this.status.textContent = n
      ? `Идёт боёв: ${n}. Выбери, какой смотреть.`
      : done
        ? 'Сейчас никто не дерётся онлайн. Позови друга: один создаёт комнату, другой заходит — бой появится здесь.'
        : 'Ищем бои…';
    clear(this.list).append(
      ...[...this.entries.values()].map((e) =>
        tile({
          title: `${e.info.red?.name ?? '?'} vs ${e.info.blue?.name ?? '?'}`,
          text: this.#stateText(e.tv),
          num: 'live',
          accent: '.tile--blue',
          onclick: () => this.#watch(e),
        }),
      ),
    );
  }

  #stateText(tv) {
    if (!tv) return 'бой начинается';
    const ph = PHASE[tv.ph] ?? '';
    return tv.ph === 'round' ? `${ph} ${tv.rd} · счёт ${tv.w?.[0] ?? 0}:${tv.w?.[1] ?? 0}` : ph;
  }

  // ── просмотр ──────────────────────────────────────────────────────────

  #watch(entry) {
    const { app } = this;
    this.watching = entry;
    this.finder?.stop(entry.wire);
    const { info, wire } = entry;
    const red = { name: String(info.red?.name ?? 'Красный').slice(0, 24), hp: 100, maxHp: 100, stamina: 100 };
    const blue = { name: String(info.blue?.name ?? 'Синий').slice(0, 24), hp: 100, maxHp: 100, stamina: 100 };
    const rounds = Math.min(9, Math.max(1, Number(info.rounds) || 3));
    // То, что HUD боя ожидает от Match, — собранное из сообщений хоста.
    this.view = { me: red, foe: blue, phase: 'waiting', round: 0, rules: { rounds, roundKo: true }, wins: { me: 0, foe: 0 }, msAt: 0, ms: 0 };
    this.view.timeLeft = (now) => Math.max(0, this.view.ms - (now - this.view.msAt));
    this.poses = { red: guardPose(), blue: guardPose() };
    this.flash = { red: 0, blue: 0 };
    this.bet = null;
    this.ended = false;

    app.stage.setSpectate(true);
    app.stage.foe.setGlove(info.blue?.glove ?? 'classic');
    app.stage.red.setGlove(info.red?.glove ?? 'classic');
    app.foeDriver = () => this.#pose('blue');
    app.cursor.setEnabled(true);
    app.music.setLevel(0.15);

    this.hud = new Hud({ me: red, foe: blue });
    this.hud.el.classList.add('hud--tv');
    this.betBox = h('div.bet');
    this.hud.el.append(
      h('div.tv-tag', h('i'), 'прямой эфир'),
      this.betBox,
      h('button.btn.btn--ghost.btn--small.tv-leave', { onclick: () => app.go('watch') }, 'К списку боёв'),
    );
    this.el.remove();
    this.mount(this.hud.el);
    this.#renderBet();

    this.listen(wire, 'tv', (m) => this.#tv(m));
    this.listen(wire, 'hit', (m) => this.#hit(m));
    this.listen(wire, 'end', (m) => this.#end(m));
    this.listen(wire, 'close', () => this.#lost());
  }

  #pose(side) {
    const p = this.poses[side];
    const f = this.flash[side];
    this.flash[side] *= 0.85;
    const f2 = side === 'red' ? this.view.me : this.view.foe;
    return { ...p, fall: f2.hp <= 0 && this.view.phase === 'round' ? 1 : 0, flash: f };
  }

  #tv(m) {
    const v = this.view;
    const num = (x, d) => (Number.isFinite(Number(x)) ? Number(x) : d);
    if (validPose(m.r)) this.poses.red = unpackPose(m.r);
    if (validPose(m.b)) this.poses.blue = unpackPose(m.b);
    v.me.hp = Math.min(100, Math.max(0, num(m.hp?.[0], v.me.hp)));
    v.foe.hp = Math.min(100, Math.max(0, num(m.hp?.[1], v.foe.hp)));
    v.me.stamina = num(m.st?.[0], 100);
    v.foe.stamina = num(m.st?.[1], 100);
    const phase = PHASE[m.ph] ? m.ph : v.phase;
    if (phase === 'round' && v.phase !== 'round') this.app.sfx.bell(1);
    v.phase = phase;
    v.round = num(m.rd, v.round);
    v.wins = { me: num(m.w?.[0], 0), foe: num(m.w?.[1], 0) };
    v.ms = num(m.ms, 0);
    v.msAt = performance.now();
    this.#renderBet();
  }

  #hit(m) {
    const side = m.to === 'red' ? 'red' : 'blue';
    const target = side === 'red' ? this.app.stage.red : this.app.stage.foe;
    const p = this.app.stage.project(target.world.head);
    const dmg = Math.max(0, Math.round(Number(m.dmg) || 0));
    if (m.outcome === 'slipped' || m.outcome === 'ducked') {
      this.app.sfx.whoosh();
      this.hud.popup('мимо', p.x, p.y - 30, 'popup--miss');
      return;
    }
    this.flash[side] = 1;
    if (m.outcome === 'blocked') {
      this.app.sfx.block();
      this.hud.popup('блок', p.x, p.y - 30, 'popup--block');
    } else {
      this.app.sfx.hit(m.outcome === 'crit' ? 1 : 0.7);
      this.hud.popup(`−${dmg}`, p.x, p.y - 30, m.outcome === 'crit' ? 'popup--crit' : 'popup--dmg');
    }
  }

  // ── ставки ────────────────────────────────────────────────────────────

  get #betsOpen() {
    const v = this.view;
    const until = CONFIG.spectate.betUntilRound;
    return !this.ended && (v.phase === 'waiting' || v.phase === 'intro' || (v.phase === 'round' && v.round <= until) || (v.phase === 'break' && v.round < until));
  }

  #renderBet() {
    const open = this.#betsOpen;
    const key = `${open}|${this.bet?.side}|${this.ended}|${wallet().money}|${this.betMsg ?? ''}`;
    if (key === this.betKey) return;
    this.betKey = key;
    const w = wallet();
    const v = this.view;
    if (this.bet) {
      const name = this.bet.side === 'red' ? v.me.name : v.foe.name;
      this.betBox.replaceChildren(
        h('b', `Ставка ${money(this.bet.amount)} на ${name}`),
        h('span', this.betMsg ?? `угадаешь — получишь ${money(this.bet.amount * CONFIG.spectate.payout)}. Уйдёшь до конца боя — ставка сгорит.`),
      );
      return;
    }
    if (!open) {
      this.betBox.replaceChildren(h('span', this.ended ? 'Бой окончен' : 'Ставки закрыты — принимаются до конца 1-го раунда'));
      return;
    }
    this.amount ??= CONFIG.spectate.bets[0];
    const chips = CONFIG.spectate.bets.map((a) =>
      h(`button.bet__chip${a === this.amount ? '.is-on' : ''}`, { disabled: w.money < a, onclick: () => ((this.amount = a), (this.betKey = null), this.#renderBet()) }, money(a)),
    );
    const on = (side, name) => h(`button.btn.btn--small${side === 'blue' ? '.bet__blue' : ''}`, { disabled: w.money < this.amount, onclick: () => this.#place(side) }, `на ${name}`);
    this.betBox.replaceChildren(
      h('span', `Ставка · на счету ${money(w.money)}${w.money < CONFIG.spectate.bets[0] ? ' — не хватает, побеждай онлайн' : ''}`),
      h('div.bet__row', ...chips),
      h('div.bet__row', on('red', v.me.name), on('blue', v.foe.name)),
    );
  }

  #place(side) {
    if (this.bet || !this.#betsOpen || !spend(this.amount)) return;
    this.bet = { side, amount: this.amount };
    this.app.sfx.select();
    this.#renderBet();
  }

  #settle(text) {
    this.betMsg = text;
    this.betKey = null;
    this.#renderBet();
  }

  // ── конец ─────────────────────────────────────────────────────────────

  #end(m) {
    if (this.ended) return;
    this.ended = true;
    const v = this.view;
    const winner = m.winner === 'red' || m.winner === 'blue' ? m.winner : 'draw';
    if (Array.isArray(m.wins)) v.wins = { me: Number(m.wins[0]) || 0, foe: Number(m.wins[1]) || 0 };
    v.phase = 'over';
    const name = winner === 'red' ? v.me.name : winner === 'blue' ? v.foe.name : null;
    this.hud.callout(name ? `Победил ${name}` : 'Ничья', `счёт ${v.wins.me}:${v.wins.foe}`, 0);
    this.app.sfx.bell(3);
    if (!this.bet) return this.#settle(null);
    const { side, amount } = this.bet;
    if (winner === 'draw') {
      earn(amount);
      this.#settle(`Ничья — ставка ${money(amount)} вернулась.`);
    } else if (winner === side) {
      const win = amount * CONFIG.spectate.payout;
      earn(win);
      this.app.sfx.cheer(1);
      this.#settle(`Угадал! +${money(win)} · на счету ${money(wallet().money)}`);
    } else {
      this.#settle(`Не угадал — ${money(amount)} сгорели.`);
    }
  }

  /** Трансляция оборвалась до итога: ставку возвращаем. */
  #lost() {
    if (this.ended) return;
    this.ended = true;
    this.hud.callout('Трансляция прервалась', 'бой закончился или у бойца пропала связь', 0);
    if (this.bet) {
      earn(this.bet.amount);
      this.#settle(`Ставка ${money(this.bet.amount)} вернулась.`);
    } else this.#settle(null);
  }

  frame(now) {
    if (!this.watching) {
      // Раз в секунду обновляем «раунд 2 · счёт 1:0» в списке.
      if (now - (this.listAt ?? 0) > 1000) {
        this.listAt = now;
        if (this.entries.size) this.#renderList();
      }
      return;
    }
    this.app.stage.red.setPose(this.#pose('red'));
    this.hud.update(now, { match: this.view, defense: {}, redFlash: 0, rtt: null });
  }

  exit() {
    this.exited = true;
    const { app } = this;
    try {
      this.finder?.stop();
      this.watching?.wire.close();
      setTimeout(() => this.finder?.peer.destroy(), 400);
    } catch {
      /* соединения уже закрыты */
    }
    if (this.watching) {
      app.stage.setSpectate(false);
      app.stage.foe.setGlove('classic');
      app.foeDriver = null;
      app.music.setLevel(0.3);
    }
    super.exit();
  }
}
