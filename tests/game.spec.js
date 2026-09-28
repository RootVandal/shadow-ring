import { test, assert } from './t.js';
import { resolveHit, attackPower, COUNTER, PUNCH_KINDS } from '../src/game/rules.js';
import { Fighter } from '../src/game/fighter.js';
import { Match } from '../src/game/match.js';
import { BotLink } from '../src/game/bot.js';
import { MatchStats } from '../src/game/stats.js';
import { Coach, roundTalk, verdict } from '../src/game/coach.js';
import { scoreOf, leaderboard } from '../src/game/records.js';
import { mulberry32 } from '../src/util/math.js';
import { CONFIG } from '../src/config.js';
import { GLOVES, hashCode, TITLES, titleById, gloveById, buy, redeem, SHORTS, shortsById } from '../src/game/shop.js';
import { rankOf, winsToNext, nextState, TOP, RANKS } from '../src/game/ranked.js';
import { voiceScore } from '../src/audio/voice.js';

const OPEN = { guard: 'open', slip: false, duck: false };
const FULL = { guard: 'full', slip: false, duck: false };
const SLIP = { guard: 'open', slip: true, duck: false };
const DUCK = { guard: 'open', slip: false, duck: true };

test('rules: every punch has a counter that makes it miss', () => {
  for (const kind of PUNCH_KINDS) {
    const def = COUNTER[kind] === 'slip' ? SLIP : DUCK;
    assert.equal(resolveHit({ kind, power: 10 }, def).damage, 0, kind);
  }
});

test('rules: the wrong dodge is punished — slip into a hook, duck into an uppercut', () => {
  const hook = resolveHit({ kind: 'hook', power: 10 }, SLIP);
  assert.equal(hook.lesson, 'hit_hook_slipped');
  assert.above(hook.damage, 10);
  const upper = resolveHit({ kind: 'upper', power: 10 }, DUCK);
  assert.equal(upper.outcome, 'crit');
  assert.equal(upper.lesson, 'hit_upper_ducked');
});

test('rules: a full guard stops straights, an uppercut splits it', () => {
  assert.equal(resolveHit({ kind: 'jab', power: 10 }, FULL).outcome, 'blocked');
  const up = resolveHit({ kind: 'upper', power: 10 }, FULL);
  assert.equal(up.outcome, 'hit');
  assert.near(up.damage, 7, 1e-9);
});

test('rules: technique and stamina scale damage', () => {
  const clean = attackPower({ kind: 'cross', quality: 1 });
  const sloppy = attackPower({ kind: 'cross', quality: 0.3 });
  const tired = attackPower({ kind: 'cross', quality: 1, tired: true });
  assert.above(clean / sloppy, 1.5);
  assert.near(tired, clean / 2, 1e-9);
});

test('fighter: running out of stamina makes punches tired, rest restores it', () => {
  const f = new Fighter({ name: 'a', corner: 'red' });
  let tired = false;
  for (let i = 0; i < 12; i++) tired = f.spend('hook', 0).tired;
  assert.ok(tired);
  f.regen(10, 5000);
  assert.equal(f.stamina, CONFIG.fight.stamina.max);
});

class FakeLink {
  constructor() {
    this.sent = [];
  }
  attach(m) {
    this.m = m;
  }
  sendAttack(a) {
    this.sent.push(['atk', a]);
  }
  sendResult(r) {
    this.sent.push(['res', r]);
  }
  sendPhase(p) {
    this.sent.push(['phase', p]);
  }
  sendEnd(r) {
    this.sent.push(['end', r]);
  }
}

function fight({ defense = () => OPEN, authority = true, rules = CONFIG.fight } = {}) {
  const me = new Fighter({ name: 'Я', corner: 'red' });
  const foe = new Fighter({ name: 'Он', corner: 'blue' });
  const link = new FakeLink();
  const m = new Match({ me, foe, link, authority, defense, rules });
  const log = [];
  for (const e of ['phase', 'defended', 'landed', 'over']) m.on(e, (x) => log.push([e, x]));
  let now = 0;
  const run = (ms, step = 16) => {
    for (let t = 0; t < ms; t += step) {
      now += step;
      m.update(now, step / 1000);
    }
  };
  return {
    me,
    foe,
    link,
    m,
    log,
    run,
    get now() {
      return now;
    },
  };
}

test('match: intro → rounds with breaks → decision on points', () => {
  const f = fight();
  f.m.start(0);
  const r = CONFIG.fight;
  f.run((r.introSeconds + r.rounds * r.roundSeconds + (r.rounds - 1) * r.breakSeconds) * 1000 + 200, 50);
  const phases = f.log.filter(([e]) => e === 'phase').map(([, p]) => `${p.phase}${p.round || ''}`);
  assert.equal(phases.join(' '), 'intro round1 break1 round2 break2 round3');
  assert.equal(f.m.phase, 'over');
  assert.equal(f.m.result.method, 'points');
  assert.equal(f.m.result.winner, 'draw');
});

test('match: an incoming punch is judged by my defense at the moment of impact', () => {
  let def = OPEN;
  const f = fight({ defense: () => def });
  f.m.start(0);
  f.run(CONFIG.fight.introSeconds * 1000 + 50);
  f.m.incoming({ id: 1, kind: 'jab', power: 10 }, 600, f.now);
  f.run(300);
  def = SLIP; // dodged just in time
  f.run(400);
  const d = f.log.find(([e]) => e === 'defended')[1];
  assert.equal(d.outcome, 'slipped');
  assert.equal(f.me.hp, 100);
  const res = f.link.sent.find(([k]) => k === 'res')[1];
  assert.equal(res.defense, 'slip');
});

test('match: a dodge sets up a stronger counter', () => {
  const f = fight({ defense: () => SLIP });
  f.m.start(0);
  f.run(CONFIG.fight.introSeconds * 1000 + 50);
  const plain = f.m.throwPunch({ kind: 'jab', side: 'left', quality: 1 }, f.now);
  f.run(1500);
  f.m.incoming({ id: 7, kind: 'jab', power: 10 }, 300, f.now);
  f.run(400);
  const counter = f.m.throwPunch({ kind: 'jab', side: 'left', quality: 1 }, f.now);
  assert.ok(counter.counter);
  assert.near(counter.power / plain.power, CONFIG.fight.counterBonus, 1e-9);
});

test('match: KO ends the fight and tells the other side', () => {
  const f = fight();
  f.m.start(0);
  f.run(CONFIG.fight.introSeconds * 1000 + 50);
  f.me.hp = 5;
  f.m.incoming({ id: 1, kind: 'cross', power: 20 }, 100, f.now);
  f.run(200);
  assert.equal(f.m.phase, 'over');
  assert.equal(f.m.result.winner, 'foe');
  assert.equal(f.m.result.method, 'ko');
  assert.ok(f.link.sent.some(([k]) => k === 'end'));
});

test('match: the follower takes the round clock from the host', () => {
  const f = fight({ authority: false });
  f.m.start(0);
  f.run(10000);
  assert.equal(f.m.phase, 'waiting', 'the follower never advances on its own');
  f.m.applyPhase({ phase: 'round', round: 2, ms: 30000 }, f.now);
  assert.equal(f.m.phase, 'round');
  assert.equal(f.m.round, 2);
  assert.near(f.m.timeLeft(f.now), 30000, 1);
});

test('match: pausing freezes the clock and pending punches', () => {
  const f = fight();
  f.m.start(0);
  f.run(CONFIG.fight.introSeconds * 1000 + 50);
  f.m.incoming({ id: 1, kind: 'jab', power: 10 }, 500, f.now);
  const left = f.m.timeLeft(f.now);
  f.m.setPaused(true, f.now);
  f.run(5000);
  f.m.setPaused(false, f.now);
  assert.near(f.m.timeLeft(f.now), left, 1);
  assert.equal(f.me.hp, 100, 'the punch waits');
  f.run(600);
  assert.below(f.me.hp, 100);
});

const ONLINE = { ...CONFIG.fight, ...CONFIG.onlineFight };

test('online: a KO ends only the round; after a short break both are back at full HP', () => {
  const f = fight({ rules: ONLINE });
  f.m.start(0);
  f.run(ONLINE.introSeconds * 1000 + 50);
  f.me.hp = 5;
  f.m.incoming({ id: 1, kind: 'cross', power: 20 }, 100, f.now);
  f.run(400);
  assert.equal(f.m.phase, 'break', 'not over — just the round');
  assert.equal(f.m.wins.foe, 1);
  assert.equal(f.m.lastRound.method, 'ko');
  const ph = f.link.sent.filter(([k]) => k === 'phase').at(-1)[1];
  assert.equal(ph.wins.foe, 1, 'the guest learns the score');
  f.run(ONLINE.breakSeconds * 1000 + 100);
  assert.equal(f.m.phase, 'round');
  assert.equal(f.m.round, 2);
  assert.equal(f.me.hp, 100);
  assert.equal(f.foe.hp, 100);
});

test('online: three rounds, the fight is decided by rounds won', () => {
  const f = fight({ rules: ONLINE });
  f.m.start(0);
  f.run(ONLINE.introSeconds * 1000 + 50);
  f.foe.hp = 0; // round 1: my KO (as reported by the other side)
  f.m.pending.set(1, { attack: { id: 1, kind: 'jab' } });
  f.m.landed({ id: 1, outcome: 'hit', damage: 5, hp: 0 }, f.now);
  assert.equal(f.m.wins.me, 1);
  f.run(ONLINE.breakSeconds * 1000 + 100);
  f.foe.hp = 60; // round 2 on points
  f.run(ONLINE.roundSeconds * 1000 + 100);
  assert.equal(f.m.wins.me, 2);
  f.run(ONLINE.breakSeconds * 1000 + ONLINE.roundSeconds * 1000 + 200);
  assert.equal(f.m.phase, 'over');
  assert.equal(f.m.result.method, 'rounds');
  assert.equal(f.m.result.winner, 'me');
});

test('online: the follower is KO-ed but waits for the host to score the round', () => {
  const f = fight({ rules: ONLINE, authority: false });
  f.m.applyPhase({ phase: 'round', round: 1, ms: 30000 }, f.now);
  f.me.hp = 5;
  f.m.incoming({ id: 1, kind: 'cross', power: 20 }, 100, f.now);
  f.run(400);
  assert.equal(f.m.phase, 'round');
  assert.ok(f.m.roundOver);
  assert.equal(f.m.throwPunch({ kind: 'jab', side: 'left', quality: 1 }, f.now), null, 'no punching while down');
  f.m.applyPhase({ phase: 'break', round: 1, ms: 3000, wins: { me: 0, foe: 1 }, last: { winner: 'foe', method: 'ko' } }, f.now);
  assert.equal(f.m.wins.foe, 1);
  f.m.applyPhase({ phase: 'round', round: 2, ms: 45000 }, f.now);
  assert.equal(f.me.hp, 100);
  assert.ok(!f.m.roundOver);
});

test('zones: a body shot ignores slips and ducks, the guard covers it partly, and it drains stamina', () => {
  const body = { kind: 'jab', power: 10, zone: 'body' };
  assert.equal(resolveHit(body, SLIP).outcome, 'hit');
  assert.equal(resolveHit(body, DUCK).outcome, 'hit');
  assert.near(resolveHit(body, OPEN).damage, 7, 1e-9);
  const guarded = resolveHit(body, FULL);
  assert.equal(guarded.outcome, 'blocked');
  assert.near(guarded.damage, 4.2, 1e-9);
  assert.above(resolveHit(body, OPEN).drain, 0);
  assert.equal(resolveHit({ kind: 'upper', power: 10, zone: 'body' }, SLIP).outcome, 'slipped', 'an uppercut is always to the head');
});

test('match: my body shot goes out marked as one', () => {
  const f = fight();
  f.m.start(0);
  f.run(CONFIG.fight.introSeconds * 1000 + 50);
  const a = f.m.throwPunch({ kind: 'hook', side: 'left', quality: 1, zone: 'body' }, f.now);
  assert.equal(a.zone, 'body');
});

test('match: a slip a moment before impact still counts (grace window)', () => {
  const f = fight({ defense: (now, windowMs) => [OPEN, SLIP] });
  f.m.start(0);
  f.run(CONFIG.fight.introSeconds * 1000 + 50);
  f.m.incoming({ id: 1, kind: 'jab', power: 10 }, 300, f.now);
  f.run(600);
  assert.equal(f.log.find(([e]) => e === 'defended')[1].outcome, 'slipped');
  assert.equal(f.me.hp, 100);
});

test('match: the best defense in the window wins — a duck beats a slip against a hook', () => {
  const f = fight({ defense: () => [SLIP, DUCK] });
  f.m.start(0);
  f.run(CONFIG.fight.introSeconds * 1000 + 50);
  f.m.incoming({ id: 1, kind: 'hook', power: 10 }, 300, f.now);
  f.run(600);
  assert.equal(f.log.find(([e]) => e === 'defended')[1].outcome, 'ducked');
});

test('bot: a full fight against the Shadow finishes with a verdict', () => {
  const rnd = mulberry32(3);
  const me = new Fighter({ name: 'Я', corner: 'red' });
  const foe = new Fighter({ name: 'Тень', corner: 'blue' });
  const bot = new BotLink({ level: 'normal', rnd });
  let def = OPEN;
  const m = new Match({ me, foe, link: bot, defense: () => def });
  const stats = new MatchStats();
  m.on('outgoing', (a) => stats.thrown(a));
  m.on('landed', (x) => stats.landed(x));
  m.on('defended', (x) => stats.defended(x));
  m.on('incoming', ({ attack }) => (def = rnd() < 0.5 ? (COUNTER[attack.kind] === 'slip' ? SLIP : DUCK) : FULL));
  m.start(0);
  let now = 0;
  for (let i = 0; i < 20000 && m.phase !== 'over'; i++) {
    now += 16;
    m.update(now, 0.016);
    if (i % 70 === 0) m.throwPunch({ kind: ['jab', 'cross', 'hook', 'upper'][i % 4], side: 'left', quality: 0.8 }, now);
  }
  assert.equal(m.phase, 'over');
  const rep = stats.report();
  assert.above(rep.thrown, 20);
  assert.above(rep.incoming, 10);
  assert.above(rep.landed, 0);
  assert.above(rep.dodges + rep.blocks, 0);
});

test('bot: it reads habits — a player who always ducks gets more uppercuts', () => {
  const share = (habit) => {
    const me = new Fighter({ name: 'Я', corner: 'red' });
    const foe = new Fighter({ name: 'Тень', corner: 'blue' });
    const bot = new BotLink({ level: 'hard', rnd: mulberry32(5) });
    const m = new Match({ me, foe, link: bot, defense: () => (habit === 'duck' ? DUCK : SLIP) });
    for (let i = 0; i < 40; i++) bot.sendResult({ defense: habit });
    const kinds = [];
    m.on('incoming', ({ attack }) => kinds.push(attack.kind));
    m.start(0);
    let now = 0;
    for (let i = 0; i < 40000 && kinds.length < 150; i++) {
      now += 16;
      me.hp = 100;
      m.update(now, 0.016);
    }
    return kinds.filter((k) => k === 'upper').length / kinds.length;
  };
  assert.above(share('duck'), share('slip') + 0.1);
});

test('stats + coach: round talk names the most frequent mistake', () => {
  const s = new MatchStats();
  for (let i = 0; i < 4; i++) {
    s.thrown({ kind: 'hook' });
    s.punch({ kind: 'hook', quality: 0.6, faults: [{ code: 'hook_low_elbow', penalty: 0.25 }] });
  }
  s.punch({ kind: 'jab', quality: 0.9, faults: [{ code: 'straight_short', penalty: 0.1 }] });
  const talk = roundTalk(s.roundSummary(), 1);
  assert.equal(talk.focus, 'hook_low_elbow');
  const v = verdict(s.report());
  assert.equal(v.work[0].code, 'hook_low_elbow');
  assert.includes(v.unused, 'апперкот');
});

test('coach: one tip at a time, no nagging', () => {
  const said = [];
  const c = new Coach({ voice: { say: (t) => said.push(t) } });
  assert.ok(c.tip('hook_low_elbow', { now: 0 }));
  assert.ok(!c.tip('hook_low_elbow', { now: 1000 }), 'same tip again too soon');
  assert.ok(!c.tip('good_block', { kind: 'praise', now: 1200 }), 'praise does not interrupt a correction');
  assert.ok(c.tip('hit_hook_open', { kind: 'lesson', now: 1300 }), 'a lesson after a hit does');
  assert.ok(c.tip('hook_low_elbow', { now: 6000 }));
  assert.equal(said.length, 2, 'voice is rate-limited');
});

test('records: a KO win outscores a points loss; board is sorted', () => {
  const rep = { dealt: 60, landed: 10, dodges: 5, blocks: 3, technique: 0.8, taken: 40 };
  const win = scoreOf(rep, { winner: 'me', method: 'ko', secondsLeft: 20 }, 'bot:normal');
  const loss = scoreOf(rep, { winner: 'foe', method: 'points' }, 'bot:normal');
  assert.above(win, loss);
  const board = leaderboard([{ score: 5 }, { score: 50 }, { score: 20 }]);
  assert.equal(board.map((e) => e.score).join(','), '50,20,5');
});

test('shop: the one-hit gloves are hidden and open only with their code', () => {
  const g = GLOVES.find((x) => x.id === 'onehit');
  assert.ok(g.hidden);
  assert.equal(g.code, undefined);
  assert.equal(hashCode('ONEHIT'), g.codeHash);
  assert.ok(hashCode('ONEHITT') !== g.codeHash);
});

test('match: in one-hit gloves any punch that lands takes the round, a slip still saves', () => {
  const me = new Fighter({ name: 'Я', corner: 'red' });
  const foe = new Fighter({ name: 'Тень', corner: 'blue' });
  const bot = new BotLink({ level: 'easy', rnd: mulberry32(3) });
  const m = new Match({ me, foe, link: bot, defense: () => FULL, rules: { ...CONFIG.fight, breakSeconds: 3, roundKo: true, resetHp: true, oneHit: true } });
  const hits = [];
  m.on('landed', (x) => hits.push(x));
  m.start(0);
  let now = 0;
  for (let i = 0; i < 4000 && !hits.some((x) => x.damage > 0); i++) {
    now += 16;
    m.update(now, 0.016);
    if (i % 60 === 0) m.throwPunch({ kind: 'cross', side: 'right', quality: 0.8 }, now);
  }
  const hit = hits.find((x) => x.damage > 0);
  assert.ok(hit, 'a punch landed');
  assert.equal(hit.hp, 0);
  for (const x of hits.filter((x) => x.outcome === 'slipped' || x.outcome === 'ducked')) assert.equal(x.damage, 0);
  assert.equal(resolveHit({ kind: 'cross', power: 400 }, SLIP).damage, 0);
});

test('shop: five titles with their prices; an unknown title from the opponent is ignored', () => {
  const price = Object.fromEntries(TITLES.map((t) => [t.id, t.price]));
  assert.equal(TITLES.length, 5);
  assert.equal(price.kms, 3000);
  assert.equal(price.master, 6000);
  assert.equal(price.legend, 10000);
  assert.equal(price.dohlyak, 1000);
  assert.equal(price.vip, 500000);
  assert.equal(titleById('vip').name, 'VIP золотой');
  assert.equal(titleById('<script>'), null);
  assert.equal(titleById(undefined), null);
});

test('voice: the nicest Russian voice wins over the robotic Windows ones', () => {
  const names = ['Microsoft Irina - Russian (Russia)', 'Google русский', 'Microsoft Svetlana Online (Natural) - Russian (Russia)', 'Milena', 'Microsoft Pavel - Russian (Russia)'];
  const best = [...names].sort((a, b) => voiceScore({ name: b }) - voiceScore({ name: a }));
  assert.equal(best[0], 'Microsoft Svetlana Online (Natural) - Russian (Russia)');
  assert.equal(best[1], 'Google русский');
  assert.equal(best[2], 'Milena');
  assert.ok(voiceScore({ name: 'Microsoft Irina - Russian (Russia)' }) < voiceScore({ name: 'Google русский' }));
});

test('ranked: Bronze 1 … Impossible 3, each step needs more wins, losses never demote', () => {
  assert.equal(rankOf(0).label, 'Бронза 1');
  assert.equal(rankOf(2).label, 'Бронза 3');
  assert.equal(rankOf(3).label, 'Серебро 1');
  assert.equal(rankOf(TOP).label, 'Невозможный 3');
  assert.equal(TOP, 20);
  assert.above(winsToNext(1), winsToNext(0));
  assert.above(winsToNext(10), winsToNext(9));

  let r = { step: 0, stars: 0, quick: 3, played: 0 };
  for (let i = 0; i < winsToNext(0) - 1; i++) r = nextState(r, true).state;
  assert.equal(r.step, 0);
  const up = nextState(r, true);
  assert.ok(up.promoted);
  assert.equal(up.after, 1);
  assert.equal(up.reward, null, 'Bronze 2 gives no gloves');

  // a loss takes a win back but never drops below the step
  const down = nextState({ step: 1, stars: 0, quick: 3, played: 5 }, false);
  assert.equal(down.after, 1);
  assert.equal(down.state.stars, 0);
});

test('ranked: entering a new rank gives its gloves; the top keeps counting', () => {
  const silver = nextState({ step: 2, stars: winsToNext(2) - 1, quick: 3, played: 9 }, true);
  assert.equal(rankOf(silver.after).label, 'Серебро 1');
  assert.equal(silver.reward, 'r-silver');
  const plat = nextState({ step: 8, stars: winsToNext(8) - 1, quick: 3, played: 9 }, true);
  assert.equal(plat.reward, 'r-plat');
  assert.equal(gloveById('r-plat').effect, 'rank');
  const top = nextState({ step: TOP, stars: 50, quick: 3, played: 99 }, true);
  assert.equal(top.after, TOP);
  assert.equal(top.state.stars, 51);
  assert.equal(nextState({ step: 5, stars: 1, quick: 3, played: 1 }, true).reward, null);
});

test('ranked: rank gloves cannot be bought', () => {
  for (const r of RANKS.filter((x) => x.glove)) {
    assert.ok(gloveById(r.glove).rank, r.glove);
    const res = buy(r.glove);
    assert.ok(!res.ok && (res.reason === 'rank' || res.reason === 'owned'), `${r.glove}: ${res.reason}`);
  }
});

test('shop: the RANKED code unlocks every rank glove at once', () => {
  const r = redeem(' ranked ');
  assert.ok(r && Array.isArray(r.pack));
  assert.equal(r.pack.length, RANKS.filter((x) => x.glove).length);
  for (const id of r.pack) assert.ok(gloveById(id).rank, id);
});

test('shop: six shorts, prices differ, an unknown id from the opponent falls back to classic', () => {
  const price = Object.fromEntries(SHORTS.map((s) => [s.id, s.price]));
  assert.equal(SHORTS.length, 6);
  assert.equal(price.classic, 0);
  assert.below(price.thong, price.elephant);
  assert.below(price.iwin, price.supreme);
  assert.equal(shortsById('leopard').name, 'Леопардовые');
  assert.equal(shortsById('<img>').id, 'classic');
  assert.equal(shortsById(undefined).id, 'classic');
});
