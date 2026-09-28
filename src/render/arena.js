import * as THREE from 'three';
import { COLORS } from './materials.js';
import { apronTexture, blobTexture, coneTexture, ringCanvasTexture } from './textures.js';
import { mulberry32 } from '../util/math.js';

// The ring and the hall around it. Red corner behind the player's left
// shoulder, blue corner diagonally across — as in a real ring.

const RING = 3.4; // half-size of the platform, m
const POST = 3.22;
const ROPES = [0.42, 0.74, 1.06, 1.38];

export class Arena {
  constructor(scene, { quality = 'high' } = {}) {
    this.scene = scene;
    this.quality = quality;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.rnd = mulberry32(17);
    this.excitement = 0;
    this.flashes = [];
    this.#lights();
    this.#ring();
    this.#hall();
    this.#crowd(quality === 'low' ? 150 : 380);
    this.#flashPool(quality === 'low' ? 6 : 14);
  }

  #lights() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0x8a93a8, 0x241b14, 0.3));
    const key = new THREE.SpotLight(0xfff0dc, 250, 18, 0.62, 0.6, 2);
    key.position.set(0, 7.2, 0.8);
    key.target.position.set(0, 0.8, -0.5);
    if (this.quality !== 'low') {
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.bias = -0.0004;
      key.shadow.camera.near = 3;
      key.shadow.camera.far = 12;
    }
    s.add(key, key.target);
    this.key = key;
    const rim = new THREE.DirectionalLight(0x6d8cff, 1.5);
    rim.position.set(1.2, 2.8, -6);
    rim.target.position.set(0, 1.2, 0);
    s.add(rim, rim.target);
    const warm = new THREE.DirectionalLight(0xffc49a, 0.45);
    warm.position.set(-3, 2.4, 5);
    s.add(warm);
  }

  #ring() {
    const g = this.group;
    const canvasMat = new THREE.MeshStandardMaterial({ map: ringCanvasTexture(), roughness: 0.95, color: 0xd6cfc0 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(RING * 2, RING * 2), canvasMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    g.add(floor);

    const apron = apronTexture();
    const skirt = new THREE.MeshStandardMaterial({ map: apron, roughness: 0.8 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x151412, roughness: 0.8 });
    const platform = new THREE.Mesh(new THREE.BoxGeometry(RING * 2 + 0.3, 1, RING * 2 + 0.3), [skirt, skirt, dark, dark, skirt, skirt]);
    platform.position.y = -0.5 - 0.002;
    g.add(platform);
    apron.repeat.set(2, 1);

    const metal = new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.35, metalness: 0.7 });
    const pad = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55 });
    const corners = [
      [-1, 1, COLORS.red], // behind the player, left
      [1, -1, COLORS.blue], // across the ring
      [1, 1, COLORS.bone],
      [-1, -1, COLORS.bone],
    ];
    for (const [sx, sz, color] of corners) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.6, 12), metal);
      post.position.set(sx * POST, 0.8, sz * POST);
      post.castShadow = true;
      const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.18, 0.2), pad(color));
      cushion.position.set(sx * (POST - 0.12), 0.9, sz * (POST - 0.12));
      cushion.rotation.y = Math.PI / 4;
      cushion.castShadow = true;
      g.add(post, cushion);
    }

    const ropeMat = new THREE.MeshStandardMaterial({ color: 0xe9e1d0, roughness: 0.5 });
    const len = POST * 2;
    for (const y of ROPES) {
      for (const [x, z, rotY] of [
        [0, -POST, 0],
        [0, POST, 0],
        [-POST, 0, Math.PI / 2],
        [POST, 0, Math.PI / 2],
      ]) {
        const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, len, 8), ropeMat);
        rope.rotation.z = Math.PI / 2;
        rope.rotation.y = rotY;
        rope.position.set(x, y, z);
        rope.castShadow = true;
        g.add(rope);
      }
    }
    // Rope ties in the middle of each side.
    const tieMat = new THREE.MeshStandardMaterial({ color: 0x1c1b19, roughness: 0.6 });
    for (const [x, z] of [
      [0, -POST],
      [0, POST],
      [-POST, 0],
      [POST, 0],
    ]) {
      const tie = new THREE.Mesh(new THREE.BoxGeometry(0.05, ROPES[3] - ROPES[0] + 0.06, 0.05), tieMat);
      tie.position.set(x, (ROPES[0] + ROPES[3]) / 2, z);
      g.add(tie);
    }
  }

  #hall() {
    const g = this.group;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x0f0e0d, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1;
    g.add(floor);

    // Overhead truss with four fixtures, and the haze of their beams.
    const truss = new THREE.MeshStandardMaterial({ color: 0x1a1918, roughness: 0.5, metalness: 0.6 });
    for (const [x, z, w, d] of [
      [0, -2.6, 5.6, 0.12],
      [0, 2.6, 5.6, 0.12],
      [-2.8, 0, 0.12, 5.3],
      [2.8, 0, 0.12, 5.3],
    ]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), truss);
      bar.position.set(x, 5.6, z);
      g.add(bar);
    }
    if (this.quality !== 'low') {
      const coneMat = new THREE.MeshBasicMaterial({
        map: coneTexture(),
        transparent: true,
        opacity: 0.075,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        color: 0xfff1de,
      });
      for (const [x, z] of [
        [-2.2, -2.2],
        [2.2, -2.2],
        [-2.2, 2.2],
        [2.2, 2.2],
      ]) {
        const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.3, 12), truss);
        lamp.position.set(x, 5.4, z);
        const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 1.7, 5.4, 24, 1, true), coneMat);
        cone.position.set(x * 0.72, 2.7, z * 0.72);
        // Narrow end up at the lamp, wide end down toward the ring.
        cone.lookAt(0, -2, 0);
        cone.rotateX(-Math.PI / 2);
        g.add(lamp, cone);
      }
    }
  }

  #crowd(count) {
    const rnd = this.rnd;
    const bodyGeo = new THREE.CapsuleGeometry(0.2, 0.42, 3, 8);
    const headGeo = new THREE.SphereGeometry(0.12, 10, 8);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.bodies = new THREE.InstancedMesh(bodyGeo, mat, count);
    this.heads = new THREE.InstancedMesh(headGeo, mat, count);
    this.people = [];
    const color = new THREE.Color();
    let i = 0;
    for (let row = 0; row < 5 && i < count; row++) {
      const half = 5.4 + row * 0.95;
      const base = -1 + row * 0.5;
      const perimeter = half * 8;
      const n = Math.floor(perimeter / 0.62);
      for (let k = 0; k < n && i < count; k++) {
        if (rnd() < 0.18) continue; // empty seats
        const u = (k / n) * 4;
        const side = Math.floor(u);
        const f = (u - side) * 2 - 1;
        const x = [f * half, half, -f * half, -half][side] + (rnd() - 0.5) * 0.2;
        const z = [-half, f * half, half, -f * half][side] + (rnd() - 0.5) * 0.2;
        const scale = 0.85 + rnd() * 0.3;
        this.people.push({ x, z, y: base + 0.5 * scale, scale, wide: 0.85 + rnd() * 0.4, phase: rnd() * 10, freq: 1.5 + rnd() * 2.5 });
        color.setHSL(0.06 + rnd() * 0.06, 0.1 + rnd() * 0.1, 0.02 + rnd() * 0.05);
        this.bodies.setColorAt(i, color);
        this.heads.setColorAt(i, color.multiplyScalar(1.15));
        i++;
      }
    }
    this.bodies.count = this.heads.count = this.people.length;
    this.#placeCrowd(0);
    this.group.add(this.bodies, this.heads);
  }

  #placeCrowd(t) {
    const m = new THREE.Matrix4();
    const amp = 0.015 + this.excitement * 0.12;
    this.people.forEach((p, i) => {
      const bob = Math.max(0, Math.sin(t * p.freq + p.phase)) * amp;
      const s = p.scale;
      m.makeScale(s * p.wide, s, s * p.wide).setPosition(p.x, p.y + bob, p.z);
      this.bodies.setMatrixAt(i, m);
      m.makeScale(s, s, s).setPosition(p.x, p.y + bob + 0.45 * s, p.z);
      this.heads.setMatrixAt(i, m);
    });
    this.bodies.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
  }

  #flashPool(n) {
    const mat = new THREE.SpriteMaterial({ map: blobTexture(), color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(mat.clone());
      s.visible = false;
      s.scale.setScalar(0.5);
      this.group.add(s);
      this.flashes.push({ sprite: s, until: 0 });
    }
  }

  /** Phones and cameras in the crowd go off — more of them after a big shot. */
  flash(count = 1, now = performance.now()) {
    for (let i = 0; i < count; i++) {
      const f = this.flashes.find((x) => x.until < now);
      if (!f) return;
      const p = this.people[Math.floor(this.rnd() * this.people.length)];
      f.sprite.position.set(p.x, p.y + 0.55 * p.scale, p.z);
      f.sprite.visible = true;
      f.until = now + 60 + this.rnd() * 60;
    }
  }

  cheer(amount = 0.6) {
    this.excitement = Math.min(1, this.excitement + amount);
  }

  update(now, dt) {
    this.excitement = Math.max(0, this.excitement - dt * 0.35);
    this.#placeCrowd(now / 1000);
    for (const f of this.flashes) if (f.sprite.visible && now > f.until) f.sprite.visible = false;
    if (this.rnd() < dt * (0.9 + this.excitement * 8)) this.flash(1, now);
  }
}
