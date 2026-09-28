// ?debug — live numbers from the recognizer. This is how thresholds in
// config.js get tuned against a real camera: throw a punch, watch the channels.

const f = (x, d = 2) => (typeof x === 'number' && Number.isFinite(x) ? x.toFixed(d) : '—');

export class DebugPanel {
  constructor(app) {
    this.app = app;
    this.el = document.createElement('pre');
    this.el.className = 'debug';
    document.body.append(this.el);
    this.log = [];
    this.last = 0;
    const t = app.tracker;
    const push = (s) => {
      this.log.unshift(`${new Date().toISOString().slice(17, 22)} ${s}`);
      this.log.length = Math.min(this.log.length, 8);
    };
    t.on('punch', (e) => push(`PUNCH ${e.kind} ${e.side} q=${f(e.quality)} ${Math.round(e.ms)}ms reach=${f(e.reach)} ${e.faults.map((x) => x.code).join(' ')}`));
    t.on('attempt', (e) => push(`attempt ${e.type} ${e.side} (${e.reason})`));
    t.on('fault', (e) => push(`fault ${e.code}`));
    t.on('dodge', (e) => push(`dodge ${e.kind} ${e.dir ?? ''}`));
  }

  update(now) {
    if (now - this.last < 100) return;
    this.last = now;
    const { app } = this;
    const d = app.tracker.debug();
    const arm = (a) =>
      `${a.state.padEnd(7)} E ${f(a.E)} [ang ${f(a.parts?.angle)} rch ${f(a.parts?.reach)} cmp ${f(a.parts?.compact)} hnd ${f(a.parts?.hand)}]  vE ${f(a.live.vE, 1).padStart(5)} vIn ${f(a.live.vIn, 1).padStart(5)} vUp ${f(a.live.vUp, 1).padStart(5)} ${a.guard ? 'GUARD' : ''}`;
    const def = d.defense;
    this.el.textContent = [
      `gfx ${app.stage.tier}${app.autoQuality ? ` auto ${f(app.autoQuality.fps, 0)}fps` : ''}  input ${app.input?.kind ?? '—'} ${f(app.input?.fps, 0)}fps  S ${f(d.S, 0)}px  mode ${d.mode}  framing ${d.framing ?? 'ok'}  luma ${f(app.tracker.luma, 0)}  screen ${app.screenName}`,
      `L ${arm(d.left)}`,
      `R ${arm(d.right)}`,
      `guard ${def.guard}  slip ${def.slip ?? '-'}  duck ${def.duck}  lat ${f(def.lateral)}  drop ${f(def.drop)}  tilt ${f(def.tilt, 0)}°`,
      '',
      ...this.log,
    ].join('\n');
  }
}
