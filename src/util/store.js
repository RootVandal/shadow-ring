// localStorage can be missing or throw (private mode, blocked site data) —
// the game must work without it, it just forgets things.
//
// Everything a player owns (settings, money, gloves, fights) lives under their
// account's namespace; a guest uses the plain one. Accounts and the current
// session themselves are global (loadGlobal / saveGlobal).

const PREFIX = 'shadowring:';

function raw(key, fallback) {
  try {
    const v = globalThis.localStorage?.getItem(PREFIX + key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

function put(key, value) {
  try {
    globalThis.localStorage?.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const loadGlobal = raw;
export const saveGlobal = put;

/** Namespace of the signed-in account ('' for a guest). */
const ns = () => {
  const user = raw('session', null);
  return typeof user === 'string' && user ? `u:${user.toLowerCase()}:` : '';
};

export const load = (key, fallback) => raw(ns() + key, fallback);
export const save = (key, value) => put(ns() + key, value);
