// Graphics quality tiers and the automatic downgrade.
//
// Pose tracking runs on the same main thread and GPU as the 3D scene, so a
// laggy picture also means late punches. On 'auto' the game watches the real
// frame rate and steps down a tier whenever it stays low; it never steps back
// up on its own (that would oscillate). A tier set by hand is left alone.

export const TIERS = ['high', 'medium', 'low', 'lowest'];

/**
 * pixelRatio  cap on the canvas resolution (× CSS pixels)
 * shadows     the key light casts shadows (an extra render pass)
 * haze        light cones under the truss
 * crowdEvery  the crowd moves every N-th frame
 * maxFps      the 3D scene renders at most this often (0 = every frame)
 * grain       the film-grain overlay (a full-screen blend over the canvas)
 * pipDpr      resolution of the camera preview
 */
export const TIER = {
  high: { pixelRatio: 1.75, shadows: true, haze: true, crowdEvery: 1, maxFps: 0, grain: true, pipDpr: 2 },
  medium: { pixelRatio: 1.25, shadows: false, haze: true, crowdEvery: 2, maxFps: 0, grain: false, pipDpr: 1.5 },
  low: { pixelRatio: 1, shadows: false, haze: false, crowdEvery: 3, maxFps: 0, grain: false, pipDpr: 1 },
  lowest: { pixelRatio: 0.75, shadows: false, haze: false, crowdEvery: 6, maxFps: 30, grain: false, pipDpr: 1 },
};

export const TIER_LABEL = { high: 'высокая', medium: 'средняя', low: 'низкая', lowest: 'минимальная' };

const WARMUP_S = 3; // shaders compile and textures upload at the start
const GRACE_S = 2.5; // after a change, let the new tier settle
const WINDOW_S = 2.5;
const MIN_FPS = 45;
const HOPELESS_FPS = 26;

/** Watches frame intervals and asks for the next tier down when the game can't keep up. */
export class AutoQuality {
  /** @param {{tier: string, onChange: (tier: string) => void}} o */
  constructor({ tier, onChange }) {
    this.tier = tier;
    this.onChange = onChange;
    this.wait = WARMUP_S;
    this.samples = [];
    this.elapsed = 0;
    this.fps = null;
  }

  /** Call once per animation frame with the real time since the previous one (s). */
  sample(dt) {
    // A long gap is a hidden tab or a breakpoint, not a slow device.
    if (dt <= 0 || dt > 0.25) {
      this.samples.length = 0;
      this.elapsed = 0;
      return;
    }
    if (this.wait > 0) {
      this.wait -= dt;
      return;
    }
    this.samples.push(dt);
    this.elapsed += dt;
    if (this.elapsed < WINDOW_S) return;

    const s = this.samples.sort((a, b) => a - b);
    const median = s[Math.floor(s.length / 2)];
    const p90 = s[Math.floor(s.length * 0.9)];
    this.fps = 1 / median;
    this.samples = [];
    this.elapsed = 0;

    // A steady 30 is a display or battery-saver cap, not lag — lowering quality wouldn't help.
    const capped = median > 0.03 && median < 0.036 && p90 < 0.04;
    const slow = this.fps < HOPELESS_FPS || (this.fps < MIN_FPS && !capped);
    const next = TIERS[TIERS.indexOf(this.tier) + 1];
    if (slow && next) {
      this.tier = next;
      this.wait = GRACE_S;
      this.onChange(next);
    }
  }
}
