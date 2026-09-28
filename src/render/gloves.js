import * as THREE from 'three';
import { COLORS, gloveMaterial, makeGlove } from './materials.js';
import { expAlpha } from '../util/math.js';

// The player's own gloves in first person. They follow the real fists: raise a
// hand and the glove rises, throw a straight and it shoots forward. When the
// coach flags a dropped guard, a translucent "ghost" glove shows where the fist
// should be — the fix, drawn in the world rather than written in a label.

const HOME = { left: new THREE.Vector3(-0.15, -0.21, -0.4), right: new THREE.Vector3(0.15, -0.21, -0.4) };
const STRIKE = { left: new THREE.Vector3(-0.03, -0.02, -1.05), right: new THREE.Vector3(0.03, -0.02, -1.05) };

export class FirstPersonGloves {
  constructor(camera) {
    this.group = new THREE.Group();
    camera.add(this.group);
    const trim = new THREE.MeshStandardMaterial({ color: COLORS.bone, roughness: 0.6 });
    const mat = gloveMaterial('red');
    this.ghostMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false });
    this.gloves = {};
    this.ghosts = {};
    this.pos = {};
    this.snap = {};
    for (const side of ['left', 'right']) {
      const g = makeGlove(mat, trim);
      g.traverse((o) => (o.castShadow = false));
      const ghost = makeGlove(this.ghostMat, this.ghostMat);
      ghost.position.copy(HOME[side]);
      ghost.visible = false;
      this.#aim(ghost, side, 0);
      this.group.add(g, ghost);
      this.gloves[side] = g;
      this.ghosts[side] = ghost;
      this.pos[side] = HOME[side].clone();
      this.snap[side] = null;
    }
    this.t = 0;
  }

  /** A recognized punch: the glove snaps out to full extension and back. */
  punch(side) {
    this.snap[side] = { t: 0, dur: 0.2 };
  }

  /**
   * @param {number} dt
   * @param {null | {arms: object, base: object, E: {left:number, right:number}}} input
   * @param {{left:boolean, right:boolean}} ghosts  which guard ghosts to show
   */
  update(dt, input, ghosts = { left: false, right: false }) {
    this.t += dt;
    for (const side of ['left', 'right']) {
      const target = HOME[side].clone();
      let E = 0;
      if (input?.arms) {
        const rel = input.arms[side].rel;
        const base = input.base[side].rel;
        E = Math.min(1.2, input.E[side]);
        target.x += (rel.x - base.x) * 0.32;
        target.y -= (rel.y - base.y) * 0.3;
        target.z -= E * 0.55;
        target.x *= 1 - 0.55 * Math.min(1, E);
        target.y += E * 0.09;
      }
      const s = this.snap[side];
      if (s) {
        s.t += dt;
        const k = Math.sin(Math.PI * Math.min(1, s.t / s.dur));
        target.lerp(STRIKE[side], k);
        if (s.t >= s.dur) this.snap[side] = null;
      }
      this.pos[side].lerp(target, expAlpha(dt, 0.04));
      const g = this.gloves[side];
      g.position.copy(this.pos[side]);
      this.#aim(g, side, E);

      const ghost = this.ghosts[side];
      ghost.visible = !!ghosts[side];
      if (ghost.visible) this.ghostMat.opacity = 0.16 + 0.14 * (0.5 + 0.5 * Math.sin(this.t * 7));
    }
  }

  #aim(g, side, E) {
    const inward = side === 'left' ? -1 : 1;
    // Knuckles forward (the camera looks down -z), slightly inward and up.
    g.rotation.set(0.25 - E * 0.2, Math.PI + inward * (0.28 - E * 0.2), inward * 0.15);
  }
}
