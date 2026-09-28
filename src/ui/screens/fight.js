import { Screen } from '../screen.js';
import { Hud } from '../hud.js';
import { Pip } from '../pip.js';
import { h } from '../../util/dom.js';
import { Fighter } from '../../game/fighter.js';
import { Match } from '../../game/match.js';
import { BotLink } from '../../game/bot.js';
import { MatchStats } from '../../game/stats.js';
import { roundTalk } from '../../game/coach.js';
import { COUNTER, isLanded } from '../../game/rules.js';
import { PoseAnimator } from '../../render/animator.js';
import { KIND, DEFENSE_WORD, TIPS } from '../../strings.js';
import { CONFIG } from '../../config.js';
import { wallet } from '../../game/shop.js';

const other = (side) => (side === 'left' ? 'right' : 'left');

/**
 * The fight itself — against the Shadow (params.mode 'bot', params.level) or a
 * remote player (params.mode 'online', params.link, params.role, params.foeName).
 * The Match holds the rules; this screen turns its events into things you see,
 * hear and learn from.
 */
export class FightScreen extends Screen {
  enter() {
    const { app, params } = this;
    this.online = params.mode === 'online';
    app.stage.setMode('fight');
    app.stage.fx.clear();
    app.cursor.setEnabled(false);
    app.tracker.setMode('active');
    app.tracker.warnGuard = true;
    app.sfx.crowd(0.05);

    this.me = new Fighter({ name: app.settings.name, corner: 'red' });
    this.foe = new Fighter({ name: this.online ? params.foeName : 'Тень', corner: 'blue' });
    this.koAnim = null;
    this.myGlove = wallet().equipped;
    this.foeGlove = this.online ? params.foeGlove ?? 'classic' : 'classic';
    app.stage.gloves.setGlove(this.myGlove);
    app.stage.foe.setGlove(this.foeGlove);
    if (this.online) {
      this.link = params.link;
      app.foeDriver = (now, dt) => (this.koAnim ? this.koAnim.update(dt) : this.link.poseAt(now));
    } else {
      this.foeAnim = new PoseAnimator();
      this.link = new BotLink({ level: params.level, animator: this.foeAnim });
      app.foeDriver = (now, dt) => this.foeAnim.update(dt);
    }
    this.showHints = !this.online && params.level === 'easy';
    const m = new Match({
      me: this.me,
      foe: this.foe,
      link: this.link,
      authority: !this.online || params.role === 'host',
      defense: (now) => app.tracker.defenseAt(now),
      rules: this.online ? { ...CONFIG.fight, ...CONFIG.onlineFight } : CONFIG.fight,
    });
    this.match = m;
    this.stats = new MatchStats();
    this.hud = new Hud({ me: this.me, foe: this.foe, online: this.online });
    this.pip = new Pip({ label: 'ты' });
    this.hud.pipSlot.append(this.pip.el);
    const quit = h('button.btn.btn--ghost.btn--small', { style: { position: 'absolute', right: 'var(--gutter)', top: '118px' }, onclick: () => m.forfeit(performance.now()) }, 'Сдаться');
    this.hud.el.append(quit);
    if (this.online) this.#foeCam();
    this.mount(this.hud.el);

    const t = app.tracker;
    this.listen(t, 'punch', (ev) => this.#punch(ev));
    this.listen(t, 'attempt', (ev) => this.#attempt(ev));
    this.listen(t, 'fault', (ev) => this.#fault(ev));
    this.listen(t, 'presence', ({ present }) => this.#presence(present));
    this.listen(t, 'framing', (issue) => issue && issue !== 'no_person' && app.coach.tip(issue, { kind: 'framing' }));
    this.listen(app.coach, 'tip', (tip) => this.hud.showTip(tip));
    this.listen(m, 'phase', (p) => this.#phase(p));
    this.listen(m, 'knock', () => app.sfx.knock());
    this.listen(m, 'outgoing', (a) => this.#outgoing(a));
    this.listen(m, 'incoming', (x) => this.#incoming(x));
    this.listen(m, 'defended', (x) => this.#defended(x));
    this.listen(m, 'landed', (x) => this.#landed(x));
    this.listen(m, 'over', (r) => this.#over(r));

    this.poseIn = 0;
    if (this.online) {
      this.link.sendReady();
      if (params.role === 'host') this.link.whenPeerReady().then(() => m.start(performance.now()));
    } else {
      m.start(performance.now());
    }
  }

  frame(now, dt) {
    const { app } = this;
    const m = this.match;
    m.update(now, dt);
    const body = app.tracker.body;
    const def = app.tracker.defense.state;
    if (body?.present) app.stage.setHead(def.lateral, def.drop);
    const focus = app.coach.current?.focus ?? null;
    const ghost = (side) => focus?.to === 'guard' && (focus.side === side || focus.side === 'both');
    app.stage.setPlayer(
      body?.present && app.tracker.baseline ? { arms: body.arms, base: app.tracker.baseline.arms, E: app.tracker.E } : null,
      { left: ghost('left'), right: ghost('right') },
    );
    this.hud.update(now, { match: m, defense: def, redFlash: app.stage.fx.redFlash, rtt: this.online ? this.link.rtt : null });
    if (m.phase === 'break') this.hud.updateCorner(now);
    this.pip.draw({ video: app.input?.video, body, hands: app.tracker.hands, focus, dt });

    if (this.online && m.phase !== 'over') {
      this.poseIn -= dt;
      if (this.poseIn <= 0) {
        this.poseIn = 1 / CONFIG.net.poseHz;
        this.link.sendPose(app.tracker.lastFrame, def);
      }
    }
  }

  /** The opponent's webcam, top left under my plate — if they share it. */
  #foeCam() {
    const video = h('video', { autoplay: true, playsinline: true, muted: true });
    const box = h('div.foe-cam.is-empty', video, h('span.pip__label', this.foe.name), h('span.foe-cam__empty', 'камера соперника выключена'));
    const show = (stream) => {
      if (video.srcObject !== stream) video.srcObject = stream;
      box.classList.toggle('is-empty', !stream);
      if (stream) video.play().catch(() => {});
    };
    show(this.link.video?.stream ?? null);
    if (this.link.video) this.listen(this.link.video, 'video', show);
    this.hud.el.append(box);
  }

  // ── rounds ────────────────────────────────────────────────────────────

  #phase({ phase, round, endsAt, wins, last }) {
    const { app, hud } = this;
    if (phase === 'round') this.koAnim = null;
    if (phase === 'break' && this.match.rules.roundKo) {
      this.#roundBreak(round, wins, last);
      return;
    }
    if (phase === 'intro') {
      app.sfx.cheer(0.5);
      hud.callout(this.me.name, 'красный угол', 1300);
      this.later(1350, () => hud.callout(this.foe.name, 'синий угол', 1300));
      this.later(2700, () => hud.callout('Руки к лицу', 'прими стойку', 1300));
      app.voice.say(`${this.me.name} против ${this.foe.name}`);
    } else if (phase === 'round') {
      hud.hideCorner();
      const last = round === this.match.rules.rounds;
      hud.callout(round === 1 ? 'Бой!' : `Раунд ${round}`, last && round > 1 ? 'последний раунд' : null, 1100);
      app.sfx.bell(1);
      app.stage.arena.cheer(0.5);
      app.voice.say(round === 1 ? 'Бой!' : `Раунд ${round}`, { interrupt: true });
    } else if (phase === 'break') {
      const talk = roundTalk(this.stats.roundSummary(), round);
      this.stats.endRound();
      hud.clearTelegraphs();
      app.stage.fx.clear();
      app.coach.clear();
      hud.showCorner(talk, endsAt);
      app.sfx.bell(2);
      app.voice.say(talk.headline, { interrupt: true });
    }
  }

  /** Online: no corner talk, just who took the round, the score and a short pause. */
  #roundBreak(round, wins, last) {
    const { app, hud } = this;
    this.stats.endRound();
    hud.clearTelegraphs();
    app.stage.fx.clear();
    app.coach.clear();
    app.sfx.bell(2);
    const title = last?.winner === 'me' ? 'Раунд твой' : last?.winner === 'foe' ? 'Раунд за соперником' : 'Ничья в раунде';
    const how = last?.method === 'ko' ? 'нокаут' : 'по очкам';
    hud.callout(title, `${how} · счёт ${wins.me} : ${wins.foe}`, this.match.rules.breakSeconds * 1000);
    app.voice.say(`${title}. Счёт ${wins.me} ${wins.foe}`, { interrupt: true });
    if (last?.method === 'ko' && last.winner === 'me') {
      this.koAnim = new PoseAnimator();
      this.koAnim.knockout();
      app.stage.arena.cheer(1);
      app.sfx.cheer(0.8);
    }
  }

  // ── my punches ────────────────────────────────────────────────────────

  #punch(ev) {
    const { app } = this;
    const now = performance.now();
    const attack = this.match.throwPunch(ev, now);
    if (!attack) return;
    this.stats.punch(ev);
    app.stage.gloves.punch(ev.side);
    this.pip.punch(ev.side);
    const worst = ev.faults[0];
    const note = attack.counter ? 'контратака +30%' : worst ? TIPS[worst.code]?.split(' — ')[0] : ev.quality >= 0.9 ? 'чисто' : null;
    this.hud.showPunch(ev.kind, ev.quality, note, now);
    if (attack.tired) app.coach.tip('tired', { now });
    else if (worst && worst.penalty >= 0.12) {
      app.coach.tip(worst.code, { now, side: worst.code === 'other_hand_dropped' ? other(ev.side) : ev.side });
    } else if (attack.counter) app.coach.tip('good_counter', { kind: 'praise', now });
    else if (ev.quality >= 0.92 && Math.random() < 0.3) {
      app.coach.tip('clean', { kind: 'praise', now, params: { kind: KIND[ev.kind], q: Math.round(ev.quality * 100) } });
    }
  }

  #outgoing(attack) {
    const { app } = this;
    this.stats.thrown(attack);
    app.sfx.whoosh();
    const now = performance.now();
    const flight = this.online ? attack.window + (this.link.rtt ?? 80) / 2 : CONFIG.fight.myProjectileMs;
    app.stage.fx.launch({
      id: `o${attack.id}`,
      kind: attack.kind,
      from: app.stage.gloveWorld(attack.side),
      to: app.stage.foe.world.head.clone(),
      start: now,
      end: now + flight,
      corner: 'red',
      glove: this.myGlove,
      hookSide: attack.side === 'left' ? -1 : 1,
    });
  }

  #landed({ attack, outcome, damage }) {
    const { app, hud } = this;
    const now = performance.now();
    this.stats.landed({ attack, outcome, damage });
    const head = app.stage.foe.world.head;
    app.stage.fx.resolve(`o${attack.id}`, outcome, now, head);
    const p = app.stage.project(head);
    if (isLanded(outcome)) {
      const crit = outcome === 'crit';
      app.sfx.hit(crit ? 1 : 0.7);
      hud.popup(`−${Math.round(damage)}`, p.x, p.y - 30, crit ? 'popup--crit' : 'popup--dmg', crit ? 'крит' : attack.counter ? 'контра' : null);
      app.stage.arena.cheer(crit ? 0.8 : 0.25);
      if (crit) {
        app.stage.arena.flash(6);
        app.sfx.cheer(0.6);
      }
    } else if (outcome === 'blocked') {
      app.sfx.block();
      hud.popup('блок', p.x, p.y - 20, 'popup--block');
    } else {
      hud.popup('мимо', p.x, p.y - 20, 'popup--miss', outcome === 'slipped' ? 'уклон' : 'нырок');
    }
  }

  // ── their punches ─────────────────────────────────────────────────────

  #incoming({ attack, impactAt }) {
    const { app } = this;
    const now = performance.now();
    const foe = app.stage.foe;
    app.stage.fx.launch({
      id: `i${attack.id}`,
      kind: attack.kind,
      from: (attack.side === 'left' ? foe.world.lGlove : foe.world.rGlove).clone(),
      to: app.stage.headAim,
      start: now,
      end: impactAt,
      corner: 'blue',
      glove: this.foeGlove,
      hookSide: attack.side === 'left' ? 1 : -1,
    });
    this.hud.showTelegraph(attack, now, impactAt, this.showHints ? DEFENSE_WORD[COUNTER[attack.kind]] : null);
  }

  #defended({ attack, outcome, damage, lesson }) {
    const { app, hud } = this;
    const now = performance.now();
    this.stats.defended({ outcome, damage, lesson });
    app.stage.fx.resolve(`i${attack.id}`, outcome, now);
    hud.resolveTelegraph(attack.id, outcome);
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight * 0.42;
    if (isLanded(outcome)) {
      const crit = outcome === 'crit';
      app.sfx.hit(crit ? 1 : 0.8);
      app.stage.fx.hurt(crit ? 1 : 0.55);
      hud.popup(`−${Math.round(damage)}`, cx, cy, 'popup--me', crit ? 'крит' : KIND[attack.kind].toLowerCase());
      if (lesson) app.coach.tip(lesson, { kind: 'lesson', now });
    } else if (outcome === 'blocked') {
      app.sfx.block();
      hud.popup('блок', cx, cy, 'popup--block', `−${damage.toFixed(1)}`);
      if (Math.random() < 0.3) app.coach.tip('good_block', { kind: 'praise', now });
    } else {
      app.sfx.whoosh();
      hud.popup(outcome === 'slipped' ? 'уклон' : 'нырок', cx, cy, 'popup--miss', 'мимо');
      app.coach.tip('good_dodge', { kind: 'praise', now });
    }
  }

  // ── coaching outside punches ─────────────────────────────────────────

  #attempt(ev) {
    if (this.match.phase !== 'round') return;
    this.stats.attempt(ev);
    this.app.coach.tip(`attempt_${ev.type}_${ev.reason}`, { kind: 'attempt', side: ev.side });
  }

  #fault(ev) {
    if (this.match.phase !== 'round') return;
    this.stats.fault(ev.code);
    this.app.coach.tip(ev.code, { kind: ev.code.startsWith('guard') ? 'guard' : 'fault', side: ev.side });
  }

  #presence(present) {
    const { app, match } = this;
    if (this.online) {
      if (!present) app.coach.tip('no_person', { kind: 'framing' });
      return;
    }
    if (!present) {
      match.setPaused(true, performance.now());
      this.hud.callout('Пауза', 'вернись в кадр', 0);
    } else {
      this.later(700, () => {
        if (!app.tracker.present) return;
        match.setPaused(false, performance.now());
        this.hud.callout('Продолжаем', null, 800);
      });
    }
  }

  onVisibility(hidden) {
    if (this.online || this.match.phase === 'over') return;
    this.match.setPaused(hidden, performance.now());
  }

  // ── the end ───────────────────────────────────────────────────────────

  #over(result) {
    const { app, hud, match } = this;
    const now = performance.now();
    hud.clearTelegraphs();
    app.sfx.bell(3);
    app.sfx.cheer(1);
    app.stage.arena.cheer(1);
    app.stage.arena.flash(10, now);
    const win = result.winner === 'me';
    let title;
    let small;
    if (result.method === 'ko') {
      title = win ? 'Нокаут!' : 'Нокаут';
      small = `раунд ${match.round}`;
    } else if (result.method === 'forfeit') {
      title = win ? 'Победа' : 'Бой остановлен';
      small = win ? 'соперник покинул ринг' : null;
    } else if (result.method === 'rounds') {
      title = result.winner === 'draw' ? 'Ничья' : win ? 'Победа' : 'Поражение';
      small = `по раундам ${result.wins.me} : ${result.wins.foe}`;
    } else {
      title = result.winner === 'draw' ? 'Ничья' : win ? 'Победа' : 'Поражение';
      small = 'решение по очкам';
    }
    hud.callout(title, small, 0);
    app.voice.say(title.replace('!', ''), { interrupt: true });
    // Online the fight can end on a KO in the last round even though it's decided by rounds.
    if (this.online && win && (result.method === 'ko' || this.foe.hp <= 0)) {
      this.koAnim = new PoseAnimator();
      this.koAnim.knockout();
    }
    const rules = match.rules;
    const inRound = Math.max(0, match.round - 1) * rules.roundSeconds;
    const left = match.phase === 'round' || result.method === 'ko' ? match.timeLeft(now) / 1000 : 0;
    const secondsLeft = result.method === 'ko' ? (rules.rounds - match.round) * rules.roundSeconds + left : 0;
    const koSeconds = result.method === 'ko' ? inRound + rules.roundSeconds - left : null;
    const payload = {
      report: this.stats.report(),
      result,
      mode: this.params.mode,
      level: this.params.level,
      foeName: this.foe.name,
      foeGlove: this.params.foeGlove,
      round: match.round,
      secondsLeft,
      koSeconds,
      myHp: this.me.hp,
      foeHp: this.foe.hp,
      link: this.online ? this.link : null,
      role: this.params.role,
    };
    this.later(3400, () => app.go('results', payload));
  }

  exit() {
    super.exit();
    this.app.stage.foe.setGlove('classic');
    const { app } = this;
    app.foeDriver = null;
    app.tracker.warnGuard = false;
    app.stage.fx.clear();
    app.stage.setHead(0, 0);
    app.sfx.crowd(0.035);
  }
}
