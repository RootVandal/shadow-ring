import { h } from '../util/dom.js';

/** A small settings card — the one place that needs a mouse or a keyboard. */
export function openSettings(app) {
  document.querySelector('.settings')?.remove();
  const s = app.settings;
  const set = (patch) => app.updateSettings(patch);
  const select = (value, options, onchange) =>
    h(
      'select',
      { onchange: (e) => onchange(e.target.value) },
      options.map(([v, label]) => h('option', { value: v, selected: v === value }, label)),
    );
  const card = h(
    'aside.settings',
    h('h3', 'Настройки'),
    h('label.field', 'Имя бойца', h('input', { type: 'text', value: s.name, maxlength: 18, onchange: (e) => set({ name: e.target.value.trim() || s.name }) })),
    h(
      'label.field',
      'Стойка',
      select(s.stance, [['orthodox', 'Правша (левая впереди)'], ['southpaw', 'Левша (правая впереди)']], (v) => set({ stance: v })),
    ),
    h(
      'label.field',
      'Чувствительность',
      select(s.sensitivity, [['low', 'Низкая — меньше ложных'], ['normal', 'Средняя'], ['high', 'Высокая — ловит слабые']], (v) => set({ sensitivity: v })),
    ),
    h(
      'label.field',
      'Трекинг',
      select(s.model, [['lite', 'Быстрый (lite)'], ['full', 'Точный (full) — после перезагрузки']], (v) => set({ model: v })),
    ),
    h(
      'label.field',
      'Показывать мою камеру сопернику (онлайн)',
      h('input', { type: 'checkbox', checked: s.shareCam, onchange: (e) => set({ shareCam: e.target.checked }) }),
    ),
    h('label.field', 'Звук', h('input', { type: 'checkbox', checked: s.sound, onchange: (e) => set({ sound: e.target.checked }) })),
    h(
      'label.field',
      app.voice.available ? 'Голос тренера' : 'Голос тренера (нет русского голоса в системе)',
      h('input', { type: 'checkbox', checked: s.voice, disabled: !app.voice.available, onchange: (e) => set({ voice: e.target.checked }) }),
    ),
    h('div', { style: { marginTop: '14px', textAlign: 'right' } }, h('button.btn.btn--small', { onclick: () => card.remove() }, 'Готово')),
  );
  document.body.append(card);
  card.style.zIndex = '45';
  card.style.position = 'fixed';
  return card;
}
