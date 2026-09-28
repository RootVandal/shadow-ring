/** Base for full-screen views: owns its DOM and its event subscriptions. */
export class Screen {
  /** @param {import('../app.js').App} app */
  constructor(app, params = {}) {
    this.app = app;
    this.params = params;
    this.el = null;
    this.offs = [];
    this.timers = [];
  }

  /** Subscribes and remembers to unsubscribe on exit. */
  listen(emitter, type, fn) {
    this.offs.push(emitter.on(type, fn));
  }

  later(ms, fn) {
    this.timers.push(setTimeout(fn, ms));
  }

  mount(el) {
    this.el = el;
    this.app.root.append(el);
    return el;
  }

  enter() {}

  frame() {}

  exit() {
    for (const off of this.offs) off();
    for (const t of this.timers) clearTimeout(t);
    this.offs = [];
    this.timers = [];
    this.el?.remove();
  }
}
