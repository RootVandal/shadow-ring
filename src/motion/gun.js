import { CONFIG } from '../config.js';

/**
 * The pistol gesture: both arms straight out in front, fists together — the
 * way you hold a pistol — held still for a moment. Aiming shows the gun
 * (to the opponent too); holding it long enough fires.
 */
export class GunGesture {
  constructor(cfg = CONFIG.gun) {
    this.cfg = cfg;
    this.held = 0;
    this.fired = false;
  }

  /**
   * @param {import('./body.js').Body|null} body
   * @param {{left:number, right:number}} E  arm extension from the tracker
   * @param {number} dt  seconds
   * @returns {{aiming:boolean, progress:number, fire:boolean}}
   */
  update(body, E, dt) {
    const c = this.cfg;
    let pose = false;
    if (body?.present) {
      const l = body.arms.left;
      const r = body.arms.right;
      const together = Math.abs(l.wrist.x - r.wrist.x) / body.S < c.maxGap;
      const level = Math.min(l.up, r.up) > c.minUp && Math.max(l.up, r.up) < c.maxUp;
      pose = E.left > c.minE && E.right > c.minE && together && level && l.vis > 0.3 && r.vis > 0.3;
    }
    // A flicker of lost tracking shouldn't reset the aim, a real release should.
    this.held = pose ? this.held + dt : Math.max(0, this.held - dt * 3);
    const progress = Math.min(1, this.held / c.holdSeconds);
    const fire = !this.fired && progress >= 1;
    if (fire) this.fired = true;
    return { aiming: this.held > c.showSeconds, progress, fire };
  }
}
