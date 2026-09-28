import * as THREE from 'three';
import { blobTexture } from './textures.js';

// The prank pistol (a promo code in the shop). Built from boxes like everything
// else — no model files. Its +z is where the barrel points, like a glove's knuckles.

let parts = null;

function shared() {
  parts ??= {
    metal: new THREE.MeshStandardMaterial({ color: 0x3a3d45, roughness: 0.3, metalness: 0.65 }),
    sight: new THREE.BoxGeometry(0.008, 0.01, 0.012),
    grip: new THREE.MeshStandardMaterial({ color: 0x3a2a1f, roughness: 0.7 }),
    slide: new THREE.BoxGeometry(0.032, 0.036, 0.17),
    barrel: new THREE.CylinderGeometry(0.009, 0.009, 0.03, 10),
    handle: new THREE.BoxGeometry(0.028, 0.095, 0.042),
    guard: new THREE.TorusGeometry(0.018, 0.004, 6, 14, Math.PI),
    flash: new THREE.SpriteMaterial({ map: blobTexture(), color: 0xffc860, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
  };
  return parts;
}

export function makePistol() {
  const p = shared();
  const g = new THREE.Group();
  const slide = new THREE.Mesh(p.slide, p.metal);
  slide.position.set(0, 0.02, 0.04);
  const barrel = new THREE.Mesh(p.barrel, p.metal);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, 0.135);
  const handle = new THREE.Mesh(p.handle, p.grip);
  handle.rotation.x = -0.28;
  handle.position.set(0, -0.035, -0.02);
  const guard = new THREE.Mesh(p.guard, p.metal);
  guard.rotation.set(0, Math.PI / 2, Math.PI);
  guard.position.set(0, -0.006, 0.03);
  const flash = new THREE.Sprite(p.flash.clone());
  flash.position.set(0, 0.02, 0.19);
  flash.scale.setScalar(0.001);
  flash.visible = false;
  const rear = [-0.011, 0.011].map((x) => {
    const s = new THREE.Mesh(p.sight, p.metal);
    s.position.set(x, 0.042, -0.035);
    return s;
  });
  const front = new THREE.Mesh(p.sight, p.metal);
  front.position.set(0, 0.042, 0.115);
  g.add(slide, barrel, handle, guard, front, ...rear, flash);
  g.userData.flash = flash;
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = false;
  });
  return g;
}

/** Muzzle flash for `ms` after `now`; call `updateFlash` every frame. */
export function fireFlash(pistol, now, ms = 90) {
  pistol.userData.flashUntil = now + ms;
}

export function updateFlash(pistol, now) {
  const f = pistol.userData.flash;
  const left = (pistol.userData.flashUntil ?? 0) - now;
  f.visible = left > 0;
  if (f.visible) f.scale.setScalar(0.09 + Math.random() * 0.06);
}
