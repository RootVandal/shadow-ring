import { Puppet } from '../src/vision/puppet.js';
import { MotionTracker } from '../src/motion/tracker.js';

/** A puppet wired into a tracker, with a fake 30 fps clock. */
export function rig({ noise = 1, seed = 7, stance = 'orthodox', fps = 30 } = {}) {
  const puppet = new Puppet({ noise, seed });
  const tracker = new MotionTracker({ stance });
  const events = [];
  for (const topic of ['punch', 'attempt', 'fault', 'dodge', 'framing', 'calibration']) {
    tracker.on(topic, (e) => events.push(e && typeof e === 'object' ? { ...e, topic } : { topic, value: e }));
  }
  let t = 1;
  const r = {
    puppet,
    tracker,
    events,
    get t() {
      return t;
    },
    step(seconds) {
      const n = Math.round(seconds * fps);
      for (let i = 0; i < n; i++) {
        t += 1 / fps;
        tracker.process(puppet.frame(t));
      }
    },
    calibrate() {
      r.step(0.3);
      tracker.setMode('calibrate');
      r.step(2);
      if (!tracker.calibrated) throw new Error('calibration did not finish');
      events.length = 0;
    },
    /** Plays an arm clip shortly after "now" and lets it finish. */
    throw(side, clip, { speed = 1, wait = 1.2 } = {}) {
      puppet.play(side, clip, t + 0.1, speed);
      r.step(wait / Math.min(1, speed));
    },
    of(topic) {
      return events.filter((e) => e.topic === topic);
    },
    clear() {
      events.length = 0;
    },
  };
  return r;
}
