// The coach's voice via the browser's speech synthesis. If the system has no
// Russian voice we stay quiet rather than mangle the words with an English one.

/**
 * Какой русский голос лучше звучит. Системные голоса Windows (Irina, Pavel)
 * роботизированные; Google — тот же, что на Android; «Natural/Online» в Edge —
 * нейросетевые, лучшие; Milena/Yuri — голоса iPhone и Mac.
 */
export function voiceScore(v) {
  if (/natural|neural|online/i.test(v.name)) return 4;
  if (/google/i.test(v.name)) return 3;
  if (/milena|yuri|katya|enhanced|premium/i.test(v.name)) return 2;
  if (/irina|pavel|desktop/i.test(v.name)) return 0;
  return 1;
}

export class Voice {
  constructor() {
    this.enabled = true;
    this.voice = null;
    this.preferred = ''; // имя голоса из настроек; '' — выбрать лучший самим
    this.voices = [];
    this.broken = new Set(); // голоса, которые у этого браузера не заговорили — пропускаем
    this.synth = globalThis.speechSynthesis ?? null;
    if (!this.synth) return;
    const pick = () => {
      this.voices = this.synth
        .getVoices()
        .filter((v) => /^ru/i.test(v.lang) && !this.broken.has(v.name))
        .sort((a, b) => voiceScore(b) - voiceScore(a));
      this.voice = this.voices.find((v) => v.name === this.preferred) ?? this.voices[0] ?? null;
    };
    this.pick = pick;
    pick();
    this.synth.addEventListener?.('voiceschanged', pick);
  }

  get available() {
    return !!(this.synth && this.voice);
  }

  /** Голос из настроек (имя) или '' — лучший из доступных. */
  setPreferred(name = '') {
    this.preferred = name;
    this.pick?.();
  }

  say(text, { interrupt = false } = {}) {
    if (!this.enabled || !this.available) return;
    if (interrupt) this.synth.cancel();
    else if (this.synth.speaking) return;
    const u = new SpeechSynthesisUtterance(text);
    u.voice = this.voice;
    u.lang = this.voice.lang;
    // Системные голоса Windows на ускорении звучат ещё хуже — им обычная скорость.
    const robotic = voiceScore(this.voice) === 0;
    u.rate = robotic ? 1 : 1.12;
    u.pitch = robotic ? 1 : 0.95;
    // Сетевой голос (Google, Natural) может не сработать без интернета — тогда
    // переходим на следующий голос и повторяем фразу, а не молчим.
    const voice = this.voice;
    u.onerror = (e) => {
      if (e.error === 'interrupted' || e.error === 'canceled' || this.voice !== voice) return;
      this.broken.add(voice.name);
      this.pick();
      if (this.voice) this.say(text, { interrupt: true });
    };
    this.synth.speak(u);
  }

  stop() {
    this.synth?.cancel();
  }
}
