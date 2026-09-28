import * as THREE from 'three';
import { rimMaterial, gloveMaterial, gloveMaterialFor, makeGlove, cornerColor, COLORS, shortsMaterialFor } from './materials.js';
import { GUARD } from './poses.js';
import { expAlpha } from '../util/math.js';

// A boxer-mannequin driven by a JointSet (see vision/landmarks.js JOINTS).
// Incoming joints are only trusted for *directions*: every bone is rebuilt with
// fixed lengths, so a noisy or oddly-proportioned remote pose still gives a
// solid body. Legs are procedural — webcams rarely see them.

const UP = new THREE.Vector3(0, 1, 0);
const L = { spine: 0.5, halfShoulder: 0.2, upper: 0.29, fore: 0.27, neck: 0.24, hipHalf: 0.105, thigh: 0.45, shin: 0.45, hipHeight: 0.98 };

const tmp = {
  a: new THREE.Vector3(),
  b: new THREE.Vector3(),
  c: new THREE.Vector3(),
  m: new THREE.Matrix4(),
  q: new THREE.Quaternion(),
};

function v3(p) {
  return new THREE.Vector3(p.x, p.y, p.z);
}

/** Orients a Y-aligned mesh along a → b and centers it between them. */
function placeBone(mesh, a, b) {
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  const dir = tmp.c.copy(b).sub(a);
  const len = dir.length();
  if (len < 1e-5) return;
  mesh.quaternion.setFromUnitVectors(UP, dir.multiplyScalar(1 / len));
}

export class Avatar {
  constructor({ corner = 'blue' } = {}) {
    this.corner = corner;
    this.root = new THREE.Group(); // stands on the canvas; KO rotates it
    this.body = new THREE.Group(); // hips; moves with drop / lateral
    this.root.add(this.body);

    const rim = cornerColor(corner);
    this.skin = rimMaterial({ color: 0x1d1e26, rim, strength: 1.15, roughness: 0.55 });
    const trim = new THREE.MeshStandardMaterial({ color: COLORS.bone, roughness: 0.6 });
    const shorts = new THREE.MeshStandardMaterial({ color: rim, roughness: 0.5 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x0f0f11, roughness: 0.5 });
    const gear = rimMaterial({ color: 0x232228, rim, strength: 0.7, roughness: 0.45 });
    this.gloveMat = gloveMaterial(corner);

    const mesh = (geo, mat) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      this.body.add(m);
      return m;
    };
    this.parts = {
      head: mesh(new THREE.SphereGeometry(0.11, 24, 18), this.skin),
      gear: mesh(new THREE.SphereGeometry(0.124, 24, 14, Math.PI / 2 + 0.8, Math.PI * 2 - 1.6, 0, Math.PI * 0.6), gear),
      neck: mesh(new THREE.CapsuleGeometry(0.058, 0.08, 4, 10), this.skin),
      torso: mesh(new THREE.CylinderGeometry(0.215, 0.16, 0.48, 22), this.skin),
      chest: mesh(new THREE.SphereGeometry(0.2, 22, 14), this.skin),
      lDelt: mesh(new THREE.SphereGeometry(0.078, 16, 12), this.skin),
      rDelt: mesh(new THREE.SphereGeometry(0.078, 16, 12), this.skin),
      lUpper: mesh(new THREE.CapsuleGeometry(0.058, 0.2, 4, 12), this.skin),
      rUpper: mesh(new THREE.CapsuleGeometry(0.058, 0.2, 4, 12), this.skin),
      lFore: mesh(new THREE.CapsuleGeometry(0.05, 0.18, 4, 12), this.skin),
      rFore: mesh(new THREE.CapsuleGeometry(0.05, 0.18, 4, 12), this.skin),
      shorts: mesh(new THREE.CylinderGeometry(0.19, 0.21, 0.27, 22), shorts),
      band: mesh(new THREE.CylinderGeometry(0.193, 0.193, 0.055, 22), trim),
      lThigh: mesh(new THREE.CapsuleGeometry(0.085, 0.28, 4, 12), this.skin),
      rThigh: mesh(new THREE.CapsuleGeometry(0.085, 0.28, 4, 12), this.skin),
      lShin: mesh(new THREE.CapsuleGeometry(0.062, 0.32, 4, 12), this.skin),
      rShin: mesh(new THREE.CapsuleGeometry(0.062, 0.32, 4, 12), this.skin),
      lShoe: mesh(new THREE.BoxGeometry(0.11, 0.09, 0.26), dark),
      rShoe: mesh(new THREE.BoxGeometry(0.11, 0.09, 0.26), dark),
    };
    this.parts.head.scale.set(0.92, 1.1, 1);
    this.parts.torso.scale.z = 0.64;
    this.parts.chest.scale.set(1.05, 0.62, 0.7);
    this.parts.shorts.scale.z = 0.74;
    this.parts.band.scale.z = 0.74;
    this.parts.gear.material.side = THREE.DoubleSide;
    this.gloves = { l: makeGlove(this.gloveMat, trim), r: makeGlove(this.gloveMat, trim) };
    this.gloves.l.scale.setScalar(1.18);
    this.gloves.r.scale.setScalar(1.18);
    this.body.add(this.gloves.l, this.gloves.r);

    this.target = clonePose(GUARD);
    this.current = clonePose(GUARD);
    this.drop = 0;
    this.lateral = 0;
    this.fall = 0;
    this.flash = 0;
    this.t = 0;
    this.world = { head: new THREE.Vector3(), body: new THREE.Vector3(), lGlove: new THREE.Vector3(), rGlove: new THREE.Vector3() };
  }

  /** The opponent's gloves from the shop ('classic' = corner color). */
  setGlove(id = 'classic') {
    if (this.gloveId === id) return;
    this.gloveId = id;
    const next = gloveMaterialFor(id, this.corner);
    for (const g of Object.values(this.gloves)) g.traverse((o) => o.material === this.gloveMat && (o.material = next));
    this.gloveMat.dispose();
    this.gloveMat = next;
  }

  /** Трусы из магазина ('classic' = цвет угла). */
  setShorts(id = 'classic') {
    if ((this.shortsId ?? 'classic') === id) return;
    this.shortsId = id;
    const old = this.parts.shorts.material;
    this.parts.shorts.material = shortsMaterialFor(id, this.corner);
    old.dispose();
  }

  /**
   * @param {{joints:object, drop?:number, lateral?:number, fall?:number, flash?:number}} pose
   */
  setPose(pose) {
    for (const k in this.target) if (pose.joints[k]) Object.assign(this.target[k], pose.joints[k]);
    this.drop = pose.drop ?? 0;
    this.lateral = pose.lateral ?? 0;
    this.fall = pose.fall ?? 0;
    if (pose.flash !== undefined) this.flash = Math.max(this.flash * 0.9, pose.flash);
  }

  update(dt) {
    this.t += dt;
    const a = expAlpha(dt, 0.035);
    for (const k in this.current) {
      const c = this.current[k];
      const t = this.target[k];
      c.x += (t.x - c.x) * a;
      c.y += (t.y - c.y) * a;
      c.z += (t.z - c.z) * a;
    }
    this.#build();
    this.skin.emissive.setRGB(this.flash * 0.9, this.flash * 0.75, this.flash * 0.6);
    // KO: the whole body tips over backwards around the feet.
    this.root.rotation.x = -this.fall * 1.42;
    this.root.position.y = this.fall * 0.08;
    this.root.updateMatrixWorld(true);
    this.parts.head.getWorldPosition(this.world.head);
    this.parts.torso.getWorldPosition(this.world.body);
    this.gloves.l.getWorldPosition(this.world.lGlove);
    this.gloves.r.getWorldPosition(this.world.rGlove);
  }

  #build() {
    const J = this.current;
    const p = this.parts;
    this.body.position.set(this.lateral, L.hipHeight - this.drop, 0);

    // Torso frame from the incoming shoulders and hips.
    const shIn = tmp.a.copy(v3(J.lSh)).add(v3(J.rSh)).multiplyScalar(0.5);
    const hipIn = tmp.b.copy(v3(J.lHip)).add(v3(J.rHip)).multiplyScalar(0.5);
    const spine = shIn.clone().sub(hipIn).normalize().lerp(UP, 0.3).normalize();
    const across = v3(J.lSh).sub(v3(J.rSh));
    across.addScaledVector(spine, -across.dot(spine)).normalize();
    if (!Number.isFinite(across.x)) across.set(1, 0, 0);
    const front = new THREE.Vector3().crossVectors(across, spine).normalize();

    const shMid = spine.clone().multiplyScalar(L.spine);
    const lSh = shMid.clone().addScaledVector(across, L.halfShoulder);
    const rSh = shMid.clone().addScaledVector(across, -L.halfShoulder);

    tmp.m.makeBasis(across, spine, front);
    p.torso.quaternion.setFromRotationMatrix(tmp.m);
    p.torso.position.copy(spine).multiplyScalar(0.26);
    p.chest.quaternion.copy(p.torso.quaternion);
    p.chest.position.copy(spine).multiplyScalar(0.4).addScaledVector(front, 0.02);
    p.lDelt.position.copy(lSh);
    p.rDelt.position.copy(rSh);

    // Hips and legs: procedural stance, left foot forward.
    const hipAcross = v3(J.lHip).sub(v3(J.rHip)).setY(0).normalize();
    if (!Number.isFinite(hipAcross.x)) hipAcross.set(1, 0, 0);
    const hipYaw = Math.atan2(-hipAcross.z, hipAcross.x);
    p.shorts.position.set(0, -0.06, 0);
    p.shorts.rotation.y = hipYaw;
    p.band.position.set(0, 0.07, 0);
    p.band.rotation.y = hipYaw;
    const bodyY = L.hipHeight - this.drop;
    for (const [s, sign, fz] of [
      ['l', 1, 0.14],
      ['r', -1, -0.12],
    ]) {
      const hip = new THREE.Vector3(sign * L.hipHalf, -0.08, 0);
      const foot = new THREE.Vector3(sign * 0.17 - this.lateral * 0.6, -bodyY + 0.06, fz);
      const knee = solveKnee(hip, foot, L.thigh, L.shin);
      placeBone(p[`${s}Thigh`], hip, knee);
      placeBone(p[`${s}Shin`], knee, foot);
      p[`${s}Shoe`].position.set(foot.x, foot.y - 0.02, foot.z + 0.05);
    }

    // Arms: incoming directions, fixed bone lengths.
    for (const [s, sh] of [
      ['l', lSh],
      ['r', rSh],
    ]) {
      const dirUpper = v3(J[`${s}El`]).sub(v3(J[`${s}Sh`])).normalize();
      const el = sh.clone().addScaledVector(dirUpper, L.upper);
      const dirFore = v3(J[`${s}Wr`]).sub(v3(J[`${s}El`])).normalize();
      const wr = el.clone().addScaledVector(dirFore, L.fore);
      placeBone(p[`${s}Upper`], sh, el);
      placeBone(p[`${s}Fore`], el, wr);
      const glove = this.gloves[s];
      glove.position.copy(wr).addScaledVector(dirFore, 0.04);
      const knuckles = v3(J[`${s}Idx`]).sub(v3(J[`${s}Wr`]));
      const aim = knuckles.lengthSq() > 1e-6 ? knuckles.normalize().lerp(dirFore, 0.5).normalize() : dirFore;
      glove.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), aim);
    }

    // Head: from the ears' midpoint relative to the shoulders; face toward the nose.
    const ears = v3(J.lEar).add(v3(J.rEar)).multiplyScalar(0.5);
    const neckDir = ears.clone().sub(shIn).normalize().lerp(spine, 0.35).normalize();
    const head = shMid.clone().addScaledVector(neckDir, L.neck);
    p.head.position.copy(head);
    p.gear.position.copy(head);
    placeBone(p.neck, shMid.clone().addScaledVector(neckDir, 0.03), head.clone().addScaledVector(neckDir, -0.08));
    const face = v3(J.nose).sub(ears);
    face.addScaledVector(neckDir, -face.dot(neckDir));
    if (face.lengthSq() < 1e-6) face.copy(front);
    face.normalize();
    const side = new THREE.Vector3().crossVectors(neckDir, face).normalize();
    tmp.m.makeBasis(side, neckDir, face);
    p.head.quaternion.setFromRotationMatrix(tmp.m);
    p.gear.quaternion.copy(p.head.quaternion);
  }
}

/** Two-bone IK in the sagittal plane: the knee bends forward (+z). */
function solveKnee(hip, foot, a, b) {
  const d = foot.clone().sub(hip);
  const len = Math.min(d.length(), a + b - 1e-4);
  const dir = d.normalize();
  const along = (a * a - b * b + len * len) / (2 * len);
  const h = Math.sqrt(Math.max(0, a * a - along * along));
  const pole = new THREE.Vector3(0, 0, 1).addScaledVector(dir, -dir.z).normalize();
  return hip.clone().addScaledVector(dir, along).addScaledVector(pole, h);
}

function clonePose(p) {
  const out = {};
  for (const k in p) out[k] = { ...p[k] };
  return out;
}
