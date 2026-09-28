import { Screen } from '../screen.js';
import { Pip } from '../pip.js';
import { Hud } from '../hud.js';
import { tile } from './menu.js';
import { h, clear } from '../../util/dom.js';
import { PoseAnimator } from '../../render/animator.js';
import { resolveHit, isMiss, COUNTER } from '../../game/rules.js';
import { guardIssue } from '../../motion/posture.js';
import { KIND, DEFENSE_WORD } from '../../strings.js';

// The warm-up doubles as the error mode's showcase: every move is demonstrated
// by the Shadow, repeated by the player, and every wrong attempt gets a specific
// correction — the wrong punch, the wrong hand, a bent jab, a straight hook.

const other = (s) => (s === 'left' ? 'right' : 'left');
const straightLike = (k) => k === 'jab' || k === 'cross';

/** Why this isn't the punch we asked for, in one line. */
function wrongPunch(want, got) {
  if (straightLike(want) && straightLike(got)) {
    return want === 'jab' ? 'Это кросс — задней рукой. Джеб бьётся передней, ближней к сопернику' : 'Это джеб — передней рукой. Кросс бьётся задней, с доворотом корпуса';
  }
  const how = {
    jab: 'джеб — прямой, резко вперёд к камере',
    cross: 'кросс — прямой задней рукой, вперёд к камере',
    hook: 'хук идёт сбоку: локоть на уровне плеча, кулак по дуге',
    upper: 'апперкот — снизу вверх, локоть согнут',
  };
  return `Это ${KIND[got].toLowerCase()}, а нужен ${KIND[want].toLowerCase()}: ${how[want]}`;
}

export class TutorialScreen extends Screen {
  enter() {
    const { app } = this;
    app.stage.setMode('fight');
    app.stage.fx.clear();
    app.cursor.setEnabled(true);
    app.tracker.setMode('active');
    app.tracker.warnGuard = false;
    const lead = app.settings.stance === 'southpaw' ? 'правой' : 'левой';
    const rear = app.settings.stance === 'southpaw' ? 'левой' : 'правой';
    this.steps = [
      { id: 'guard', title: 'Стойка', text: 'Кулаки у подбородка, локти вниз, подбородок чуть опущен. Держи две секунды.', reps: 1 },
      { id: 'jab', title: 'Джеб', text: `Прямой передней (${lead}) рукой: резко вперёд к камере — и сразу обратно к лицу.`, reps: 3, kind: 'jab' },
      { id: 'cross', title: 'Кросс', text: `Прямой задней (${rear}) рукой. Доверни плечо и корпус — это самый сильный прямой.`, reps: 3, kind: 'cross' },
      { id: 'hook', title: 'Хук', text: 'Боковой: локоть поднят до плеча, рука согнута под 90°, кулак идёт по дуге через центр.', reps: 2, kind: 'hook' },
      { id: 'upper', title: 'Апперкот', text: 'Снизу вверх: опусти кулак к груди и толкни его вверх, не выпрямляя локоть.', reps: 2, kind: 'upper' },
      { id: 'slip', title: 'Уклон', text: 'Уведи голову с линии удара: наклон корпуса в одну сторону, потом в другую.', reps: 2, dodge: 'slip' },
      { id: 'duck', title: 'Нырок', text: 'Быстро присядь, будто под рукой соперника, и сразу вернись.', reps: 2, dodge: 'duck' },
      { id: 'drill', title: 'Защищайся', text: 'Тень бьёт по-настоящему. От прямого и апперкота — уклон, от хука — нырок. Или закройся блоком.', reps: 4, drill: true },
    ];
    this.i = -1;
    this.anim = new PoseAnimator();
    app.foeDriver = (now, dt) => this.anim.update(dt);
    this.hud = new Hud({ me: { name: app.settings.name }, foe: { name: 'Тень' } });
    this.pip = new Pip({ label: 'ты' });

    this.stepLabel = h('div.lesson__step');
    this.title = h('h2');
    this.text = h('p');
    this.reps = h('div.reps');
    this.progress = h('div.lesson__progress', this.steps.map(() => h('i')));
    this.card = h('div.lesson', this.stepLabel, this.title, this.text, this.reps, this.progress);
    this.coachBox = h('div', this.hud.coach);
    const skip = h('div.lesson__skip', h('button.btn.btn--ghost.btn--small', { dataset: { dwell: '' }, onclick: () => this.#next() }, 'Пропустить шаг'), h('button.btn.btn--ghost.btn--small', { dataset: { dwell: '' }, onclick: () => app.go('menu') }, 'Меню'));
    this.mount(
      h(
        'section.hud',
        this.hud.popups,
        this.hud.telegraph,
        this.card,
        skip,
        h('div.hud__bottom', this.coachBox, h('div.hud-pip', this.pip.el)),
        this.hud.calloutBox,
      ),
    );

    const t = app.tracker;
    this.listen(t, 'punch', (ev) => this.#punch(ev));
    this.listen(t, 'attempt', (ev) => this.step?.kind && app.coach.tip(`attempt_${ev.type}_${ev.reason}`, { kind: 'attempt', side: ev.side }));
    this.listen(t, 'dodge', (ev) => this.#dodge(ev));
    this.listen(t, 'fault', (ev) => this.step?.kind && ev.code === 'no_return' && app.coach.tip('no_return', { side: ev.side }));
    this.listen(app.coach, 'tip', (tip) => this.hud.showTip(tip));
    this.#next();
  }

  get step() {
    return this.steps[this.i];
  }

  #next() {
    const { app } = this;
    this.i++;
    this.done = 0;
    this.hold = 0;
    this.seen = new Set();
    this.nextDemo = 0;
    this.nextAttack = performance.now() + 2200;
    this.pending = [];
    app.coach.clear();
    app.stage.fx.clear();
    this.hud.clearTelegraphs();
    if (this.i >= this.steps.length) return this.#finish();
    const s = this.step;
    this.stepLabel.textContent = `шаг ${this.i + 1} из ${this.steps.length}`;
    this.title.textContent = s.title;
    this.text.textContent = s.text;
    clear(this.reps).append(...Array.from({ length: s.reps }, () => h('i')));
    [...this.progress.children].forEach((el, k) => el.classList.toggle('is-done', k < this.i));
    app.voice.say(`${s.title}. ${s.text}`, { interrupt: true });
  }

  #rep() {
    const { app } = this;
    this.done++;
    this.reps.children[this.done - 1]?.classList.add('is-done');
    app.sfx.select();
    if (this.done >= this.step.reps) {
      this.hud.callout('Есть!', null, 800);
      this.stepDone = true;
      this.later(1000, () => {
        this.stepDone = false;
        this.#next();
      });
    }
  }

  #punch(ev) {
    const s = this.step;
    if (!s?.kind || this.stepDone) return;
    const { app } = this;
    app.stage.gloves.punch(ev.side);
    this.pip.punch(ev.side);
    this.hud.popup(`${KIND[ev.kind]} · ${Math.round(ev.quality * 100)}%`, window.innerWidth / 2, window.innerHeight * 0.4, ev.quality >= 0.6 ? 'popup--dmg' : 'popup--block');
    if (ev.kind !== s.kind) {
      app.coach.tip(`wrong_${s.kind}_${ev.kind}`, { kind: 'lesson', text: wrongPunch(s.kind, ev.kind) });
      return;
    }
    const worst = ev.faults[0];
    if (worst) app.coach.tip(worst.code, { side: worst.code === 'other_hand_dropped' ? other(ev.side) : ev.side });
    if (ev.quality >= 0.6) this.#rep();
  }

  #dodge(ev) {
    const s = this.step;
    if (!s?.dodge || this.stepDone || ev.kind !== s.dodge) return;
    if (s.dodge === 'slip') {
      if (this.seen.has(ev.dir)) {
        this.app.coach.tip('good_dodge', { kind: 'praise' });
        this.hud.popup('а теперь в другую сторону', window.innerWidth / 2, window.innerHeight * 0.4, 'popup--block');
        return;
      }
      this.seen.add(ev.dir);
    }
    this.#rep();
  }

  frame(now, dt) {
    const { app } = this;
    const s = this.step;
    const body = app.tracker.body;
    const def = app.tracker.defense.state;
    if (body?.present) app.stage.setHead(def.lateral, def.drop);
    const focus = app.coach.current?.focus ?? null;
    const ghost = (side) => focus?.to === 'guard' && (focus.side === side || focus.side === 'both');
    app.stage.setPlayer(body?.present && app.tracker.baseline ? { arms: body.arms, base: app.tracker.baseline.arms, E: app.tracker.E } : null, {
      left: ghost('left') || (s?.id === 'guard' && !app.tracker.hands.left),
      right: ghost('right') || (s?.id === 'guard' && !app.tracker.hands.right),
    });
    this.hud.update(now, { match: DUMMY, defense: def, redFlash: app.stage.fx.redFlash, rtt: null });
    this.pip.draw({ video: app.input?.video, body, hands: app.tracker.hands, focus, targets: s?.id === 'guard', dt });
    if (!s || this.stepDone) return;

    if (s.id === 'guard' && body?.present) this.#guardStep(body, dt);
    else if (!s.drill && now > this.nextDemo) this.#demo(now);
    if (s.drill) this.#drill(now);
  }

  #guardStep(body, dt) {
    const { app } = this;
    if (app.tracker.hands.left && app.tracker.hands.right) {
      this.hold += dt;
      if (this.hold >= 2) this.#rep();
    } else {
      this.hold = Math.max(0, this.hold - dt);
      for (const side of ['left', 'right']) {
        const issue = guardIssue(body.arms[side], body, app.tracker.E[side]);
        if (issue) {
          app.coach.tip(`guard_${issue}_${side}`, { kind: 'guard', side });
          break;
        }
      }
    }
    const bar = this.reps.children[0];
    if (bar) bar.style.background = `linear-gradient(90deg, var(--ok) ${Math.min(100, (this.hold / 2) * 100)}%, var(--ink-3) 0)`;
  }

  /** The Shadow shows the move — mirrored, so it matches the player's own mirror view. */
  #demo(now) {
    const s = this.step;
    const a = this.anim;
    if (s.kind) {
      const lead = this.app.settings.stance === 'southpaw' ? 'right' : 'left';
      const side = s.kind === 'jab' ? lead : s.kind === 'cross' ? other(lead) : this.demoSide === 'left' ? 'right' : 'left';
      this.demoSide = side;
      a.punch(s.kind, other(side), 350);
    } else if (s.dodge === 'slip') {
      this.slipDir = -(this.slipDir || 1);
      a.slip(this.slipDir);
    } else if (s.dodge === 'duck') a.duck();
    this.nextDemo = now + 2600;
  }

  /** Real incoming punches, generous timing, the counter written on the telegraph. */
  #drill(now) {
    const { app } = this;
    if (now > this.nextAttack) {
      const kinds = ['jab', 'hook', 'upper', 'cross', 'hook', 'jab', 'upper'];
      const kind = kinds[(this.done + this.pending.length + Math.floor(now / 1000)) % kinds.length];
      const side = kind === 'jab' ? 'left' : kind === 'cross' ? 'right' : Math.random() < 0.5 ? 'left' : 'right';
      this.anim.punch(kind, side, 300);
      const attack = { id: `d${Math.round(now)}`, kind, side, power: 6, quality: 0.8 };
      const launch = now + 300;
      const impact = launch + 1000;
      this.pending.push({ attack, launch, impact, launched: false });
      this.nextAttack = impact + 1400;
    }
    for (const p of this.pending) {
      if (!p.launched && now >= p.launch) {
        p.launched = true;
        const foe = app.stage.foe;
        app.stage.fx.launch({
          id: p.attack.id,
          kind: p.attack.kind,
          from: (p.attack.side === 'left' ? foe.world.lGlove : foe.world.rGlove).clone(),
          to: app.stage.headAim,
          start: now,
          end: p.impact,
          corner: 'blue',
          hookSide: p.attack.side === 'left' ? 1 : -1,
        });
        this.hud.showTelegraph(p.attack, now, p.impact, DEFENSE_WORD[COUNTER[p.attack.kind]]);
      }
    }
    const due = this.pending.filter((p) => now >= p.impact);
    this.pending = this.pending.filter((p) => now < p.impact);
    for (const p of due) {
      const res = resolveHit(p.attack, app.tracker.defenseAt(now));
      app.stage.fx.resolve(p.attack.id, res.outcome, now);
      this.hud.resolveTelegraph(p.attack.id, res.outcome);
      const ok = isMiss(res.outcome) || res.outcome === 'blocked';
      if (ok) {
        app.sfx[res.outcome === 'blocked' ? 'block' : 'whoosh']();
        this.hud.popup(res.outcome === 'blocked' ? 'блок' : 'ушёл', window.innerWidth / 2, window.innerHeight * 0.42, 'popup--miss');
        this.#rep();
      } else {
        app.sfx.hit(0.6);
        app.stage.fx.hurt(0.5);
        this.hud.popup('пропустил', window.innerWidth / 2, window.innerHeight * 0.42, 'popup--me');
        if (res.lesson) app.coach.tip(res.lesson, { kind: 'lesson' });
      }
    }
  }

  #finish() {
    const { app } = this;
    app.stage.setMode('showcase');
    this.anim.celebrate();
    this.card.replaceChildren(
      h('div.lesson__step', 'разминка пройдена'),
      h('h2', 'Готов к бою'),
      h('p', 'Все удары, защита и ответы на ошибки — ты их видел. Дальше тренер будет подсказывать прямо в бою.'),
      h(
        'div.actions',
        tile({ title: 'Спарринг', num: 'с Тенью', accent: '.tile--tape', onclick: () => app.go('level') }),
        tile({ title: 'Онлайн', num: 'живой соперник', accent: '.tile--blue', onclick: () => app.go('lobby') }),
      ),
    );
    app.voice.say('Разминка пройдена. Готов к бою.', { interrupt: true });
  }

  exit() {
    super.exit();
    const { app } = this;
    app.foeDriver = null;
    app.stage.fx.clear();
    app.stage.setHead(0, 0);
  }
}

// The HUD's clock and plates aren't shown in the warm-up; it only needs a stand-in.
const DUMMY = {
  me: { hp: 100, maxHp: 100, stamina: 100 },
  foe: { hp: 100, maxHp: 100, stamina: 100 },
  phase: 'waiting',
  round: 0,
  rules: { rounds: 0 },
  timeLeft: () => 0,
};
