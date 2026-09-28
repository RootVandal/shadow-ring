import { test, assert } from './t.js';
import { packPose, unpackPose, RemoteLink } from '../src/net/remote.js';
import { Emitter } from '../src/util/emitter.js';
import { JOINT_NAMES, JOINTS } from '../src/vision/landmarks.js';

test('net: a pose survives packing to centimeters and back', () => {
  const world = Array.from({ length: 33 }, (_, i) => ({ x: i * 0.01, y: -0.5 + i * 0.02, z: -0.1 * (i % 3) }));
  const packed = packPose({ world }, { lateral: 0.5, drop: 0.4 });
  assert.equal(packed.j.length, JOINT_NAMES.length * 3);
  assert.ok(JSON.stringify(packed).length < 260, 'small enough for 20 packets a second');
  const pose = unpackPose(packed);
  const w = world[JOINTS.lWr];
  assert.near(pose.joints.lWr.x, w.x, 0.006);
  assert.near(pose.joints.lWr.y, -w.y, 0.006);
  assert.near(pose.joints.lWr.z, -w.z, 0.006);
  assert.below(pose.lateral, 0, "the player's right is the viewer's left");
  assert.above(pose.drop, 0);
});

test('net: nonsense from the other side is clamped', () => {
  const pose = unpackPose({ j: new Array(39).fill(0), l: 9999, d: -50 });
  assert.near(pose.lateral, 0.4, 1e-9);
  assert.equal(pose.drop, 0);
});

test('net: the host\'s round score and verdict arrive flipped to the guest\'s seat', () => {
  const wire = new Emitter();
  wire.send = () => {};
  wire.open = true;
  const link = new RemoteLink({ wire, role: 'guest' });
  const got = {};
  link.attach({ applyPhase: (p) => (got.phase = p), finishRemote: (r) => (got.end = r) });
  wire.emit('ph', { phase: 'break', round: 1, ms: 3000, wins: { me: 1, foe: 0 }, last: { winner: 'me', method: 'ko' } });
  assert.equal(got.phase.wins.foe, 1);
  assert.equal(got.phase.wins.me, 0);
  assert.equal(got.phase.last.winner, 'foe');
  wire.emit('end', { r: { winner: 'me', method: 'rounds', wins: { me: 2, foe: 1 } } });
  assert.equal(got.end.winner, 'foe');
  assert.equal(got.end.wins.me, 1);
  assert.equal(got.end.wins.foe, 2);
});
