import { loadGlobal, saveGlobal } from '../util/store.js';

// Nickname + password accounts on this device. Passwords are never stored:
// only a salted SHA-256 hash (Web Crypto). Money, gloves, fights and settings
// are kept per account (see util/store.js), a guest can play without one.

const ACCOUNTS = 'accounts';
const SESSION = 'session';
const OWNED_KEYS = ['wallet', 'history', 'settings'];

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function hash(password, salt) {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  return hex(await crypto.subtle.digest('SHA-256', data));
}

const accounts = () => loadGlobal(ACCOUNTS, {}) ?? {};
const keyOf = (nick) => nick.trim().toLowerCase();

export const currentUser = () => {
  const s = loadGlobal(SESSION, null);
  return typeof s === 'string' && s ? accounts()[keyOf(s)]?.nick ?? null : null;
};

/** @returns {string|null} what's wrong with the nickname/password, or null */
export function validate(nick, password) {
  const n = String(nick ?? '').trim();
  if (n.length < 3 || n.length > 16) return 'Ник — от 3 до 16 символов';
  if (!/^[\p{L}\p{N}_\- ]+$/u.test(n)) return 'В нике только буквы, цифры, пробел, _ и -';
  if (String(password ?? '').length < 4) return 'Пароль — минимум 4 символа';
  return null;
}

/**
 * Creates an account. Whatever the guest earned so far moves into it, so
 * signing up after a good fight doesn't lose the money.
 */
export async function register(nick, password) {
  const err = validate(nick, password);
  if (err) throw new Error(err);
  const all = accounts();
  const key = keyOf(nick);
  if (all[key]) throw new Error('Такой ник уже занят');
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  all[key] = { nick: nick.trim(), salt, hash: await hash(password, salt), created: Date.now() };
  saveGlobal(ACCOUNTS, all);
  for (const k of OWNED_KEYS) {
    const guest = loadGlobal(k, null);
    if (guest != null) saveGlobal(`u:${key}:${k}`, k === 'settings' ? { ...guest, name: nick.trim() } : guest);
  }
  if (loadGlobal(`u:${key}:settings`, null) == null) saveGlobal(`u:${key}:settings`, { name: nick.trim() });
  saveGlobal(SESSION, key);
  return all[key].nick;
}

export async function login(nick, password) {
  const acc = accounts()[keyOf(String(nick ?? ''))];
  if (!acc || (await hash(password, acc.salt)) !== acc.hash) throw new Error('Неверный ник или пароль');
  saveGlobal(SESSION, keyOf(nick));
  return acc.nick;
}

export function logout() {
  saveGlobal(SESSION, null);
}
