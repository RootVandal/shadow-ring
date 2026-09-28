// The coach's voice via the browser's speech synthesis. If the system has no
// Russian voice we stay quiet rather than mangle the words with an English one.

export class Voice {
  constructor() {
    this.enabled = true;
    this.voice = null;
    this.synth = globalThis.speechSynthesis ?? null;
    if (!this.synth) return;
    const pick = () => {
      const all = this.synth.getVoices();
      this.voice = all.find((v) => /^ru/i.test(v.lang) && /google|microsoft|natural/i.test(v.name)) ?? all.find((v) => /^ru/i.test(v.lang)) ?? null;
    };
    pick();
    this.synth.addEventListener?.('voiceschanged', pick);
  }

  get available() {
    return !!(this.synth && this.voice);
  }

  say(text, { interrupt = false } = {}) {
    if (!this.enabled || !this.available) return;
    if (interrupt) this.synth.cancel();
    else if (this.synth.speaking) return;
    const u = new SpeechSynthesisUtterance(text);
    u.voice = this.voice;
    u.lang = this.voice.lang;
    u.rate = 1.12;
    u.pitch = 0.95;
    this.synth.speak(u);
  }

  stop() {
    this.synth?.cancel();
  }
}
