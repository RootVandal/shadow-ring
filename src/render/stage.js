import * as THREE from 'three';
import { Arena } from './arena.js';
import { Avatar } from './avatar.js';
import { FirstPersonGloves } from './gloves.js';
import { Fx } from './fx.js';
import { TIER } from './quality.js';
import { expAlpha } from '../util/math.js';

export const FOE_Z = -0.75;
const EYE = new THREE.Vector3(0, 1.62, 0.85);
const LOOK = new THREE.Vector3(0, 1.52, FOE_Z);

/**
 * Owns the WebGL scene. Two camera modes:
 *   showcase — a slow orbit around the ring (landing, menus)
 *   fight    — first person: the player's eyes, head-tracked, with their gloves
 */
export class Stage {
  /** @param {HTMLCanvasElement} canvas  @param {{tier?: keyof TIER}} [o] */
  constructor(canvas, { tier = 'high' } = {}) {
    this.canvas = canvas;
    // Antialiasing can only be chosen when the context is created.
    const antialias = tier === 'high' || tier === 'medium';
    const renderer = new THREE.WebGLRenderer({ canvas, antialias, powerPreference: 'high-performance' });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    // Always on: without a shadow-casting light it costs nothing, and a tier can turn the light's shadow off.
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0a09);
    this.scene.fog = new THREE.FogExp2(0x0b0a09, 0.045);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.05, 80);
    this.scene.add(this.camera);

    this.arena = new Arena(this.scene, { tier });
    this.foe = new Avatar({ corner: 'blue' });
    this.foe.root.position.set(0, 0, FOE_Z);
    this.scene.add(this.foe.root);
    this.gloves = new FirstPersonGloves(this.camera);
    this.fx = new Fx(this.scene);

    this.mode = 'showcase';
    this.head = new THREE.Vector2();
    this.headTarget = new THREE.Vector2();
    this.blend = 0; // 0 = orbit, 1 = first person
    this.orbit = 0.6;
    this.playerInput = null;
    this.ghosts = { left: false, right: false };
    this.eye = EYE.clone();

    this.maxFps = 0;
    this.lastRender = 0;
    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    this.setTier(tier);
  }

  /** Applies a graphics tier (see quality.js) — at runtime, no reload. */
  setTier(tier) {
    const t = TIER[tier] ?? TIER.high;
    this.tier = tier;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, t.pixelRatio));
    this.arena.setTier(t);
    this.maxFps = t.maxFps;
    this.resize();
  }

  setMode(mode) {
    this.mode = mode;
  }

  /** Head offset from the defense tracker (in shoulder widths): slips and ducks move the view. */
  setHead(lateral, drop) {
    this.headTarget.set(lateral, drop);
  }

  setPlayer(input, ghosts) {
    this.playerInput = input;
    this.ghosts = ghosts ?? this.ghosts;
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Portrait phones need a taller view to fit the opponent.
    this.camera.fov = w / h < 0.8 ? 74 : 58;
    this.camera.updateProjectionMatrix();
  }

  /** Where the incoming punch aims: the player's resting head, not the dodged one. */
  get headAim() {
    return EYE.clone().add(new THREE.Vector3(0, -0.04, -0.22));
  }

  /** Where a body shot at the player aims: below the view, at the chest. */
  get bodyAim() {
    return EYE.clone().add(new THREE.Vector3(0, -0.5, -0.25));
  }

  /** World position of the player's glove (for outgoing punches). */
  gloveWorld(side) {
    return this.gloves.gloves[side].getWorldPosition(new THREE.Vector3());
  }

  project(v) {
    const p = v.clone().project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * this.canvas.clientWidth, y: (-p.y * 0.5 + 0.5) * this.canvas.clientHeight, behind: p.z > 1 };
  }

  render(now, dt) {
    const fight = this.mode === 'fight';
    this.blend += ((fight ? 1 : 0) - this.blend) * expAlpha(dt, 0.35);
    this.head.lerp(this.headTarget, expAlpha(dt, 0.06));

    this.arena.update(now, dt);
    this.foe.update(dt);
    this.fx.update(now, dt);
    this.gloves.group.visible = this.blend > 0.6;
    if (this.gloves.group.visible) this.gloves.update(dt, this.playerInput, this.ghosts);

    // Orbit camera.
    this.orbit += dt * 0.06;
    const r = 3.7;
    const orbitPos = new THREE.Vector3(Math.sin(this.orbit) * r, 2.1 + Math.sin(this.orbit * 0.7) * 0.25, FOE_Z + Math.cos(this.orbit) * r);
    const orbitLook = new THREE.Vector3(0, 1.25, FOE_Z);

    // First person: eyes follow the player's head, a little exaggerated so a
    // slip visibly takes you out of the punch's path.
    const fpPos = EYE.clone().add(new THREE.Vector3(this.head.x * 0.3, -this.head.y * 0.42, 0));
    const shake = this.fx.shake;
    if (shake > 0.01) fpPos.add(new THREE.Vector3((Math.random() - 0.5) * shake * 0.08, (Math.random() - 0.5) * shake * 0.06, 0));
    const fpLook = LOOK.clone().add(new THREE.Vector3(this.head.x * 0.12, -this.head.y * 0.2, 0));

    const k = this.blend * this.blend * (3 - 2 * this.blend);
    this.camera.position.lerpVectors(orbitPos, fpPos, k);
    this.camera.lookAt(new THREE.Vector3().lerpVectors(orbitLook, fpLook, k));
    // On the lowest tier the scene is drawn at most maxFps times a second, which
    // leaves the main thread and the GPU to pose tracking.
    const maxFps = this.covered ? 10 : this.maxFps;
    if (maxFps && now - this.lastRender < 1000 / maxFps - 4) return;
    this.lastRender = now;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener('resize', this.resize);
    this.renderer.dispose();
  }
}
