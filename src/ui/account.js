import { h } from '../util/dom.js';
import { currentUser, login, logout, register } from '../game/accounts.js';

// The account corner: "Гость · Регистрация / Вход" or "ник · Выйти".
// Switching accounts reloads the page so every screen reads the new owner's data.

export function mountAccountBar() {
  const user = currentUser();
  const bar = h(
    'div.account',
    user
      ? [h('span.account__who', h('i'), user), h('button.account__btn', { onclick: () => (logout(), location.reload()) }, 'Выйти')]
      : [h('span.account__who.is-guest', 'Гость'), h('button.account__btn', { onclick: () => openAuth('register') }, 'Регистрация / Вход')],
  );
  document.body.append(bar);
  return bar;
}

function openAuth(mode) {
  document.querySelector('.auth')?.remove();
  const nick = h('input', { placeholder: 'ник', maxlength: 16, autocomplete: 'username', spellcheck: false });
  const pass = h('input', { type: 'password', placeholder: 'пароль', autocomplete: mode === 'login' ? 'current-password' : 'new-password' });
  const err = h('p.auth__err');
  const submit = async (e) => {
    e.preventDefault();
    err.textContent = '';
    try {
      await (mode === 'login' ? login : register)(nick.value, pass.value);
      location.reload();
    } catch (x) {
      err.textContent = x.message;
    }
  };
  const box = h(
    'div.auth',
    { onclick: (e) => e.target === box && box.remove() },
    h(
      'form.auth__card',
      { onsubmit: submit },
      h('h2', mode === 'login' ? 'Вход' : 'Регистрация'),
      h('p.muted', mode === 'login' ? 'Деньги, перчатки и бои вернутся на место.' : 'Сохраняет деньги, перчатки и бои. Всё, что заработал гостем, перейдёт в аккаунт.'),
      nick,
      pass,
      err,
      h('button.btn', { type: 'submit' }, mode === 'login' ? 'Войти' : 'Создать аккаунт'),
      h(
        'p.auth__switch',
        mode === 'login' ? 'Нет аккаунта? ' : 'Уже есть аккаунт? ',
        h('a', { href: '#', onclick: (e) => (e.preventDefault(), openAuth(mode === 'login' ? 'register' : 'login')) }, mode === 'login' ? 'Регистрация' : 'Войти'),
      ),
      h('p.auth__note', 'Аккаунт хранится в этом браузере.'),
    ),
  );
  document.body.append(box);
  setTimeout(() => nick.focus(), 30);
}
