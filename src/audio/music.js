// Background music: a boom-bap loop for the gym, synthesized on the fly with
// Web Audio (no audio files, nothing to license). 90 BPM, A minor, 4 bars.

const BPM = 90;
const STEP = 60 / BPM / 4; // a sixteenth
const SWING = 0.018;

// 16 steps per bar
const KICK = [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0];
const SNARE = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1];
const HAT = [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1];
// Bass root per bar (Hz) and a little figure on top of it.
const ROOTS = [55, 55, 43.65, 49];
const BASS = { 0: 1, 3: 1, 7: 1.5, 10: 1, 14: 1.19 };
// Minor-seventh stabs per bar, as ratios to the root one octave up.
const CHORD = [1, 1.19, 1.5, 1.78];

export class Music {
  /** @param {import('./sfx.js').Sfx} sfx  shares its AudioContext and master bus */
  constructor(sfx) {
    this.sfx = sfx;
    this.level = 0.3;
    this.timer = null;
    this.step = 0;
  }

  get playing() {
    return this.timer !== null;
  }

  start() {
    const c = this.sfx.ctx;
    if (!c || this.timer) return;
    this.out = c.createGain();
    this.out.gain.value = 0.0001;
    this.out.connect(this.sfx.master);
    this.out.gain.setTargetAtTime(this.level, c.currentTime, 0.8);
    this.next = c.currentTime + 0.15;
    this.step = 0;
    this.timer = setInterval(() => this.#schedule(), 25);
  }

  stop() {
    if (!this.timer) return;
    const c = this.sfx.ctx;
    const out = this.out;
    out.gain.setTargetAtTime(0.0001, c.currentTime, 0.3);
    clearInterval(this.timer);
    this.timer = null;
    setTimeout(() => out.disconnect(), 1500);
  }

  /** Quieter during a fight, so punches and the coach stay on top. */
  setLevel(level) {
    this.level = level;
    if (this.out) this.out.gain.setTargetAtTime(level, this.sfx.ctx.currentTime, 0.5);
  }

  #schedule() {
    const c = this.sfx.ctx;
    while (this.next < c.currentTime + 0.12) {
      this.#play(this.step, this.next + (this.step % 2 ? SWING : 0));
      this.next += STEP;
      this.step = (this.step + 1) % 64;
    }
  }

  #play(step, t) {
    const s = step % 16;
    const bar = Math.floor(step / 16);
    if (KICK[s]) this.#kick(t);
    if (SNARE[s] && !(s === 15 && bar !== 3)) this.#snare(t, s === 15 ? 0.35 : 1);
    if (HAT[s]) this.#hat(t, s % 4 === 0 ? 0.13 : 0.08);
    if (BASS[s]) this.#bass(t, ROOTS[bar] * BASS[s], s === 0 ? 0.42 : 0.24);
    if (s === 0 || s === 10) this.#stab(t, ROOTS[bar] * 4, s === 0 ? 0.08 : 0.05);
  }

  #env(g, t, peak, decay, attack = 0.004) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  #osc(t, type, freq, to, peak, decay, filter = null) {
    const c = this.sfx.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + decay);
    const g = c.createGain();
    this.#env(g, t, peak, decay);
    let node = o;
    if (filter) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filter;
      node = o.connect(f);
    }
    node.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + decay + 0.05);
  }

  #noise(t, type, freq, peak, decay) {
    const c = this.sfx.ctx;
    const src = c.createBufferSource();
    src.buffer = this.sfx.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = c.createGain();
    this.#env(g, t, peak, decay, 0.002);
    src.connect(f).connect(g).connect(this.out);
    src.start(t, Math.random());
    src.stop(t + decay + 0.05);
  }

  #kick(t) {
    this.#osc(t, 'sine', 130, 42, 0.9, 0.32);
  }

  #snare(t, amt) {
    this.#noise(t, 'bandpass', 1900, 0.45 * amt, 0.17);
    this.#osc(t, 'triangle', 200, 140, 0.25 * amt, 0.09);
  }

  #hat(t, amt) {
    this.#noise(t, 'highpass', 7500, amt, 0.035);
  }

  #bass(t, freq, amt) {
    this.#osc(t, 'sawtooth', freq, null, amt, 0.34, 420);
  }

  #stab(t, root, amt) {
    for (const r of CHORD) this.#osc(t, 'sawtooth', root * r, null, amt, 0.42, 1300);
  }
}
