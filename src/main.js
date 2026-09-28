import { App } from './app.js';

function unsupported(text) {
  document.getElementById('ui').innerHTML = `<div class="screen setup"><div class="error-card"><h2>Не запустится</h2><p>${text}</p></div></div>`;
}

const probe = document.createElement('canvas');
if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) {
  unsupported('Браузер не поддерживает WebGL. Открой игру в свежем Chrome, Edge, Firefox или Safari.');
} else {
  const app = new App({
    canvas: document.getElementById('stage'),
    root: document.getElementById('ui'),
    params: new URLSearchParams(location.search),
  });
  app.boot();
  if (app.params.has('debug')) {
    window.app = app;
    import('./game/ranked.js').then((m) => (window.ranked = m)); // проверка рейтинга из консоли
  }
}
