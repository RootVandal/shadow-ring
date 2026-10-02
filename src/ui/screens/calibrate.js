import { Screen } from '../screen.js';
import { Pip } from '../pip.js';
import { h } from '../../util/dom.js';
import { TIPS, TIP_FOCUS, UI } from '../../strings.js';
import { shouldOfferTutorial, markProgress } from '../../game/progress.js';

const RING = 2 * Math.PI * 38;

/** "Hold your guard for a second" — the baseline everything else is measured against. */
export class CalibrateScreen extends Screen {
  enter() {
    const { app } = this;
    app.stage.setMode('showcase');
    app.cursor.setEnabled(false);
    app.tracker.setMode('calibrate');
    this.pip = new Pip({ label: 'стойка' });
    this.ringFg = svgCircle('fg');
    const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ring.setAttribute('viewBox', '0 0 92 92');
    ring.classList.add('hold-ring');
    ring.append(svgCircle('bg'), this.ringFg);
    this.hint = h('p.setup__text', UI.calibText);
    this.title = h('h2.setup__title', UI.calibTitle);
    this.mount(h('section.screen.setup', this.title, this.hint, h('div.setup__stage', this.pip.el, ring)));
    this.focus = null;
    this.done = false;
    this.listen(app.tracker, 'calibration', (r) => this.#progress(r));
    app.voice.say('Прими стойку. Кулаки у подбородка, локти вниз.');
  }

  #progress(r) {
    if (this.done) return;
    this.ringFg.style.strokeDashoffset = String(RING * (1 - Math.min(1, r.progress)));
    const issue = r.issue === 'no_person' ? this.app.tracker.framing.issue ?? 'no_person' : r.issue;
    this.focus = issue ? (TIP_FOCUS[issue] ? { ...TIP_FOCUS[issue] } : null) : null;
    this.hint.textContent = issue ? TIPS[issue] ?? UI.calibText : UI.calibText;
    if (r.baseline) {
      this.done = true;
      this.app.sfx.select();
      this.title.textContent = UI.calibDone;
      this.hint.textContent = 'Теперь игра знает твою стойку. Все удары меряются от неё.';
      this.later(900, () => {
        const room = this.app.pendingRoom;
        if (room) this.app.go('lobby', { join: room });
        else if (shouldOfferTutorial()) {
          markProgress({ offered: true });
          this.app.go('tutorial', { first: true });
        } else this.app.go('menu');
      });
    }
  }

  frame(now, dt) {
    const { app } = this;
    this.pip.draw({ video: app.input?.video, body: app.tracker.body, hands: app.tracker.hands, focus: this.focus, targets: true, dt });
  }
}

function svgCircle(cls) {
  const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  c.setAttribute('cx', '46');
  c.setAttribute('cy', '46');
  c.setAttribute('r', '38');
  c.setAttribute('class', cls);
  if (cls === 'fg') {
    c.setAttribute('stroke-dasharray', String(RING));
    c.style.strokeDashoffset = String(RING);
  }
  return c;
}
