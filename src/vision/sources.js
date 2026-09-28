import { openCamera, createLightMeter } from './camera.js';
import { Puppet } from './puppet.js';

/** Webcam → MediaPipe → frames, paced by the camera itself. */
export class CameraSource {
  /** @param {{detector: Promise<any>, onFrame: (frame:object) => void}} o */
  constructor({ detector, onFrame }) {
    this.kind = 'camera';
    this.video = document.createElement('video');
    this.detectorPromise = detector;
    this.onFrame = onFrame;
    this.running = false;
    this.luma = null;
    this.fps = 0;
    this.lightMeter = createLightMeter();
    this.lastLight = 0;
    this.lastMediaTime = -1;
  }

  async start() {
    this.cam = await openCamera(this.video);
    this.detector = await this.detectorPromise;
    this.running = true;
    this.#schedule();
  }

  #schedule() {
    const v = this.video;
    if ('requestVideoFrameCallback' in v) v.requestVideoFrameCallback(() => this.#tick());
    else requestAnimationFrame(() => this.#tick());
  }

  #tick() {
    if (!this.running) return;
    const v = this.video;
    const now = performance.now();
    // Without requestVideoFrameCallback, skip repeated frames — they'd read as "no motion".
    if (v.readyState >= 2 && v.currentTime !== this.lastMediaTime) {
      this.lastMediaTime = v.currentTime;
      try {
        const r = this.detector.detect(v, now);
        this.onFrame({ ...r, width: v.videoWidth, height: v.videoHeight, t: now });
      } catch (e) {
        console.warn('pose detection failed', e);
      }
      this.fps = this.fps * 0.9 + (1000 / Math.max(1, now - (this.lastTick ?? now - 33))) * 0.1;
      this.lastTick = now;
      if (now - this.lastLight > 1000) {
        this.luma = this.lightMeter(v);
        this.lastLight = now;
      }
    }
    this.#schedule();
  }

  stop() {
    this.running = false;
    this.cam?.stop();
  }
}

/**
 * Keyboard-driven stand-in for a camera (?input=puppet): the same landmarks a
 * webcam would produce, so everything downstream runs for real. For testing
 * without a camera and for recording demos.
 *
 *   F / J  jab / cross        D / K  left / right hook     S / L  left / right uppercut
 *   Shift + the same keys — sloppy versions (short jab, swing, low elbow, straight-arm uppercut)
 *   ← / →  slip (hold)        ↓  duck (hold)              G  drop the guard
 *   H  raise the right hand (menu cursor)                  V  leave the frame
 *   P  (hold) both arms out, fists together — the pistol grip
 *   Z + F / K — a body jab / body hook
 */
export class PuppetSource {
  constructor({ onFrame }) {
    this.kind = 'puppet';
    this.video = null;
    this.luma = 140;
    this.fps = 30;
    this.onFrame = onFrame;
    this.puppet = new Puppet({ noise: 0.6 });
    this.guardDown = false;
    this.onKey = this.onKey.bind(this);
  }

  async start() {
    this.timer = setInterval(() => {
      const t = performance.now();
      this.onFrame(this.puppet.frame(t / 1000));
    }, 1000 / 30);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
  }

  onKey(e) {
    if (e.target instanceof HTMLInputElement) return;
    const down = e.type === 'keydown';
    const p = this.puppet;
    const t = performance.now() / 1000;
    const sloppy = e.shiftKey;
    const low = this.zHeld;
    const punches = {
      KeyF: ['left', low ? 'jabBody' : sloppy ? 'jabShort' : 'jab'],
      KeyJ: ['right', sloppy ? 'jabShort' : 'jab'],
      KeyD: ['left', sloppy ? 'swing' : 'hook'],
      KeyK: ['right', low ? 'hookBody' : sloppy ? 'hookLow' : 'hook'],
      KeyS: ['left', sloppy ? 'upperStraight' : 'upper'],
      KeyL: ['right', sloppy ? 'upperStraight' : 'upper'],
    };
    if (punches[e.code]) {
      if (down && !e.repeat) p.play(punches[e.code][0], punches[e.code][1], t);
      return;
    }
    switch (e.code) {
      case 'ArrowLeft':
        p.slip(down ? 1 : 0);
        break;
      case 'ArrowRight':
        p.slip(down ? -1 : 0);
        break;
      case 'ArrowDown':
        p.duck(down);
        break;
      case 'KeyG':
        if (down && !e.repeat) {
          this.guardDown = !this.guardDown;
          p.setBase('left', this.guardDown ? 'low' : 'guard');
          p.setBase('right', this.guardDown ? 'low' : 'guard');
        }
        break;
      case 'KeyH':
        if (!e.repeat) p.setBase('right', down ? 'cursor' : this.guardDown ? 'low' : 'guard');
        break;
      case 'KeyZ':
        this.zHeld = down;
        break;
      case 'KeyP':
        if (!e.repeat) {
          const base = down ? 'aim' : this.guardDown ? 'low' : 'guard';
          p.setBase('left', base);
          p.setBase('right', base);
        }
        break;
      case 'KeyV':
        if (down && !e.repeat) p.visible = !p.visible;
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  stop() {
    clearInterval(this.timer);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
  }
}
