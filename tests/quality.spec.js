import { test, assert } from './t.js';
import { AutoQuality } from '../src/render/quality.js';

function feed(q, fps, seconds) {
  for (let t = 0; t < seconds; t += 1 / fps) q.sample(1 / fps);
}

test('quality: a smooth 60 fps keeps the tier', () => {
  const changes = [];
  const q = new AutoQuality({ tier: 'high', onChange: (t) => changes.push(t) });
  feed(q, 60, 20);
  assert.equal(changes.length, 0);
});

test('quality: steady lag steps down one tier at a time, down to the lowest', () => {
  const changes = [];
  const q = new AutoQuality({ tier: 'high', onChange: (t) => changes.push(t) });
  feed(q, 22, 40);
  assert.equal(changes.join(','), 'medium,low,lowest');
});

test('quality: a steady 30 fps cap (battery saver) is not lag', () => {
  const changes = [];
  const q = new AutoQuality({ tier: 'high', onChange: (t) => changes.push(t) });
  feed(q, 30, 20);
  assert.equal(changes.length, 0);
});

test('quality: a hidden tab or a short hitch does not count', () => {
  const changes = [];
  const q = new AutoQuality({ tier: 'high', onChange: (t) => changes.push(t) });
  feed(q, 60, 5);
  q.sample(3); // came back to the tab
  for (let i = 0; i < 5; i++) q.sample(0.2); // shader compile hitch
  feed(q, 60, 10);
  assert.equal(changes.length, 0);
});
