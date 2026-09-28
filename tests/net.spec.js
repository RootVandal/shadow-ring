import { test, assert } from './t.js';
import { packPose, unpackPose } from '../src/net/remote.js';
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
