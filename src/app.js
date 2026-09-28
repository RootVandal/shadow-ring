import { Stage } from './render/stage.js';
import { AutoQuality, TIER } from './render/quality.js';
import { Pip } from './ui/pip.js';
import { PoseAnimator } from './render/animator.js';
import { MotionTracker } from './motion/tracker.js';
import { Coach } from './game/coach.js';
import { Sfx } from './audio/sfx.js';
import { Voice } from './audio/voice.js';
import { HandCursor } from './ui/hand-cursor.js';
import { CameraSource, PuppetSource } from './vision/sources.js';
import { createPoseDetector } from './vision/pose-detector.js';
import { SCREENS } from './ui/screens/index.js';
import { DebugPanel } from './ui/debug.js';
import { load, save } from './util/store.js';

const DEFAULTS = { name: '', stance: 'orthodox', sensitivity: 'normal', sound: true, voice: true, model: 'lite', shareCam: true, graphics: 'auto' };
const FIRST = ['Тихий', 'Быстрый', 'Железный', 'Хитрый', 'Бешеный', 'Ночной', 'Левый', 'Точный'];
const SECOND = ['Джеб', 'Хук', 'Кулак', 'Апперкот', 'Нырок', 'Уклон', 'Кросс', 'Клинч'];

function randomName() {
  const r = (a) => a[Math.floor(Math.random() * a.length)];
  return `${r(FIRST)} ${r(SECOND)}`;
}

/** Room code from a shared link: …/#room=ABCDE */
function roomFromHash() {
  const m = /room=([A-Z0-9]{4,8})/i.exec(location.hash);
  return m ? m[1].toUpperCase() : null;
}

/**
 * Wires the long-lived pieces together — 3D stage, camera and tracker, coach,
 * audio, hand cursor — and switches between screens. Screens do the rest.
 */
export class App {
  constructor({ canvas, root, params }) {
    this.root = root;
    this.params = params;
    this.settings = { ...DEFAULTS, ...load('settings', {}) };
    if (!this.settings.name) {
      this.settings.name = randomName();
      save('settings', this.settings);
    }
    this.mobile = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820;
    this.stage = new Stage(canvas, { tier: this.#startTier() });
    this.#applyTier(this.stage.tier);
    this.#setupAutoQuality();
    this.sfx = new Sfx();
    this.sfx.enabled = this.settings.sound;
    this.voice = new Voice();
    this.voice.enabled = this.settings.voice;
    this.tracker = new MotionTracker({ stance: this.settings.stance, sensitivity: this.settings.sensitivity });
    this.coach = new Coach({ voice: this.voice });
    this.cursor = new HandCursor();
    this.cursor.onHover = () => this.sfx.tick();
    this.cursor.onSelect = () => this.sfx.select();
    this.showcase = new PoseAnimator();
    this.nextShowcaseMove = 0;
    this.foeDriver = null;
    this.input = null;
    this.inputKind = params.get('input') === 'puppet' ? 'puppet' : 'camera';
    this.loadProgress = { loaded: 0, total: 0, done: false, error: null };
    this.pendingRoom = roomFromHash();
    this.screen = null;
    this.last = performance.now();
    this.debug = params.has('debug') ? new DebugPanel(this) : null;
    this.loop = this.loop.bind(this);
  }

  boot() {
    if (this.inputKind === 'camera') this.#preload();
    document.addEventListener('visibilitychange', () => this.screen?.onVisibility?.(document.hidden));
    this.go('landing');
    requestAnimationFrame(this.loop);
  }

  /** Starts downloading the tracker right away — by the time the player clicks, it's there. */
  #preload() {
    this.detector = createPoseDetector({
      model: this.params.get('model') ?? this.settings.model,
      onProgress: (loaded, total) => Object.assign(this.loadProgress, { loaded, total }),
    }).then(
      (d) => {
        this.loadProgress.done = true;
        return d;
      },
      (e) => {
        this.loadProgress.error = e;
        throw e;
      },
    );
    this.detector.catch(() => {});
  }

  /** Camera (or the keyboard puppet) on. Safe to call repeatedly. */
  startInput() {
    this.sfx.unlock();
    this.sfx.crowd(0.035);
    if (this.inputStarted) return this.inputStarted;
    const onFrame = (frame) => {
      this.tracker.luma = this.input.luma;
      this.tracker.process(frame);
    };
    this.input = this.inputKind === 'puppet' ? new PuppetSource({ onFrame }) : new CameraSource({ detector: this.detector, onFrame });
    this.inputStarted = this.input.start().catch((e) => {
      this.inputStarted = null;
      this.input = null;
      throw e;
    });
    return this.inputStarted;
  }

  go(name, params = {}) {
    this.screen?.exit();
    this.coach.clear();
    const S = SCREENS[name];
    this.stage.covered = S.covers;
    this.screen = new S(this, params);
    this.screenName = name;
    this.screen.enter();
  }

  updateSettings(patch) {
    Object.assign(this.settings, patch);
    save('settings', this.settings);
    const s = this.settings;
    this.tracker.stance = s.stance;
    this.tracker.setSensitivity(s.sensitivity);
    this.sfx.setEnabled(s.sound);
    this.voice.enabled = s.voice;
    if (!s.voice) this.voice.stop();
    if ('graphics' in patch) {
      if (s.graphics !== 'auto') this.#applyTier(s.graphics);
      this.#setupAutoQuality();
    }
  }

  /** ?quality=… pins a tier for testing; otherwise the setting, and 'auto' starts by device. */
  #startTier() {
    const forced = this.params.get('quality');
    if (TIER[forced]) return forced;
    if (TIER[this.settings.graphics]) return this.settings.graphics;
    return this.mobile ? 'low' : 'high';
  }

  #setupAutoQuality() {
    const auto = !TIER[this.params.get('quality')] && this.settings.graphics === 'auto';
    this.autoQuality = auto ? new AutoQuality({ tier: this.stage.tier, onChange: (t) => this.#applyTier(t) }) : null;
  }

  #applyTier(tier) {
    const t = TIER[tier];
    if (tier !== this.stage.tier) this.stage.setTier(tier);
    Pip.maxDpr = t.pipDpr;
    document.documentElement.dataset.grain = t.grain ? 'on' : 'off';
  }

  loop(now) {
    this.autoQuality?.sample((now - this.last) / 1000);
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.screen?.frame(now, dt);
    const pose = this.foeDriver ? this.foeDriver(now, dt) : this.#shadowboxing(now, dt);
    if (pose) this.stage.foe.setPose(pose);
    this.cursor.update(this.tracker.body, now);
    this.coach.update(now);
    this.stage.render(now, dt);
    this.debug?.update(now);
    requestAnimationFrame(this.loop);
  }

  /** Between fights the Shadow warms up on its own. */
  #shadowboxing(now, dt) {
    const a = this.showcase;
    if (now > this.nextShowcaseMove) {
      const r = Math.random();
      if (r < 0.55) a.punch(['jab', 'cross', 'hook', 'upper'][Math.floor(Math.random() * 4)], Math.random() < 0.5 ? 'left' : 'right', 160);
      else if (r < 0.75) a.slip(Math.random() < 0.5 ? -1 : 1);
      else if (r < 0.85) a.duck();
      this.nextShowcaseMove = now + 700 + Math.random() * 1300;
    }
    return a.update(dt);
  }
}
