import { Screen } from '../screen.js';
import { Pip } from '../pip.js';
import { h, clear } from '../../util/dom.js';
import { TIPS, UI } from '../../strings.js';

const CHECKS = [
  ['body', UI.checks.body, (i) => i !== 'no_person'],
  ['arms', UI.checks.arms, (i) => i !== 'no_person' && i !== 'partial'],
  ['distance', UI.checks.distance, (i) => !['no_person', 'partial', 'too_far', 'too_close'].includes(i)],
  ['light', UI.checks.light, (i) => i !== 'dark' && i !== 'no_person'],
];

/** Camera on, model loaded, player standing where the camera can see them. */
export class SetupScreen extends Screen {
  enter() {
    const { app } = this;
    app.stage.setMode('showcase');
    app.cursor.setEnabled(false);
    this.pip = new Pip({ label: 'камера' });
    this.chips = CHECKS.map(([key, label]) => [key, h('span.chip', label)]);
    this.hint = h('p.setup__text', UI.startingCamera);
    this.bar = h('i');
    this.loadLabel = h('span', UI.loadingModel);
    this.loadNum = h('span', '');
    this.loader = h('div.loader', h('div.loader__label', this.loadLabel, this.loadNum), h('div.loader__bar', this.bar));
    this.body = h(
      'div.setup__stage',
      this.pip.el,
    );
    this.mount(
      h(
        'section.screen.setup',
        h('h2.setup__title', UI.setupTitle),
        this.hint,
        this.body,
        h('div.checks', this.chips.map(([, el]) => el)),
        this.loader,
      ),
    );
    this.okSince = 0;
    this.ready = false;
    app
      .startInput()
      .then(() => {
        this.ready = true;
        this.loader.remove();
      })
      .catch((err) => this.#fail(err));
  }

  #fail(err) {
    console.error(err);
    const code = err?.code;
    const text = UI.cameraErrors[code] ?? `${UI.cameraErrors.unknown} ${err?.message ?? ''}`;
    clear(this.el).append(
      h(
        'div.error-card',
        h('h2', code ? 'Нет камеры' : 'Не загрузилось'),
        h('p', text),
        h('button.btn', { onclick: () => location.reload() }, UI.retry),
      ),
    );
  }

  frame(now, dt) {
    const { app } = this;
    const p = app.loadProgress;
    if (!this.ready) {
      if (p.total) {
        this.bar.parentElement.style.setProperty('--p', String(p.loaded / p.total));
        this.bar.style.width = `${(p.loaded / p.total) * 100}%`;
        this.loadNum.textContent = `${(p.loaded / 1e6).toFixed(1)} / ${(p.total / 1e6).toFixed(1)} МБ`;
      }
      if (app.input?.video?.videoWidth || app.input?.kind === 'puppet') this.hint.textContent = 'Камера есть. Догружаем трекинг…';
      this.pip.draw({ video: app.input?.video, body: null, dt });
      return;
    }
    const issue = app.tracker.framing.issue;
    for (const [key, el] of this.chips) {
      const check = CHECKS.find((c) => c[0] === key)[2];
      el.classList.toggle('is-ok', check(issue));
      el.classList.toggle('is-bad', !check(issue));
    }
    this.hint.textContent = issue ? TIPS[issue] : 'Отлично, так и стой.';
    this.pip.draw({ video: app.input.video, body: app.tracker.body, dt });
    if (!issue) {
      this.okSince ||= now;
      if (now - this.okSince > 700) app.go('calibrate');
    } else this.okSince = 0;
  }
}
