import { load, save } from '../util/store.js';

// Glove shop: money for online wins, gloves the opponent sees on you.
// Everything lives in this browser (like the records).

export const WIN_REWARD = 250;

export const GLOVES = [
  {
    id: 'classic',
    name: 'Классика',
    price: 0,
    desc: 'Перчатки цвета твоего угла. С ними начинал каждый — и каждый их помнит.',
  },
  {
    id: 'violet',
    name: 'Фиолетовый шторм',
    price: 250,
    desc: 'Глубокий фиолетовый лак. Первая покупка, после которой соперник понимает: ты тут не первый день.',
  },
  {
    id: 'gold',
    name: 'Чемпион',
    price: 1000,
    desc: 'Полированное золото, как на поясе. Тяжело смотрятся, легко бьют. Надевают те, кто уже побеждал.',
  },
  {
    id: 'polka',
    name: 'Горошек',
    price: 2500,
    desc: 'Красные в белый горошек — дерзость в чистом виде. Проиграть в таких стыдно, поэтому в них не проигрывают.',
  },
  {
    id: 'legend',
    name: 'Легенда',
    code: 'BOXINGLEGENDS',
    effect: 'legend',
    desc: 'Чёрная кожа и золотая кромка. Каждый точный удар разрывается золотой ударной волной. Не продаются — только для тех, кто знает слово.',
  },
];

export const gloveById = (id) => GLOVES.find((g) => g.id === id) ?? GLOVES[0];

/** Not gloves: things a promo code gives. */
export const SECRETS = [
  {
    id: 'pistol',
    name: 'Пистолет',
    code: 'PIFPAF',
    desc: 'С первой секунды боя — в правой перчатке, соперник его видит. Один патрон: кнопка «Выстрел» или пробел — и бой окончен.',
  },
];

function read() {
  const w = load('wallet', null);
  return {
    money: Number.isFinite(w?.money) ? w.money : 0,
    owned: Array.isArray(w?.owned) ? w.owned : ['classic'],
    equipped: typeof w?.equipped === 'string' ? w.equipped : 'classic',
    pistol: w?.pistol === true,
  };
}

export const wallet = () => read();

export function earn(amount) {
  const w = read();
  w.money += amount;
  save('wallet', w);
  return w;
}

/** @returns {{ok:boolean, reason?:'owned'|'money'|'code'}} */
export function buy(id) {
  const w = read();
  const g = gloveById(id);
  if (w.owned.includes(id)) return { ok: false, reason: 'owned' };
  if (g.code) return { ok: false, reason: 'code' };
  if (w.money < g.price) return { ok: false, reason: 'money' };
  w.money -= g.price;
  w.owned.push(id);
  w.equipped = id;
  save('wallet', w);
  return { ok: true };
}

/** Promo codes unlock gloves that aren't for sale. */
export function redeem(code) {
  const wanted = String(code).trim().toUpperCase();
  const secret = SECRETS.find((x) => x.code === wanted);
  if (secret) {
    const w = read();
    w[secret.id] = true;
    save('wallet', w);
    return { ...secret, item: true };
  }
  const g = GLOVES.find((x) => x.code && x.code === wanted);
  if (!g) return null;
  const w = read();
  if (!w.owned.includes(g.id)) w.owned.push(g.id);
  w.equipped = g.id;
  save('wallet', w);
  return g;
}

export function equip(id) {
  const w = read();
  if (!w.owned.includes(id)) return false;
  w.equipped = id;
  save('wallet', w);
  return true;
}
