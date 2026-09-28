// Every sound is synthesized with Web Audio — no files to load or license.

export class Sfx {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.crowdGain = null;
  }

  /** Must run inside a user gesture (browsers keep audio locked until then). */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(comp).connect(this.ctx.destination);
      this.noise = this.#noiseBuffer();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  get ready() {
    return this.enabled && this.ctx && this.ctx.state === 'running';
  }

  #noiseBuffer() {
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  #env(gain, t, peak, attack, decay) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  #noise(t, { type = 'lowpass', freq = 1000, q = 0.7, peak = 0.5, attack = 0.003, decay = 0.12, sweepTo = null }) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + attack + decay);
    f.Q.value = q;
    const g = this.ctx.createGain();
    this.#env(g, t, peak, attack, decay);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5);
    src.stop(t + attack + decay + 0.05);
  }

  #tone(t, { type = 'sine', freq = 440, to = null, peak = 0.4, attack = 0.004, decay = 0.2 }) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + attack + decay);
    const g = this.ctx.createGain();
    this.#env(g, t, peak, attack, decay);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  }

  /** Leather on a head: a low thump plus a slap. */
  hit(strength = 0.7) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.#tone(t, { freq: 150, to: 42, peak: 0.9 * strength, decay: 0.2 });
    this.#noise(t, { type: 'bandpass', freq: 1900, q: 0.8, peak: 0.55 * strength, decay: 0.07 });
    this.#noise(t, { type: 'lowpass', freq: 900, peak: 0.5 * strength, decay: 0.16 });
  }

  block() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.#tone(t, { freq: 110, to: 60, peak: 0.5, decay: 0.12 });
    this.#noise(t, { type: 'lowpass', freq: 520, peak: 0.45, decay: 0.1 });
  }

  /** The prank pistol: a sharp crack, a low boom and the hall's echo. */
  shot() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.#noise(t, { type: 'highpass', freq: 1800, peak: 1, attack: 0.001, decay: 0.05 });
    this.#noise(t, { type: 'lowpass', freq: 700, peak: 0.9, attack: 0.002, decay: 0.35 });
    this.#tone(t, { freq: 110, to: 38, peak: 1, attack: 0.002, decay: 0.3 });
    this.#noise(t + 0.09, { type: 'bandpass', freq: 900, q: 0.6, peak: 0.25, attack: 0.02, decay: 0.8 });
  }

  whoosh() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.#noise(t, { type: 'bandpass', freq: 320, sweepTo: 1700, q: 1.2, peak: 0.35, attack: 0.07, decay: 0.16 });
  }

  /** The ring bell: inharmonic partials with a long ring. */
  bell(times = 1) {
    if (!this.ready) return;
    const t0 = this.ctx.currentTime;
    for (let n = 0; n < times; n++) {
      const t = t0 + n * 0.32;
      [1, 2.01, 2.76, 4.07, 5.43].forEach((r, i) => {
        this.#tone(t, { freq: 760 * r, peak: [0.32, 0.16, 0.12, 0.06, 0.04][i], attack: 0.002, decay: 1.6 - i * 0.2 });
      });
      this.#noise(t, { type: 'highpass', freq: 3000, peak: 0.15, decay: 0.03 });
    }
  }

  /** The timekeeper's wooden knock, ten seconds before the bell. */
  knock() {
    if (!this.ready) return;
    const t0 = this.ctx.currentTime;
    for (let n = 0; n < 3; n++) {
      const t = t0 + n * 0.16;
      this.#tone(t, { freq: 1050, to: 900, peak: 0.35, attack: 0.001, decay: 0.05 });
      this.#noise(t, { type: 'bandpass', freq: 2400, q: 3, peak: 0.2, decay: 0.03 });
    }
  }

  tick() {
    if (!this.ready) return;
    this.#tone(this.ctx.currentTime, { freq: 1200, peak: 0.08, decay: 0.03 });
  }

  select() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.#tone(t, { type: 'triangle', freq: 660, peak: 0.2, decay: 0.08 });
    this.#tone(t + 0.07, { type: 'triangle', freq: 990, peak: 0.2, decay: 0.12 });
  }

  countdown(final = false) {
    if (!this.ready) return;
    this.#tone(this.ctx.currentTime, { type: 'square', freq: final ? 1320 : 880, peak: 0.12, decay: final ? 0.3 : 0.09 });
  }

  /** A cheer rising out of the crowd. */
  cheer(amount = 0.6) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.#noise(t, { type: 'bandpass', freq: 900, q: 0.5, peak: 0.28 * amount, attack: 0.25, decay: 1.6 });
    this.#noise(t, { type: 'bandpass', freq: 2200, q: 0.8, peak: 0.1 * amount, attack: 0.3, decay: 1.2 });
  }

  /** Low murmur of a full hall; call again to change the level. */
  crowd(level = 0.05) {
    if (!this.ctx) return;
    if (!this.crowdGain) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 650;
      f.Q.value = 0.45;
      this.crowdGain = this.ctx.createGain();
      this.crowdGain.gain.value = 0;
      src.connect(f).connect(this.crowdGain).connect(this.master);
      src.start();
    }
    this.crowdGain.gain.setTargetAtTime(this.enabled ? level : 0, this.ctx.currentTime, 0.6);
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.crowdGain) this.crowdGain.gain.setTargetAtTime(on ? 0.04 : 0, this.ctx.currentTime, 0.2);
  }
}
