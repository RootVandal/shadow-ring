import { test, assert } from './t.js';
import { rig } from './helpers.js';
import { OneEuro } from '../src/util/one-euro.js';
import { angleAt } from '../src/util/math.js';

test('math: elbow angle of a straight arm is ~180°, of a right angle 90°', () => {
  assert.near(angleAt({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }), 180, 1e-6);
  assert.near(angleAt({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }), 90, 1e-6);
});

test('one-euro: smooths jitter at rest, follows a fast move', () => {
  const f = new OneEuro({ minCutoff: 1, beta: 4 });
  let y = 0;
  for (let i = 0; i < 60; i++) y = f.filter(i % 2 ? 0.01 : -0.01, i / 30);
  assert.below(Math.abs(y), 0.006, 'jitter should be damped');
  for (let i = 60; i < 70; i++) y = f.filter(1, i / 30);
  assert.above(y, 0.85, 'a step should be followed within ~0.3 s');
});

test('calibration: holding guard produces a baseline', () => {
  const r = rig();
  r.calibrate();
  const b = r.tracker.baseline;
  assert.above(b.S, 60);
  assert.below(b.S, 250);
  assert.below(b.arms.left.angle, 80, 'guard elbow is bent');
});

test('calibration: a dropped hand blocks it and names that hand', () => {
  const r = rig();
  r.puppet.setBase('left', 'low');
  r.tracker.setMode('calibrate');
  r.step(2);
  assert.ok(!r.tracker.calibrated);
  assert.equal(r.of('calibration').at(-1).issue, 'guard_low_left');
});

test('jab: a left straight is a clean jab', () => {
  const r = rig();
  r.calibrate();
  r.throw('left', 'jab');
  const p = r.of('punch');
  assert.equal(p.length, 1, 'one punch');
  assert.equal(p[0].kind, 'jab');
  assert.equal(p[0].side, 'left');
  assert.above(p[0].quality, 0.85, `faults: ${p[0].faults.map((f) => f.code)}`);
});

test('cross: a right straight is a cross; southpaw swaps jab and cross', () => {
  const r = rig();
  r.calibrate();
  r.throw('right', 'jab');
  assert.equal(r.of('punch')[0]?.kind, 'cross');
  const s = rig({ stance: 'southpaw' });
  s.calibrate();
  s.throw('right', 'jab');
  assert.equal(s.of('punch')[0]?.kind, 'jab');
});

test('hook: a bent-arm arc across the body is a hook', () => {
  const r = rig();
  r.calibrate();
  r.throw('left', 'hook');
  const p = r.of('punch');
  assert.equal(p.length, 1, 'one punch');
  assert.equal(p[0].kind, 'hook');
  assert.above(p[0].quality, 0.8, `faults: ${p[0].faults.map((f) => f.code)}`);
});

test('uppercut: a bent-arm rise is an uppercut', () => {
  const r = rig();
  r.calibrate();
  r.throw('right', 'upper');
  const p = r.of('punch');
  assert.equal(p.length, 1, 'one punch');
  assert.equal(p[0].kind, 'upper');
  assert.above(p[0].quality, 0.8, `faults: ${p[0].faults.map((f) => f.code)}`);
});

test('error mode: a half-thrown jab is flagged as short', () => {
  const r = rig();
  r.calibrate();
  r.throw('left', 'jabShort');
  const p = r.of('punch');
  assert.equal(p.length, 1);
  assert.equal(p[0].faults[0]?.code, 'straight_short');
});

test('error mode: a straight-arm swing is a hook with "bend your elbow"', () => {
  const r = rig();
  r.calibrate();
  r.throw('left', 'swing');
  const p = r.of('punch');
  assert.equal(p[0]?.kind, 'hook');
  assert.includes(p[0].faults.map((f) => f.code), 'hook_straight_arm');
});

test('error mode: a hook with a dropped elbow', () => {
  const r = rig();
  r.calibrate();
  r.throw('right', 'hookLow');
  const p = r.of('punch');
  assert.equal(p[0]?.kind, 'hook');
  assert.includes(p[0].faults.map((f) => f.code), 'hook_low_elbow');
});

test('error mode: an uppercut thrown with a straight arm', () => {
  const r = rig();
  r.calibrate();
  r.throw('left', 'upperStraight');
  const p = r.of('punch');
  assert.equal(p[0]?.kind, 'upper');
  assert.includes(p[0].faults.map((f) => f.code), 'upper_straight_arm');
});

test('error mode: a sluggish jab still counts but is graded down', () => {
  const r = rig();
  r.calibrate();
  r.throw('left', 'jab', { speed: 0.3 });
  const p = r.of('punch');
  assert.equal(p.length, 1);
  assert.includes(p[0].faults.map((f) => f.code), 'straight_slow');
});

test('error mode: a push that is too slow is an attempt, not a punch', () => {
  const r = rig();
  r.calibrate();
  r.throw('left', 'jab', { speed: 0.14 });
  assert.equal(r.of('punch').length, 0, 'no punch');
  const a = r.of('attempt');
  assert.equal(a.length, 1, 'one attempt');
  assert.equal(a[0].reason, 'slow');
});

test('error mode: dropping the other hand while punching', () => {
  const r = rig();
  r.calibrate();
  r.puppet.setBase('right', 'low');
  r.throw('left', 'jab');
  const p = r.of('punch');
  assert.equal(p.length, 1);
  assert.includes(p[0].faults.map((f) => f.code), 'other_hand_dropped');
});

test('error mode: leaving the arm out after a punch', () => {
  const r = rig();
  r.calibrate();
  r.throw('left', 'noReturn', { wait: 2.6 });
  assert.equal(r.of('punch').length, 1);
  assert.includes(r.of('fault').map((f) => f.code), 'no_return');
});

test('error mode: a dropped guard is reported after a delay', () => {
  const r = rig();
  r.calibrate();
  r.tracker.warnGuard = true;
  r.puppet.setBase('left', 'low');
  r.step(0.8);
  assert.equal(r.of('fault').length, 0, 'not immediately');
  r.step(1.2);
  assert.includes(r.of('fault').map((f) => f.code), 'guard_low_left');
});

test('combo: jab–cross–hook gives three punches in order', () => {
  const r = rig();
  r.calibrate();
  r.puppet.play('left', 'jab', r.t + 0.1);
  r.puppet.play('right', 'jab', r.t + 0.55);
  r.step(1.1);
  r.puppet.play('left', 'hook', r.t + 0.05);
  r.step(1.2);
  assert.equal(r.of('punch').map((p) => p.kind).join(','), 'jab,cross,hook');
});

test('double jab: the same hand fires twice', () => {
  const r = rig();
  r.calibrate();
  r.puppet.play('left', 'jab', r.t + 0.1);
  r.step(0.62);
  r.puppet.play('left', 'jab', r.t);
  r.step(1);
  assert.equal(r.of('punch').filter((p) => p.kind === 'jab').length, 2);
});

test('defense: slips both ways and a duck', () => {
  const r = rig();
  r.calibrate();
  r.puppet.slip(1); // the person's left
  r.step(0.4);
  assert.equal(r.tracker.defense.state.slip, 'left');
  r.puppet.slip(0);
  r.step(0.5);
  assert.equal(r.tracker.defense.state.slip, null);
  r.puppet.slip(-1);
  r.step(0.4);
  assert.equal(r.tracker.defense.state.slip, 'right');
  r.puppet.slip(0);
  r.step(0.5);
  r.puppet.duck(true);
  r.step(0.4);
  assert.ok(r.tracker.defense.state.duck, 'ducking');
  assert.equal(r.of('dodge').map((d) => d.dir ?? d.kind).join(','), 'left,right,duck');
});

test('defense: a dodge held too long goes stale', () => {
  const r = rig();
  r.calibrate();
  r.puppet.duck(true);
  r.step(0.4);
  assert.ok(r.tracker.defenseAt(r.t * 1000).duck, 'fresh duck protects');
  r.step(1.5);
  const snap = r.tracker.defenseAt(r.t * 1000);
  assert.ok(!snap.duck && snap.duckStale, 'stale duck');
});

test('defense: guard is full when both fists are up', () => {
  const r = rig();
  r.calibrate();
  r.step(0.2);
  assert.equal(r.tracker.defense.state.guard, 'full');
  r.puppet.setBase('right', 'low');
  r.step(0.4);
  assert.equal(r.tracker.defense.state.guard, 'half');
});

test('no phantom punches: 10 s of standing in guard with jitter', () => {
  const r = rig({ noise: 1.6, seed: 99 });
  r.calibrate();
  r.step(10);
  assert.equal(r.of('punch').length, 0);
  assert.equal(r.of('attempt').length, 0);
});

test('no punches from dodging: slips and ducks move the fists with the body', () => {
  const r = rig();
  r.calibrate();
  for (const dir of [1, -1]) {
    r.puppet.slip(dir);
    r.step(0.5);
    r.puppet.slip(0);
    r.step(0.5);
  }
  r.puppet.duck(true);
  r.step(0.5);
  r.puppet.duck(false);
  r.step(0.6);
  assert.equal(r.of('punch').length, 0, `got ${r.of('punch').map((p) => p.kind)}`);
});

test('framing: standing off to one side is reported', () => {
  const r = rig();
  r.step(1);
  assert.equal(r.tracker.framing.issue, null);
  r.puppet.stepTo(0.62); // toward the image's right = the left of the mirrored preview
  r.step(1.2);
  assert.equal(r.tracker.framing.issue, 'off_left');
});

test('zones: a jab at the face goes to the head, a low one to the body', () => {
  const r = rig();
  r.calibrate();
  r.throw('left', 'jab');
  r.throw('left', 'jabBody');
  const p = r.of('punch');
  assert.equal(p.map((x) => `${x.kind}:${x.zone}`).join(','), 'jab:head,jab:body');
});

test('zones: a body hook is not flagged for its low elbow', () => {
  const r = rig();
  r.calibrate();
  r.throw('right', 'hookBody');
  const p = r.of('punch');
  assert.equal(p[0]?.kind, 'hook');
  assert.equal(p[0].zone, 'body');
  assert.ok(!p[0].faults.some((f) => f.code === 'hook_low_elbow'), `faults: ${p[0].faults.map((f) => f.code)}`);
});

test('zones: dropping the guard to the hip is still not a punch', () => {
  const r = rig();
  r.calibrate();
  r.puppet.setBase('left', 'low');
  r.step(1);
  r.puppet.setBase('left', 'guard');
  r.step(1);
  assert.equal(r.of('punch').length, 0);
});

test('defense window: a slip that just ended still shows up in the last 300 ms', () => {
  const r = rig();
  r.calibrate();
  r.puppet.slip(1);
  r.step(0.4);
  r.puppet.slip(0);
  r.step(0.3);
  assert.equal(r.tracker.defense.state.slip, null, 'back in the center now');
  const recent = r.tracker.defenseAt(r.t * 1000, 400);
  assert.ok(recent.some((d) => d.slip), 'but the slip is in the window');
  assert.ok(!r.tracker.defenseAt(r.t * 1000, 50).some((d) => d.slip), 'and not in a tiny one');
});

